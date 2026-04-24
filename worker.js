// Cloudflare Worker — Anthropic API Proxy + Embedding Proxy
// Secrets (wrangler secret put): ANTHROPIC_API_KEY, APP_TOKEN
// Binding (wrangler.toml): AI (Workers AI for embeddings)

const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function requireAppToken(request, env) {
  const t = request.headers.get('X-App-Token');
  if (!env.APP_TOKEN || t !== env.APP_TOKEN) return json({ error: 'Unauthorized' }, 401);
  return null;
}

async function handleChat(request, env) {
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
  return json(data, resp.status);
}

async function handleEmbed(request, env) {
  const { text } = await request.json();
  if (!text || typeof text !== 'string') return json({ error: 'text required' }, 400);
  const res = await env.AI.run(EMBED_MODEL, { text: [text] });
  return json({ values: res.data[0] });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    try {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      if (path === '/' || path === '/chat') {
        const unauth = requireAppToken(request, env);
        if (unauth) return unauth;
        return await handleChat(request, env);
      }

      if (path === '/embed') {
        const unauth = requireAppToken(request, env);
        if (unauth) return unauth;
        return await handleEmbed(request, env);
      }

      return json({ error: 'Not Found', path }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
