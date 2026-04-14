// Cloudflare Worker — Anthropic API Proxy
// 環境變數（在 Cloudflare Dashboard 設定）：
//   ANTHROPIC_API_KEY  → 你的 Anthropic API Key
//   APP_TOKEN          → 自訂存取密碼，防止他人濫用

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
  };
}

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // 驗證 App Token（防止外部濫用）
    const token = request.headers.get('X-App-Token');
    if (!env.APP_TOKEN || token !== env.APP_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 轉發到 Anthropic
    try {
      const body = await request.json();
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  },
};
