// functions/api/_middleware.js - /api/* ning hammasi shu yerdan o'tadi (kirishdan oldingi birinchi to'siq).
import { assertAdmin, json } from '../_lib/common.js';

const MAX_BODY = 27 * 1024 * 1024;

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);

  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ success: false, error: 'Usul ruxsat etilmagan' }, 405);
  }
  if (request.method === 'POST') {
    // CSRF: faqat shu saytning o'zidan kelgan so'rovlar
    if (request.headers.get('Origin') !== url.origin) return json({ success: false, error: "Ruxsat yo'q" }, 403);
    if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ success: false, error: "Ruxsat yo'q" }, 403);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) return json({ success: false, error: "So'rov hajmi juda katta" }, 413);
  }

  const denied = await assertAdmin(request, env);
  if (denied) return denied;

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return out;
}
