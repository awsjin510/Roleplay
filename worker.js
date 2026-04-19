// Cloudflare Worker — Anthropic API Proxy + RAG endpoints
// Bindings (wrangler.toml): VECTORIZE, AI, DOC_META
// Secrets (wrangler secret put): ANTHROPIC_API_KEY, APP_TOKEN, ADMIN_TOKEN

const EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
const MAX_CHARS = 800;
const OVERLAP = 100;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token, X-Admin-Token',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function requireToken(request, env, kind) {
  if (kind === 'app') {
    const t = request.headers.get('X-App-Token');
    if (!env.APP_TOKEN || t !== env.APP_TOKEN) return json({ error: 'Unauthorized' }, 401);
  } else {
    const t = request.headers.get('X-Admin-Token');
    if (!env.ADMIN_TOKEN || t !== env.ADMIN_TOKEN) return json({ error: 'Unauthorized' }, 401);
  }
  return null;
}

function chunkText(text, maxChars = MAX_CHARS, overlap = OVERLAP) {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    const joined = current ? current + '\n\n' + para : para;
    if (joined.length > maxChars && current) {
      chunks.push(current.trim());
      const tail = current.length > overlap ? current.slice(-overlap) : current;
      current = tail + '\n\n' + para;
    } else {
      current = joined;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  const final = [];
  for (const c of chunks) {
    if (c.length <= maxChars * 1.5) { final.push(c); continue; }
    for (let i = 0; i < c.length; i += maxChars - overlap) {
      final.push(c.slice(i, i + maxChars));
    }
  }
  return final;
}

async function embed(env, text) {
  const res = await env.AI.run(EMBED_MODEL, { text: [text] });
  return res.data[0];
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

async function handleUpload(request, env) {
  const { docId, name, product, text } = await request.json();
  if (!docId || !name || !text) return json({ error: 'docId, name, text required' }, 400);

  const chunks = chunkText(text);
  if (!chunks.length) return json({ error: 'no content' }, 400);

  const vectors = [];
  for (let i = 0; i < chunks.length; i++) {
    const values = await embed(env, chunks[i]);
    vectors.push({
      id: `${docId}_${i}`,
      values,
      metadata: {
        docId, docName: name, chunkIndex: i,
        product: product || 'general',
        text: chunks[i],
      },
    });
  }
  await env.VECTORIZE.upsert(vectors);

  const meta = {
    name, product: product || 'general',
    chunkCount: chunks.length,
    uploadedAt: new Date().toISOString(),
    status: 'ready',
  };
  await env.DOC_META.put(docId, JSON.stringify(meta));
  return json({ ok: true, docId, chunkCount: chunks.length });
}

async function handleQuery(request, env) {
  const { query, topK = 5, product } = await request.json();
  if (!query || typeof query !== 'string') return json({ error: 'query required' }, 400);
  const values = await embed(env, query);
  const opts = { topK, returnMetadata: 'all' };
  if (product) opts.filter = { product };
  const res = await env.VECTORIZE.query(values, opts);
  const matches = (res.matches || []).map(m => ({
    score: m.score,
    text: m.metadata?.text,
    docName: m.metadata?.docName,
    product: m.metadata?.product,
  }));
  return json({ matches });
}

async function handleListDocs(env) {
  const list = await env.DOC_META.list();
  const docs = [];
  for (const k of list.keys) {
    const raw = await env.DOC_META.get(k.name);
    if (raw) docs.push({ id: k.name, ...JSON.parse(raw) });
  }
  docs.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
  return json({ docs });
}

async function handleDeleteDoc(docId, env) {
  const raw = await env.DOC_META.get(docId);
  if (!raw) return json({ error: 'not found' }, 404);
  const meta = JSON.parse(raw);
  const ids = [];
  for (let i = 0; i < (meta.chunkCount || 0); i++) ids.push(`${docId}_${i}`);
  if (ids.length) await env.VECTORIZE.deleteByIds(ids);
  await env.DOC_META.delete(docId);
  return json({ ok: true, deleted: ids.length });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method;

    try {
      if (path === '/' || path === '/chat') {
        if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
        const unauth = requireToken(request, env, 'app');
        if (unauth) return unauth;
        return await handleChat(request, env);
      }

      if (path === '/query' && method === 'POST') {
        const unauth = requireToken(request, env, 'app');
        if (unauth) return unauth;
        return await handleQuery(request, env);
      }

      if (path === '/upload' && method === 'POST') {
        const unauth = requireToken(request, env, 'admin');
        if (unauth) return unauth;
        return await handleUpload(request, env);
      }

      if (path === '/docs' && method === 'GET') {
        const unauth = requireToken(request, env, 'admin');
        if (unauth) return unauth;
        return await handleListDocs(env);
      }

      if (path.startsWith('/docs/') && method === 'DELETE') {
        const unauth = requireToken(request, env, 'admin');
        if (unauth) return unauth;
        const docId = decodeURIComponent(path.slice('/docs/'.length));
        return await handleDeleteDoc(docId, env);
      }

      return json({ error: 'Not Found', path }, 404);
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  },
};
