// functions/article/_middleware.js
// Maqola sahifasiga (/article/<id>/) to'liq matnni server tomonida qo'yadi (R2: text/<id>.json).
// Google va Google Scholar matnni sahifaning o'zida to'liq ko'radi; citation_fulltext_html_url shu sahifani ko'rsatadi.
// Matn bo'lmasa, sahifa o'zgarishsiz qaytadi.
import { cleanBlocks } from '../../lib/fulltext-clean.js';

const PAGE = /^\/article\/([a-z0-9-]{1,120})\/$/;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)\]])/g, '<a href="$1" rel="nofollow noopener noreferrer">$1</a>');

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const m = url.pathname.match(PAGE);
  if (!m || (request.method !== 'GET' && request.method !== 'HEAD') || !env.R2_OMBOR) return next();

  // Shartli so'rovlar (If-None-Match) 304 qaytarmasligi uchun olib tashlanadi: matn sahifadan alohida yangilanadi
  const headers = new Headers(request.headers);
  headers.delete('If-None-Match'); headers.delete('If-Modified-Since');
  const res = await next(new Request(request, { headers }));
  if (!res.ok || !(res.headers.get('Content-Type') || '').includes('text/html')) return res;

  let data = null;
  try {
    const o = await env.R2_OMBOR.get(`text/${m[1]}.json`);
    if (o) data = await o.json();
  } catch (e) { console.error('fulltext', e); }
  if (!data || !Array.isArray(data.blocks) || !data.blocks.length) return res;

  // Sahifada alohida "Adabiyotlar" bo'limi bor bo'lsa (data-has-refs), matn ichidagi takroriy ro'yxat chiqarilmaydi
  const render = (list) => list.map((b) => (b.t === 'h' ? `<h3>${esc(b.x)}</h3>` : `<p>${linkify(b.x)}</p>`)).join('\n');
  const withRefs = cleanBlocks(data.blocks, true), plain = cleanBlocks(data.blocks, false);
  if (!plain.length) return res;
  let hasRefs = false;
  const self = `${url.origin}${url.pathname}`;
  const out = new HTMLRewriter()
    .on('head', { element(e) { e.append(`<meta name="citation_fulltext_html_url" content="${esc(self)}">\n`, { html: true }); } })
    .on('[data-fulltext]', { element(e) { hasRefs = e.hasAttribute('data-has-refs'); e.removeAttribute('hidden'); } })
    .on('[data-fulltext-body]', { element(e) { e.setInnerContent(render(hasRefs && withRefs.length ? withRefs : plain), { html: true }); } })
    .on('[data-ft-only]', { element(e) { e.removeAttribute('hidden'); } })
    .transform(res);
  const final = new Response(out.body, out);
  final.headers.delete('ETag');
  final.headers.delete('Content-Length');
  final.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return final;
}
