const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'enamel-quote-proxy/1.0';

async function getAccessToken(env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&client_secret=${encodeURIComponent(env.GOOGLE_CLIENT_SECRET)}&refresh_token=${encodeURIComponent(env.GOOGLE_REFRESH_TOKEN)}&grant_type=refresh_token`
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Token error: ${res.status} - ${JSON.stringify(data)}`);
  }
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
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive error ${res.status}: ${err.slice(0, 200)}`);
  }
  return res.json();
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
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
      } catch (kvErr) { /* ignore */ }
    }

    // PDF 上傳
    let pdfId = null;
    if (body.pdfBase64) {
      try {
        const result = await uploadPDF(env, body, body.pdfBase64);
        pdfId = result.id;
      } catch (uploadErr) {
        console.error('PDF upload error:', uploadErr);
        return new Response(JSON.stringify({ error: `PDF上傳失敗: ${uploadErr.message}` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // GitHub Notion
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
        body: JSON.stringify({ event_type: 'quote-submitted', client_payload: body })
      }
    );

    if (!dispatchRes.ok) {
      const errorText = await dispatchRes.text();
      return new Response(JSON.stringify({ error: `提交失敗 (${dispatchRes.status})` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true, pdfId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
