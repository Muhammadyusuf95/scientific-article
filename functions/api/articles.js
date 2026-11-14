// functions/api/articles.js -> GET /api/articles
async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}

const b64decode = (b) =>
  new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export async function onRequestGet({ request, env }) {
  try {
    const given = request.headers.get('X-Admin-Token') || '';
    if (!env.ADMIN_TOKEN || !given || !(await sameSecret(given, env.ADMIN_TOKEN))) {
      return json({ success: false, error: "Ruxsat yo'q" }, 401);
    }
    if (!env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    }

    const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
    const ref = env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '';
    const ghHeaders = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'article-portal',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    const res = await fetch(api + ref, { headers: ghHeaders });
    if (!res.ok) {
      return json({ success: false, error: `GitHub o'qish xatosi (${res.status})` }, 500);
    }

    const cur = await res.json();
    let b64 = cur.content;
    if (!b64 && cur.sha) {
      const blobRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/git/blobs/${cur.sha}`, {
        headers: ghHeaders,
      });
      if (!blobRes.ok) return json({ success: false, error: "GitHub blob o'qish xatosi" }, 500);
      b64 = (await blobRes.json()).content;
    }

    const data = JSON.parse(b64decode(b64));
    return json({
      success: true,
      articles: Array.isArray(data.articles) ? data.articles : [],
      collections: Array.isArray(data.collections) ? data.collections : [],
    });
  } catch (err) {
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
