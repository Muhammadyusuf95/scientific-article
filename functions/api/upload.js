// functions/api/upload.js -> POST /api/upload (Yangi qo'shish, Tahrirlash va To'plamlar)
const SCHOLAR_MAX = 5000000;
const BOOK_MAX = 25 * 1024 * 1024;
const LANGS = ['uz', 'en', 'ru'];
const KIND = {
  'jurnal-maqolasi': 'journal', 'konferensiya-maqolasi': 'conf', 'konferensiya-tezisi': 'conf',
  'darslik': 'book', 'oquv-qollanma': 'book', 'monografiya': 'book',
};
const FIELDS = {
  journal: ['journal_name', 'volume', 'issue', 'pages'],
  conf: ['conference_org', 'conference_place', 'conference_date', 'pages'],
  book: ['publisher', 'publisher_city', 'edition', 'total_pages'],
};
const OK = {
  issn: /^\d{4}-\d{3}[\dXx]$/,
  isbn: /^(?:\d[- ]?){9}[\dXx]$|^(?:\d[- ]?){12}\d$/,
  doi: /^10\.\d{4,9}\/\S+$/,
};
const PDF_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i;
const ID_RE = /^[a-z0-9-]{1,120}$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
class UserError extends Error {}

async function sameSecret(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(x, y);
}
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const list = (v, sep, maxItems, maxLen) => clean(v, 20000).split(sep).map((s) => s.trim()).filter(Boolean).slice(0, maxItems).map((s) => s.slice(0, maxLen));
const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[ʻʼ‘’`'´]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'maqola';
const b64decode = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const b64encode = (s) => {
  let bin = '';
  for (const byte of new TextEncoder().encode(s)) bin += String.fromCharCode(byte);
  return btoa(bin);
};

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
  let key = null;
  let committed = false;
  try {
    if (!env.ADMIN_TOKEN || !env.R2_OMBOR || !env.GITHUB_REPO || !env.GITHUB_TOKEN) {
      return json({ success: false, error: "Server sozlamalari to'liq emas" }, 500);
    }
    const given = request.headers.get('X-Admin-Token') || '';
    if (!given || !(await sameSecret(given, env.ADMIN_TOKEN))) return json({ success: false, error: "Ruxsat yo'q" }, 401);
    if (!(request.headers.get('Content-Type') || '').includes('multipart/form-data')) {
      return json({ success: false, error: "Noto'g'ri so'rov turi" }, 415);
    }

    const form = await request.formData();
    const g = (name, max) => clean(form.get(name), max);
    const editId = g('edit_id', 120);
    if (editId && !ID_RE.test(editId)) throw new UserError("Tahrirlanayotgan nashr ID si noto'g'ri");

    const type = g('item_type', 40);
    const kind = KIND[type];
    if (!kind) throw new UserError("Material turi noto'g'ri");
    const lang = LANGS.includes(g('language', 2)) ? g('language', 2) : 'uz';

    const article = { id: editId || '', item_type: type, language: lang };
    for (const l of LANGS) {
      const t = g('title_' + l, 300), a = g('abstract_' + l, 6000), k = list(form.get('keywords_' + l), /[,;\n]+/, 15, 60);
      if (t) article['title_' + l] = t;
      if (a) article['abstract_' + l] = a;
      if (k.length) article['keywords_' + l] = k;
    }
    if (!article['title_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da maqola nomi kiritilmagan`);
    if (!article['abstract_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da annotatsiya kiritilmagan (Google Scholar uchun shart)`);
    if (!article['keywords_' + lang]) throw new UserError(`Asosiy til (${lang.toUpperCase()}) da kamida bitta kalit so'z kiriting`);

    const authors = list(form.get('authors'), /[;\n]+/, 30, 120);
    if (!authors.length) throw new UserError('Kamida bitta muallif kiriting (bir nechta bo\'lsa ";" bilan ajrating)');
    const year = /^\d{4}$/.test(g('year', 4)) ? Number(g('year', 4)) : new Date().getUTCFullYear();
    const dateIn = g('date', 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(dateIn) ? dateIn : new Date().toISOString().slice(0, 10);
    Object.assign(article, { authors, year, date });

    for (const f of FIELDS[kind]) { const v = g(f, 200); if (v) article[f] = v; }
    if (kind === 'journal' && !article.journal_name) throw new UserError('Jurnal nomini kiriting');
    if (kind === 'conf' && !article.conference_org) throw new UserError('Konferensiya nomini kiriting');

    for (const f of ['issn', 'isbn', 'udk', 'bbk']) { const v = g(f, 60); if (v) article[f] = v; }
    if (article.issn && !OK.issn.test(article.issn)) throw new UserError("ISSN formati noto'g'ri (masalan 1234-5678)");
    if (article.isbn && !OK.isbn.test(article.isbn)) throw new UserError("ISBN formati noto'g'ri (10 yoki 13 raqam)");
    const doi = g('doi', 200).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    if (doi) {
      if (!OK.doi.test(doi)) throw new UserError("DOI formati noto'g'ri (masalan 10.1234/abcd)");
      article.doi = doi;
    }

    // To'plam (Konferensiya yoki Jurnal to'plami)
    const collIdIn = g('collection_id', 120) || g('collection', 120);
    const collNameIn = g('collection_name', 200);
    const collTypeIn = g('collection_type', 20) || (kind === 'conf' ? 'conf' : 'journal');
    let newCollectionObj = null;
    if (collNameIn) {
      const cid = collIdIn || slugify(collNameIn);
      article.collection = cid;
      newCollectionObj = { id: cid, name: collNameIn, type: collTypeIn };
    } else if (collIdIn) {
      article.collection = collIdIn;
    }

    const references = list(form.get('references'), /\n+/, 300, 1000)
      .map((r) => r.replace(/^(?:\[\d+\]|\d+[\.\)])\s+/, '').trim())
      .filter(Boolean);
    if (references.length) article.references = references;

    const file = form.get('file');
    const hasNewFile = file && typeof file !== 'string' && file.size > 0;
    if (!editId && !hasNewFile) throw new UserError('PDF fayl tanlanmagan');

    if (hasNewFile) {
      if (form.get('checks') !== 'yes') throw new UserError('PDF tayyorgarligi tasdiqlanmagan');
      const limit = kind === 'book' ? BOOK_MAX : SCHOLAR_MAX;
      if (file.size > limit) {
        throw new UserError(kind === 'book'
          ? 'PDF hajmi 25 MB dan oshmasligi kerak'
          : 'Google Scholar 5 MB dan katta fayllarni indekslamaydi. PDF hajmini 5 MB dan kichik qiling');
      }
      if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== '%PDF-') {
        throw new UserError('Faqat PDF fayl qabul qilinadi');
      }
    }

    if (!article.id) {
      article.id = `${slugify(article['title_' + lang])}-${crypto.randomUUID().slice(0, 6)}`;
    }

    if (hasNewFile) {
      key = editId ? `${article.id}-${Date.now().toString(36)}.pdf` : `${article.id}.pdf`;
      article.pdf = key;
      article.pdf_size = file.size;
      await env.R2_OMBOR.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf' } });
    }

    const api = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/articles.json`;
    const ref = env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : '';
    const gh = {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'article-portal',
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    let oldPdfToArchive = null;
    for (let attempt = 0; attempt < 3 && !committed; attempt++) {
      const getRes = await fetch(api + ref, { headers: gh });
      if (!getRes.ok) throw new Error(`GitHub o'qish xatosi: ${getRes.status}`);
      const cur = await getRes.json();
      let b64 = cur.content;
      if (!b64 && cur.sha) {
        const blobRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/git/blobs/${cur.sha}`, { headers: gh });
        if (!blobRes.ok) throw new Error(`GitHub blob xatosi: ${blobRes.status}`);
        b64 = (await blobRes.json()).content;
      }
      const data = JSON.parse(b64decode(b64));
      if (!Array.isArray(data.articles)) data.articles = [];
      if (!Array.isArray(data.collections)) data.collections = [];

      if (newCollectionObj) {
        const cIdx = data.collections.findIndex((c) => c.id === newCollectionObj.id);
        if (cIdx >= 0) data.collections[cIdx] = { ...data.collections[cIdx], ...newCollectionObj };
        else data.collections.push(newCollectionObj);
      }

      if (editId) {
        const idx = data.articles.findIndex((x) => x.id === editId);
        if (idx === -1) throw new UserError('Tahrirlanayotgan maqola topilmadi');
        const prev = data.articles[idx];
        if (!hasNewFile) {
          article.pdf = prev.pdf;
          article.pdf_size = prev.pdf_size;
        } else if (prev.pdf && prev.pdf !== key) {
          oldPdfToArchive = prev.pdf;
        }
        data.articles[idx] = { ...article, id: editId };
      } else {
        data.articles.unshift(article);
      }

      const putRes = await fetch(api, {
        method: 'PUT',
        headers: { ...gh, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: editId ? `Tahrirlandi: ${article.id}` : `Yangi nashr: ${article.id}`,
          content: b64encode(JSON.stringify(data, null, 2) + '\n'),
          sha: cur.sha,
          ...(env.GITHUB_BRANCH ? { branch: env.GITHUB_BRANCH } : {}),
        }),
      });
      if (putRes.ok) committed = true;
      else if (putRes.status !== 409 && putRes.status !== 422) throw new Error(`GitHub yozish xatosi: ${putRes.status}`);
    }
    if (!committed) throw new Error("articles.json ni yangilab bo'lmadi (konflikt)");

    if (oldPdfToArchive) {
      try { await archiveObject(env, oldPdfToArchive); } catch (e) { console.error(e); }
    }

    return json({ success: true, id: article.id, scholar_pdf: !article.pdf_size || article.pdf_size <= SCHOLAR_MAX });
  } catch (err) {
    if (key && !committed) { try { await env.R2_OMBOR.delete(key); } catch (_) {} }
    if (err instanceof UserError) return json({ success: false, error: err.message }, 400);
    console.error(err);
    return json({ success: false, error: "Server xatosi. Keyinroq qayta urinib ko'ring." }, 500);
  }
}
