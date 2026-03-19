/**
 * 琺瑯壁板報價系統 - Cloudflare Worker
 * 
 * 用途：前端無密鑰代理，轉發報價資料到 GitHub Actions workflow
 * 部署：wrangler deploy
 * 
 * 環境變數（Cloudflare Secrets）：
 *   GITHUB_PAT - GitHub Personal Access Token（需要 repo scope）
 * 
 * 環境變數（Cloudflare Variables）：
 *   GITHUB_OWNER - fnsservicebot-max
 *   GITHUB_REPO - enamel-quote-system
 */

const GITHUB_API = 'https://api.github.com';

export default {
  async fetch(request, env, ctx) {
    // 只接受 POST
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    try {
      const body = await request.json();

      // 基本驗證：確保有必要的欄位
      if (!body.customer || !body.quote) {
        return new Response(JSON.stringify({ error: '缺少必要資料' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Rate limiting 簡易保護（每分鐘最多 10 次）
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rateKey = `rate:${ip}`;
      const count = await RATE_LIMIT.get(rateKey);
      
      if (count && parseInt(count) >= 10) {
        return new Response(JSON.stringify({ error: '請求過於頻繁，請稍後再試' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' }
        });
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
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            event_type: 'quote-submitted',
            client_payload: {
              customer: body.customer,
              quote: body.quote
            }
          })
        }
      );

      // Rate limit counter
      if (!count) {
        await RATE_LIMIT.put(rateKey, '1', { expirationTtl: 60 });
      } else {
        await RATE_LIMIT.put(rateKey, String(parseInt(count) + 1), { expirationTtl: 60 });
      }

      if (!dispatchRes.ok) {
        const errorText = await dispatchRes.text();
        console.error('GitHub API error:', errorText);
        return new Response(JSON.stringify({ error: '提交失敗，請稍後再試' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: '系統錯誤' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
