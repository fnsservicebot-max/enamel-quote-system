const GITHUB_API = 'https://api.github.com';
const USER_AGENT = 'enamel-quote-proxy/1.0';

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

    // 觸發 GitHub repository_dispatch
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
