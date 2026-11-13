// functions/pdf/[name].js  ->  GET /pdf/<fayl>.pdf
// R2 dagi PDF ni sayt domenida beradi (Google Scholar uchun) - R2 ni ochiq (r2.dev) qilish shart emas.

export async function onRequestGet({ params, env, request }) {
  const name = String(params.name || '');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i.test(name) || !env.R2_OMBOR) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.R2_OMBOR.get(name, { range: request.headers, onlyIf: request.headers });
  if (object === null) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', 'application/pdf');
  headers.set('Content-Disposition', `inline; filename="${name}"`);
  headers.set('ETag', object.httpEtag);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  headers.set('X-Robots-Tag', 'all');

  if (object.range) {
    const end = object.range.end ?? object.size - 1;
    headers.set('Content-Range', `bytes ${object.range.offset}-${end}/${object.size}`);
  }
  const status = object.body ? (request.headers.get('range') ? 206 : 200) : 304;
  return new Response(object.body, { status, headers });
}
