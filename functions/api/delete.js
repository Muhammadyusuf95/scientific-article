// functions/api/delete.js -> POST /api/delete
const PDF_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i;
const ID_RE = /^[a-z0-9-]{1,120}$/;

class UserError extends Error {}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

const clean = (v, max) =>
  String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

const b64decode = (b) =>
  new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

const b64encode = (s) => {
  let bin = '';
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}

async function archiveObject(env, key) {
  if (!PDF_NAME.test(key) || !env.R2_OMBOR) return;
  const o = await env.R2_OMBOR.get(key);
  if (!o) return;
  await env.R2_OMBOR.put(`deleted/${Date.now()}-${key}`, await o.arrayBuffer(), {
    httpMetadata: { contentType: 'application/pdf' },
  });
  await env.R2_OMBOR.delete(key);
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.ADMIN_TOKEN || !env.R2_OMBOR || !env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    }
    const given = request.headers.get('X-Admin-Token') || '';
    if (!given || !(await sameSecret(given, env.ADMIN_TOKEN))) {
      return json({ success: false, error: "Ruxsat yo'q" }, 401);
    }

    let id = '', confirmId = '';
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      const body = await request.json();
      id = clean(body.id, 120);
      confirmId = clean(body.confirm || body.id, 120);
    } else {
      const form = await request.formData();
      id = clean(form.get('id'), 120);
      confirmId = clean(form.get('confirm'), 120);
    }

    if (!ID_RE.test(id)) throw new UserError("Nashr ID si noto'g'ri");
    if (confirmId !== id) throw new UserError('Tasdiqlash mos kelmadi');

    const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
    const ref = env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '';
    const gh = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'article-portal',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    let key = null;
    let committed = false;

    for (let attempt = 0; attempt < 3 && !committed; attempt++) {
      const getRes = await fetch(api + ref, { headers: gh });
      if (!getRes.ok) throw new Error(`GitHub o'qish xatosi: ${getRes.status}`);
      const cur = await getRes.json();
      const data = JSON.parse(b64decode(cur.content));
      if (!Array.isArray(data.articles)) throw new Error("articles.json da 'articles' massivi yo'q");

      const i = data.articles.findIndex((a) => a.id === id);
      if (i < 0) throw new UserError('Nashr topilmadi');
      key = data.articles[i].pdf || null;
      data.articles.splice(i, 1);

      const putRes = await fetch(api, {
        method: 'PUT',
        headers: { ...gh, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Nashr o'chirildi: ${id}`,
          content: b64encode(JSON.stringify(data, null, 2) + '\n'),
          sha: cur.sha,
          ...(env.GITHUB_BRANCH ? { branch: env.GITHUB_BRANCH } : {}),
        }),
      });
      if (putRes.ok) committed = true;
      else if (putRes.status !== 409 && putRes.status !== 422) {
        throw new Error(`GitHub yozish xatosi: ${putRes.status}`);
      }
    }
    if (!committed) throw new Error("articles.json ni yangilab bo'lmadi (konflikt)");

    if (key) {
      try { await archiveObject(env, key); } catch (e) { console.error(e); }
    }
    return json({ success: true });
  } catch (err) {
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
