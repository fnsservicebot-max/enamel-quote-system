const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'enamel-quote-proxy/1.0';

async function getAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&client_secret=${encodeURIComponent(env.GOOGLE_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(env.GOOGLE_REFRESH_TOKEN)}&grant_type=refresh_token`
  });
  const data = await res.json();
  return data.access_token;
}

async function uploadPDF(env, quoteData, pdfBase64) {
  const accessToken = await getAccessToken(env);
  const fileName = `JFE_${quoteData.customer.name}_${quoteData.customer.phone}_${Date.now()}.pdf`;
  const boundary = 'b' + Math.random().toString(36).slice(2);
  const binaryStr = atob(pdfBase64);
  const metaJson = JSON.stringify({ name: fileName, parents: [env.GOOGLE_DRIVE_FOLDER_ID] });
  const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n${binaryStr}\r\n--${boundary}--`;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  if (!res.ok) { throw new Error(`Drive error ${res.status}`); }
  return res.json();
}

async function sendEmail(env, customer, pdfBase64) {
  const customerEmail = customer.email;
  const storeEmail = 'fns.service.bot@gmail.com';
  
  // Build HTML email body
  const now = new Date().toLocaleString('zh-TW', {timeZone:'Asia/Taipei'});
  const htmlBody = `
    <h2>JFE 琺瑯板報價單</h2>
    <p><strong>報價時間：</strong>${now}</p>
    <hr>
    <h3>客戶資料</h3>
    <p><strong>姓名：</strong>${customer.name}</p>
    <p><strong>電話：</strong>${customer.phone}</p>
    <p><strong>地址：</strong>${customer.address}</p>
    ${customer.installDate ? `<p><strong>希望安裝日期：</strong>${customer.installDate}</p>` : ''}
    <hr>
    <h3>報價資訊</h3>
    <p><strong>小計：</strong>$${Number(customer.quote?.subtotal||0).toLocaleString()}</p>
    <p><strong>稅金(5%)：</strong>$${Number(customer.quote?.tax||0).toLocaleString()}</p>
    <p><strong>總計：</strong><span style="font-size:1.2em;font-weight:bold;">$${Number(customer.quote?.total||0).toLocaleString()}</span></p>
    ${customer.quote?.needsManualQuote ? '<p><em>（含需專人報價項目）</em></p>' : ''}
    <hr>
    <h3>公司資訊</h3>
    <p>琺恩斯國際｜02-82732233</p>
    <p>新北市土城區青仁路116號</p>
    <p>營業時間：09:30～20:00（每週三公休）</p>
  `;

  const attachments = [{
    filename: `JFE_${customer.name}_${customer.phone}.pdf`,
    content: pdfBase64
  }];

  // Send to customer
  const toEmails = [customerEmail, storeEmail].filter(Boolean);
  
  for (const to of toEmails) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'JFE琺瑯板報價 <onboarding@resend.dev>',
        to: to,
        subject: `JFE 琺瑯板報價單 - ${customer.name}`,
        html: htmlBody,
        attachments: attachments
      })
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error(`Email to ${to} failed:`, err);
    } else {
      console.log(`Email sent to ${to}`);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    let body;
    try { body = await request.json(); } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!body.customer || !body.quote) {
      return new Response(JSON.stringify({ error: '缺少必要資料' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Rate limiting
    if (env.RATE_LIMIT) {
      try {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateKey = `rate:${ip}`;
        const count = await env.RATE_LIMIT.get(rateKey);
        if (count && parseInt(count) >= 10) {
          return new Response(JSON.stringify({ error: '請求過於頻繁' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }
        await env.RATE_LIMIT.put(rateKey, count ? String(parseInt(count) + 1) : '1', { expirationTtl: 60 });
      } catch (kvErr) {}
    }

    // PDF上傳 + Email寄送
    let pdfId = null;
    if (body.pdfBase64) {
      try {
        pdfId = (await uploadPDF(env, body, body.pdfBase64)).id;
      } catch (e) { console.error('PDF upload error:', e); }
      try {
        await sendEmail(env, body.customer, body.pdfBase64);
      } catch (e) { console.error('Email error:', e); }
    }

    // GitHub Notion
    const dispatchRes = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`,
      { method: 'POST', headers: { 'Authorization': `Bearer ${env.GITHUB_PAT}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({ event_type: 'quote-submitted', client_payload: body }) }
    );
    if (!dispatchRes.ok) {
      return new Response(JSON.stringify({ error: `提交失敗 (${dispatchRes.status})` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, pdfId }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
};
