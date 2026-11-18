// Cloudflare Pages: build buyrug'i "node build.js", chiqish papkasi "dist".
// Sayt mazmuni articles.json dan olinadi (admin panel uni avtomat yangilaydi).
'use strict';
const fs = require('fs'), path = require('path');
const CITE = require('./citations.js');

const D = JSON.parse(fs.readFileSync(process.env.DATA_FILE || 'articles.json', 'utf8'));
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
const RESERVED = new Set(['article', 'collection', 'collections', 'author', 'authors', 'pdf', 'api', 'stats', 'data', 'css', 'js', 'admin',
  'journal', 'journals', 'conference', 'conferences', 'news', 'archive', 'search', 'feed', 'oai',
  'field', 'fields', 'organization', 'organizations', 'latest']);
const LANG_NAME = { uz: "O'zbekcha", en: 'English', ru: 'Русский' };
const TODAY = new Date().toISOString().slice(0, 10);

// ---------- yordamchilar ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const translit = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[ʻʼ‘’`'´]/g, '')
  .replace(/[а-яёўқғҳ]/g, (c) => ({ а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' }[c] || ''))
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const fieldKey = (f) => translit(f).slice(0, 60);
const out = (p, h) => { const f = path.join('dist', p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, h); };
const meta = (n, v) => (v || v === 0 ? `<meta name="${n}" content="${esc(v)}">\n` : '');
const prop = (n, v) => (v || v === 0 ? `<meta property="${n}" content="${esc(v)}">\n` : '');
const plural = (n, w) => `${n} ta ${w}`;

const C = (D.collections || []).map((c) => ({ ...c, _id: slug(c.id) }));
const A = D.articles.map((a) => ({ ...a, _id: slug(a.id), _t: ALIAS[a.item_type] || a.item_type || 'jurnal-maqolasi' }));

// Nashr seriyalari (jurnal yoki konferensiya): har birining sonlari / to'plamlari bo'ladi
const SER = (D.series || []).map((s) => ({ ...s, _id: slug(s.id), _kind: s.type === 'journal' ? 'journal' : 'conf' }));
const serHref = (s) => `/${s._kind === 'journal' ? 'journal' : 'conference'}/${s._id}/`;
const serLabel = (s) => (s._kind === 'journal' ? 'Jurnal' : 'Konferensiya');
const serOf = (c) => (c && c.series ? SER.find((s) => s.id === c.series) || null : null);
// E'lonlar (konferensiyaga chaqiruv, yangiliklar)
const NEWS = (D.news || []).map((n) => ({ ...n, _id: slug(n.id) })).sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')));
const paras = (t) => [].concat(t || []).flatMap((x) => String(x).split(/\n\s*\n/)).map((x) => x.trim()).filter(Boolean);

// Maqolada bo'sh qolgan bibliografik maydonlar to'plam (son) va seriyadan to'ldiriladi:
// bir son ichidagi barcha maqolalarning Scholar metama'lumoti bir xil bo'lishi uchun
for (const a of A) {
  const c = C.find((x) => x.id === a.collection) || null, s = serOf(c), k = KIND[a._t];
  a._c = c; a._s = s;
  if (k === 'journal') {
    a.journal_name = a.journal_name || (s && s.name) || (c && c.type === 'journal' ? c.name : '');
    a.volume = a.volume || (c && c.volume) || '';
    a.issue = a.issue || (c && c.number) || '';
    a.issn = a.issn || (c && c.issn) || (s && (s.issn || s.eissn)) || '';
  } else if (k === 'conf') {
    a.conference_org = a.conference_org || (c && c.name) || (s && s.name) || '';
    a.conference_place = a.conference_place || (c && c.place) || '';
    a.conference_date = a.conference_date || (c && c.date) || '';
    a.isbn = a.isbn || (c && c.isbn) || '';
    a.issn = a.issn || (c && c.issn) || (s && (s.issn || s.eissn)) || '';
  }
  a._publisher = (s && s.publisher) || (c && c.publisher) || (k === 'book' ? a.publisher : '') || S.publisher;
  a._info = (a.authors || []).map((n, i) => ((a.author_info || [])[i] || {}));
  a._field = String(a.field || (s && s.field) || '').trim();
}
const HAS_ORGS = A.some((a) => a._info.some((x) => x.org));
// Fan sohalari (har bir maqolaga bitta; sohalar soni cheklangan)
const FIELDS = {};
for (const a of A) if (a._field) { const k = fieldKey(a._field); (FIELDS[k] = FIELDS[k] || { key: k, names: {}, items: [] }).items.push(a); FIELDS[k].names[a._field] = (FIELDS[k].names[a._field] || 0) + 1; }
const FIELD_LIST = Object.values(FIELDS).map((f) => ({ ...f, name: Object.entries(f.names).sort((x, y) => y[1] - x[1])[0][0] })).sort((x, y) => x.name.localeCompare(y.name, 'uz'));

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
// (yagona manba: citations.js; admin panel ham shu qoidaga amal qiladi)
const nameParts = (full) => { const n = CITE.parseName(full); return { family: n.family, toks: n.toks }; };
const scholarName = CITE.scholarName;
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
  for (const n of x.authors || []) if (!String(n).includes(',')) warn.push(`${x.id}: muallif ismida vergul yo'q ("${n}"), birinchi so'z familiya deb olindi. To'g'ri shakl: "Familiya, Ism Otasining ismi"`);
  if (x.date && Number(x.date.slice(0, 4)) !== Number(x.year)) warn.push(`${x.id}: yil (${x.year}) va sana (${x.date}) mos emas`);
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }

// ---------- muallif ismlarini birlashtirish (admin panel: Sahifalar > Muallif ismlari) ----------
// site.author_groups: [{ name: "Asosiy ism", variants: ["Boshqa yozilish", ...], show_variants: true|false }]
// Metama'lumot (citation_author) o'zgarmaydi: har bir maqola o'z PDF idagi yozuvni saqlaydi.
// Faqat saytdagi muallif sahifasi bitta bo'ladi, eski manzil asosiysiga 301 bilan yo'naltiriladi.
const GROUPS = [], KEYMAP = {};
for (const g of [].concat(S.author_groups || [])) {
  const name = String((g && g.name) || '').trim(), k = authorKey(name);
  if (!name || !k) continue;
  const grp = { key: k, name, variants: [].concat(g.variants || []).map((v) => String(v).trim()).filter(Boolean), show: g.show_variants === true };
  GROUPS.push(grp);
  for (const v of grp.variants) {
    const vk = authorKey(v);
    if (!vk || vk === k) continue;
    if (KEYMAP[vk] && KEYMAP[vk] !== k) warn.push(`Muallif ismi ikki guruhga kiritilgan: "${v}"`);
    else KEYMAP[vk] = k;
  }
}
for (const g of GROUPS) if (KEYMAP[g.key]) warn.push(`Asosiy ism boshqa guruhda "boshqa yozilish" sifatida ham turibdi: "${g.name}"`);
const GROUP_BY_KEY = Object.fromEntries(GROUPS.map((g) => [g.key, g]));
const resolveKey = (n) => { const k = authorKey(n) || 'muallif'; return KEYMAP[k] || k; };

// Bir xil familiyali, lekin ismi turlicha yozilgan mualliflar (Google Scholar ularni har xil odam deb biladi).
// Admin panelda birlashtirilgan ismlar uchun ogohlantirish berilmaydi.
const byFamily = {};
for (const a of A) for (const n of a.authors) {
  const f = translit(nameParts(n).family), rk = resolveKey(n);
  const m = (byFamily[f] = byFamily[f] || {});
  (m[rk] = m[rk] || new Set()).add(scholarName(n));
}
for (const [f, m] of Object.entries(byFamily)) {
  const keys = Object.keys(m), all = [...new Set(keys.flatMap((k) => [...m[k]]))];
  const loose = keys.filter((k) => !GROUP_BY_KEY[k] && m[k].size > 1);
  if (keys.length > 1 || loose.length) warn.push(`Muallif ismi turlicha yozilgan (${f}): ${all.join(' | ')}. Bitta odam bo'lsa, admin panelda "Muallif ismlari" bo'limida birlashtiring.`);
}
if (warn.length) console.warn('OGOHLANTIRISH:\n  ' + warn.join('\n  '));

// ---------- mualliflar ----------
const AUTH = {};
for (const a of A) a.authors.forEach((n, i) => {
  const k = resolveKey(n);
  const e = (AUTH[k] = AUTH[k] || { key: k, names: {}, items: [], orgs: {}, orcid: '' });
  e.names[n] = (e.names[n] || 0) + 1;
  if (!e.items.includes(a)) e.items.push(a);
  const inf = a._info[i];
  if (inf.org) e.orgs[inf.org] = (e.orgs[inf.org] || 0) + 1;
  if (inf.orcid && !e.orcid) e.orcid = inf.orcid;
});
// Muallif profillari (admin panel: Mualliflar): ism bo'yicha bog'lanadi
const PROFILES = {};
for (const p of [].concat(D.profiles || [])) if (p && p.name) PROFILES[resolveKey(p.name)] = p;
for (const e of Object.values(AUTH)) {
  const pr = PROFILES[e.key];
  if (pr) { e.profile = pr; if (pr.orcid) e.orcid = pr.orcid; if (pr.org) e.orgs[pr.org] = (e.orgs[pr.org] || 0) + 1000; }
}
for (const e of Object.values(AUTH)) {
  const g = GROUP_BY_KEY[e.key];
  e.name = g ? g.name : Object.entries(e.names).sort((x, y) => y[1] - x[1])[0][0];
  // "Boshqa yozilishi": guruhda faqat show_variants yoqilgan bo'lsa; o'g'li/qizi yoki katta-kichik harf farqi hisobga olinmaydi
  const seenN = new Set([scholarName(e.name).toLowerCase()]);
  const cand = g ? (g.show ? [...g.variants, ...Object.keys(e.names)] : []) : Object.keys(e.names);
  e.other = cand.filter((n) => { const s2 = scholarName(n).toLowerCase(); if (seenN.has(s2)) return false; seenN.add(s2); return true; });
}
const authorHref = (n) => `/author/${resolveKey(n)}/`;
const authorLinks = (a) => a.authors.map((n) => `<a href="${authorHref(n)}">${esc(n)}</a>`).join(', ');
const ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
const orcidLink = (o) => (o && ORCID_RE.test(o) ? `<a class="orcid" href="https://orcid.org/${o}" rel="noopener noreferrer" title="ORCID: ${o}" aria-label="ORCID ${o}">iD</a>` : '');
// Mualliflar bloki: ism, ORCID va ish joyi (afilliatsiya) raqamlari bilan
function byline(a) {
  const orgs = [...new Set(a._info.map((x) => x.org).filter(Boolean))];
  const sup = (i) => { const o = a._info[i].org; return o && orgs.length > 1 ? `<sup>${orgs.indexOf(o) + 1}</sup>` : ''; };
  return `<ul class="byline">${a.authors.map((n, i) => `<li><a href="${authorHref(n)}">${esc(n)}</a>${sup(i)}${orcidLink(a._info[i].orcid)}</li>`).join('')}</ul>`
    + (orgs.length ? `<ol class="affils${orgs.length > 1 ? '' : ' one'}">${orgs.map((o) => `<li>${orgHref(o) ? `<a href="${orgHref(o)}">${esc(o)}</a>` : esc(o)}</li>`).join('')}</ol>` : '');
}

// ---------- iqtiboslar ----------
function citeMeta(a, k, url) {
  return {
    kind: k, authors: a.authors, title: title(a), year: a.year, date: a.date, lang: lang(a), keywords: kws(a), abstract: abstract(a),
    journal: a.journal_name, volume: a.volume, issue: a.issue, pages: a.pages, doi: doi(a), url,
    container: a.conference_org, confPlace: a.conference_place,
    publisher: a.publisher, city: a.publisher_city, edition: a.edition, totalPages: a.total_pages, issn: a.issn, isbn: a.isbn,
  };
}

// schema.org Person: name - Scholar shaklida; familyName / givenName / additionalName (otasining ismi) alohida
function personLd(full, info = {}) {
  const n = nameParts(full);
  const p = { '@type': 'Person', name: scholarName(full), familyName: n.family };
  if (info.org) p.affiliation = { '@type': 'Organization', name: info.org };
  if (info.orcid && ORCID_RE.test(info.orcid)) p.sameAs = `https://orcid.org/${info.orcid}`;
  if (n.toks[0]) p.givenName = n.toks[0];
  if (n.toks.length > 1) p.additionalName = n.toks.slice(1).join(' ');
  p.url = `${BASE}${authorHref(full)}`;
  return p;
}

function buildJsonLd(a, k, d, url, fp, lp, c) {
  const obj = {
    '@context': 'https://schema.org',
    '@type': k === 'book' ? 'Book' : 'ScholarlyArticle',
    headline: title(a).slice(0, 110), name: title(a),
    author: a.authors.map((n, i) => personLd(n, a._info[i])),
    datePublished: a.date || String(a.year), inLanguage: lang(a), url, mainEntityOfPage: url,
    isAccessibleForFree: true, license: 'https://creativecommons.org/licenses/by/4.0/',
    publisher: { '@type': 'Organization', name: a._publisher, url: BASE },
  };
  if (abstract(a)) obj.abstract = abstract(a);
  if (kws(a).length) obj.keywords = kws(a).join(', ');
  if (d) { obj.sameAs = `https://doi.org/${d}`; obj.identifier = { '@type': 'PropertyValue', propertyID: 'DOI', value: d }; }
  if (a.isbn) obj.isbn = a.isbn;
  if (fp) obj.pageStart = fp;
  if (lp) obj.pageEnd = lp;
  if (k === 'journal' && a.journal_name) {
    // Maqola -> Son -> Tom -> Jurnal (schema.org tavsiyasi)
    let part = { '@type': 'Periodical', name: a.journal_name, ...(a.issn ? { issn: a.issn } : {}), ...(a._s ? { url: BASE + serHref(a._s) } : {}) };
    if (a.volume) part = { '@type': 'PublicationVolume', volumeNumber: String(a.volume), isPartOf: part };
    if (a.issue) part = { '@type': 'PublicationIssue', issueNumber: String(a.issue), ...(c ? { url: `${BASE}/collection/${c._id}/` } : {}), isPartOf: part };
    obj.isPartOf = part;
  }
  else if (k === 'conf' && a.conference_org) obj.isPartOf = { '@type': 'Book', name: c ? c.name : a.conference_org };
  if (a.pdf) obj.encoding = { '@type': 'MediaObject', contentUrl: pdfUrl(a), encodingFormat: 'application/pdf' };
  if (a.references?.length) obj.citation = a.references.map((r) => ({ '@type': 'CreativeWork', name: r }));
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>\n`;
}

// ---------- sahifa qolipi ----------
const PAGE_ORDER = ['about', 'editorial-board', 'ethics', 'contact'];
const PAGES = Object.entries(D.pages || {}).filter(([k]) => /^[a-z0-9][a-z0-9-]{1,39}$/.test(k) && !RESERVED.has(k))
  .sort((x, y) => ((PAGE_ORDER.indexOf(x[0]) + 1 || 99) - (PAGE_ORDER.indexOf(y[0]) + 1 || 99)));
const JOUR = SER.filter((x) => x._kind === 'journal'), CONF = SER.filter((x) => x._kind === 'conf');
const LOOSE = C.filter((c) => !serOf(c)); // seriyaga biriktirilmagan to'plamlar
const NAV = [['/', 'Bosh sahifa'], ...(JOUR.length ? [['/journals/', 'Jurnallar']] : []), ...(CONF.length ? [['/conferences/', 'Konferensiyalar']] : []),
  ...(LOOSE.length ? [['/collections/', "To'plamlar"]] : []), ...(FIELD_LIST.length ? [['/fields/', 'Fan sohalari']] : []), ['/archive/', 'Arxiv'], ['/authors/', 'Mualliflar'], ...(NEWS.length ? [['/news/', "E'lonlar"]] : []),
  ...PAGES.filter(([k]) => k === 'about').map(([k, t]) => [`/${k}/`, t.title])];
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230b3c42'/%3E%3Cpath d='M18 18h18a10 10 0 0 1 10 10v18H28a10 10 0 0 1-10-10z' fill='%23fff'/%3E%3Cpath d='M26 30h14M26 37h10' stroke='%230b3c42' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E";
const I = {
  pdf: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  quote: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h4v4c0 3-1.5 5-4 6M15 7h4v4c0 3-1.5 5-4 6"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  cal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  award: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2"/></svg>',
  rss: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.4"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
};

const page = ({ t, d, body, p = '/', head = '', l = 'uz', type = 'website', scripts = ['app'], robots = '' }) => `<!doctype html>
<html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="google-site-verification" content="vQNgaEMkoKVjJBtF3rtL4v_wphIuwCbRxkA3h495RTY">
<title>${esc(t)}</title><meta name="description" content="${esc(String(d || '').slice(0, 300))}"><link rel="canonical" href="${BASE}${p}">${robots ? `<meta name="robots" content="${robots}">` : ''}
<link rel="alternate" type="application/atom+xml" title="${esc(S.name)}: yangi nashrlar" href="/feed.xml">
<meta name="theme-color" content="#0b3c42"><link rel="icon" href="${ICON}">
${prop('og:site_name', S.name)}${prop('og:type', type)}${prop('og:title', t)}${prop('og:description', String(d || '').slice(0, 300))}${prop('og:url', BASE + p)}${meta('twitter:card', 'summary')}${head}<link rel="stylesheet" href="/css/style.css?v=${BUILD}">
${scripts.map((s) => `<script src="/js/${s}.js?v=${BUILD}" defer></script>`).join('\n')}
</head><body>
<a class="skip" href="#main">Asosiy mazmunga o'tish</a>
<header class="site-head"><div class="wrap head-in">
<a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span><span>${esc(S.name)}</span></a>
<nav class="nav" aria-label="Asosiy menyu">${NAV.map(([h, n]) => `<a href="${h}"${(h === '/' ? p === '/' : p.startsWith(h) || (h === '/journals/' && p.startsWith('/journal/')) || (h === '/conferences/' && p.startsWith('/conference/'))) ? ' aria-current="page"' : ''}>${esc(n)}</a>`).join('')}<a class="nav-search" href="/search/" aria-label="Qidiruv"${p === '/search/' ? ' aria-current="page"' : ''}>${I.search}</a></nav>
</div></header>
<main id="main">${body}</main>
<footer class="site-foot"><div class="wrap foot-in">
<div><p class="foot-brand">${esc(S.name)}</p><p>${esc(S.description || '')}</p>
<p class="foot-links">${PAGES.map(([k, x]) => `<a href="/${k}/">${esc(x.title)}</a>`).join('')}<a href="/archive/">Arxiv</a><a href="/latest/">So'nggi qo'shilganlar</a>${HAS_ORGS ? '<a href="/organizations/">Tashkilotlar</a>' : ''}<a href="/search/">Qidiruv</a></p></div>
<div><p>${esc(S.publisher)}${S.email ? ` · <a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ''}</p>
<p>Barcha nashrlar ochiq foydalanishda. Litsenziya: <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener noreferrer">CC BY 4.0</a> · <a href="/sitemap.xml">Sayt xaritasi</a></p>
<p class="foot-links"><a href="/feed.xml">${I.rss} Atom lenta</a><a href="/oai?verb=Identify" rel="nofollow">OAI-PMH</a></p></div>
</div></footer></body></html>`;

// Ro'yxat elementi (bosh sahifa, arxiv, son va muallif sahifalari)
const searchText = (a) => [title(a), ...LANGS.map((l) => a['title_' + l] || ''), a.authors.join(' '), kws(a).join(' '), srcText(a), a.year].join(' ').toLowerCase();
const card = (a) => `<li class="entry" data-s="${esc(searchText(a))}">
<div class="entry-top"><span class="badge">${esc(TYPES[a._t])}</span><span class="entry-year">${esc(a.year)}</span>${a.doi ? '<span class="badge soft">DOI</span>' : ''}</div>
<h3 class="entry-title" lang="${lang(a)}"><a href="/article/${a._id}/">${esc(title(a))}</a></h3>
<p class="entry-by">${esc(a.authors.join(', '))}</p>
<p class="entry-src">${esc(srcText(a))}</p></li>`;

const byDate = (x, y) => String(y.date || y.year).localeCompare(String(x.date || x.year));
const ledger = (L, filter = true) => `<div class="ledger"${filter ? ' data-list' : ''}>${[...new Set(L.map((a) => a.year))].sort((x, y) => y - x).map((y) => `<section class="yr" data-year><h2 class="yr-h">${y}</h2><ul class="entries">${L.filter((a) => a.year === y).sort(byDate).map(card).join('')}</ul></section>`).join('')}
${filter ? `<p class="empty" data-empty hidden>Hech narsa topilmadi. Boshqa so'z bilan qidirib ko'ring.</p>` : ''}</div>`;

// Qidiruv maydoni: "go" - qidiruv sahifasiga yuboradi, "local" - shu sahifadagi ro'yxatni suzadi, "global" - qidiruv sahifasining o'zi
const searchBox = (ph, mode = 'go') => `<form class="search" role="search" action="${mode === 'local' ? '' : '/search/'}" method="get"${mode === 'local' ? ' data-search' : mode === 'global' ? ' data-gsearch' : ''}>
<label class="sr" for="q">Qidirish</label>${I.search}<input id="q" name="q" type="search" placeholder="${esc(ph)}" autocomplete="off"><button class="search-go" type="submit">Izlash</button>
</form>`;

const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; };
const proseHtml = (L) => L.map((x) => `<p>${esc(x).replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, '<a href="mailto:$1">$1</a>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" rel="noopener">$1</a>')}</p>`).join('');
const ld = (o) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o }).replace(/</g, '\\u003c')}</script>\n`;
const factsDl = (rows, cls = 'facts') => `<dl class="${cls}">${rows.filter((r) => r && (r[1] || r[1] === 0)).map((r) => `<div><dt>${r[0]}</dt><dd>${r[2] ? r[1] : esc(r[1])}</dd></div>`).join('')}</dl>`;

// ---------- sonlar / to'plamlar ----------
const collArts = (c) => A.filter((a) => a.collection === c.id);
const toc = (L) => L.slice().sort((x, y) => (parseInt(pages(x)[0], 10) || 1e9) - (parseInt(pages(y)[0], 10) || 1e9) || byDate(x, y));
for (const c of C) toc(collArts(c)).forEach((a, i) => { a._no = i + 1; });
// Maqola raqami: [seriya qisqa nomi]-[tom]-[son]-[tartib raqami], masalan FDM-1-3-004
const artNo = (a) => (a._no ? [a._s && a._s.short, a._c && a._c.volume, a._c && a._c.number, String(a._no).padStart(3, '0')].filter(Boolean).join('-') : '');
const issueLabel = (c) => [c.volume && `${c.volume}-tom`, c.number && `${c.number}-son`, c.year].filter(Boolean).join(', ');
const collKey = (c) => {
  const last = collArts(c).map((a) => a.date || String(a.year)).sort().pop() || '';
  return [String(c.year || last.slice(0, 4) || '0').padStart(4, '0'), String(parseInt(c.volume, 10) || 0).padStart(4, '0'), String(parseInt(c.number, 10) || 0).padStart(4, '0'), last].join('|');
};
const byColl = (x, y) => collKey(y).localeCompare(collKey(x));
const collKind = (c) => { const s = serOf(c); return s ? s._kind : (c.type === 'journal' ? 'journal' : 'conf'); };
const collTypeLabel = (c) => (collKind(c) === 'journal' ? 'Jurnal soni' : 'Konferensiya materiallari');

// Muqova: rasm o'rniga tipografik muqova (seriya nomi, tom/son, yil)
const cover = (c) => {
  const s = serOf(c), k = collKind(c);
  const nm = s ? (s.short || s.name) : c.name;
  return `<div class="cover cover-${k}${nm.length > 34 ? ' long' : ''}" aria-hidden="true"><span class="cover-k">${k === 'journal' ? 'Ilmiy jurnal' : 'Konferensiya'}</span><span class="cover-t">${esc(nm)}</span><span class="cover-n">${esc([c.volume && `Tom ${c.volume}`, c.number && `№ ${c.number}`].filter(Boolean).join(' · '))}</span><span class="cover-y">${esc(c.year || '')}</span></div>`;
};
const issueCard = (c) => { const n = collArts(c).length; return `<a class="issue" href="/collection/${c._id}/">${cover(c)}<span class="issue-b"><strong>${esc(c.name)}</strong><span class="muted">${esc([issueLabel(c), n && plural(n, 'maqola')].filter(Boolean).join(' · '))}</span></span></a>`; };
const issueGrid = (L) => `<div class="issues">${L.map(issueCard).join('')}</div>`;

// Mundarija: fan bo'limlari (section) bo'yicha guruhlanadi
const tocItem = (a) => `<li class="ti"><span class="ti-no">${String(a._no || '').padStart(2, '0')}</span><div class="ti-b"><a class="ti-t" href="/article/${a._id}/" lang="${lang(a)}">${esc(title(a))}</a><span class="entry-by">${esc(a.authors.join(', '))}</span><span class="ti-m">${[a.pages && `B. ${esc(a.pages)}`, doi(a) && `DOI: <a href="https://doi.org/${encodeURI(doi(a))}" rel="noopener noreferrer">${esc(doi(a))}</a>`, a.pdf && `<a href="${pdfPath(a)}">PDF</a>`].filter(Boolean).join('<span aria-hidden="true"> · </span>')}</span></div></li>`;
const tocBlock = (L) => {
  const sorted = toc(L), secs = [...new Set(sorted.map((a) => a.section || ''))];
  if (secs.length === 1 && !secs[0]) return `<ol class="toc2">${sorted.map(tocItem).join('')}</ol>`;
  return secs.map((sec) => `<section class="toc-sec"><h3>${esc(sec || 'Boshqa maqolalar')}</h3><ol class="toc2">${sorted.filter((a) => (a.section || '') === sec).map(tocItem).join('')}</ol></section>`).join('');
};

// ---------- seriya kartalari va e'lonlar ----------
const serColls = (s) => C.filter((c) => c.series === s.id).sort(byColl);
const serArts = (s) => A.filter((a) => a._s === s);
const serCard = (s) => `<a class="series-card series-${s._kind}" href="${serHref(s)}"><span class="badge">${serLabel(s)}</span><strong>${esc(s.name)}</strong>${s.description ? `<span class="series-d">${esc(clip(paras(s.description)[0], 170))}</span>` : ''}<span class="series-m">${[s.issn && 'ISSN ' + s.issn, s.eissn && 'eISSN ' + s.eissn, plural(serColls(s).length, s._kind === 'journal' ? 'son' : "to'plam"), plural(serArts(s).length, 'maqola')].filter(Boolean).map(esc).join(' · ')}</span></a>`;
const newsDate = (n) => fmtDate(n.date) || esc(n.date || '');
const isOpen = (n) => !!n.deadline && n.deadline >= TODAY;
const newsCard = (n) => `<a class="news-card${isOpen(n) ? ' open' : ''}" href="/news/${n._id}/"><span class="news-date">${I.cal} ${newsDate(n)}${n.kind === 'cfp' ? ' · Maqolalar qabuli' : ''}</span><strong>${esc(n.title)}</strong>${n.deadline ? `<span class="news-dl">${isOpen(n) ? 'Qabul ochiq' : 'Qabul yopilgan'}: ${fmtDate(n.deadline)} gacha</span>` : ''}${paras(n.text)[0] ? `<span class="series-d">${esc(clip(paras(n.text)[0], 150))}</span>` : ''}</a>`;
// ---------- bosh sahifa ----------
const nAuthors = Object.keys(AUTH).length;
const YEARS = [...new Set(A.map((a) => a.year))].sort((x, y) => y - x);
const yearChips = () => `<p class="years">${YEARS.map((y) => `<a class="chip" href="/archive/${y}/">${y} <span class="muted">${A.filter((a) => a.year === y).length}</span></a>`).join('')}</p>`;
const LATEST = A.slice().sort(byDate).slice(0, 12);

out('index.html', page({
  t: S.name, d: S.description, p: '/',
  head: ld({ '@type': 'WebSite', name: S.name, url: BASE + '/', description: S.description, publisher: { '@type': 'Organization', name: S.publisher }, potentialAction: { '@type': 'SearchAction', target: `${BASE}/search/?q={q}`, 'query-input': 'required name=q' } }),
  body: `<section class="hero"><div class="wrap hero-in">
<p class="eyebrow">Ochiq ilmiy repozitoriy</p>
<h1>${esc(S.name)}</h1>
<p class="lead">${esc(S.description || '')}</p>
${searchBox("Sarlavha, muallif, kalit so'z yoki DOI bo'yicha qidirish")}
<dl class="figures"><div><dt>Nashrlar</dt><dd>${A.length}</dd></div>${JOUR.length ? `<div><dt>Jurnallar</dt><dd>${JOUR.length}</dd></div>` : ''}${CONF.length ? `<div><dt>Konferensiyalar</dt><dd>${CONF.length}</dd></div>` : ''}${C.length ? `<div><dt>Son va to'plamlar</dt><dd>${C.length}</dd></div>` : ''}<div><dt>Mualliflar</dt><dd>${nAuthors}</dd></div></dl>
</div></section>
<div class="wrap">
${SER.length ? `<section class="block"><div class="block-h"><h2>Jurnallar va konferensiyalar</h2>${JOUR.length && CONF.length ? `<span class="links"><a href="/journals/">Jurnallar</a><a href="/conferences/">Konferensiyalar</a></span>` : ''}</div><div class="series-grid">${SER.map(serCard).join('')}</div></section>` : ''}
${NEWS.length ? `<section class="block"><div class="block-h"><h2>E'lonlar</h2><a href="/news/">Barchasi</a></div><div class="news-grid">${NEWS.slice(0, 3).map(newsCard).join('')}</div></section>` : ''}
${FIELD_LIST.length ? `<section class="block"><div class="block-h"><h2>Fan sohalari</h2><a href="/fields/">Barchasi</a></div><p class="years fields-chips">${FIELD_LIST.map((f) => `<a class="chip" href="/field/${f.key}/">${esc(f.name)} <span class="muted">${f.items.length}</span></a>`).join('')}</p></section>` : ''}
<section class="block" data-popular hidden><div class="block-h"><h2>Ko'p o'qilgan maqolalar</h2></div><ol class="popular" data-popular-list></ol></section>
${C.length ? `<section class="block"><div class="block-h"><h2>So'nggi son va to'plamlar</h2><a href="/collections/">Barchasi</a></div>${issueGrid(C.slice().sort(byColl).slice(0, 4))}</section>` : ''}
<section class="block"><div class="block-h"><h2>So'nggi nashrlar</h2><a href="/archive/">Arxiv ${I.arrow}</a></div>${ledger(LATEST, false)}
${A.length > LATEST.length ? `<p class="more"><a class="btn ghost" href="/archive/">Barcha ${A.length} ta nashr</a></p>` : ''}
<div class="year-nav"><span class="side-h">Yillar bo'yicha</span>${yearChips()}</div></section>
</div>`,
}));

// ---------- jurnallar va konferensiyalar ro'yxati ----------
for (const [kind, L, ttl, lead] of [['journal', JOUR, 'Jurnallar', 'Ilmiy jurnallar: har bir sonning mundarijasi, arxivi va tahririyati'], ['conf', CONF, 'Konferensiyalar', "Konferensiya materiallari to'plamlari"]]) {
  if (!L.length) continue;
  const p = kind === 'journal' ? '/journals/' : '/conferences/';
  out(`${p.slice(1)}index.html`, page({
    t: `${ttl} - ${S.name}`, d: `${S.name}: ${lead}`, p,
    body: `<section class="hero slim"><div class="wrap hero-in"><h1>${ttl}</h1><p class="lead">${esc(lead)}</p></div></section>
<div class="wrap block"><div class="series-grid">${L.map(serCard).join('')}</div></div>`,
  }));
}

// ---------- seriya sahifasi (jurnal yoki konferensiya) ----------
const board = (L) => `<ul class="board">${L.map((m) => `<li><span class="board-r">${esc(m.role || "Tahrir hay'ati a'zosi")}</span><strong>${esc(m.name)}${orcidLink(m.orcid)}</strong>${m.degree ? `<span>${esc(m.degree)}</span>` : ''}${m.org ? `<span class="muted">${esc(m.org)}</span>` : ''}</li>`).join('')}</ul>`;
for (const s of SER) {
  const L = serColls(s), cur = L[0], arts = serArts(s), base = serHref(s);
  const about = paras(s.description), guide = paras(s.guidelines), eth = paras(s.ethics);
  const isJ = s._kind === 'journal';
  const tabs = [['#about', isJ ? 'Jurnal haqida' : 'Konferensiya haqida'], cur && ['#current', isJ ? 'Joriy son' : "So'nggi to'plam"], L.length && ['#archive', 'Arxiv'],
    s.editors?.length && ['#board', 'Tahririyat'], s.indexing?.length && ['#indexing', 'Indekslanish'],
    guide.length && [base + 'guidelines/', 'Mualliflar uchun'], eth.length && [base + 'ethics/', 'Nashr etikasi']].filter(Boolean);
  const facts = [['ISSN (bosma)', s.issn], ['ISSN (onlayn)', s.eissn], ['Tashkil etilgan', s.founded], ['Davriyligi', s.frequency], ['Nashr tillari', s.languages],
    ["Ilmiy yo'nalishlar", s.scope], ['Nashriyot', s.publisher], [isJ ? 'Sonlar' : "To'plamlar", L.length], ['Maqolalar', arts.length]];
  const years = [...new Set(L.map((c) => String(c.year || '')))];
  const hero = (h1, eb) => `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow">${eb}</p><h1>${h1}</h1>${factsDl(facts)}</div></section>
<nav class="subnav" aria-label="${esc(s.name)} bo'limlari"><div class="wrap">${tabs.map(([h, n]) => `<a href="${h.startsWith('#') ? base + h : h}">${esc(n)}</a>`).join('')}</div></nav>`;
  const eyebrow = `<a href="${isJ ? '/journals/' : '/conferences/'}">${isJ ? 'Jurnallar' : 'Konferensiyalar'}</a>`;
  const json = ld({ '@type': isJ ? 'Periodical' : 'CreativeWorkSeries', name: s.name, url: BASE + base, ...(s.issn || s.eissn ? { issn: [s.issn, s.eissn].filter(Boolean) } : {}), ...(s.publisher ? { publisher: { '@type': 'Organization', name: s.publisher } } : {}), ...(about[0] ? { description: about[0] } : {}), inLanguage: s.languages || undefined });
  out(`${base.slice(1)}index.html`, page({
    t: `${s.name} - ${S.name}`, d: about[0] || s.name, p: base, head: json,
    body: `${hero(esc(s.name), eyebrow)}
<div class="wrap">
<section class="block" id="about"><div class="block-h"><h2>${isJ ? 'Jurnal haqida' : 'Konferensiya haqida'}</h2></div><div class="prose">${proseHtml(about.length ? about : [s.name])}${s.email || s.address ? `<p class="small muted">${[s.address, s.email].filter(Boolean).map(esc).join(' · ')}</p>` : ''}</div></section>
${cur ? `<section class="block" id="current"><div class="block-h"><h2>${isJ ? 'Joriy son' : "So'nggi to'plam"}</h2><a href="/collection/${cur._id}/">Son sahifasi ${I.arrow}</a></div>
<div class="cur"><a class="cur-cover" href="/collection/${cur._id}/">${cover(cur)}</a><div class="cur-b"><h3><a href="/collection/${cur._id}/">${esc(cur.name)}</a></h3><p class="muted">${esc([issueLabel(cur), cur.date].filter(Boolean).join(' · '))}</p>${tocBlock(collArts(cur))}</div></div></section>` : ''}
${L.length ? `<section class="block" id="archive"><div class="block-h"><h2>Arxiv</h2><span class="muted">${plural(L.length, isJ ? 'son' : "to'plam")}</span></div>${years.map((y) => `<h3 class="arch-y">${esc(y || 'Yilsiz')}</h3>${issueGrid(L.filter((c) => String(c.year || '') === y))}`).join('')}</section>` : ''}
${s.editors?.length ? `<section class="block" id="board"><div class="block-h"><h2>Tahririyat</h2></div>${board(s.editors)}</section>` : ''}
${s.indexing?.length ? `<section class="block" id="indexing"><div class="block-h"><h2>Indekslanish va bazalar</h2></div><ul class="idx">${s.indexing.map((x) => `<li>${x.url ? `<a href="${esc(x.url)}" rel="noopener">${esc(x.name)}</a>` : esc(x.name)}</li>`).join('')}</ul></section>` : ''}
${arts.length ? `<section class="block"><div class="block-h"><h2>So'nggi maqolalar</h2></div>${ledger(arts.slice().sort(byDate).slice(0, 6), false)}</section>` : ''}
</div>`,
  }));
  for (const [slugp, ttl, txt] of [['guidelines', 'Mualliflar uchun talablar', guide], ['ethics', 'Nashr etikasi', eth]]) {
    if (!txt.length) continue;
    out(`${base.slice(1)}${slugp}/index.html`, page({
      t: `${ttl} - ${s.name}`, d: clip(txt.join(' '), 200), p: `${base}${slugp}/`,
      body: `${hero(esc(ttl), `${eyebrow} <span aria-hidden="true">/</span> <a href="${base}">${esc(s.name)}</a>`)}<div class="wrap block"><div class="prose">${proseHtml(txt)}</div></div>`,
    }));
  }
}

// ---------- son / to'plam sahifalari ----------
if (C.length) out('collections/index.html', page({
  t: `Son va to'plamlar - ${S.name}`, d: `${S.name}: jurnal sonlari va konferensiya to'plamlari`, p: '/collections/',
  body: `<section class="hero slim"><div class="wrap hero-in"><h1>Son va to'plamlar</h1><p class="lead">Jurnal sonlari va konferensiya materiallari to'plamlari</p></div></section>
<div class="wrap block">${[...new Set(C.slice().sort(byColl).map((c) => String(c.year || '')))].map((y) => `<h3 class="arch-y">${esc(y || 'Yilsiz')}</h3>${issueGrid(C.filter((c) => String(c.year || '') === y).sort(byColl))}`).join('')}</div>`,
}));

for (const c of C) {
  const L = collArts(c), s = serOf(c), isJ = collKind(c) === 'journal';
  const sib = s ? serColls(s) : [], i = sib.indexOf(c), newer = i > 0 ? sib[i - 1] : null, older = i >= 0 && i < sib.length - 1 ? sib[i + 1] : null;
  const facts = [['Turi', collTypeLabel(c)], s && [isJ ? 'Jurnal' : 'Konferensiya', `<a href="${serHref(s)}">${esc(s.name)}</a>`, 1], ['Tom', c.volume], ['Son', c.number], ['Yil', c.year], ['Sana', c.date], ["O'tkazilgan joyi", c.place],
    ['Nashriyot', c.publisher || (s && s.publisher)], ["Mas'ul muharrir", c.editor], ['ISSN', c.issn || (s && (s.issn || s.eissn))], ['ISBN', c.isbn], ['Maqolalar', L.length]];
  const json = ld({ '@type': isJ ? 'PublicationIssue' : 'Book', name: c.name, url: `${BASE}/collection/${c._id}/`, ...(c.number ? { issueNumber: String(c.number) } : {}), ...(c.year ? { datePublished: String(c.year) } : {}), ...(c.isbn ? { isbn: c.isbn } : {}),
    ...(s ? { isPartOf: { '@type': isJ ? 'Periodical' : 'CreativeWorkSeries', name: s.name, url: BASE + serHref(s), ...(s.issn || s.eissn ? { issn: [s.issn, s.eissn].filter(Boolean) } : {}) } } : {}),
    hasPart: toc(L).map((a) => ({ '@type': 'ScholarlyArticle', name: title(a), url: `${BASE}/article/${a._id}/` })) });
  out(`collection/${c._id}/index.html`, page({
    t: `${c.name} - ${S.name}`, d: c.description || `${c.name}: ${plural(L.length, 'nashr')}`, p: `/collection/${c._id}/`, head: json,
    body: `<section class="hero slim"><div class="wrap hero-in issue-hero"><div><p class="eyebrow">${s ? `<a href="${isJ ? '/journals/' : '/conferences/'}">${isJ ? 'Jurnallar' : 'Konferensiyalar'}</a> <span aria-hidden="true">/</span> <a href="${serHref(s)}">${esc(s.name)}</a>` : `<a href="/collections/">Son va to'plamlar</a>`}</p><h1>${esc(c.name)}</h1>${c.description ? `<p class="lead">${esc(c.description)}</p>` : ''}
${factsDl(facts)}</div>${cover(c)}</div></section>
<div class="wrap block"><div class="block-h"><h2>Mundarija</h2><span class="muted">${plural(L.length, 'nashr')}</span></div>
${L.length ? tocBlock(L) : '<p class="empty">Bu songa hali maqola biriktirilmagan.</p>'}
${newer || older ? `<nav class="pager" aria-label="Boshqa sonlar">${older ? `<a href="/collection/${older._id}/">← ${esc(issueLabel(older) || older.name)}</a>` : '<span></span>'}${newer ? `<a href="/collection/${newer._id}/">${esc(issueLabel(newer) || newer.name)} →</a>` : ''}</nav>` : ''}</div>`,
  }));
}

// ---------- e'lonlar ----------
if (NEWS.length) {
  out('news/index.html', page({
    t: `E'lonlar - ${S.name}`, d: `${S.name}: konferensiyalarga chaqiruvlar va yangiliklar`, p: '/news/',
    body: `<section class="hero slim"><div class="wrap hero-in"><h1>E'lonlar</h1><p class="lead">Konferensiyalarga maqola qabul qilish, yangi sonlar va yangiliklar</p></div></section>
<div class="wrap block"><div class="news-grid">${NEWS.map(newsCard).join('')}</div></div>`,
  }));
  for (const n of NEWS) {
    const s = SER.find((x) => x.id === n.series), c = C.find((x) => x.id === n.collection);
    const facts = [['E\'lon sanasi', fmtDate(n.date)], ['Maqola qabul qilish muddati', fmtDate(n.deadline)], ["O'tkaziladigan sana", n.event_date], ["O'tkaziladigan joy", n.place],
      s && [serLabel(s), `<a href="${serHref(s)}">${esc(s.name)}</a>`, 1], c && ["Son / to'plam", `<a href="/collection/${c._id}/">${esc(c.name)}</a>`, 1]];
    out(`news/${n._id}/index.html`, page({
      t: `${n.title} - ${S.name}`, d: clip(paras(n.text).join(' '), 200) || n.title, p: `/news/${n._id}/`, type: 'article',
      head: ld({ '@type': 'NewsArticle', headline: clip(n.title, 110), ...(OK.date.test(n.date || '') ? { datePublished: n.date } : {}), url: `${BASE}/news/${n._id}/`, publisher: { '@type': 'Organization', name: S.publisher } }),
      body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/news/">E'lonlar</a></p><h1>${esc(n.title)}</h1>${isOpen(n) ? `<p class="lead"><span class="badge open">Maqolalar qabul qilinmoqda</span></p>` : ''}${factsDl(facts)}</div></section>
<div class="wrap block"><div class="prose">${proseHtml(paras(n.text))}${n.link ? `<p><a class="btn" href="${esc(n.link)}" rel="noopener">${esc(n.link_text || "Ro'yxatdan o'tish")} ${I.arrow}</a></p>` : ''}</div></div>`,
    }));
  }
}

// ---------- arxiv (yillar bo'yicha) va qidiruv ----------
// Google Scholar tavsiyasi: barcha maqolalarni sana bo'yicha ko'rib chiqish imkoni (browse by date)
out('archive/index.html', page({
  t: `Arxiv - ${S.name}`, d: `${S.name}: barcha nashrlar yillar bo'yicha`, p: '/archive/',
  body: `<section class="hero slim"><div class="wrap hero-in"><h1>Arxiv</h1><p class="lead">Barcha ${A.length} ta nashr yillar bo'yicha</p></div></section>
<div class="wrap block"><p class="arch-links"><a class="btn ghost sm" href="/latest/">So'nggi qo'shilganlar</a>${FIELD_LIST.length ? '<a class="btn ghost sm" href="/fields/">Fan sohalari bo\'yicha</a>' : ''}${C.length ? '<a class="btn ghost sm" href="/collections/">Son va to\'plamlar</a>' : ''}</p><ul class="year-grid">${YEARS.map((y) => { const L = A.filter((a) => a.year === y); return `<li><a href="/archive/${y}/"><b>${y}</b><span>${plural(L.length, 'nashr')}</span><span class="muted">${esc([...new Set(L.map((a) => TYPES[a._t]))].join(', '))}</span></a></li>`; }).join('')}</ul></div>`,
}));
for (const y of YEARS) {
  const L = A.filter((a) => a.year === y);
  out(`archive/${y}/index.html`, page({
    t: `${y}-yil nashrlari - ${S.name}`, d: `${S.name}: ${y}-yilda chop etilgan ${plural(L.length, 'nashr')}`, p: `/archive/${y}/`,
    body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/archive/">Arxiv</a></p><h1>${y}-yil nashrlari</h1><p class="lead">${plural(L.length, 'nashr')}</p>${searchBox(`${y}-yil nashrlari ichidan qidirish`, 'local')}</div></section>
<div class="wrap block"><div class="block-h"><h2>Nashrlar</h2><span class="muted" data-count>${plural(L.length, 'nashr')}</span></div>${ledger(L)}
<div class="year-nav"><span class="side-h">Boshqa yillar</span>${yearChips()}</div></div>`,
  }));
}
out('search/index.html', page({
  t: `Qidiruv - ${S.name}`, d: `${S.name}: nashrlar bo'yicha qidiruv`, p: '/search/', robots: 'noindex, follow',
  body: `<section class="hero slim"><div class="wrap hero-in"><h1>Qidiruv</h1><p class="lead">Sarlavha, muallif, kalit so'z, jurnal, konferensiya yoki DOI bo'yicha</p>${searchBox("Masalan: fitonim, Ikromov yoki 10.5281", 'global')}</div></section>
<div class="wrap block"><div class="block-h"><h2>Natijalar</h2><span class="muted" data-gcount></span></div><div class="ledger" data-results><p class="empty">Qidirish uchun so'z kiriting.</p></div>
<noscript><p class="empty">Qidiruv uchun JavaScript kerak. Barcha nashrlar <a href="/archive/">arxivda</a>.</p></noscript></div>`,
}));

// ---------- mualliflar ----------
const AU = Object.values(AUTH).sort((x, y) => x.name.localeCompare(y.name, 'uz'));
const topOrg = (e) => (Object.entries(e.orgs).sort((x, y) => y[1] - x[1])[0] || [''])[0];

// Tashkilotlar (mualliflarning ish joylari): yozilishidagi kichik farqlar bitta sahifaga birlashadi
const ORGS = {};
const orgKey = (o) => translit(o).slice(0, 80);
for (const a of A) a._info.forEach((inf, i) => {
  if (!inf.org) return;
  const k = orgKey(inf.org);
  if (!k) return;
  const o = (ORGS[k] = ORGS[k] || { key: k, names: {}, items: [], authors: new Set() });
  o.names[inf.org] = (o.names[inf.org] || 0) + 1;
  if (!o.items.includes(a)) o.items.push(a);
  o.authors.add(resolveKey(a.authors[i]));
});
for (const e of AU) if (e.profile && e.profile.org) { const k = orgKey(e.profile.org); if (ORGS[k]) ORGS[k].authors.add(e.key); }
const ORG_LIST = Object.values(ORGS).map((o) => ({ ...o, name: Object.entries(o.names).sort((x, y) => y[1] - x[1])[0][0] })).sort((x, y) => y.items.length - x.items.length || x.name.localeCompare(y.name, 'uz'));
const orgHref = (name) => (ORGS[orgKey(name)] ? `/organization/${orgKey(name)}/` : '');

// Hammualliflar
const coauthors = (e) => {
  const c = {};
  for (const a of e.items) for (const n of a.authors) { const k = resolveKey(n); if (k !== e.key && AUTH[k]) c[k] = (c[k] || 0) + 1; }
  return Object.entries(c).sort((x, y) => y[1] - x[1]).map(([k, n]) => [AUTH[k], n]);
};
const TYPE_GROUPS = [['journal', 'Jurnal maqolalari'], ['conf', 'Konferensiya materiallari'], ['book', 'Kitoblar va qo\'llanmalar']];

out('authors/index.html', page({
  t: `Mualliflar - ${S.name}`, d: `${S.name} mualliflari ro'yxati`, p: '/authors/',
  body: `<section class="hero slim"><div class="wrap hero-in"><h1>Mualliflar</h1><p class="lead">${plural(AU.length, 'muallif')}${ORG_LIST.length ? ` · <a href="/organizations/">${plural(ORG_LIST.length, 'tashkilot')}</a>` : ''}</p></div></section>
<div class="wrap block"><ul class="authors-grid">${AU.map((e) => `<li><span><a href="/author/${e.key}/">${esc(e.name)}</a>${orcidLink(e.orcid)}${topOrg(e) ? `<span class="au-org">${esc(topOrg(e))}</span>` : ''}${e.profile && e.profile.interests ? `<span class="au-int">${e.profile.interests.slice(0, 4).map(esc).join(' · ')}</span>` : ''}</span><span class="muted">${plural(e.items.length, 'nashr')}</span></li>`).join('')}</ul></div>`,
}));
for (const e of AU) {
  const other = e.other, pr = e.profile || {}, org = topOrg(e);
  const links = [e.orcid && ORCID_RE.test(e.orcid) && [`https://orcid.org/${e.orcid}`, 'ORCID'], pr.scholar && [pr.scholar, 'Google Scholar'], pr.researchgate && [pr.researchgate, 'ResearchGate'], pr.website && [pr.website, 'Shaxsiy sahifa']].filter(Boolean);
  const pld = { '@context': 'https://schema.org', ...personLd(e.name, { org, orcid: e.orcid }) };
  if (other.length) pld.alternateName = other.map(scholarName);
  if (links.length) pld.sameAs = links.map((l) => l[0]);
  if (pr.position) pld.jobTitle = pr.position;
  if (pr.interests) pld.knowsAbout = pr.interests;
  if (pr.bio) pld.description = clip(pr.bio.join(' '), 300);
  const co = coauthors(e);
  const groups = TYPE_GROUPS.map(([k, ttl]) => [ttl, e.items.filter((a) => KIND[a._t] === k)]).filter((g) => g[1].length);
  out(`author/${e.key}/index.html`, page({
    t: `${e.name} - ${S.name}`, d: pr.bio ? clip(pr.bio.join(' '), 200) : `${e.name}${org ? ', ' + org : ''}: ${plural(e.items.length, 'nashr')}`, p: `/author/${e.key}/`, type: 'profile',
    head: `<script type="application/ld+json">${JSON.stringify(pld).replace(/</g, '\\u003c')}</script>\n`,
    body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/authors/">Mualliflar</a></p><h1>${esc(e.name)}${orcidLink(e.orcid)}</h1>
<p class="lead">${esc([pr.degree, pr.position].filter(Boolean).join(', ')) || plural(e.items.length, 'nashr')}${other.length ? ` · boshqa yozilishi: ${esc(other.join('; '))}` : ''}</p>
${factsDl([['Ish joyi', Object.keys(e.orgs).map((o) => (orgHref(o) ? `<a href="${orgHref(o)}">${esc(o)}</a>` : esc(o))).join('; '), 1], ['Nashrlar', e.items.length], ['Hammualliflar', co.length], ['Ko\'rishlar', '<span data-au-views>–</span>', 1], ['Yuklab olishlar', '<span data-au-downloads>–</span>', 1]])}
${links.length ? `<p class="prof-links">${links.map(([u, n]) => `<a href="${esc(u)}" rel="noopener noreferrer me">${esc(n)}</a>`).join('')}</p>` : ''}</div></section>
<div class="wrap block au-grid" data-author-stats="${esc(e.items.map((a) => a._id).join(','))}"><div>
${pr.bio ? `<section class="prose au-bio"><h2>Muallif haqida</h2>${proseHtml(pr.bio)}</section>` : ''}
${groups.map(([ttl, L]) => `<section class="au-sec"><div class="block-h"><h2>${ttl}</h2><span class="muted">${L.length}</span></div>${ledger(L, false)}</section>`).join('')}
</div><aside class="side">
${pr.interests ? `<div class="side-card"><p class="side-h">Ilmiy qiziqishlari</p><p class="kw">${pr.interests.map((x) => `<a class="chip" href="/search/?q=${encodeURIComponent(x)}" rel="nofollow">${esc(x)}</a>`).join(' ')}</p></div>` : ''}
${co.length ? `<div class="side-card"><p class="side-h">Hammualliflar</p><ul class="co">${co.slice(0, 12).map(([x, n]) => `<li><a href="/author/${x.key}/">${esc(x.name)}</a><span class="muted">${n}</span></li>`).join('')}</ul></div>` : ''}
${[...new Set(e.items.map((a) => a._field).filter(Boolean))].length ? `<div class="side-card"><p class="side-h">Fan sohalari</p><p class="kw">${[...new Set(e.items.map((a) => a._field).filter(Boolean))].map((f) => `<a class="chip" href="/field/${fieldKey(f)}/">${esc(f)}</a>`).join(' ')}</p></div>` : ''}
</aside></div>`,
  }));
}

// ---------- tashkilotlar ----------
if (ORG_LIST.length) {
  out('organizations/index.html', page({
    t: `Tashkilotlar - ${S.name}`, d: `${S.name}: mualliflar ish joylari bo'yicha nashrlar`, p: '/organizations/',
    body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/authors/">Mualliflar</a></p><h1>Tashkilotlar</h1><p class="lead">Mualliflarning ish joylari bo'yicha nashrlar</p></div></section>
<div class="wrap block"><ul class="org-grid">${ORG_LIST.map((o) => `<li><a href="/organization/${o.key}/"><strong>${esc(o.name)}</strong><span class="muted">${plural(o.authors.size, 'muallif')} · ${plural(o.items.length, 'nashr')}</span></a></li>`).join('')}</ul></div>`,
  }));
  for (const o of ORG_LIST) {
    const people = [...o.authors].map((k) => AUTH[k]).filter(Boolean).sort((x, y) => x.name.localeCompare(y.name, 'uz'));
    out(`organization/${o.key}/index.html`, page({
      t: `${o.name} - ${S.name}`, d: `${o.name}: ${plural(people.length, 'muallif')}, ${plural(o.items.length, 'nashr')}`, p: `/organization/${o.key}/`,
      head: ld({ '@type': 'Organization', name: o.name, url: `${BASE}/organization/${o.key}/`, ...(Object.keys(o.names).length > 1 ? { alternateName: Object.keys(o.names).filter((n) => n !== o.name) } : {}) }),
      body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/organizations/">Tashkilotlar</a></p><h1>${esc(o.name)}</h1>${factsDl([['Mualliflar', people.length], ['Nashrlar', o.items.length]])}</div></section>
<div class="wrap block"><div class="block-h"><h2>Mualliflar</h2></div><ul class="authors-grid">${people.map((e) => `<li><a href="/author/${e.key}/">${esc(e.name)}</a><span class="muted">${plural(e.items.length, 'nashr')}</span></li>`).join('')}</ul></div>
<div class="wrap block"><div class="block-h"><h2>Nashrlar</h2></div>${ledger(o.items, false)}</div>`,
    }));
  }
}

// ---------- fan sohalari ----------
// Sohalar soni cheklangan (har bir maqolaga bitta), shuning uchun sahifalar soni ortiqcha ko'paymaydi
const fieldCard = (a) => `<li class="entry fcard"><div class="entry-top"><span class="badge">${esc(TYPES[a._t])}</span><span class="entry-year">${esc(a.year)}</span>${a.doi ? '<span class="badge soft">DOI</span>' : ''}</div>
<h3 class="entry-title" lang="${lang(a)}"><a href="/article/${a._id}/">${esc(title(a))}</a></h3><p class="entry-by">${esc(a.authors.join(', '))}</p>
${abstract(a) ? `<p class="entry-abs" lang="${lang(a)}">${esc(clip(abstract(a), 280))}</p>` : ''}<p class="entry-src">${esc(srcText(a))}</p></li>`;
if (FIELD_LIST.length) {
  out('fields/index.html', page({
    t: `Fan sohalari - ${S.name}`, d: `${S.name}: nashrlar fan sohalari bo'yicha`, p: '/fields/',
    body: `<section class="hero slim"><div class="wrap hero-in"><h1>Fan sohalari</h1><p class="lead">Nashrlar ilmiy yo'nalishlar bo'yicha</p></div></section>
<div class="wrap block"><ul class="field-grid">${FIELD_LIST.map((f) => `<li><a href="/field/${f.key}/"><strong>${esc(f.name)}</strong><span class="muted">${plural(f.items.length, 'nashr')}</span></a></li>`).join('')}</ul></div>`,
  }));
  for (const f of FIELD_LIST) {
    out(`field/${f.key}/index.html`, page({
      t: `${f.name}: ilmiy maqolalar - ${S.name}`, d: `${f.name} sohasidagi ilmiy maqolalar va konferensiya materiallari: ${plural(f.items.length, 'nashr')}`, p: `/field/${f.key}/`,
      body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/fields/">Fan sohalari</a></p><h1>${esc(f.name)}</h1><p class="lead">${plural(f.items.length, 'nashr')}</p></div></section>
<div class="wrap block"><ul class="entries">${f.items.slice().sort(byDate).map(fieldCard).join('')}</ul>
<div class="year-nav"><span class="side-h">Boshqa sohalar</span><p class="years">${FIELD_LIST.filter((x) => x !== f).map((x) => `<a class="chip" href="/field/${x.key}/">${esc(x.name)} <span class="muted">${x.items.length}</span></a>`).join('')}</p></div></div>`,
    }));
  }
}

// ---------- so'nggi qo'shilganlar (saytga joylangan sana bo'yicha) ----------
// Google Scholar tavsiyasi: yangi qo'shilgan maqolalarni alohida ro'yxatda ko'rsatish (robot ularni tez topadi)
const addedOn = (a) => a.created || a.date || `${a.year}-01-01`;
const LAST30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
let LATEST_ADDED = A.filter((a) => addedOn(a) >= LAST30);
if (LATEST_ADDED.length < 10) LATEST_ADDED = A.slice();
LATEST_ADDED = LATEST_ADDED.sort((x, y) => addedOn(y).localeCompare(addedOn(x)) || byDate(x, y)).slice(0, 100);
out('latest/index.html', page({
  t: `So'nggi qo'shilganlar - ${S.name}`, d: `${S.name}: saytga yaqinda joylangan nashrlar`, p: '/latest/',
  body: `<section class="hero slim"><div class="wrap hero-in"><p class="eyebrow"><a href="/archive/">Arxiv</a></p><h1>So'nggi qo'shilganlar</h1><p class="lead">Saytga joylangan sanasi bo'yicha (yangi qo'shilganlar yuqorida)</p></div></section>
<div class="wrap block"><ol class="added">${LATEST_ADDED.map((a) => `<li><time datetime="${esc(addedOn(a))}">${esc(fmtDate(addedOn(a)) || addedOn(a))}</time><div><a href="/article/${a._id}/" lang="${lang(a)}">${esc(title(a))}</a><span class="muted">${esc(a.authors.join(', '))} · ${esc(srcText(a))}</span></div></li>`).join('')}</ol></div>`,
}));

// ---------- maqola sahifalari ----------
// O'xshash maqolalar: umumiy kalit so'zlar, bir bo'lim, bir seriya yoki bir muallif
const related = (a) => {
  const kw = new Set(kws(a).map((w) => w.toLowerCase())), keys = new Set(a.authors.map(resolveKey));
  return A.filter((b) => b !== a).map((b) => {
    let sc = 0;
    for (const w of kws(b)) if (kw.has(w.toLowerCase())) sc += 3;
    if (a.section && b.section === a.section) sc += 2;
    if (a._s && b._s === a._s) sc += 1;
    if (b.authors.some((n) => keys.has(resolveKey(n)))) sc += 2;
    return [sc, b];
  }).filter((x) => x[0] >= 2).sort((x, y) => y[0] - x[0] || byDate(x[1], y[1])).slice(0, 5).map((x) => x[1]);
};
const onlineDate = (a) => String(a.created || a.date || '').replace(/-/g, '/');

for (const a of A) {
  const k = KIND[a._t], L = lang(a), c = C.find((x) => x.id === a.collection), d = doi(a), url = `${BASE}/article/${a._id}/`, [fp, lp] = pages(a);
  const refs = [].concat(a.references || []).filter(Boolean);

  // Google Scholar (Highwire Press) meta teglari
  const head = meta('citation_title', title(a))
    + a.authors.map((x, i) => meta('citation_author', scholarName(x)) + meta('citation_author_institution', a._info[i].org) + (ORCID_RE.test(a._info[i].orcid || '') ? meta('citation_author_orcid', `https://orcid.org/${a._info[i].orcid}`) : '')).join('')
    + meta('citation_publication_date', pubDate(a)) + meta('citation_online_date', onlineDate(a))
    + (k === 'journal' ? meta('citation_journal_title', a.journal_name) + meta('citation_volume', a.volume) + meta('citation_issue', a.issue) : '')
    + (k === 'conf' ? meta('citation_conference_title', a.conference_org) : '')
    + meta('citation_publisher', a._publisher) + (k === 'book' ? '' : meta('citation_firstpage', fp) + meta('citation_lastpage', lp))
    + meta('citation_doi', d) + meta('citation_issn', a.issn) + meta('citation_isbn', a.isbn) + meta('citation_language', L)
    + meta('citation_keywords', kws(a).join('; '))
    + meta('citation_abstract_html_url', url) + (scholarPdf(a) ? meta('citation_pdf_url', pdfUrl(a)) : '')
    + refs.map((r) => meta('citation_reference', r)).join('')
    // Dublin Core (boshqa indeksatorlar uchun)
    + `<link rel="schema.DC" href="http://purl.org/dc/elements/1.1/">\n`
    + meta('DC.title', title(a)) + a.authors.map((x) => meta('DC.creator', scholarName(x))).join('') + meta('DC.date', a.date || a.year)
    + meta('DC.type', 'Text') + meta('DC.format', 'application/pdf') + meta('DC.language', L) + meta('DC.identifier', d ? `https://doi.org/${d}` : url)
    + meta('DC.rights', 'https://creativecommons.org/licenses/by/4.0/')
    + prop('article:published_time', a.date || String(a.year))
    + buildJsonLd(a, k, d, url, fp, lp, c);

  const s = a._s;
  const rows = [['Turi', TYPES[a._t]], ['Nashr yili', a.year], ['Nashr sanasi', fmtDate(a.date)],
    k === 'journal' && ['Jurnal', s ? `<a href="${serHref(s)}">${esc(a.journal_name)}</a>` : esc(a.journal_name), 1], k === 'journal' && ['Tom / son', [a.volume, a.issue].filter(Boolean).join(' / ')],
    k === 'conf' && ['Konferensiya', s ? `<a href="${serHref(s)}">${esc(a.conference_org)}</a>` : esc(a.conference_org), 1], k === 'conf' && ["O'tkazilgan joyi", a.conference_place], k === 'conf' && ['Konferensiya sanasi', a.conference_date],
    k === 'book' && ['Nashriyot', a.publisher], k === 'book' && ['Nashr joyi', a.publisher_city], k === 'book' && ['Nashr', a.edition], k === 'book' && ['Hajmi (bet)', a.total_pages],
    k !== 'book' && ['Betlar', a.pages], ['Bo\'lim', a.section], ['Fan sohasi', a._field ? `<a href="/field/${fieldKey(a._field)}/">${esc(a._field)}</a>` : '', 1], ['Maqola raqami', artNo(a)], ['Maqola tili', LANG_NAME[L]],
    ['Hajmi', a.pdf_pages ? `${a.pdf_pages} bet` : ''], ['Saytga joylangan', fmtDate(a.created)], ['Oxirgi o\'zgarish', a.updated && a.updated !== a.created ? fmtDate(a.updated) : ''], ['ISSN', a.issn], ['ISBN', a.isbn], ['UDK', a.udk], ['BBK', a.bbk]].filter((r) => r && r[1]);
  const dl = rows.map((r) => `<div><dt>${r[0]}</dt><dd>${r[2] ? r[1] : esc(r[1])}</dd></div>`).join('')
    + (c ? `<div><dt>${collKind(c) === 'journal' ? 'Son' : "To'plam"}</dt><dd><a href="/collection/${c._id}/">${esc(c.name)}</a></dd></div>` : '')
    + (d ? `<div><dt>DOI</dt><dd><a href="https://doi.org/${encodeURI(d)}" rel="noopener noreferrer">https://doi.org/${esc(d)}</a></dd></div>` : '');
  const alt = order(a).slice(1).filter((l) => a['title_' + l]).map((l) => `<p class="alt-title" lang="${l}">${esc(a['title_' + l])}</p>`).join('');
  const ab = order(a).filter((l) => a['abstract_' + l]).map((l) => `<section class="abs" lang="${l}"><h2>${AB[l]}</h2><p>${esc(a['abstract_' + l])}</p>${a['keywords_' + l]?.length ? `<p class="kw"><strong>${KW[l]}:</strong> ${a['keywords_' + l].map((w) => `<a class="chip" href="/search/?q=${encodeURIComponent(w)}" rel="nofollow">${esc(w)}</a>`).join(' ')}</p>` : ''}</section>`).join('');

  const cm = citeMeta(a, k, url);
  const cites = CITE.all(cm);
  const bibB64 = Buffer.from(CITE.bibtex(cm), 'utf8').toString('base64');
  const risB64 = Buffer.from(CITE.ris(cm), 'utf8').toString('base64');
  // EndNote (Refer/tagged) formati
  const enw = [`%0 ${k === 'book' ? 'Book' : k === 'conf' ? 'Conference Proceedings' : 'Journal Article'}`, `%T ${title(a)}`, ...a.authors.map((n) => `%A ${scholarName(n)}`),
    a.journal_name && `%J ${a.journal_name}`, k === 'conf' && a.conference_org && `%B ${a.conference_org}`, a.volume && `%V ${a.volume}`, a.issue && `%N ${a.issue}`, a.pages && `%P ${a.pages}`,
    `%D ${a.year}`, a._publisher && `%I ${a._publisher}`, a.issn && `%@ ${a.issn}`, a.isbn && `%@ ${a.isbn}`, d && `%R ${d}`, `%U ${url}`, ...kws(a).map((w) => `%K ${w}`), abstract(a) && `%X ${abstract(a)}`, `%G ${L}`].filter(Boolean).join('\n') + '\n';
  const enwB64 = Buffer.from(enw, 'utf8').toString('base64');
  const size = a.pdf_size ? `${(a.pdf_size / 1048576).toFixed(1)} MB` : '';

  const citeBox = `<section class="panel" id="cite"><h2>${I.quote} Iqtibos keltirish</h2>
<div class="cite" data-cite><div class="cite-bar"><label for="citeStyle">Uslub</label><select id="citeStyle" data-cite-select>${cites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
<button type="button" class="btn sm" data-cite-copy hidden>Nusxa olish</button></div>
${cites.map((s, i) => `<div class="cite-item${i === 0 ? ' on' : ''}" data-style="${s.id}"><p class="cite-name">${esc(s.name)}</p><p class="cite-text">${s.html}</p></div>`).join('')}
<p class="cite-files"><a href="data:application/x-bibtex;charset=utf-8;base64,${bibB64}" download="${esc(a._id)}.bib">BibTeX (.bib)</a><a href="data:application/x-research-info-systems;charset=utf-8;base64,${risB64}" download="${esc(a._id)}.ris">RIS / Zotero / Mendeley (.ris)</a><a href="data:application/x-endnote-refer;charset=utf-8;base64,${enwB64}" download="${esc(a._id)}.enw">EndNote (.enw)</a></p></div></section>`;

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

  const rel = related(a);
  const aside = `<aside class="side">
${a.pdf ? `<div class="side-card"><a class="btn block" href="${pdfPath(a)}" target="_blank" rel="noopener">${I.pdf} To'liq matn (PDF)</a>
<a class="btn ghost block" href="${pdfPath(a)}?dl=1" data-dl>${I.down} Yuklab olish${size ? ` <span class="muted">${size}</span>` : ''}</a></div>` : ''}
<div class="side-card stats" data-stats="${esc(a._id)}"><div><span class="stat-i">${I.eye}</span><b data-views>–</b><span>ko'rishlar</span></div><div><span class="stat-i">${I.down}</span><b data-downloads>–</b><span>yuklab olishlar</span></div></div>
<div class="side-card"><p class="side-h">Ushbu sahifada</p><nav class="toc-side" aria-label="Sahifa bo'limlari"><a href="#abstract">Annotatsiya</a><a href="#fulltext" data-ft-only hidden>Maqola matni</a>${a.pdf ? '<a href="#read">Maqolani o\'qish</a>' : ''}${refs.length ? '<a href="#references">Adabiyotlar</a>' : ''}<a href="#cite">Iqtibos keltirish</a>${rel.length ? '<a href="#related">O\'xshash maqolalar</a>' : ''}</nav>
<button type="button" class="btn ghost sm block" data-share>${I.link} Havolani nusxalash</button></div>
<div class="side-card"><a class="btn ghost sm block" href="/article/${a._id}/certificate/" rel="nofollow">${I.award} Nashr sertifikati</a></div>
<div class="side-card lic"><p>Ochiq foydalanish · <a href="https://creativecommons.org/licenses/by/4.0/" rel="license noopener noreferrer">CC BY 4.0</a></p></div>
</aside>`;
  const relBox = rel.length ? `<section class="panel" id="related"><h2>${I.layers} O'xshash maqolalar</h2><ul class="rel">${rel.map((b) => `<li><a href="/article/${b._id}/" lang="${lang(b)}">${esc(title(b))}</a><span class="muted">${esc(b.authors.join(', '))} · ${esc(b.year)}</span></li>`).join('')}</ul></section>` : '';

  out(`article/${a._id}/index.html`, page({
    t: `${title(a)} - ${S.name}`, d: abstract(a) || title(a), p: `/article/${a._id}/`, l: L, type: 'article', scripts: ['app', 'viewer'],
    head,
    body: `<div class="wrap art-wrap"><nav class="crumbs" aria-label="Yo'l"><a href="/">Bosh sahifa</a>${s ? ` <span>/</span> <a href="${serHref(s)}">${esc(s.short || s.name)}</a>` : ''}${c ? ` <span>/</span> <a href="/collection/${c._id}/">${esc(s && issueLabel(c) ? issueLabel(c) : c.name)}</a>` : ` <span>/</span> <a href="/archive/${a.year}/">${esc(a.year)}</a>`}</nav>
<div class="art-grid"><article class="paper" data-article="${esc(a._id)}">
<header class="paper-h"><p class="paper-kind"><span class="badge">${esc(TYPES[a._t])}</span>${d ? `<a class="badge soft" href="https://doi.org/${encodeURI(d)}" rel="noopener noreferrer">DOI: ${esc(d)}</a>` : ''}</p>
<h1 lang="${L}">${esc(title(a))}</h1>${alt}
${byline(a)}
<p class="paper-src">${esc(srcText(a))}${a.year ? `, ${esc(a.year)}` : ''}</p></header>
<dl class="facts card-facts">${dl}</dl>
<div id="abstract">${ab}</div>
<section class="panel fulltext" id="fulltext" data-fulltext hidden lang="${L}"><h2>${I.doc} Maqola matni</h2>
<p class="ft-note">Matn PDF fayldan avtomatik olingan. Jadval, formula va rasmlar uchun PDF nusxaga qarang.</p>
<div class="ft-body" data-fulltext-body></div><button type="button" class="btn ghost sm ft-more" data-ft-more hidden>Matnni to'liq ko'rsatish</button></section>
${viewer}${refsBox}${citeBox}${relBox}
</article>${aside}</div></div>`,
  }));

  // Nashr sertifikati: har bir muallif uchun alohida varaq (chop etish uchun, qidiruv tizimlari uchun emas)
  const venue = a.journal_name || a.conference_org || a.publisher || S.name;
  const certFacts = [['Nashr', venue], ['Tom / son', [a.volume, a.issue].filter(Boolean).join(' / ')], ['Betlar', a.pages], ['Nashr sanasi', fmtDate(a.date) || a.year], ['DOI', d], ['Maqola raqami', artNo(a)]];
  out(`article/${a._id}/certificate/index.html`, page({
    t: `Sertifikat: ${title(a)} - ${S.name}`, d: `${title(a)}: nashr sertifikati`, p: `/article/${a._id}/certificate/`, robots: 'noindex, nofollow',
    body: `<div class="wrap cert-wrap"><p class="cert-bar"><a href="/article/${a._id}/">← Maqola sahifasi</a><button type="button" class="btn sm" data-print hidden>Chop etish yoki PDF saqlash</button></p>
${a.authors.map((n, i) => `<section class="cert"><div class="cert-in">
<p class="cert-org">${esc(a._publisher)}</p>
<h1 class="cert-h">Sertifikat</h1>
<p class="cert-sub">Ushbu sertifikat bilan tasdiqlanadiki,</p>
<p class="cert-name">${esc(n)}</p>${a._info[i].org ? `<p class="cert-aff">${esc(a._info[i].org)}</p>` : ''}
<p class="cert-txt">muallifligidagi quyidagi ilmiy ish «${esc(venue)}» nashrida chop etilgan:</p>
<p class="cert-title" lang="${L}">${esc(title(a))}</p>
${factsDl(certFacts, 'cert-facts')}
<p class="cert-url">${esc(url)}</p>
<div class="cert-sign"><span>Tahririyat</span><span>${esc(S.name)}</span></div>
</div></section>`).join('')}</div>`,
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

// Qidiruv sahifasi uchun ixcham indeks
out('data/search.json', JSON.stringify(A.slice().sort(byDate).map((a) => ({ i: a._id, u: `/article/${a._id}/`, t: title(a), a: a.authors.join(', '), s: srcText(a), y: a.year, ty: TYPES[a._t], d: doi(a), l: lang(a), k: searchText(a) + ' ' + doi(a).toLowerCase() }))));

// Atom lenta: so'nggi 50 nashr
const isoTime = (a) => `${a.created || a.date || `${a.year}-01-01`}T00:00:00Z`;
const FEED = A.slice().sort((x, y) => isoTime(y).localeCompare(isoTime(x)) || byDate(x, y)).slice(0, 50);
out('feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="uz">
<title>${esc(S.name)}</title><subtitle>${esc(S.description || '')}</subtitle>
<link href="${BASE}/feed.xml" rel="self"/><link href="${BASE}/"/><id>${BASE}/</id>
<updated>${FEED.length ? isoTime(FEED[0]) : new Date().toISOString()}</updated>
${FEED.map((a) => `<entry><title>${esc(title(a))}</title><link href="${BASE}/article/${a._id}/"/><id>${BASE}/article/${a._id}/</id>
<updated>${isoTime(a)}</updated>${a.authors.map((n) => `<author><name>${esc(n)}</name></author>`).join('')}
<summary>${esc(clip(abstract(a), 600))}</summary>${srcText(a) ? `<category term="${esc(TYPES[a._t])}"/>` : ''}</entry>`).join('\n')}
</feed>
`);

// OAI-PMH (functions/oai.js) uchun yozuvlar: BASE, OpenAIRE va boshqa yig'uvchilar shu orqali metama'lumot oladi
out('data/oai.json', JSON.stringify({
  name: S.name, base: BASE, email: S.email || '', earliest: A.map((a) => (a.created || a.date || `${a.year}-01-01`)).sort()[0] || TODAY,
  sets: [...SER.map((x) => ({ spec: `series:${x._id}`, name: x.name })), ...['journal', 'conf', 'book'].map((k) => ({ spec: `type:${k}`, name: { journal: 'Jurnal maqolalari', conf: 'Konferensiya materiallari', book: 'Kitoblar' }[k] }))],
  records: A.map((a) => ({
    id: a._id, stamp: a.updated || a.created || a.date || `${a.year}-01-01`, sets: [`type:${KIND[a._t]}`, ...(a._s ? [`series:${a._s._id}`] : [])],
    dc: {
      title: LANGS.map((l) => a['title_' + l]).filter(Boolean), creator: a.authors.map(scholarName),
      subject: LANGS.flatMap((l) => a['keywords_' + l] || []), description: LANGS.map((l) => a['abstract_' + l]).filter(Boolean),
      publisher: [a._publisher].filter(Boolean), date: [a.date || String(a.year)], type: [KIND[a._t] === 'book' ? 'info:eu-repo/semantics/book' : KIND[a._t] === 'conf' ? 'info:eu-repo/semantics/conferenceObject' : 'info:eu-repo/semantics/article', 'Text'],
      format: ['application/pdf'], identifier: [`${BASE}/article/${a._id}/`, ...(doi(a) ? [`https://doi.org/${doi(a)}`] : []), ...(a.pdf ? [pdfUrl(a)] : [])],
      source: [srcText(a)].filter(Boolean), language: [lang(a)], rights: ['info:eu-repo/semantics/openAccess', 'https://creativecommons.org/licenses/by/4.0/'],
    },
  })),
}));

const urls = [['/'], ...(C.length ? [['/collections/']] : []), ...C.map((c) => [`/collection/${c._id}/`]), ['/authors/'], ...AU.map((e) => [`/author/${e.key}/`]),
  ...(JOUR.length ? [['/journals/']] : []), ...(CONF.length ? [['/conferences/']] : []),
  ...SER.flatMap((x) => [[serHref(x)], ...(paras(x.guidelines).length ? [[serHref(x) + 'guidelines/']] : []), ...(paras(x.ethics).length ? [[serHref(x) + 'ethics/']] : [])]),
  ['/archive/'], ...YEARS.map((y) => [`/archive/${y}/`]), ['/latest/'],
  ...(FIELD_LIST.length ? [['/fields/'], ...FIELD_LIST.map((f) => [`/field/${f.key}/`])] : []),
  ...(ORG_LIST.length ? [['/organizations/'], ...ORG_LIST.map((o) => [`/organization/${o.key}/`])] : []), ...(NEWS.length ? [['/news/'], ...NEWS.map((n) => [`/news/${n._id}/`, n.date])] : []),
  ...A.map((a) => [`/article/${a._id}/`, a.updated || a.date]), ...PAGES.map(([k]) => [`/${k}/`])];
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, m]) => `<url><loc>${BASE}${u}</loc>${m && OK.date.test(m) ? `<lastmod>${esc(m)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
// Birlashtirilgan mualliflarning eski sahifalari asosiy sahifaga 301 bilan yo'naltiriladi
const REDIR = Object.entries(KEYMAP).filter(([v, k]) => AUTH[k] && !AUTH[v]).flatMap(([v, k]) => [`/author/${v}/ /author/${k}/ 301`, `/author/${v} /author/${k}/ 301`]);
if (REDIR.length) out('_redirects', REDIR.join('\n') + '\n');
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

/feed.xml
  Content-Type: application/atom+xml; charset=utf-8

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
console.log(`Tayyor: ${A.length} nashr, ${SER.length} seriya, ${C.length} son/to'plam, ${NEWS.length} e'lon, ${AU.length} muallif, ${urls.length} sahifa (sitemap)`);
