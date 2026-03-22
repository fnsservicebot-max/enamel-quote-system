/**
 * JFE 琺瑯板報價系統 - Cloudflare Worker
 * 只發送 HTML Email，不處理 PDF
 */

const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'enamel-quote-proxy/1.0';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!body.customer || !body.quote) {
      return new Response(JSON.stringify({ error: '缺少必要資料' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { customer, quote } = body;

    // Rate limiting
    if (env.RATE_LIMIT) {
      try {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateKey = `rate:${ip}`;
        const count = await env.RATE_LIMIT.get(rateKey);
        if (count && parseInt(count) >= 10) {
          return new Response(JSON.stringify({ error: '請求過於頻繁' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        await env.RATE_LIMIT.put(rateKey, count ? String(parseInt(count) + 1) : '1', { expirationTtl: 60 });
      } catch (kvErr) {
        console.error('Rate limit error:', kvErr);
      }
    }

    // 發送 HTML Email 給門市
    try {
      const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });

      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: 'Noto Sans TC', 'Microsoft JhengHei', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear: 135deg, #667eea 0%, #764ba2 100%; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 20px; border-radius: 0 0 10px 10px; }
    .section { background: white; padding: 15px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .section-title { font-size: 16px; font-weight: bold; color: #667eea; margin-bottom: 10px; border-bottom: 2px solid #667eea; padding-bottom: 5px; }
    .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
    .row:last-child { border-bottom: none; }
    .label { color: #666; }
    .value { font-weight: 500; }
    .total { font-size: 24px; color: #e74c3c; font-weight: bold; text-align: right; margin-top: 15px; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
    .highlight { color: #667eea; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🏠 JFE 琺瑯板報價單</h1>
    <p>報價時間：${now}</p>
  </div>
  <div class="content">
    <div class="section">
      <div class="section-title">👤 客戶資料</div>
      <div class="row"><span class="label">姓名：</span><span class="value">${customer.name}</span></div>
      <div class="row"><span class="label">電話：</span><span class="value">${customer.phone}</span></div>
      <div class="row"><span class="label">Email：</span><span class="value">${customer.email || '-'}</span></div>
      <div class="row"><span class="label">安裝地址：</span><span class="value">${customer.address}</span></div>
      ${customer.installDate ? `<div class="row"><span class="label">希望安裝日期：</span><span class="value">${customer.installDate}</span></div>` : ''}
    </div>

    <div class="section">
      <div class="section-title">📋 報價明細</div>
      ${quote.areas ? quote.areas.map((area, i) => `
        <div class="row">
          <span class="label">區域 ${i + 1}：</span>
          <span class="value">${area.length} × ${area.width} cm × ${area.quantity} 片</span>
        </div>
        <div class="row">
          <span class="label">單價：</span>
          <span class="value highlight">$${area.unitPrice}/cm</span>
        </div>
        <div class="row">
          <span class="label">小計：</span>
          <span class="value highlight">$${Number(area.subtotal || 0).toLocaleString()}</span>
        </div>
      `).join('') : ''}
      <div class="row"><span class="label">小計：</span><span class="value">$${Number(quote.subtotal || 0).toLocaleString()}</span></div>
      <div class="row"><span class="label">稅金 (5%)：</span><span class="value">$${Number(quote.tax || 0).toLocaleString()}</span></div>
      ${quote.needsManualQuote ? '<div class="row"><span class="label" style="color:#e74c3c;">注意：</span><span class="value" style="color:#e74c3c;">含需專人報價項目</span></div>' : ''}
      <div class="total">總計：$${Number(quote.total || 0).toLocaleString()}</div>
    </div>

    <div class="section">
      <div class="section-title">🏢 公司資訊</div>
      <div class="row"><span class="label">公司名稱：</span><span class="value">琺恩斯國際</span></div>
      <div class="row"><span class="label">電話：</span><span class="value">02-82732233</span></div>
      <div class="row"><span class="label">地址：</span><span class="value">新北市土城區青仁路116號</span></div>
      <div class="row"><span class="label">營業時間：</span><span class="value">09:30～20:00（每週三公休）</span></div>
    </div>
  </div>
  <div class="footer">
    <p>此郵件由 JFE 琺瑯板報價系統自動發送</p>
  </div>
</body>
</html>
      `;

      // 發送 Email 給門市
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'JFE琺瑯板報價 <onboarding@resend.dev>',
          to: [env.STORE_EMAIL],
          subject: `【新報價】${customer.name} - ${customer.phone} - $${Number(quote.total || 0).toLocaleString()}`,
          html: htmlBody
        })
      });

      if (!emailRes.ok) {
        const err = await emailRes.text();
        console.error('Email error:', err);
        throw new Error(`Email failed: ${err}`);
      }

    } catch (emailErr) {
      console.error('Email sending error:', emailErr);
      return new Response(JSON.stringify({ error: 'Email 發送失敗: ' + emailErr.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 觸發 GitHub Actions 寫入 Notion
    try {
      const dispatchRes = await fetch(
        `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.GITHUB_PAT}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': USER_AGENT
          },
          body: JSON.stringify({
            event_type: 'quote-submitted',
            client_payload: body
          })
        }
      );

      if (!dispatchRes.ok) {
        const err = await dispatchRes.text();
        console.error('GitHub dispatch error:', err);
        // 不阻擋流程，Email 已發送
      }
    } catch (ghErr) {
      console.error('GitHub error:', ghErr);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
