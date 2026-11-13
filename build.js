// Cloudflare Pages: build buyrug'i "node build.js", chiqish papkasi "dist". Faqat articles.json ni tahrirlang.
const fs=require('fs'),path=require('path');
const D=JSON.parse(fs.readFileSync('articles.json','utf8'));
if(!Array.isArray(D.articles)){console.error("articles.json: 'articles' massivi topilmadi");process.exit(1)}
const S=D.site||{};
const BASE=(process.env.SITE_URL||S.url||process.env.CF_PAGES_URL||'').replace(/\/$/,'');
if(!/^https:\/\//.test(BASE)){console.error("Sayt manzili topilmadi: articles.json -> site.url ga https://... manzilni yozing");process.exit(1)}

const SCHOLAR_MAX=5000000; // Google Scholar: har bir fayl 5 MB dan oshmasligi kerak
const LANGS=['uz','en','ru'];
const TYPES={'jurnal-maqolasi':'Jurnal maqolasi','konferensiya-maqolasi':'Konferensiya maqolasi','konferensiya-tezisi':'Konferensiya tezisi','darslik':'Darslik','oquv-qollanma':"O'quv qo'llanma",'monografiya':'Monografiya'};
const KIND={'jurnal-maqolasi':'journal','konferensiya-maqolasi':'conf','konferensiya-tezisi':'conf','darslik':'book','oquv-qollanma':'book','monografiya':'book'};
const ALIAS={jurnal:'jurnal-maqolasi',konferensiya:'konferensiya-maqolasi'};
const AB={uz:'Annotatsiya',en:'Abstract',ru:'Аннотация'},KW={uz:"Kalit so'zlar",en:'Keywords',ru:'Ключевые слова'};
const OK={issn:/^\d{4}-\d{3}[\dXx]$/,isbn:/^(?:\d[- ]?){9}[\dXx]$|^(?:\d[- ]?){12}\d$/,doi:/^10\.\d{4,9}\/\S+$/,date:/^\d{4}-\d{2}-\d{2}$/};
const PDF_OK=/^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.pdf$/i;

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
const out=(p,h)=>{const f=path.join('dist',p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,h)};
const meta=(n,v)=>v||v===0?`<meta name="${n}" content="${esc(v)}">\n`:'';
const C=(D.collections||[]).map(c=>({...c,_id:slug(c.id)}));
const A=D.articles.map(a=>({...a,_id:slug(a.id),_t:ALIAS[a.item_type]||a.item_type||'jurnal-maqolasi'}));

const lang=a=>LANGS.includes(a.language)?a.language:'uz';
const first=(a,k)=>a[k+'_'+lang(a)]||LANGS.map(l=>a[k+'_'+l]).find(v=>v&&v.length);
const title=a=>first(a,'title'),abstract=a=>first(a,'abstract'),kws=a=>first(a,'keywords')||[];
const order=a=>[lang(a),...LANGS.filter(l=>l!==lang(a))];
const doi=a=>(a.doi||'').replace(/^https?:\/\/(dx\.)?doi\.org\//i,'');
const pdfUrl=a=>`${BASE}/pdf/${encodeURIComponent(a.pdf)}`;
const scholarPdf=a=>a.pdf&&(!a.pdf_size||a.pdf_size<=SCHOLAR_MAX);
const src=a=>{const k=KIND[a._t];return k==='journal'?[a.journal_name,a.volume&&`Tom ${a.volume}`,a.issue&&`Son ${a.issue}`]:k==='conf'?[a.conference_org]:[a.publisher,a.publisher_city]}
const srcText=a=>src(a).filter(Boolean).join(', ');

const bad=[];const seen=new Set();
for(const x of A){const k=KIND[x._t],L=lang(x);
 if(!x._id||seen.has(x._id))bad.push(`id xato yoki takror: ${x.id}`);seen.add(x._id);
 if(!k)bad.push(`${x.id}: item_type noto'g'ri: ${x.item_type}`);
 if(!x['title_'+L])bad.push(`${x.id}: asosiy til (${L}) da sarlavha yo'q`);
 if(!x['abstract_'+L])bad.push(`${x.id}: asosiy til (${L}) da annotatsiya yo'q (Google Scholar uchun shart)`);
 if(!x.authors?.length)bad.push(`${x.id}: mualliflar yo'q`);if(!x.year)bad.push(`${x.id}: yil yo'q`);
 if(k==='journal'&&!x.journal_name)bad.push(`${x.id}: jurnal nomi yo'q`);
 if(k==='conf'&&!x.conference_org)bad.push(`${x.id}: konferensiya nomi yo'q`);
 if(x.issn&&!OK.issn.test(x.issn))bad.push(`${x.id}: ISSN formati noto'g'ri`);
 if(x.isbn&&!OK.isbn.test(x.isbn))bad.push(`${x.id}: ISBN formati noto'g'ri`);
 if(x.doi&&!OK.doi.test(doi(x)))bad.push(`${x.id}: DOI formati noto'g'ri`);
 if(x.date&&!OK.date.test(x.date))bad.push(`${x.id}: sana YYYY-MM-DD bo'lishi kerak`);
 if(x.pdf&&!PDF_OK.test(x.pdf))bad.push(`${x.id}: pdf fayl nomi noto'g'ri: ${x.pdf}`);
}
if(bad.length){console.error(bad.join('\n'));process.exit(1)}

const NAV=[['/about/','Portal haqida'],['/editorial-board/',"Tahririyat hay'ati"],['/ethics/','Nashr etikasi'],['/contact/','Aloqa']];
const page=(t,d,body,p='/',head='',l='uz')=>`<!doctype html>
<html lang="${l}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t)}</title><meta name="description" content="${esc(d)}"><link rel="canonical" href="${BASE}${p}">
<meta property="og:title" content="${esc(t)}"><meta property="og:description" content="${esc(d)}"><meta property="og:url" content="${BASE}${p}"><meta property="og:type" content="website">
${head}<link rel="stylesheet" href="/css/style.css"></head><body>
<a class="skip" href="#main">Asosiy mazmunga o'tish</a>
<header class="bar"><div class="wrap"><a class="brand" href="/">${esc(S.name)}</a><nav aria-label="Asosiy">${NAV.map(([h,x])=>`<a href="${h}">${x}</a>`).join('')}</nav></div></header>
<main id="main">${body}</main>
<footer><div class="wrap"><p>${esc(S.publisher)}. Ochiq foydalanish, litsenziya: <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a>.</p></div></footer></body></html>`;
// Ro'yxat oddiy HTML havolalardan iborat (JavaScript'siz ham to'liq ko'rinadi) - Google Scholar "browse interface" talabi
const row=a=>`<li data-s="${esc(([...LANGS.map(l=>a['title_'+l]),...a.authors,...kws(a)].filter(Boolean).join(' ')).toLowerCase())}"><a href="/article/${a._id}/">${esc(title(a))}</a><span class="by">${esc(a.authors.join(', '))}</span><span class="src">${esc([TYPES[a._t],srcText(a)].filter(Boolean).join(' · '))}</span></li>`;
const ledger=L=>`<div class="wrap" id="list">${[...new Set(L.map(a=>a.year))].sort((x,y)=>y-x).map(y=>`<section class="yr"><h2>${y}</h2><ul>${L.filter(a=>a.year===y).map(row).join('')}</ul></section>`).join('')}</div>`;

out('index.html',page(S.name,S.description,`<section class="hero"><div class="wrap"><h1>${esc(S.name)}</h1><p>${esc(S.description)}</p><div id="q"></div></div></section>
${C.length?`<nav class="wrap cols" aria-label="To'plamlar"><h2>To'plamlar</h2>${C.map(c=>`<a href="/collection/${c._id}/">${esc(c.name)}</a>`).join('')}</nav>`:''}${ledger(A)}`,'/','<script src="/js/app.js" defer></script>\n'));
for(const c of C){const L=A.filter(a=>a.collection===c.id);out(`collection/${c._id}/index.html`,page(`${c.name} - ${S.name}`,`${c.name}: ${L.length} ta nashr`,`<section class="hero"><div class="wrap"><h1>${esc(c.name)}</h1><p>${L.length} ta nashr</p></div></section>${ledger(L)}`,`/collection/${c._id}/`))}

for(const a of A){
 const k=KIND[a._t],L=lang(a),c=C.find(x=>x.id===a.collection),d=doi(a),url=`${BASE}/article/${a._id}/`,[fp,lp]=String(a.pages||'').split(/\s*[-–]\s*/);
 // Highwire Press teglari - Google Scholar tavsiya etgan format. citation_title faqat asosiy (PDF) tilida.
 const head=meta('citation_title',title(a))+a.authors.map(x=>meta('citation_author',x)).join('')+meta('citation_publication_date',a.date?a.date.replace(/-/g,'/'):a.year)
  +(k==='journal'?meta('citation_journal_title',a.journal_name)+meta('citation_volume',a.volume)+meta('citation_issue',a.issue):'')
  +(k==='conf'?meta('citation_conference_title',a.conference_org):'')
  +(k==='book'?meta('citation_publisher',a.publisher):meta('citation_firstpage',fp)+meta('citation_lastpage',lp))
  +meta('citation_doi',d)+meta('citation_issn',a.issn)+meta('citation_isbn',a.isbn)+meta('citation_language',L)+meta('citation_keywords',kws(a).join('; '))
  +meta('citation_abstract_html_url',url)+(scholarPdf(a)?meta('citation_pdf_url',pdfUrl(a)):'');
 const rows=[['Turi',TYPES[a._t]],['Nashr yili',a.year],
  k==='journal'&&['Jurnal',a.journal_name],k==='journal'&&['Tom / son',[a.volume,a.issue].filter(Boolean).join(' / ')],
  k==='conf'&&['Konferensiya',a.conference_org],k==='conf'&&["O'tkazilgan joyi",a.conference_place],k==='conf'&&['Sanasi',a.conference_date],
  k==='book'&&['Nashriyot',a.publisher],k==='book'&&['Nashr joyi',a.publisher_city],k==='book'&&['Nashr',a.edition],k==='book'&&['Hajmi (bet)',a.total_pages],
  k!=='book'&&['Betlar',a.pages],['ISSN',a.issn],['ISBN',a.isbn],['UDK',a.udk],['BBK',a.bbk]].filter(r=>r&&r[1]);
 const dl=rows.map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')+(d?`<dt>DOI</dt><dd><a href="https://doi.org/${encodeURI(d)}" rel="noopener noreferrer">${esc(d)}</a></dd>`:'');
 const alt=order(a).slice(1).filter(l=>a['title_'+l]).map(l=>`<p class="alt" lang="${l}">${esc(a['title_'+l])}</p>`).join('');
 const ab=order(a).filter(l=>a['abstract_'+l]).map(l=>`<h2 lang="${l}">${AB[l]}</h2><p lang="${l}">${esc(a['abstract_'+l])}</p>`).join('');
 const kw=order(a).filter(l=>a['keywords_'+l]?.length).map(l=>`<p lang="${l}"><strong>${KW[l]}:</strong> ${esc(a['keywords_'+l].join(', '))}</p>`).join('');
 const refs=[].concat(a.references||[]);
 const cite=`${a.authors.join(', ')} (${a.year}). ${title(a)}. ${[TYPES[a._t],srcText(a)].filter(Boolean).join('. ')}${a.pages?', '+a.pages+'-b':''}.${d?' https://doi.org/'+d:''}`;
 const size=a.pdf_size?` (${(a.pdf_size/1e6).toFixed(1)} MB)`:'';
 out(`article/${a._id}/index.html`,page(`${title(a)} - ${S.name}`,(abstract(a)||'').slice(0,160),
 `<div class="wrap"><article class="paper">${c?`<p class="crumb"><a href="/collection/${c._id}/">${esc(c.name)}</a></p>`:''}<p class="kind">${esc(TYPES[a._t])}</p><h1 lang="${L}">${esc(title(a))}</h1>
<p class="authors">${esc(a.authors.join(', '))}</p>${alt}<dl class="meta">${dl}</dl>${a.pdf?`<p><a class="btn" href="/pdf/${encodeURIComponent(a.pdf)}" target="_blank" rel="noopener noreferrer">To'liq matn (PDF)${size}</a></p>`:''}${ab}${kw}
${refs.length?`<h2>Adabiyotlar</h2><ol>${refs.map(r=>`<li>${esc(r)}</li>`).join('')}</ol>`:''}<h2>Iqtibos keltirish</h2><p>${esc(cite)}</p></article></div>`,`/article/${a._id}/`,head,L))}

for(const [k,t] of Object.entries(D.pages||{}))out(`${k}/index.html`,page(`${t.title} - ${S.name}`,t.title,`<div class="wrap"><div class="text"><h1>${esc(t.title)}</h1>${t.text.map(p=>`<p>${esc(p)}</p>`).join('')}</div></div>`,`/${k}/`));
out('404.html',page('Sahifa topilmadi',S.name,`<div class="wrap"><div class="text"><h1>Sahifa topilmadi</h1><p>Manzil noto'g'ri yoki sahifa ko'chirilgan. <a href="/">Bosh sahifaga qaytish</a>.</p></div></div>`,'/404.html'));

const urls=[['/'],...C.map(c=>[`/collection/${c._id}/`]),...A.map(a=>[`/article/${a._id}/`,a.date]),...Object.keys(D.pages||{}).map(k=>[`/${k}/`])];
out('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(([u,m])=>`<url><loc>${BASE}${u}</loc>${m?`<lastmod>${esc(m)}</lastmod>`:''}</url>`).join('')}</urlset>`);
out('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);

// Xavfsizlik sarlavhalari (_headers faqat statik fayllarga ta'sir qiladi). Indekslashga to'sqinlik qiluvchi sarlavha (noindex va h.k.) faqat /admin.html ga qo'yilgan.
out('_headers',`/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

/admin.html
  ! Content-Security-Policy
  Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
  X-Robots-Tag: noindex, nofollow
  Cache-Control: no-store

/css/*
  Cache-Control: public, max-age=3600
/js/*
  Cache-Control: public, max-age=3600
`);

for(const d of ['css','js'])if(fs.existsSync(d))fs.cpSync(d,path.join('dist',d),{recursive:true});
if(fs.existsSync('admin.html'))fs.copyFileSync('admin.html',path.join('dist','admin.html'));
console.log(`Tayyor: ${A.length} nashr, ${C.length} to'plam, ${urls.length} sahifa`);
