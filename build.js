// Netlify: "node build.js" -> dist/. Faqat articles.json ni tahrirlang.
const fs=require('fs'),path=require('path');
const D=JSON.parse(fs.readFileSync('articles.json','utf8'));
const S=D.site,BASE=(process.env.URL||S.url||'https://example.netlify.app').replace(/\/$/,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'');
const out=(p,h)=>{const f=path.join('dist',p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,h)};
const meta=(n,v)=>v||v===0?`<meta name="${n}" content="${esc(v)}">\n`:'';
const C=(D.collections||[]).map(c=>({...c,_id:slug(c.id)}));
const A=D.articles.map(a=>({...a,_id:slug(a.id)}));
const title=a=>a.title_uz||a.title_en||a.title_ru;
const doi=a=>(a.doi||'').replace(/^https?:\/\/(dx\.)?doi\.org\//i,'');
const src=a=>[a.journal_name||a.conference_org,a.volume&&`Tom ${a.volume}`,a.issue&&`Son ${a.issue}`].filter(Boolean).join(', ');
const bad=[];const seen=new Set();
for(const a of A){if(!a._id||seen.has(a._id))bad.push(`id xato yoki takror: ${a.id}`);seen.add(a._id);
 if(!title(a))bad.push(`${a.id}: sarlavha yo'q`);if(!a.authors?.length)bad.push(`${a.id}: mualliflar yo'q`);if(!a.year)bad.push(`${a.id}: yil yo'q`);
 if(!(a.abstract_uz||a.abstract_en||a.abstract_ru))bad.push(`${a.id}: annotatsiya yo'q (Google Scholar uchun shart)`);
 if(a.pdf&&!fs.existsSync(path.join('maqolalar',a.pdf)))console.warn(`OGOHLANTIRISH: maqolalar/${a.pdf} topilmadi`)}
if(bad.length){console.error(bad.join('\n'));process.exit(1)}
const NAV=[['/about/','Portal haqida'],['/editorial-board/',"Tahririyat hay'ati"],['/ethics/','Nashr etikasi'],['/contact/','Aloqa']];
const page=(t,d,body,p='/',head='')=>`<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t)}</title><meta name="description" content="${esc(d)}"><link rel="canonical" href="${BASE}${p}">
${head}<link rel="stylesheet" href="/css/style.css"></head><body>
<a class="skip" href="#main">Asosiy mazmunga o'tish</a>
<header class="bar"><div class="wrap"><a class="brand" href="/">${esc(S.name)}</a><nav aria-label="Asosiy">${NAV.map(([h,l])=>`<a href="${h}">${l}</a>`).join('')}</nav></div></header>
<main id="main">${body}</main>
<footer><div class="wrap"><p>${esc(S.publisher)}. Ochiq foydalanish, litsenziya: <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a>.</p></div></footer></body></html>`;
const row=a=>`<li data-s="${esc((title(a)+' '+a.authors.join(' ')+' '+(a.keywords_uz||[]).join(' ')).toLowerCase())}"><a href="/article/${a._id}/">${esc(title(a))}</a><span class="by">${esc(a.authors.join(', '))}</span><span class="src">${esc(src(a))}</span></li>`;
const ledger=L=>`<div class="wrap" id="list">${[...new Set(L.map(a=>a.year))].sort((x,y)=>y-x).map(y=>`<section class="yr"><h2>${y}</h2><ul>${L.filter(a=>a.year===y).map(row).join('')}</ul></section>`).join('')}</div>`;
out('index.html',page(S.name,S.description,`<section class="hero"><div class="wrap"><h1>${esc(S.name)}</h1><p>${esc(S.description)}</p><div id="q"></div></div></section>
${C.length?`<nav class="wrap cols" aria-label="To'plamlar"><h2>To'plamlar</h2>${C.map(c=>`<a href="/collection/${c._id}/">${esc(c.name)}</a>`).join('')}</nav>`:''}${ledger(A)}`,'/','<script src="/js/app.js" defer></script>\n'));
for(const c of C){const L=A.filter(a=>a.collection===c.id);out(`collection/${c._id}/index.html`,page(`${c.name} - ${S.name}`,`${c.name}: ${L.length} ta nashr`,`<section class="hero"><div class="wrap"><h1>${esc(c.name)}</h1><p>${L.length} ta nashr</p></div></section>${ledger(L)}`,`/collection/${c._id}/`))}
for(const a of A){
 const c=C.find(x=>x.id===a.collection),conf=a.item_type==='konferensiya',[fp,lp]=String(a.pages||'').split(/\s*[-–]\s*/),d=doi(a),url=`${BASE}/article/${a._id}/`;
 const head=meta('citation_title',title(a))+a.authors.map(x=>meta('citation_author',x)).join('')+meta('citation_publication_date',a.date?a.date.replace(/-/g,'/'):a.year)
  +meta(conf?'citation_conference_title':'citation_journal_title',conf?a.conference_org:a.journal_name)+meta('citation_volume',a.volume)+meta('citation_issue',a.issue)+meta('citation_firstpage',fp)+meta('citation_lastpage',lp)
  +meta('citation_doi',d)+meta('citation_issn',a.issn)+meta('citation_isbn',a.isbn)+meta('citation_language',a.language||'uz')+meta('citation_keywords',(a.keywords_uz||[]).join('; '))
  +meta('citation_abstract_html_url',url)+(a.pdf?meta('citation_pdf_url',`${BASE}/maqolalar/${encodeURIComponent(a.pdf)}`):'');
 const dl=[['Nashr yili',a.year],[conf?'Konferensiya':'Jurnal',a.conference_org||a.journal_name],['Tom / son',[a.volume,a.issue].filter(Boolean).join(' / ')],['Betlar',a.pages],['ISSN',a.issn],['ISBN',a.isbn],['UDK',a.udk]].filter(r=>r[1]).map(r=>`<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join('')+(d?`<dt>DOI</dt><dd><a href="https://doi.org/${encodeURI(d)}" rel="noopener noreferrer">${esc(d)}</a></dd>`:'');
 const ab=[['uz','Annotatsiya'],['en','Abstract'],['ru','Аннотация']].filter(([l])=>a['abstract_'+l]).map(([l,h])=>`<h2>${h}</h2><p lang="${l}">${esc(a['abstract_'+l])}</p>`).join('');
 const kw=a.keywords_uz?.length?`<p><strong>Kalit so'zlar:</strong> ${esc(a.keywords_uz.join(', '))}</p>`:'';
 const refs=[].concat(a.references||[]);
 const cite=`${a.authors.join(', ')} (${a.year}). ${title(a)}. ${src(a)}${a.pages?', '+a.pages+'-b':''}.${d?' https://doi.org/'+d:''}`;
 out(`article/${a._id}/index.html`,page(`${title(a)} - ${S.name}`,(a.abstract_uz||a.abstract_en||a.abstract_ru).slice(0,160),
 `<div class="wrap"><article class="paper">${c?`<p class="crumb"><a href="/collection/${c._id}/">${esc(c.name)}</a></p>`:''}<h1>${esc(title(a))}</h1>
<p class="authors">${esc(a.authors.join(', '))}</p><dl class="meta">${dl}</dl>${a.pdf?`<p><a class="btn" href="/maqolalar/${encodeURIComponent(a.pdf)}">To'liq matn (PDF)</a></p>`:''}${ab}${kw}
${refs.length?`<h2>Adabiyotlar</h2><ol>${refs.map(r=>`<li>${esc(r)}</li>`).join('')}</ol>`:''}<h2>Iqtibos keltirish</h2><p>${esc(cite)}</p></article></div>`,`/article/${a._id}/`,head))}
for(const [k,t] of Object.entries(D.pages||{}))out(`${k}/index.html`,page(`${t.title} - ${S.name}`,t.title,`<div class="wrap"><div class="text"><h1>${esc(t.title)}</h1>${t.text.map(p=>`<p>${esc(p)}</p>`).join('')}</div></div>`,`/${k}/`));
out('404.html',page('Sahifa topilmadi',S.name,`<div class="wrap"><div class="text"><h1>Sahifa topilmadi</h1><p>Manzil noto'g'ri yoki sahifa ko'chirilgan. <a href="/">Bosh sahifaga qaytish</a>.</p></div></div>`,'/404.html'));
const urls=['/',...C.map(c=>`/collection/${c._id}/`),...A.map(a=>`/article/${a._id}/`),...Object.keys(D.pages||{}).map(k=>`/${k}/`)];
out('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u=>`<url><loc>${BASE}${u}</loc></url>`).join('')}</urlset>`);
out('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
for(const d of ['css','js','maqolalar'])if(fs.existsSync(d))fs.cpSync(d,path.join('dist',d),{recursive:true});
console.log(`Tayyor: ${A.length} maqola, ${C.length} to'plam, ${urls.length} sahifa`);
