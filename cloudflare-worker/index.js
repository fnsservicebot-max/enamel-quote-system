const GITHUB_API = 'https://api.github.com';
const OAUTH_API = 'https://oauth2.googleapis.com';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const USER_AGENT = 'enamel-quote-proxy/1.0';

// 取得 Access Token（使用 Cloudflare Secrets 中的環境變數）
async function getAccessToken() {
  const res = await fetch(`${OAUTH_API}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token'
    })
  });
  const data = await res.json();
  return data.access_token;
}

// 上傳 PDF 到 Google Drive
async function uploadPDF(quoteData, pdfBase64) {
  const accessToken = await getAccessToken();
  const fileName = `JFE_${quoteData.customer.name}_${quoteData.customer.phone}_${Date.now()}.pdf`;
  const boundary = 'boundary_' + Math.random().toString(36).slice(2);
  
  const body = [
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify({
      name: fileName,
      parents: [env.GOOGLE_DRIVE_FOLDER_ID]
    }),
    `--${boundary}`,
    'Content-Type: application/pdf',
    '',
    atob(pdfBase64),
    `--${boundary}--`
  ].join('\r\n');

  const res = await fetch(`${DRIVE_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body
  });
  
  return res.json();
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
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

    // 如果有 PDF，就上傳到 Google Drive
    if (body.pdfBase64) {
      try {
        const uploadResult = await uploadPDF(body, body.pdfBase64);
        console.log('PDF upload result:', JSON.stringify(uploadResult));
      } catch (uploadErr) {
        console.error('PDF upload error:', uploadErr);
      }
    }

    // 觸發 GitHub 寫入 Notion
    const dispatchRes = await fetch(
      `${GITHUB_API}/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/dispatches`,
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
      console.error('GitHub dispatch error:', dispatchRes.status, errorText);
      return new Response(JSON.stringify({ error: `提交失敗 (${dispatchRes.status})` }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
