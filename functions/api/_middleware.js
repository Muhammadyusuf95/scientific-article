// functions/api/_middleware.js - /api/* ning hammasi shu yerdan o'tadi
const MAX_BODY = 27 * 1024 * 1024;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ success: false, error: 'Usul ruxsat etilmagan' }, 405);
  }
  if (request.method === 'POST') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ success: false, error: "Ruxsat yo'q" }, 403);
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ success: false, error: "Ruxsat yo'q" }, 403);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) {
      return json({ success: false, error: "So'rov hajmi juda katta" }, 413);
    }
  }

  if (!env.ADMIN_TOKEN) {
    return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
  }
  const given = request.headers.get('X-Admin-Token') || '';
  if (!given || !(await sameSecret(given, env.ADMIN_TOKEN))) {
    await new Promise((r) => setTimeout(r, 400));
    return json({ success: false, error: "Ruxsat yo'q" }, 401);
  }

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
