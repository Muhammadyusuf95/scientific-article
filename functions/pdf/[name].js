// functions/pdf/[name].js  ->  GET /pdf/<fayl>.pdf
// R2 dagi PDF ni sayt domenida beradi (Google Scholar uchun). R2 ni ochiq (r2.dev) qilish shart emas.
//  * /pdf/<fayl>.pdf        - brauzerda ochiladi (inline). Google Scholar shu manzilni ko'radi.
//  * /pdf/<fayl>.pdf?dl=1   - "Yuklab olish" tugmasi: fayl saqlanadi va yuklab olishlar soni oshadi.
//  * Eski (almashtirilgan) fayl nomi so'ralsa, maqolaning amaldagi PDF iga 301 bilan yo'naltiradi,
//    shuning uchun ilgari indekslangan havolalar hech qachon "o'lik" bo'lib qolmaydi.
import { PDF_NAME } from '../../lib/common.js';
import { bump, loadIndex, isBot } from '../../lib/stats.js';

function findArticle(index, name) {
  const list = Object.entries((index && index.articles) || {});
  const exact = list.find(([, a]) => a.pdf === name || (a.aliases || []).includes(name));
  if (exact) return { id: exact[0], ...exact[1] };
  const base = name.replace(/\.pdf$/i, '');
  // Eski nom shakli: "<id>-<qo'shimcha>.pdf" yoki "<id>.pdf"
  const pref = list
    .filter(([id]) => base === id || base.startsWith(id + '-'))
    .sort((x, y) => y[0].length - x[0].length)[0];
  return pref ? { id: pref[0], ...pref[1] } : null;
}

function baseHeaders(object, name, download) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${name}"`);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=600, must-revalidate');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'all');
  headers.delete('X-Frame-Options');
  return headers;
}

async function serve(ctx, headOnly) {
  const { params, env, request } = ctx;
  const name = String(params.name || '');
  if (!PDF_NAME.test(name) || !env.R2_OMBOR) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const download = url.searchParams.get('dl') === '1';

  const object = headOnly
    ? await env.R2_OMBOR.head(name)
    : await env.R2_OMBOR.get(name, { range: request.headers, onlyIf: request.headers });

  if (object === null) {
    const index = await loadIndex(env, request);
    const art = findArticle(index, name);
    if (art && art.pdf && art.pdf !== name) {
      return Response.redirect(`${url.origin}/pdf/${encodeURIComponent(art.pdf)}${url.search}`, 301);
    }
    return new Response('Not found', { status: 404, headers: { 'X-Robots-Tag': 'noindex' } });
  }

  const headers = baseHeaders(object, name, download);
  if (headOnly) {
    headers.set('Content-Length', String(object.size));
    return new Response(null, { status: 200, headers });
  }
  const ranged = !!request.headers.get('range');
  if (object.range && ranged) {
    const end = object.range.end ?? (object.range.length ? object.range.offset + object.range.length - 1 : object.size - 1);
    headers.set('Content-Range', `bytes ${object.range.offset}-${end}/${object.size}`);
  }
  const status = object.body ? (ranged ? 206 : 200) : 304;

  // Yuklab olishlarni hisoblash: "Yuklab olish" tugmasi (?dl=1) yoki PDF ni to'liq ochish (yangi oynada).
  // Saytdagi o'quvchi (pdf.js) fetch bilan oladi, u yuklab olish hisoblanmaydi.
  const dest = request.headers.get('Sec-Fetch-Dest') || '';
  const countable = status === 200 && !ranged && !isBot(request) && (download || dest === 'document');
  if (countable) {
    const p = (async () => {
      const art = findArticle(await loadIndex(env, request), name);
      if (art) await bump(env, art.id, 'downloads');
    })().catch((e) => console.error('stats', e));
    if (typeof ctx.waitUntil === 'function') ctx.waitUntil(p);
    else await p;
  }
  return new Response(object.body, { status, headers });
}

export const onRequestGet = (ctx) => serve(ctx, false);
export const onRequestHead = (ctx) => serve(ctx, true);
