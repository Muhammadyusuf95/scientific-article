// Cloudflare Pages: build buyrug'i "node build.js", chiqish papkasi "dist". Faqat articles.json ni tahrirlang.
const fs = require('fs'), path = require('path');
const CIT = require('./citations.js');

// Eski fayllar qolib ketmasligi uchun chiqish papkasini har safar tozalaymiz
fs.rmSync('dist', { recursive: true, force: true });

const D = JSON.parse(fs.readFileSync('articles.json', 'utf8'));
if (!Array.isArray(D.articles)) { console.error("articles.json: 'articles' massivi topilmadi"); process.exit(1); }
const S = D.site || {};

// Sayt manzili: SITE_URL > articles.json (shablon bo'lmasa) > Cloudflare'ning o'z manzili
const placeholder = u => !u || /LOYIHA-NOMI|example\.com/i.test(u);
let BASE = (process.env.SITE_URL || (!placeholder(S.url) ? S.url : '') || '').replace(/\/$/, '');
if (!BASE && process.env.CF_PAGES_URL) {
  // CF_PAGES_URL har bir deploy uchun alohida (8a0774b7.loyiha.pages.dev). Doimiy manzil: loyiha.pages.dev
  BASE = process.env.CF_PAGES_URL.replace(/\/$/, '').replace(/^(https:\/\/)[0-9a-f]{8}\./, '$1');
  console.warn("OGOHLANTIRISH: articles.json -> site.url shablon holida. Vaqtincha " + BASE + " ishlatildi. Haqiqiy manzilni yozing.");
}
if (!/^https:\/\//.test(BASE)) { console.error("Sayt manzili topilmadi: articles.json -> site.url ga https://... manzilni yozing"); process.exit(1); }

const SCHOLAR_MAX = 5000000; // Google Scholar: har bir fayl 5 MB dan oshmasligi kerak
const LANGS = ['uz', 'en', 'ru'];
const TYPES = { 'jurnal-maqolasi': 'Jurnal maqolasi', 'konferensiya-maqolasi': 'Konferensiya maqolasi', 'konferensiya-tezisi': 'Konferensiya tezisi', 'darslik': 'Darslik', 'oquv-qollanma': "O'quv qo'llanma", 'monografiya': 'Monografiya' };
const KIND = { 'jurnal-maqolasi': 'journal', 'konferensiya-maqolasi': 'conf', 'konferensiya-tezisi': 'conf', 'darslik': 'book', 'oquv-qollanma': 'book', 'monografiya': 'book' };
const ALIAS = { jurnal: 'jurnal-maqolasi', konferensiya: 'konferensiya-maqolasi' };
const AB = { uz: 'Annotatsiya', en: 'Abstract', ru: 'Аннотация' }, KW = { uz: "Kalit so'zlar", en: 'Keywords', ru: 'Ключевые слова' };
const INHERIT = ['journal_name', 'volume', 'issue', 'issn', 'isbn', 'publisher', 'publisher_city', 'conference_org', 'conference_place', 'conference_date'];
const OK = { issn: /^\d{4}-\d{3}[\dXx]$/, isbn: /^(?:\d[- ]?){9}[\dXx]$|^(?:\d[- ]?){12}\d$/, doi: /^10\.\d{4,9}\/\S+$/, date: /^\d{4}-\d{2}-\d{2}$/ };
const PDF_OK = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const out = (p, h) => { const f = path.join('dist', p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, h); };
const meta = (n, v) => v || v === 0 ? `<meta name="${n}" content="${esc(v)}">\n` : '';
const ld = o => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>\n`;
const crumbLd = L => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: L.map(([n, u], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: BASE + u })) });
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };

// ---------- Ma'lumotni tayyorlash ----------
const C = (D.collections || []).map(c => ({ ...c, _id: slug(c.id) }));
const cById = new Map(C.map(c => [c.id, c]));
const A = D.articles.map(a => {
  const x = { ...a, _id: slug(a.id), _t: ALIAS[a.item_type] || a.item_type || 'jurnal-maqolasi' };
  const c = cById.get(a.collection);
  if (c) for (const f of INHERIT) if (!x[f] && c[f]) x[f] = c[f]; // to'plamdagi umumiy ma'lumotlar maqolaga o'tadi
  x._c = c || null;
  return x;
});

const lang = a => LANGS.includes(a.language) ? a.language : 'uz';
const first = (a, k) => a[k + '_' + lang(a)] || LANGS.map(l => a[k + '_' + l]).find(v => v && v.length);
const title = a => first(a, 'title'), abstract = a => first(a, 'abstract'), kws = a => first(a, 'keywords') || [];
const order = a => [lang(a), ...LANGS.filter(l => l !== lang(a))];
const doi = a => (a.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
const pdfUrl = a => `${BASE}/pdf/${encodeURIComponent(a.pdf)}`;
const scholarPdf = a => a.pdf && (!a.pdf_size || a.pdf_size <= SCHOLAR_MAX);
const src = a => { const k = KIND[a._t]; return k === 'journal' ? [a.journal_name, a.volume && `Tom ${a.volume}`, a.issue && `Son ${a.issue}`] : k === 'conf' ? [a.conference_org] : [a.publisher, a.publisher_city]; };
const srcText = a => src(a).filter(Boolean).join(', ');
const firstPage = a => parseInt(String(a.pages || '').replace(/\D+.*$/, ''), 10) || 1e9;
const byPages = (x, y) => firstPage(x) - firstPage(y) || String(title(x)).localeCompare(String(title(y)));

const CKIND = { journal: 'Jurnal toʻplami', conf: 'Konferensiya toʻplami' };
const cLabel = c => c.type === 'journal'
  ? [c.name, c.volume && `Tom ${c.volume}`, c.issue && `Son ${c.issue}`, c.year && `(${c.year})`].filter(Boolean).join(', ').replace(', (', ' (')
  : [c.name, c.year && `(${c.year})`].filter(Boolean).join(' ');

// ---------- Tekshiruv ----------
const bad = []; const seen = new Set(); const seenC = new Set();
for (const c of C) {
  if (!c._id || seenC.has(c._id)) bad.push(`to'plam id xato yoki takror: ${c.id}`); seenC.add(c._id);
  if (!['journal', 'conf'].includes(c.type)) bad.push(`to'plam ${c.id}: type 'journal' yoki 'conf' bo'lishi kerak`);
  if (!c.name) bad.push(`to'plam ${c.id}: nom yo'q`);
  if (c.issn && !OK.issn.test(c.issn)) bad.push(`to'plam ${c.id}: ISSN formati noto'g'ri`);
  if (c.isbn && !OK.isbn.test(c.isbn)) bad.push(`to'plam ${c.id}: ISBN formati noto'g'ri`);
}
for (const x of A) {
  const k = KIND[x._t], L = lang(x);
  if (!x._id || seen.has(x._id)) bad.push(`id xato yoki takror: ${x.id}`); seen.add(x._id);
  if (!k) bad.push(`${x.id}: item_type noto'g'ri: ${x.item_type}`);
  if (x.collection && !x._c) bad.push(`${x.id}: to'plam topilmadi: ${x.collection}`);
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
}
if (bad.length) { console.error(bad.join('\n')); process.exit(1); }

// ---------- Sahifa qobig'i ----------
const NAV = [['/about/', 'Portal haqida'], ['/editorial-board/', "Tahririyat hay'ati"], ['/ethics/', 'Nashr etikasi'], ['/contact/', 'Aloqa']];
const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231a56db'/%3E%3Ctext x='16' y='23' font-size='20' text-anchor='middle' fill='white' font-family='Arial,sans-serif'%3EA%3C/text%3E%3C/svg%3E";
const page = (t, d, body, p = '/', head = '', l = 'uz', ot = 'website') => `<!doctype html>
<html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t)}</title><meta name="description" content="${esc(d)}"><link rel="canonical" href="${BASE}${p}"><link rel="icon" href="${FAVICON}">
<meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}"><meta property="og:url" content="${BASE}${p}"><meta property="og:type" content="${ot}"><meta property="og:site_name" content="${esc(S.name)}">
${head}<link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/extra.css"></head><body>
<a class="skip" href="#main">Asosiy mazmunga o'tish</a>
<header class="bar"><div class="wrap"><a class="brand" href="/">${esc(S.name)}</a><nav aria-label="Asosiy">${NAV.map(([h, x]) => `<a href="${h}">${x}</a>`).join('')}</nav></div></header>
<main id="main">${body}</main>
<footer><div class="wrap"><p>${esc(S.publisher)}. Ochiq foydalanish, litsenziya: <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a>.</p></div></footer></body></html>`;

// Ro'yxat oddiy HTML havolalardan iborat (JavaScript'siz ham to'liq ko'rinadi) - Google Scholar "browse interface" talabi
const row = a => `<li data-s="${esc(([...LANGS.map(l => a['title_' + l]), ...a.authors, ...kws(a)].filter(Boolean).join(' ')).toLowerCase())}"><a href="/article/${a._id}/">${esc(title(a))}</a><span class="by">${esc(a.authors.join(', '))}</span><span class="src">${esc([TYPES[a._t], srcText(a)].filter(Boolean).join(' · '))}</span></li>`;
const ledger = L => `<div class="wrap" id="list">${[...new Set(L.map(a => a.year))].sort((x, y) => y - x).map(y => `<section class="yr"><h2>${y}</h2><ul>${L.filter(a => a.year === y).map(row).join('')}</ul></section>`).join('')}</div>`;
const countOf = c => A.filter(a => a.collection === c.id).length;
const collNav = () => !C.length ? '' : ['journal', 'conf'].map(t => {
  const L = C.filter(c => c.type === t).sort((x, y) => (y.year || 0) - (x.year || 0) || x.name.localeCompare(y.name));
  return L.length ? `<nav class="wrap cols" aria-label="${CKIND[t]}lar"><h2>${CKIND[t]}lari</h2>${L.map(c => `<a href="/collection/${c._id}/">${esc(cLabel(c))} <small>(${countOf(c)})</small></a>`).join('')}</nav>` : '';
}).join('');

// ---------- Bosh sahifa ----------
out('index.html', page(S.name, S.description, `<section class="hero"><div class="wrap"><h1>${esc(S.name)}</h1><p>${esc(S.description)}</p><div id="q"></div></div></section>
${collNav()}${ledger(A)}`, '/', '<script src="/js/app.js" defer></script>\n' + ld({ '@context': 'https://schema.org', '@type': 'WebSite', name: S.name, url: BASE + '/', description: S.description, inLanguage: 'uz', publisher: { '@type': 'Organization', name: S.publisher || S.name } })));

// ---------- To'plam sahifalari ----------
for (const c of C) {
  const L = A.filter(a => a.collection === c.id).sort(byPages);
  const dl = [c.type === 'journal' ? ['Jurnal', c.journal_name] : ['Konferensiya', c.conference_org], c.type === 'conf' && ["O'tkazilgan joyi", c.conference_place], c.type === 'conf' && ['Sanasi', c.conference_date],
    c.volume && ['Tom', c.volume], c.issue && ['Son', c.issue], c.year && ['Yil', c.year], c.publisher && ['Nashriyot', c.publisher], c.publisher_city && ['Nashr joyi', c.publisher_city], c.issn && ['ISSN', c.issn], c.isbn && ['ISBN', c.isbn]].filter(r => r && r[1]);
  const body = `<section class="hero"><div class="wrap"><p class="crumb"><a href="/">Bosh sahifa</a></p><h1>${esc(cLabel(c))}</h1><p>${CKIND[c.type]} · ${L.length} ta nashr</p></div></section>
<div class="wrap"><dl class="meta">${dl.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')}</dl></div>
<div class="wrap" id="list"><ul class="plain">${L.map(row).join('')}</ul></div>`;
  const u = `${BASE}/collection/${c._id}/`;
  out(`collection/${c._id}/index.html`, page(`${cLabel(c)} - ${S.name}`, `${cLabel(c)}: ${L.length} ta nashr`, body, `/collection/${c._id}/`,
    ld(crumbLd([[S.name, '/'], [cLabel(c), `/collection/${c._id}/`]])) + ld({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: cLabel(c), url: u, isPartOf: { '@type': 'WebSite', name: S.name, url: BASE + '/' }, hasPart: L.map(a => ({ '@type': 'ScholarlyArticle', headline: title(a), url: `${BASE}/article/${a._id}/` })) })));
}

// ---------- Maqola sahifalari ----------
const CSTYLE_LABEL = 'Iqtibos uslubi';
for (const a of A) {
  const k = KIND[a._t], L = lang(a), c = a._c, d = doi(a), url = `${BASE}/article/${a._id}/`, [fp, lp] = String(a.pages || '').split(/\s*[-–]\s*/);
  // Highwire Press teglari - Google Scholar tavsiya etgan format. citation_title faqat asosiy (PDF) tilida.
  const head = meta('citation_title', title(a)) + a.authors.map(x => meta('citation_author', x)).join('') + meta('citation_publication_date', a.date ? a.date.replace(/-/g, '/') : a.year)
    + (k === 'journal' ? meta('citation_journal_title', a.journal_name) + meta('citation_volume', a.volume) + meta('citation_issue', a.issue) + meta('citation_issn', a.issn) : '')
    + (k === 'conf' ? meta('citation_conference_title', a.conference_org) : '')
    + (k === 'book' ? meta('citation_publisher', a.publisher) + meta('citation_isbn', a.isbn) : meta('citation_firstpage', fp) + meta('citation_lastpage', lp) + (k === 'conf' ? meta('citation_isbn', a.isbn) : ''))
    + meta('citation_doi', d) + meta('citation_language', L) + meta('citation_keywords', kws(a).join('; '))
    + meta('citation_abstract_html_url', url) + (scholarPdf(a) ? meta('citation_pdf_url', pdfUrl(a)) : '');
  const ldArt = {
    '@context': 'https://schema.org', '@type': k === 'book' ? 'Book' : 'ScholarlyArticle', headline: title(a), name: title(a), url,
    inLanguage: L, publisher: { '@type': 'Organization', name: S.publisher || S.name }, author: a.authors.map(n => ({ '@type': 'Person', name: n })), datePublished: a.date || String(a.year),
    abstract: abstract(a), keywords: kws(a).join(', '), license: 'https://creativecommons.org/licenses/by/4.0/', isAccessibleForFree: true,
    ...(d ? { sameAs: 'https://doi.org/' + d, identifier: d } : {}), ...(a.pages ? { pagination: String(a.pages) } : {}),
    ...(a.pdf ? { encoding: { '@type': 'MediaObject', contentUrl: pdfUrl(a), encodingFormat: 'application/pdf' } } : {}),
    ...(k === 'journal' ? { isPartOf: { '@type': 'PublicationIssue', ...(a.issue ? { issueNumber: String(a.issue) } : {}), isPartOf: { '@type': 'PublicationVolume', ...(a.volume ? { volumeNumber: String(a.volume) } : {}), isPartOf: { '@type': 'Periodical', name: a.journal_name, ...(a.issn ? { issn: a.issn } : {}) } } } }
      : k === 'conf' ? { isPartOf: { '@type': 'Event', name: a.conference_org, ...(a.conference_place ? { location: a.conference_place } : {}) } } : { publisher: { '@type': 'Organization', name: a.publisher || S.publisher } }),
  };
  const rows = [['Turi', TYPES[a._t]], ['Nashr yili', a.year],
    k === 'journal' && ['Jurnal', a.journal_name], k === 'journal' && ['Tom / son', [a.volume, a.issue].filter(Boolean).join(' / ')],
    k === 'conf' && ['Konferensiya', a.conference_org], k === 'conf' && ["O'tkazilgan joyi", a.conference_place], k === 'conf' && ['Sanasi', a.conference_date],
    k === 'book' && ['Nashriyot', a.publisher], k === 'book' && ['Nashr joyi', a.publisher_city], k === 'book' && ['Nashr', a.edition], k === 'book' && ['Hajmi (bet)', a.total_pages],
    k !== 'book' && ['Betlar', a.pages], ['ISSN', a.issn], ['ISBN', a.isbn], ['UDK', a.udk], ['BBK', a.bbk]].filter(r => r && r[1]);
  const dl = rows.map(r => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('') + (d ? `<dt>DOI</dt><dd><a href="https://doi.org/${encodeURI(d)}" rel="noopener noreferrer">${esc(d)}</a></dd>` : '');
  const alt = order(a).slice(1).filter(l => a['title_' + l]).map(l => `<p class="alt" lang="${l}">${esc(a['title_' + l])}</p>`).join('');
  const ab = order(a).filter(l => a['abstract_' + l]).map(l => `<h2 lang="${l}">${AB[l]}</h2><p lang="${l}">${esc(a['abstract_' + l])}</p>`).join('');
  const kw = order(a).filter(l => a['keywords_' + l]?.length).map(l => `<p lang="${l}"><strong>${KW[l]}:</strong> ${esc(a['keywords_' + l].join(', '))}</p>`).join('');
  const refs = [].concat(a.references || []);
  const size = a.pdf_size ? ` (${(a.pdf_size / 1e6).toFixed(1)} MB)` : '';

  // Iqtibos: 8 ta uslub + BibTeX/RIS (bu yerda hamma uslub HTML ichida, JavaScript ixtiyoriy)
  const cm = { kind: k, lang: L, authors: a.authors, year: a.year, date: a.date, title: title(a), abstract: abstract(a), keywords: kws(a), pages: a.pages, doi: d, url,
    journal: a.journal_name, volume: a.volume, issue: a.issue, confName: a.conference_org, confPlace: a.conference_place, container: a.conference_org,
    publisher: a.publisher, city: a.publisher_city, edition: a.edition, totalPages: a.total_pages, issn: a.issn, isbn: a.isbn };
  const cites = CIT.all(cm);
  out(`cite/${a._id}.bib`, CIT.bibtex(cm)); out(`cite/${a._id}.ris`, CIT.ris(cm));
  const citeBlock = `<section class="cite" data-cite aria-labelledby="ct-${a._id}"><h2 id="ct-${a._id}">Iqtibos keltirish</h2>
<label class="cite-pick">${CSTYLE_LABEL} <select data-cite-select>${cites.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
${cites.map(s => `<div class="cite-item" data-style="${s.id}"><h3>${esc(s.name)}</h3><p class="cite-text">${s.html}</p></div>`).join('')}
<p class="cite-acts"><button type="button" class="btn-copy" data-cite-copy hidden>Nusxalash</button> <a href="/cite/${a._id}.bib" download>BibTeX</a> <a href="/cite/${a._id}.ris" download>RIS (EndNote, Zotero, Mendeley)</a></p></section>`;

  out(`article/${a._id}/index.html`, page(`${title(a)} - ${S.name}`, clip(abstract(a), 160),
    `<div class="wrap"><article class="paper"><nav class="crumb" aria-label="Yo'l"><a href="/">Bosh sahifa</a>${c ? ` › <a href="/collection/${c._id}/">${esc(cLabel(c))}</a>` : ''}</nav><p class="kind">${esc(TYPES[a._t])}</p><h1 lang="${L}">${esc(title(a))}</h1>
<p class="authors">${esc(a.authors.join(', '))}</p>${alt}<dl class="meta">${dl}</dl>${a.pdf ? `<p><a class="btn" href="/pdf/${encodeURIComponent(a.pdf)}" target="_blank" rel="noopener noreferrer">To'liq matn (PDF)${size}</a></p>` : ''}${ab}${kw}
${refs.length ? `<h2>Adabiyotlar</h2><ol>${refs.map(r => `<li>${esc(r)}</li>`).join('')}</ol>` : ''}${citeBlock}</article></div>`,
    `/article/${a._id}/`, head + ld(ldArt) + ld(crumbLd([[S.name, '/'], ...(c ? [[cLabel(c), `/collection/${c._id}/`]] : []), [title(a), `/article/${a._id}/`]])) + '<script src="/js/cite.js" defer></script>\n', L, 'article'));
}

for (const [k, t] of Object.entries(D.pages || {})) out(`${k}/index.html`, page(`${t.title} - ${S.name}`, t.title, `<div class="wrap"><div class="text"><h1>${esc(t.title)}</h1>${t.text.map(p => `<p>${esc(p)}</p>`).join('')}</div></div>`, `/${k}/`));
out('404.html', page('Sahifa topilmadi', S.name, `<div class="wrap"><div class="text"><h1>Sahifa topilmadi</h1><p>Manzil noto'g'ri yoki sahifa ko'chirilgan. <a href="/">Bosh sahifaga qaytish</a>.</p></div></div>`, '/404.html', '<meta name="robots" content="noindex">\n'));

const lastOf = L => L.map(a => a.date).filter(Boolean).sort().pop();
const urls = [['/', lastOf(A)], ...C.map(c => [`/collection/${c._id}/`, lastOf(A.filter(a => a.collection === c.id))]), ...A.map(a => [`/article/${a._id}/`, a.date]), ...Object.keys(D.pages || {}).map(k => [`/${k}/`])];
out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u, m]) => `<url><loc>${BASE}${u}</loc>${m ? `<lastmod>${esc(m)}</lastmod>` : ''}</url>`).join('')}</urlset>`);
out('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: ${BASE}/sitemap.xml\n`);

// Qo'shimcha uslublar (iqtibos va to'plam bloklari). Asosiy dizayn css/style.css da qoladi.
out('css/extra.css', `.cite{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid rgba(128,128,128,.3)}
.cite h3{font-size:1rem;margin:1rem 0 .25rem}
.cite-pick{display:inline-flex;gap:.6rem;align-items:center;margin:.5rem 0}
.cite-pick select{font:inherit;padding:.35rem .6rem}
.cite-text{margin:.25rem 0;line-height:1.55;overflow-wrap:anywhere}
.cite.js .cite-item{display:none}.cite.js .cite-item.on{display:block}.cite.js .cite-item h3{display:none}
.cite-acts{display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-top:1rem}
.btn-copy{font:inherit;cursor:pointer;padding:.4rem .9rem;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit}
.cols small{opacity:.7}.plain{list-style:none;padding:0}.plain li{margin:0 0 1rem}
.plain .by,.plain .src{display:block}
`);

// Xavfsizlik sarlavhalari (_headers faqat statik fayllarga ta'sir qiladi). Indekslashga to'sqinlik qiluvchi sarlavha (noindex va h.k.) faqat /admin ga qo'yilgan.
const ADMIN_CSP = "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const adminRule = p => `${p}
  ! Content-Security-Policy
  Content-Security-Policy: ${ADMIN_CSP}
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store
`;
out('_headers', `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

${adminRule('/admin.html')}
${adminRule('/admin')}
${adminRule('/admin/')}
/cite/*
  Content-Type: text/plain; charset=utf-8
/css/*
  Cache-Control: public, max-age=3600
/js/*
  Cache-Control: public, max-age=3600
`);

// ---------- Statik fayllarni ko'chirish ----------
for (const d of ['css', 'js']) if (fs.existsSync(d)) fs.cpSync(d, path.join('dist', d), { recursive: true });

// Admin sahifa: ildizdagi admin.html (asosiy) yoki admin/index.html (zaxira) - qaysi biri bo'lsa, o'sha ko'chiriladi
if (fs.existsSync('admin.html')) fs.copyFileSync('admin.html', path.join('dist', 'admin.html'));
else if (fs.existsSync(path.join('admin', 'index.html'))) fs.copyFileSync(path.join('admin', 'index.html'), path.join('dist', 'admin.html'));
else console.warn("OGOHLANTIRISH: admin.html topilmadi (ildizda yoki admin/index.html)");

// pdf.js (adabiyotlarni PDF dan avtomat o'qish uchun). CSP "script-src 'self'" tufayli sayt ichida turishi kerak.
// Kerak: package.json -> dependencies -> "pdfjs-dist". Yo'q bo'lsa, build to'xtamaydi, faqat avtomat o'qish o'chiq bo'ladi.
const PJ = ['node_modules/pdfjs-dist/build', 'node_modules/pdfjs-dist/legacy/build'].find(p => fs.existsSync(path.join(p, 'pdf.min.mjs')));
if (PJ) {
  fs.mkdirSync(path.join('dist', 'js', 'vendor'), { recursive: true });
  for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) if (fs.existsSync(path.join(PJ, f))) fs.copyFileSync(path.join(PJ, f), path.join('dist', 'js', 'vendor', f));
} else console.warn("OGOHLANTIRISH: pdfjs-dist o'rnatilmagan, adabiyotlarni PDF dan avtomat o'qish ishlamaydi.");

console.log(`Tayyor: ${A.length} nashr, ${C.length} to'plam, ${urls.length} sahifa`);
