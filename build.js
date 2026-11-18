// Cloudflare Pages: build buyrug'i "node build.js", chiqish papkasi "dist".
// Sayt mazmuni articles.json dan olinadi (admin panel uni avtomat yangilaydi).
'use strict';
const fs = require('fs'), path = require('path');
const CITE = require('./citations.js');

const D = JSON.parse(fs.readFileSync('articles.json', 'utf8'));
if (!Array.isArray(D.articles)) { console.error("articles.json: 'articles' massivi topilmadi"); process.exit(1); }
const S = { name: 'Ilmiy Maqolalar Portali', description: '', publisher: '', ...(D.site || {}) };
if (!S.publisher) S.publisher = S.name;
const cleanUrl = (u) => (u && !/loyiha-nomi\.pages\.dev/i.test(u) ? u : '');
const BASE = (cleanUrl(process.env.SITE_URL) || cleanUrl(S.url) || process.env.CF_PAGES_URL || 'https://scientific-article.pages.dev').replace(/\/$/, '');
const BUILD = Date.now().toString(36);

const SCHOLAR_MAX = 5000000;
const LANGS = ['uz', 'en', 'ru'];
const TYPES = { 'jurnal-maqolasi': 'Jurnal maqolasi', 'konferensiya-maqolasi': 'Konferensiya maqolasi', 'konferensiya-tezisi': 'Konferensiya tezisi', 'darslik': 'Darslik', 'oquv-qollanma': "O'quv qo'llanma", 'monografiya': 'Monografiya' };
const KIND = { 'jurnal-maqolasi': 'journal', 'konferensiya-maqolasi': 'conf', 'konferensiya-tezisi': 'conf', 'darslik': 'book', 'oquv-qollanma': 'book', 'monografiya': 'book' };
const ALIAS = { jurnal: 'jurnal-maqolasi', konferensiya: 'konferensiya-maqolasi' };
const AB = { uz: 'Annotatsiya', en: 'Abstract', ru: 'Аннотация' }, KW = { uz: "Kalit so'zlar", en: 'Keywords', ru: 'Ключевые слова' };
const OK = { issn: /^\d{4}-\d{3}[\dXx]$/, isbn: /^(?:\d[- ]?){9}[\dXx]$|^(?:\d[- ]?){12}\d$/, doi: /^10\.\d{4,9}\/\S+$/, date: /^\d{4}-\d{2}-\d{2}$/ };
const PDF_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i;
const PATRONYM = /^(?:o['ʻʼ‘’`´]?g['ʻʼ‘’`´]?li|ogli|ugli|qizi|kizi|kyzy|ўғли|қизи|оглы|кызы|угли)$/i;
const RESERVED = new Set(['article', 'collection', 'collections', 'author', 'authors', 'pdf', 'api', 'stats', 'data', 'css', 'js', 'admin']);

// ---------- yordamchilar ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const translit = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[ʻʼ‘’`'´]/g, '')
  .replace(/[а-яёўқғҳ]/g, (c) => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' }[c] || ''))
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const out = (p, h) => { const f = path.join('dist', p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, h); };
const meta = (n, v) => (v || v === 0 ? `<meta name="${n}" content="${esc(v)}">\n` : '');
const prop = (n, v) => (v || v === 0 ? `<meta property="${n}" content="${esc(v)}">\n` : '');
const plural = (n, w) => `${n} ta ${w}`;

const C = (D.collections || []).map((c) => ({ ...c, _id: slug(c.id) }));
const A = D.articles.map((a) => ({ ...a, _id: slug(a.id), _t: ALIAS[a.item_type] || a.item_type || 'jurnal-maqolasi' }));

const lang = (a) => (LANGS.includes(a.language) ? a.language : 'uz');
const first = (a, k) => a[k + '_' + lang(a)] || LANGS.map((l) => a[k + '_' + l]).find((v) => v && v.length);
const title = (a) => first(a, 'title'), abstract = (a) => first(a, 'abstract'), kws = (a) => first(a, 'keywords') || [];
const order = (a) => [lang(a), ...LANGS.filter((l) => l !== lang(a))];
const doi = (a) => (a.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
const pdfPath = (a) => `/pdf/${encodeURIComponent(a.pdf)}`;
const pdfUrl = (a) => `${BASE}${pdfPath(a)}`;
const scholarPdf = (a) => a.pdf && (!a.pdf_size || a.pdf_size <= SCHOLAR_MAX);
const pages = (a) => String(a.pages || '').split(/\s*[-–—]\s*/);
const src = (a) => { const k = KIND[a._t]; return k === 'journal' ? [a.journal_name, a.volume && `${a.volume}-tom`, a.issue && `${a.issue}-son`, a.pages && `B. ${a.pages}`] : k === 'conf' ? [a.conference_org, a.conference_place, a.pages && `B. ${a.pages}`] : [a.publisher, a.publisher_city]; };
const srcText = (a) => src(a).filter(Boolean).join(' · ');
const pubDate = (a) => (a.date ? a.date.replace(/-/g, '/') : String(a.year));
const fmtDate = (d) => (OK.date.test(d || '') ? d.split('-').reverse().join('.') : '');

// Ism: "Familiya, Ism Otasining ismi o'g'li" -> Scholar uchun "Familiya, Ism Otasining ismi"
function nameParts(full) {
  const s = String(full || '').replace(/\s+/g, ' ').trim();
  let family = s, given = '';
  if (s.includes(',')) { const k = s.indexOf(','); family = s.slice(0, k).trim(); given = s.slice(k + 1).trim(); }
  else { const sp = s.indexOf(' '); if (sp > 0) { family = s.slice(0, sp); given = s.slice(sp + 1).trim(); } }
  const toks = given.split(' ').filter((t) => t && !PATRONYM.test(t));
  return { family, toks };
}
const scholarName = (full) => { const n = nameParts(full); return n.toks.length ? `${n.family}, ${n.toks.join(' ')}` : n.family; };
const authorKey = (full) => { const n = nameParts(full); return translit([n.family, n.toks[0] || ''].join(' ')); };

// ---------- tekshiruv ----------
const bad = [], warn = [];
const seen = new Set();
for (const x of A) {
  const k = KIND[x._t], L = lang(x);
  if (!x._id || seen.has(x._id)) bad.push(`id xato yoki takror: ${x.id}`); seen.add(x._id);
  if (!k) bad.push(`${x.id}: item_type noto'g'ri: ${x.item_type}`);
  if (!x['title_' + L]) bad.push(`${x.id}: asosiy til (${L}) da sarlavha yo'q`);
  if (!x['abstract_' + L]) bad.push(`${x.id}: asosiy til (${L}) da annotatsiya yo'q (Google Scholar uchun shart)`);
  if (!x.authors?.length) bad.push(`${x.id}: mualliflar yo'q`); if (!x.year) bad.push(`${x.id}: yil yo'q`);
  if (k === 'journal' && !x.journal_name) bad.push(`${x.id}: jurnal nomi yo'q`);
  if (k === 'conf' && !x.conference_org) bad.push(`${x.id}: konferensiya nomi yo'q`);
  if (x.issn && !OK.issn.test(x.issn)) bad.push(`${x.id}: ISSN formati noto'g'ri`);
  if (x.isbn && !OK.isbn.test(x.isbn)) bad.push(`${x.id}: ISBN formati noto'g'ri`);
  if (x.doi && !OK.doi.test(doi(x))) bad.push(`${x.id}: DOI formati noto'g'ri`);
  if (x.date && !OK.date.test(x.date)) bad.push(`${x.id}: sana YYYY-MM-DD bo'lishi kerak`);
  if (x.pdf && !PDF_OK.test(x.pdf)) bad.push(`${x.id}: pdf fayl nomi noto'g'ri: ${x.pdf}`);
  if (x.date && Number(x.date.slice(0, 4)) !== Number(x.year)) warn.push(`${x.id}: yil (${x.year}) va sana (${x.date}) mos emas`);
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }

// Bir xil familiyali, lekin ismi turlicha yozilgan mualliflar (Google Scholar ularni har xil odam deb biladi)
const byFamily = {};
for (const a of A) for (const n of a.authors) { const f = translit(nameParts(n).family); (byFamily[f] = byFamily[f] || new Set()).add(scholarName(n)); }
for (const [f, set] of Object.entries(byFamily)) if (set.size > 1) warn.push(`Muallif ismi turlicha yozilgan (${f}): ${[...set].join(' | ')}`);
if (warn.length) console.warn('OGOHLANTIRISH:\n  ' + warn.join('\n  '));

// ---------- mualliflar ----------
const AUTH = {};
for (const a of A) for (const n of a.authors) {
  const k = authorKey(n) || 'muallif';
  const e = (AUTH[k] = AUTH[k] || { key: k, names: {}, items: [] });
  e.names[n] = (e.names[n] || 0) + 1;
  if (!e.items.includes(a)) e.items.push(a);
}
for (const e of Object.values(AUTH)) e.name = Object.entries(e.names).sort((x, y) => y[1] - x[1])[0][0];
const authorHref = (n) => `/author/${authorKey(n) || 'muallif'}/`;
const authorLinks = (a) => a.authors.map((n) => `<a href="${authorHref(n)}">${esc(n)}</a>`).join(', ');

// ---------- iqtiboslar ----------
function citeMeta(a, k, url) {
  return {
    kind: k, authors: a.authors, title: title(a), year: a.year, date: a.date, lang: lang(a), keywords: kws(a), abstract: abstract(a),
    journal: a.journal_name, volume: a.volume, issue: a.issue, pages: a.pages, doi: doi(a), url,
    container: a.conference_org, confPlace: a.conference_place,
    publisher: a.publisher, city: a.publisher_city, edition: a.edition, totalPages: a.total_pages, issn: a.issn, isbn: a.isbn,
  };
}

function buildJsonLd(a, k, d, url, fp, lp, c) {
  const obj = {
    '@context': 'https://schema.org',
    '@type': k === 'book' ? 'Book' : 'ScholarlyArticle',
    headline: title(a).slice(0, 110), name: title(a),
    author: a.authors.map((name) => ({ '@type': 'Person', name, url: `${BASE}${authorHref(name)}` })),
    datePublished: a.date || String(a.year), inLanguage: lang(a), url, mainEntityOfPage: url,
    isAccessibleForFree: true, license: 'https://creativecommons.org/licenses/by/4.0/',
    publisher: { '@type': 'Organization', name: a.publisher || S.publisher, url: BASE },
  };
  if (abstract(a)) obj.abstract = abstract(a);
  if (kws(a).length) obj.keywords = kws(a).join(', ');
  if (d) { obj.sameAs = `https://doi.org/${d}`; obj.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: d }; }
  if (a.isbn) obj.isbn = a.isbn;
  if (fp) obj.pageStart = fp;
  if (lp) obj.pageEnd = lp;
  if (k === 'journal' && a.journal_name) obj.isPartOf = { '@type': 'Periodical', name: a.journal_name, ...(a.issn ? { issn: a.issn } : {}) };
  else if (k === 'conf' && a.conference_org) obj.isPartOf = { '@type': 'Book', name: c ? c.name : a.conference_org };
  if (a.pdf) obj.encoding = { '@type': 'MediaObject', contentUrl: pdfUrl(a), encodingFormat: 'application/pdf' };
  if (a.references?.length) obj.citation = a.references.map((r) => ({ '@type': 'CreativeWork', name: r }));
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>\n`;
}

// ---------- sahifa qolipi ----------
const PAGE_ORDER = ['about', 'editorial-board', 'ethics', 'contact'];
const PAGES = Object.entries(D.pages || {}).filter(([k]) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(k) && !RESERVED.has(k))
  .sort((x, y) => ((PAGE_ORDER.indexOf(x[0]) + 1 || 99) - (PAGE_ORDER.indexOf(y[0]) + 1 || 99)));
const NAV = [['/', 'Nashrlar'], ...(C.length ? [['/collections/', "To'plamlar"]] : []), ['/authors/', 'Mualliflar'], ...PAGES.map(([k, t]) => [`/${k}/`, t.title])];
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b3c42'/%3E%3Cpath d='M18 18h18a10 10 0 0 1 10 10v18H28a10 10 0 0 1-10-10z' fill='%23fff'/%3E%3Cpath d='M26 30h14M26 37h10' stroke='%230b3c42' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";
const I = {
  pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
};

const page = ({ t, d, body, p = '/', head = '', l = 'uz', type = 'website', scripts = ['app'] }) => `<!doctype html>
<html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="google-site-verification" content="vQNgaEMkoKVjJBtF3rtL4v_wphIuwCbRxkA3h495RTY">
<title>${esc(t)}</title><meta name="description" content="${esc(String(d || '').slice(0, 300))}"><link rel="canonical" href="${BASE}${p}">
<meta name="theme-color" content="#0b3c42"><link rel="icon" href="${ICON}">
${prop('og:site_name', S.name)}${prop('og:type', type)}${prop('og:title', t)}${prop('og:description', String(d || '').slice(0, 300))}${prop('og:url', BASE + p)}${meta('twitter:card', 'summary')}${head}<link rel="stylesheet" href="/css/style.css?v=${BUILD}">
${scripts.map((s) => `<script src="/js/${s}.js?v=${BUILD}" defer></script>`).join('\n')}
</head><body>
<a class="skip" href="#main">Asosiy mazmunga o'tish</a>
<header class="site-head"><div class="wrap head-in">
<a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>${esc(S.name)}</span></a>
<nav class="nav" aria-label="Asosiy menyu">${NAV.map(([h, n]) => `<a href="${h}"${(h === '/' ? p === '/' : p.startsWith(h)) ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('')}</nav>
</div></header>
<main id="main">${body}</main>
<footer class="site-foot"><div class="wrap foot-in">
<div><p class="foot-brand">${esc(S.name)}</p><p>${esc(S.description || '')}</p></div>
<div><p>${esc(S.publisher)}${S.email ? ` · <a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ''}</p>
<p>Barcha nashrlar ochiq foydalanishda. Litsenziya: <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener noreferrer">CC BY 4.0</a> · <a href="/sitemap.xml">Sayt xaritasi</a></p></div>
</div></footer></body></html>`;

// Ro'yxat elementi (bosh sahifa, to'plam, muallif sahifalari)
const card = (a) => `<li class="entry" data-s="${esc([title(a), ...LANGS.map((l) => a['title_' + l] || ''), a.authors.join(' '), kws(a).join(' '), srcText(a), a.year].join(' ').toLowerCase())}">
<div class="entry-top"><span class="badge">${esc(TYPES[a._t])}</span><span class="entry-year">${esc(a.year)}</span>${a.doi ? '<span class="badge soft">DOI</span>' : ''}</div>
<h3 class="entry-title" lang="${lang(a)}"><a href="/article/${a._id}/">${esc(title(a))}</a></h3>
<p class="entry-by">${esc(a.authors.join(', '))}</p>
<p class="entry-src">${esc(srcText(a))}</p></li>`;

const byDate = (x, y) => String(y.date || y.year).localeCompare(String(x.date || x.year));
const ledger = (L) => `<div class="ledger" data-list>${[...new Set(L.map((a) => a.year))].sort((x, y) => y - x).map((y) => `<section class="yr" data-year><h2 class="yr-h">${y}</h2><ul class="entries">${L.filter((a) => a.year === y).sort(byDate).map(card).join('')}</ul></section>`).join('')}
<p class="empty" data-empty hidden>Hech narsa topilmadi. Boshqa so'z bilan qidirib ko'ring.</p></div>`;

const searchBox = (ph) => `<form class="search" role="search" action="/" method="get" data-search>
<label class="sr" for="q">Qidirish</label>${I.search}<input id="q" name="q" type="search" placeholder="${esc(ph)}" autocomplete="off">
</form>`;

// ---------- bosh sahifa ----------
const nAuthors = Object.keys(AUTH).length;
const collCards = (L) => `<div class="colls">${L.map((c) => {
  const n = A.filter((a) => a.collection === c.id).length;
  return `<a class="coll" href="/collection/${c._id}/"><span class="badge">${c.type === 'journal' ? 'Jurnal soni' : 'Konferensiya'}</span><strong>${esc(c.name)}</strong><span class="coll-n">${plural(n, 'nashr')}${c.year ? ' · ' + esc(c.year) : ''}</span></a>`;
}).join('')}</div>`;

out('index.html', page({
  t: S.name, d: S.description, p: '/',
  head: `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: S.name, url: BASE + '/', description: S.description, publisher: { '@type': 'Organization', name: S.publisher } }).replace(/</g, '\\u003c')}</script>\n`,
  body: `<section class="hero"><div class="wrap hero-in">
<p class="eyebrow">Ochiq ilmiy repozitoriy</p>
<h1>${esc(S.name)}</h1>
<p class="lead">${esc(S.description || '')}</p>
${searchBox("Sarlavha, muallif, kalit so'z yoki konferensiya bo'yicha qidirish")}
<dl class="figures"><div><dt>Nashrlar</dt><dd>${A.length}</dd></div><div><dt>To'plamlar</dt><dd>${C.length}</dd></div><div><dt>Mualliflar</dt><dd>${nAuthors}</dd></div></dl>
</div></section>
<div class="wrap">
${C.length ? `<section class="block"><div class="block-h"><h2>To'plamlar</h2><a href="/collections/">Barchasi</a></div>${collCards(C.slice(0, 6))}</section>` : ''}
<section class="block"><div class="block-h"><h2>Barcha nashrlar</h2><span class="muted" data-count>${plural(A.length, 'nashr')}</span></div>${ledger(A)}</section>
</div>`,
}));

// ---------- to'plamlar ----------
if (C.length) out('collections/index.html', page({
  t: `To'plamlar - ${S.name}`, d: `${S.name}: konferensiya va jurnal to'plamlari`, p: '/collections/',
  body: `<section class="hero slim"><div class="wrap hero-in"><h1>To'plamlar</h1><p class="lead">Konferensiya materiallari va jurnal sonlari</p></div></section><div class="wrap block">${collCards(C)}</div>`,
}));

const toc = (L) => L.slice().sort((x, y) => (parseInt(pages(x)[0], 10) || 1e9) - (parseInt(pages(y)[0], 10) || 1e9) || byDate(x, y));
for (const c of C) {
  const L = A.filter((a) => a.collection === c.id);
  const facts = [['Turi', c.type === 'journal' ? 'Jurnal soni' : 'Konferensiya materiallari to\'plami'], ['Yil', c.year], ['Sana', c.date], ["O'tkazilgan joyi", c.place], ['Nashriyot', c.publisher], ["Mas'ul muharrir", c.editor], ['ISSN', c.issn], ['ISBN', c.isbn], ['Nashrlar soni', L.length]].filter((r) => r[1]);
  out(`collection/${c._id}/index.html`, page({
    t: `${c.name} - ${S.name}`, d: c.description || `${c.name}: ${plural(L.length, 'nashr')}`, p: `/collection/${c._id}/`,
    body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/collections/">To'plamlar</a></p><h1>${esc(c.name)}</h1>${c.description ? `<p class="lead">${esc(c.description)}</p>` : ''}
<dl class="facts">${facts.map((r) => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join('')}</dl></div></section>
<div class="wrap block"><div class="block-h"><h2>Mundarija</h2><span class="muted">${plural(L.length, 'nashr')}</span></div>
<ol class="toc">${toc(L).map((a) => `<li><div><a href="/article/${a._id}/" lang="${lang(a)}">${esc(title(a))}</a><span class="entry-by">${esc(a.authors.join(', '))}</span></div><span class="toc-p">${esc(a.pages || '')}</span></li>`).join('')}</ol></div>`,
  }));
}

// ---------- mualliflar ----------
const AU = Object.values(AUTH).sort((x, y) => x.name.localeCompare(y.name, 'uz'));
out('authors/index.html', page({
  t: `Mualliflar - ${S.name}`, d: `${S.name} mualliflari ro'yxati`, p: '/authors/',
  body: `<section class="hero slim"><div class="wrap hero-in"><h1>Mualliflar</h1><p class="lead">${plural(AU.length, 'muallif')}</p></div></section>
<div class="wrap block"><ul class="authors-grid">${AU.map((e) => `<li><a href="/author/${e.key}/">${esc(e.name)}</a><span class="muted">${plural(e.items.length, 'nashr')}</span></li>`).join('')}</ul></div>`,
}));
for (const e of AU) {
  const other = Object.keys(e.names).filter((n) => n !== e.name);
  out(`author/${e.key}/index.html`, page({
    t: `${e.name} - ${S.name}`, d: `${e.name}: ${plural(e.items.length, 'nashr')}`, p: `/author/${e.key}/`, type: 'profile',
    head: `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: e.name, url: `${BASE}/author/${e.key}/` }).replace(/</g, '\\u003c')}</script>\n`,
    body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/authors/">Mualliflar</a></p><h1>${esc(e.name)}</h1><p class="lead">${plural(e.items.length, 'nashr')}${other.length ? ` · boshqa yozilishi: ${esc(other.join('; '))}` : ''}</p></div></section>
<div class="wrap block">${ledger(e.items)}</div>`,
  }));
}

// ---------- maqola sahifalari ----------
for (const a of A) {
  const k = KIND[a._t], L = lang(a), c = C.find((x) => x.id === a.collection), d = doi(a), url = `${BASE}/article/${a._id}/`, [fp, lp] = pages(a);
  const refs = [].concat(a.references || []).filter(Boolean);

  // Google Scholar (Highwire Press) meta teglari
  const head = meta('citation_title', title(a))
    + a.authors.map((x) => meta('citation_author', scholarName(x))).join('')
    + meta('citation_publication_date', pubDate(a))
    + (k === 'journal' ? meta('citation_journal_title', a.journal_name) + meta('citation_volume', a.volume) + meta('citation_issue', a.issue) : '')
    + (k === 'conf' ? meta('citation_conference_title', a.conference_org) : '')
    + (k === 'book' ? meta('citation_publisher', a.publisher) : meta('citation_firstpage', fp) + meta('citation_lastpage', lp))
    + meta('citation_doi', d) + meta('citation_issn', a.issn) + meta('citation_isbn', a.isbn) + meta('citation_language', L)
    + meta('citation_keywords', kws(a).join('; '))
    + meta('citation_abstract_html_url', url) + (scholarPdf(a) ? meta('citation_pdf_url', pdfUrl(a)) : '')
    + refs.map((r) => meta('citation_reference', r)).join('')
    // Dublin Core (boshqa indeksatorlar uchun)
    + `<link rel="schema.DC" href="http://purl.org/dc/elements/1.1/">\n`
    + meta('DC.title', title(a)) + a.authors.map((x) => meta('DC.creator', x)).join('') + meta('DC.date', a.date || a.year)
    + meta('DC.type', 'Text') + meta('DC.format', 'application/pdf') + meta('DC.language', L) + meta('DC.identifier', d ? `https://doi.org/${d}` : url)
    + meta('DC.rights', 'https://creativecommons.org/licenses/by/4.0/')
    + prop('article:published_time', a.date || String(a.year))
    + buildJsonLd(a, k, d, url, fp, lp, c);

  const rows = [['Turi', TYPES[a._t]], ['Nashr yili', a.year], ['Nashr sanasi', fmtDate(a.date)],
    k === 'journal' && ['Jurnal', a.journal_name], k === 'journal' && ['Tom / son', [a.volume, a.issue].filter(Boolean).join(' / ')],
    k === 'conf' && ['Konferensiya', a.conference_org], k === 'conf' && ["O'tkazilgan joyi", a.conference_place], k === 'conf' && ['Konferensiya sanasi', a.conference_date],
    k === 'book' && ['Nashriyot', a.publisher], k === 'book' && ['Nashr joyi', a.publisher_city], k === 'book' && ['Nashr', a.edition], k === 'book' && ['Hajmi (bet)', a.total_pages],
    k !== 'book' && ['Betlar', a.pages], ['ISSN', a.issn], ['ISBN', a.isbn], ['UDK', a.udk], ['BBK', a.bbk]].filter((r) => r && r[1]);
  const dl = rows.map((r) => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join('')
    + (c ? `<div><dt>To'plam</dt><dd><a href="/collection/${c._id}/">${esc(c.name)}</a></dd></div>` : '')
    + (d ? `<div><dt>DOI</dt><dd><a href="https://doi.org/${encodeURI(d)}" rel="noopener noreferrer">https://doi.org/${esc(d)}</a></dd></div>` : '');
  const alt = order(a).slice(1).filter((l) => a['title_' + l]).map((l) => `<p class="alt-title" lang="${l}">${esc(a['title_' + l])}</p>`).join('');
  const ab = order(a).filter((l) => a['abstract_' + l]).map((l) => `<section class="abs" lang="${l}"><h2>${AB[l]}</h2><p>${esc(a['abstract_' + l])}</p>${a['keywords_' + l]?.length ? `<p class="kw"><strong>${KW[l]}:</strong> ${a['keywords_' + l].map((w) => `<span class="chip">${esc(w)}</span>`).join(' ')}</p>` : ''}</section>`).join('');

  const cm = citeMeta(a, k, url);
  const cites = CITE.all(cm);
  const bibB64 = Buffer.from(CITE.bibtex(cm), 'utf8').toString('base64');
  const risB64 = Buffer.from(CITE.ris(cm), 'utf8').toString('base64');
  const size = a.pdf_size ? `${(a.pdf_size / 1048576).toFixed(1)} MB` : '';

  const citeBox = `<section class="panel" id="cite"><h2>${I.quote} Iqtibos keltirish</h2>
<div class="cite" data-cite><div class="cite-bar"><label for="citeStyle">Uslub</label><select id="citeStyle" data-cite-select>${cites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
<button type="button" class="btn sm" data-cite-copy hidden>Nusxa olish</button></div>
${cites.map((s, i) => `<div class="cite-item${i === 0 ? ' on' : ''}" data-style="${s.id}"><p class="cite-name">${esc(s.name)}</p><p class="cite-text">${s.html}</p></div>`).join('')}
<p class="cite-files"><a href="data:application/x-bibtex;charset=utf-8;base64,${bibB64}" download="${esc(a._id)}.bib">BibTeX (.bib)</a><a href="data:application/x-research-info-systems;charset=utf-8;base64,${risB64}" download="${esc(a._id)}.ris">RIS / EndNote / Zotero (.ris)</a></p></div></section>`;

  const viewer = a.pdf ? `<section class="panel viewer" id="read" data-viewer data-src="${pdfPath(a)}" data-title="${esc(title(a))}">
<div class="viewer-h"><h2>${I.pdf} Maqolani o'qish</h2>
<div class="viewer-tools" data-tools hidden>
<button type="button" class="tbtn" data-act="prev" aria-label="Oldingi sahifa">‹</button><span class="vp" data-pageinfo>1 / 1</span><button type="button" class="tbtn" data-act="next" aria-label="Keyingi sahifa">›</button>
<span class="sep"></span><button type="button" class="tbtn" data-act="out" aria-label="Kichiklashtirish">−</button><span class="vp" data-zoom>100%</span><button type="button" class="tbtn" data-act="in" aria-label="Kattalashtirish">+</button>
<button type="button" class="tbtn" data-act="fit">Kenglik</button><button type="button" class="tbtn" data-act="full">To'liq ekran</button></div></div>
<div class="viewer-body" data-body><div class="viewer-ph" data-ph><p>PDF sahifaning o'zida ochiladi.</p><button type="button" class="btn" data-act="load">Maqolani ochish</button>
<noscript><p>Brauzeringizda JavaScript o'chirilgan. PDF ni <a href="${pdfPath(a)}">shu havola orqali</a> oching.</p></noscript></div></div>
<p class="viewer-alt">Ko'rinmasa: <a href="${pdfPath(a)}" target="_blank" rel="noopener">PDF ni yangi oynada ochish</a> yoki <a href="${pdfPath(a)}?dl=1" data-dl>yuklab olish</a>.</p></section>` : '';

  const refsBox = refs.length ? `<section class="panel refs" id="references" lang="${L}"><h2>Foydalanilgan adabiyotlar <span class="muted">(References)</span></h2>
<ol class="ref-list">${refs.map((r) => `<li>${esc(r).replace(/(https?:\/\/[^\s<]+[^\s<.,;:)\]])/g, '<a href="$1" rel="nofollow noopener noreferrer">$1</a>')}</li>`).join('')}</ol>
<p class="small"><a href="data:text/plain;charset=utf-8;base64,${Buffer.from(refs.map((r, i) => `${i + 1}. ${r}`).join('\n'), 'utf8').toString('base64')}" download="${esc(a._id)}-adabiyotlar.txt">Adabiyotlar ro'yxatini yuklab olish (.txt)</a></p></section>` : '';

  const aside = `<aside class="side">
${a.pdf ? `<div class="side-card"><a class="btn block" href="${pdfPath(a)}" target="_blank" rel="noopener">${I.pdf} To'liq matn (PDF)</a>
<a class="btn ghost block" href="${pdfPath(a)}?dl=1" data-dl>${I.down} Yuklab olish${size ? ` <span class="muted">${size}</span>` : ''}</a></div>` : ''}
<div class="side-card stats" data-stats="${esc(a._id)}"><div><span class="stat-i">${I.eye}</span><b data-views>–</b><span>ko'rishlar</span></div><div><span class="stat-i">${I.down}</span><b data-downloads>–</b><span>yuklab olishlar</span></div></div>
<div class="side-card"><p class="side-h">Ushbu sahifada</p><nav class="toc-side" aria-label="Sahifa bo'limlari"><a href="#abstract">Annotatsiya</a>${a.pdf ? '<a href="#read">Maqolani o\'qish</a>' : ''}${refs.length ? '<a href="#references">Adabiyotlar</a>' : ''}<a href="#cite">Iqtibos keltirish</a></nav>
<button type="button" class="btn ghost sm block" data-share>${I.link} Havolani nusxalash</button></div>
<div class="side-card lic"><p>Ochiq foydalanish · <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener noreferrer">CC BY 4.0</a></p></div>
</aside>`;

  out(`article/${a._id}/index.html`, page({
    t: `${title(a)} - ${S.name}`, d: abstract(a) || title(a), p: `/article/${a._id}/`, l: L, type: 'article', scripts: ['app', 'viewer'],
    head,
    body: `<div class="wrap art-wrap"><nav class="crumbs" aria-label="Yo'l"><a href="/">Nashrlar</a>${c ? ` <span>/</span> <a href="/collection/${c._id}/">${esc(c.name)}</a>` : ''}</nav>
<div class="art-grid"><article class="paper" data-article="${esc(a._id)}">
<header class="paper-h"><p class="paper-kind"><span class="badge">${esc(TYPES[a._t])}</span>${d ? `<a class="badge soft" href="https://doi.org/${encodeURI(d)}" rel="noopener noreferrer">DOI: ${esc(d)}</a>` : ''}</p>
<h1 lang="${L}">${esc(title(a))}</h1>${alt}
<p class="paper-authors">${authorLinks(a)}</p>
<p class="paper-src">${esc(srcText(a))}${a.year ? `, ${esc(a.year)}` : ''}</p></header>
<dl class="facts card-facts">${dl}</dl>
<div id="abstract">${ab}</div>
${viewer}${refsBox}${citeBox}
</article>${aside}</div></div>`,
  }));
}

// ---------- ma'lumot sahifalari ----------
for (const [k, t] of PAGES) out(`${k}/index.html`, page({
  t: `${t.title} - ${S.name}`, d: (t.text || []).join(' ').slice(0, 200) || t.title, p: `/${k}/`,
  body: `<section class="hero slim"><div class="wrap hero-in"><h1>${esc(t.title)}</h1></div></section><div class="wrap block"><div class="prose">${(t.text || []).map((x) => `<p>${esc(x).replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, '<a href="mailto:$1">$1</a>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener">$1</a>')}</p>`).join('')}</div></div>`,
}));
out('404.html', page({ t: 'Sahifa topilmadi', d: S.name, p: '/404.html', body: `<section class="hero slim"><div class="wrap hero-in"><h1>Sahifa topilmadi</h1><p class="lead">Manzil noto'g'ri yoki sahifa ko'chirilgan.</p><p><a class="btn" href="/">Bosh sahifaga qaytish</a></p></div></section>` }));

// ---------- xizmat fayllari ----------
// Funksiyalar uchun indeks: statistikani tekshirish va eski PDF havolalarini yo'naltirish
out('data/index.json', JSON.stringify({ built: new Date().toISOString(), articles: Object.fromEntries(A.map((a) => [a.id, { pdf: a.pdf || null, ...(a.pdf_aliases?.length ? { aliases: a.pdf_aliases } : {}) }])) }));

const urls = [['/'], ...(C.length ? [['/collections/']] : []), ...C.map((c) => [`/collection/${c._id}/`]), ['/authors/'], ...AU.map((e) => [`/author/${e.key}/`]),
  ...A.map((a) => [`/article/${a._id}/`, a.updated || a.date]), ...PAGES.map(([k]) => [`/${k}/`])];
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, m]) => `<url><loc>${BASE}${u}</loc>${m && OK.date.test(m) ? `<lastmod>${esc(m)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
out('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin.html\nDisallow: /stats\nDisallow: /*?dl=1\n\nSitemap: ${BASE}/sitemap.xml\n`);
out('_headers', `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; script-src 'self'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'

/admin.html
  ! Content-Security-Policy
  Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; script-src 'self' https://cdnjs.cloudflare.com; worker-src 'self' blob: https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://cdnjs.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store

/data/*
  X-Robots-Tag: noindex
  Cache-Control: public, max-age=60

/css/*
  Cache-Control: public, max-age=31536000, immutable
/js/*
  Cache-Control: public, max-age=31536000, immutable
/js/vendor/*
  Cache-Control: public, max-age=31536000, immutable
`);

for (const dir of ['css', 'js']) if (fs.existsSync(dir)) fs.cpSync(dir, path.join('dist', dir), { recursive: true });
if (fs.existsSync('admin.html')) fs.writeFileSync(path.join('dist', 'admin.html'), fs.readFileSync('admin.html', 'utf8').replace(/\?v=\w+/g, `?v=${BUILD}`));
console.log(`Tayyor: ${A.length} nashr, ${C.length} to'plam, ${AU.length} muallif, ${urls.length} sahifa`);
