// functions/api/articles.js -> GET /api/articles
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}
const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

export async function onRequestGet({ request, env }) {
  const given = request.headers.get('X-Admin-Token') || '';
  if (!env.ADMIN_TOKEN || !given || !(await sameSecret(given, env.ADMIN_TOKEN))) {
    return new Response(JSON.stringify({ success: false, error: "Ruxsat yo'q" }), { status: 401 });
  }
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
  const ref = env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '';
  const res = await fetch(api + ref, {
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'article-portal',
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) return new Response(JSON.stringify({ success: false, error: "GitHub o'qish xatosi" }), { status: 500 });
  const cur = await res.json();
  const data = JSON.parse(b64decode(cur.content));
  return new Response(JSON.stringify({
    success: true,
    articles: data.articles || [],
    collections: data.collections || [],
  }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
