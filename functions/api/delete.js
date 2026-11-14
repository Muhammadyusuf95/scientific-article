// functions/api/delete.js -> POST /api/delete
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}
const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const b64encode = (s) => {
  let bin = '';
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};

export async function onRequestPost({ request, env }) {
  const given = request.headers.get('X-Admin-Token') || '';
  if (!env.ADMIN_TOKEN || !given || !(await sameSecret(given, env.ADMIN_TOKEN))) {
    return new Response(JSON.stringify({ success: false, error: "Ruxsat yo'q" }), { status: 401 });
  }
  const { id } = await request.json();
  if (!id) return new Response(JSON.stringify({ success: false, error: 'ID kiritilmadi' }), { status: 400 });

  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
  const gh = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    'User-Agent': 'article-portal',
    Accept: 'application/vnd.github+json',
  };

  const getRes = await fetch(api, { headers: gh });
  if (!getRes.ok) return new Response(JSON.stringify({ success: false, error: "GitHub o'qish xatosi" }), { status: 500 });
  const cur = await getRes.json();
  const data = JSON.parse(b64decode(cur.content));
  const target = (data.articles || []).find((a) => a.id === id);
  if (!target) return new Response(JSON.stringify({ success: false, error: 'Maqola topilmadi' }), { status: 404 });

  data.articles = data.articles.filter((a) => a.id !== id);

  const putRes = await fetch(api, {
    method: 'PUT',
    headers: { ...gh, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `O'chirildi: ${id}`,
      content: b64encode(JSON.stringify(data, null, 2) + '\n'),
      sha: cur.sha,
    }),
  });
  if (!putRes.ok) return new Response(JSON.stringify({ success: false, error: 'GitHub yozish xatosi' }), { status: 500 });

  if (target.pdf && env.R2_OMBOR) {
    try { await env.R2_OMBOR.delete(target.pdf); } catch (_) {}
  }

  return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
}
