'use strict';
// Iqtibos generatori (build.js ishlatadi): APA 7, GOST R 7.0.5-2008, MLA 9, Chicago (author-date),
// Harvard, IEEE, Vancouver, ISO 690 + BibTeX va RIS.
// Mualliflar "Familiya Ism Sharif" tartibida yoziladi (yoki "Familiya, Ism").

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Kursiv belgilari: \u0001 ... \u0002 (oxirida <i> ga aylanadi)
const I = (s) => (s ? '\u0001' + s + '\u0002' : '');
const toHtml = (s) => esc(s).replace(/\u0001/g, '<i>').replace(/\u0002/g, '</i>');
const toPlain = (s) => s.replace(/[\u0001\u0002]/g, '');
const tidy = (s) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').replace(/\.{2,}/g, '.').replace(/,\s*\./g, '.').trim();
const endDot = (s) => (/[.!?…]$/.test(s.replace(/\u0002$/, '')) ? s : s + '.');
const stripDot = (s) => s.replace(/[.\s]+$/, '');
const qt = (t) => '“' + (/[.!?]$/.test(t) ? t : t + '.') + '”';

// ---------- Ismlar ----------
const PATRONYM = /^(?:o['ʻʼ‘’`´]?g['ʻʼ‘’`´]?li|ogli|ugli|qizi|kizi|kyzy|ўғли|қизи|оглы|кызы|угли)$/i;
function initial(tok) {
  return tok.split('-').map((part) => {
    const t = part.replace(/\./g, '');
    if (!t) return '';
    if (/^(sh|ch)/i.test(t)) return t[0].toUpperCase() + t[1].toLowerCase();
    if (/^[og][ʻʼ‘’`´']/i.test(t)) return t[0].toUpperCase() + t[1];
    return t[0].toUpperCase();
  }).filter(Boolean).join('-');
}
function parseName(full) {
  const s = String(full || '').replace(/\s+/g, ' ').trim();
  let family = s, given = '';
  if (s.includes(',')) { const k = s.indexOf(','); family = s.slice(0, k).trim(); given = s.slice(k + 1).trim(); }
  else { const sp = s.indexOf(' '); if (sp > 0) { family = s.slice(0, sp); given = s.slice(sp + 1).trim(); } }
  const toks = given.split(' ').filter(Boolean);
  const ini = toks.filter((t) => !PATRONYM.test(t)).map(initial).filter(Boolean);
  return { family, toks, ini };
}
const dots = (n) => n.ini.map((x) => x.split('-').map((p) => p + '.').join('-')).join(' ');
const compact = (n) => n.ini.map((x) => x.replace(/-/g, '')).join('');
const famInit = (n) => n.family + (n.ini.length ? ', ' + dots(n) : '');         // Aliyev, V. S.
const initFam = (n) => (n.ini.length ? dots(n) + ' ' : '') + n.family;         // V. S. Aliyev
const givenFull = (n) => n.toks.map((t) => (/^\p{L}$/u.test(t) ? t + '.' : t)).join(' ');
const famGiven = (n) => n.family + (n.toks.length ? ', ' + givenFull(n) : ''); // Aliyev, Vali
const givenFam = (n) => (n.toks.length ? givenFull(n) + ' ' : '') + n.family;  // Vali Aliyev

// ---------- Umumiy yordamchilar ----------
function sentence(t) { // BUTUN SARLAVHA BOSH HARFDA bo'lsa, gap holatiga o'tkazadi
  t = String(t || '').trim();
  if (t && t === t.toUpperCase() && t !== t.toLowerCase()) { const l = t.toLowerCase(); return l.charAt(0).toUpperCase() + l.slice(1); }
  return t;
}
const range = (p) => String(p || '').replace(/\s*[-–—]\s*/, '–').trim();
const isRange = (p) => range(p).includes('–');
const pp = (p, a = 'pp.', b = 'p.') => (p ? (isRange(p) ? a : b) + ' ' + p : '');
const join = (arr, sep = ', ') => arr.filter(Boolean).join(sep);

function prep(m) {
  return {
    ...m,
    names: (m.authors || []).map(parseName),
    title: sentence(m.title),
    pages: range(m.pages),
    link: m.doi ? 'https://doi.org/' + m.doi : m.url || '',
    cont: m.container || m.confName || m.journal || '',
    place: join([m.city]) || m.confPlace || '',
  };
}

// ---------- Uslublar ----------
function apa(m) {
  const L = m.names.map(famInit);
  let A = '';
  if (L.length === 1) A = L[0];
  else if (L.length >= 2 && L.length <= 20) A = L.slice(0, -1).join(', ') + ', & ' + L[L.length - 1];
  else if (L.length > 20) A = L.slice(0, 19).join(', ') + ', … ' + L[L.length - 1];
  const head = (A ? endDot(A) + ' ' : '') + '(' + m.year + '). ';
  let s;
  if (m.kind === 'journal') {
    s = head + endDot(m.title) + ' ' + I(m.journal);
    if (m.volume) s += ', ' + I(m.volume);
    if (m.issue) s += '(' + m.issue + ')';
    if (m.pages) s += ', ' + m.pages;
    s += '.';
  } else if (m.kind === 'conf') {
    s = head + endDot(m.title) + ' In ' + I(m.cont);
    if (m.pages) s += ' (' + pp(m.pages) + ')';
    s += '.';
    if (m.publisher) s += ' ' + endDot(m.publisher);
  } else {
    s = head + I(m.title) + (m.edition ? ' (' + m.edition + ')' : '') + '. ' + (m.publisher ? endDot(m.publisher) : '');
  }
  return s + (m.link ? ' ' + m.link : '');
}

function mla(m) {
  const n = m.names;
  let A = '';
  if (n.length === 1) A = famGiven(n[0]);
  else if (n.length === 2) A = famGiven(n[0]) + ', and ' + givenFam(n[1]);
  else if (n.length >= 3) A = famGiven(n[0]) + ', et al.';
  const a = A ? endDot(A) + ' ' : '';
  let s;
  if (m.kind === 'journal') {
    s = a + qt(m.title) + ' ' + I(m.journal) + ', ' + join([m.volume && 'vol. ' + m.volume, m.issue && 'no. ' + m.issue, m.year, pp(m.pages)]) + '.';
  } else if (m.kind === 'conf') {
    s = a + qt(m.title) + ' ' + I(m.cont) + ', ' + join([m.publisher, m.year, pp(m.pages)]) + '.';
  } else {
    s = a + I(m.title) + '. ' + join([m.edition, m.publisher, m.year]) + '.';
  }
  return s + (m.link ? ' ' + m.link + '.' : '');
}

function chicago(m) {
  const n = m.names;
  const full = n.map((x, i) => (i === 0 ? famGiven(x) : givenFam(x)));
  let A = '';
  if (n.length === 1) A = full[0];
  else if (n.length === 2) A = full[0] + ' and ' + full[1];
  else if (n.length <= 10 && n.length > 2) A = full.slice(0, -1).join(', ') + ', and ' + full[full.length - 1];
  else if (n.length > 10) A = full.slice(0, 7).join(', ') + ', et al.';
  const head = (A ? endDot(A) + ' ' : '') + m.year + '. ';
  const pub = m.place && m.publisher ? m.place + ': ' + m.publisher : m.publisher || m.place;
  let s;
  if (m.kind === 'journal') {
    s = head + qt(m.title) + ' ' + I(m.journal) + (m.volume ? ' ' + m.volume : '') + (m.issue ? ' (' + m.issue + ')' : '') + (m.pages ? ': ' + m.pages : '') + '.';
  } else if (m.kind === 'conf') {
    s = head + qt(m.title) + ' In ' + I(m.cont) + (m.pages ? ', ' + m.pages : '') + '.' + (pub ? ' ' + pub + '.' : '');
  } else {
    s = head + I(m.title) + '.' + (pub ? ' ' + pub + '.' : '');
  }
  return s + (m.link ? ' ' + m.link + '.' : '');
}

function harvard(m) {
  const L = m.names.map(famInit);
  let A = '';
  if (L.length === 1) A = L[0];
  else if (L.length >= 2 && L.length <= 3) A = L.slice(0, -1).join(', ') + ' and ' + L[L.length - 1];
  else if (L.length > 3) A = L[0] + ' et al.';
  const head = (A ? A + ' ' : '') + '(' + m.year + ') ';
  const pub = m.place && m.publisher ? m.place + ': ' + m.publisher : m.publisher || m.place;
  let s;
  if (m.kind === 'journal') {
    const vi = m.volume ? m.volume + (m.issue ? '(' + m.issue + ')' : '') : m.issue ? '(' + m.issue + ')' : '';
    s = head + '‘' + m.title + '’, ' + join([I(m.journal), vi, pp(m.pages)]) + '.';
  } else if (m.kind === 'conf') {
    s = head + '‘' + m.title + '’, in ' + I(m.cont) + '.' + (pub ? ' ' + pub : '') + (m.pages ? (pub ? ', ' : ' ') + pp(m.pages) : '') + '.';
  } else {
    s = head + I(m.title) + '.' + (m.edition ? ' ' + m.edition + '.' : '') + (pub ? ' ' + pub + '.' : '');
  }
  return s + (m.link ? ' Available at: ' + m.link + '.' : '');
}

function ieee(m) {
  const L = m.names.map(initFam);
  let A = '';
  if (L.length > 6) A = L[0] + ' et al.';
  else if (L.length === 1) A = L[0];
  else if (L.length === 2) A = L[0] + ' and ' + L[1];
  else if (L.length > 2) A = L.slice(0, -1).join(', ') + ', and ' + L[L.length - 1];
  const a = A ? A + ', ' : '';
  const doi = m.doi ? ', doi: ' + m.doi : '';
  if (m.kind === 'journal') return a + '“' + m.title + ',” ' + I(m.journal) + ', ' + join([m.volume && 'vol. ' + m.volume, m.issue && 'no. ' + m.issue, pp(m.pages), m.year]) + doi + '.';
  if (m.kind === 'conf') return a + '“' + m.title + ',” in ' + I(m.cont) + ', ' + join([m.place, m.year, pp(m.pages)]) + doi + '.';
  return a + I(m.title) + (m.edition ? ', ' + m.edition : '') + '. ' + join([m.place && m.publisher ? m.place + ': ' + m.publisher : m.publisher || m.place, m.year]) + doi + '.';
}

function vancouver(m) {
  const L = m.names.map((n) => n.family + (n.ini.length ? ' ' + compact(n) : ''));
  const A = L.length > 6 ? L.slice(0, 6).join(', ') + ', et al' : L.join(', ');
  const pg = m.pages.replace('–', '-');
  const doi = m.doi ? ' doi:' + m.doi : '';
  if (m.kind === 'journal') {
    const vi = m.volume || m.issue ? ';' + (m.volume || '') + (m.issue ? '(' + m.issue + ')' : '') : '';
    return (A ? A + '. ' : '') + endDot(m.title) + ' ' + m.journal + '. ' + m.year + vi + (pg ? ':' + pg : '') + '.' + doi;
  }
  const pub = join([m.place && m.publisher ? m.place + ': ' + m.publisher : m.publisher || m.place], '');
  if (m.kind === 'conf') return (A ? A + '. ' : '') + endDot(m.title) + ' In: ' + m.cont + '. ' + (pub ? pub + '; ' : '') + m.year + '.' + (pg ? ' p. ' + pg + '.' : '') + doi;
  return (A ? A + '. ' : '') + endDot(m.title) + ' ' + (pub ? pub + '; ' : '') + m.year + '.' + doi;
}

const GL = {
  uz: { vol: 'T.', p: 'B.', etal: '[va boshq.]', tot: 'b.' },
  ru: { vol: 'Т.', p: 'С.', etal: '[и др.]', tot: 'с.' },
  en: { vol: 'Vol.', p: 'P.', etal: '[et al.]', tot: 'p.' },
};
function gost(m) {
  const t = GL[m.lang] || GL.uz;
  const n = m.names;
  const head = n.length && n.length <= 3 ? famInit(n[0]) + ' ' : '';
  let resp = '';
  if (n.length && n.length <= 3) resp = n.map(initFam).join(', ');
  else if (n.length > 3) resp = initFam(n[0]) + ' ' + t.etal;
  const block = head + stripDot(m.title) + (resp ? ' / ' + resp : '');
  let parts;
  if (m.kind === 'journal') {
    const vi = join([m.volume && t.vol + ' ' + m.volume, m.issue && '№ ' + m.issue]);
    parts = [block + ' // ' + stripDot(m.journal), String(m.year), vi, m.pages && t.p + ' ' + m.pages];
  } else if (m.kind === 'conf') {
    const inner = stripDot(m.cont) + (m.confName && m.confName !== m.cont ? ': ' + stripDot(m.confName) : '');
    parts = [block + ' // ' + inner, join([m.place || m.confPlace, m.year]), m.pages && t.p + ' ' + m.pages];
  } else {
    parts = [block, (m.place ? m.place + ': ' : '') + (m.publisher ? m.publisher + ', ' : '') + m.year, m.totalPages && m.totalPages + ' ' + t.tot];
  }
  if (m.doi) parts.push('DOI: ' + m.doi);
  const s = parts.filter(Boolean).join('. – ');
  return m.doi ? s : s + '.';
}

function iso690(m) {
  const L = m.names.map((n) => n.family.toUpperCase() + (n.ini.length ? ', ' + dots(n) : ''));
  let A = '';
  if (L.length <= 3) A = L.join('; ');
  else A = L[0] + '; et al.';
  const a = A ? endDot(A) + ' ' : '';
  const doi = m.doi ? ' DOI ' + m.doi + '.' : m.url ? ' Available at: ' + m.url : '';
  const pub = m.place && m.publisher ? m.place + ': ' + m.publisher : m.publisher || m.place;
  if (m.kind === 'journal') return a + endDot(m.title) + ' ' + I(m.journal) + '. ' + join([String(m.year), m.volume && 'vol. ' + m.volume, m.issue && 'no. ' + m.issue, pp(m.pages)]) + '.' + doi;
  if (m.kind === 'conf') return a + endDot(m.title) + ' In: ' + I(m.cont) + '. ' + join([pub, String(m.year), pp(m.pages)]) + '.' + doi;
  return a + I(m.title) + '. ' + join([m.edition, pub, String(m.year)]) + '.' + doi;
}

const STYLES = [
  { id: 'apa', name: 'APA 7', fn: apa },
  { id: 'gost', name: 'GOST R 7.0.5-2008', fn: gost },
  { id: 'mla', name: 'MLA 9', fn: mla },
  { id: 'chicago', name: 'Chicago (author-date)', fn: chicago },
  { id: 'harvard', name: 'Harvard', fn: harvard },
  { id: 'ieee', name: 'IEEE', fn: ieee },
  { id: 'vancouver', name: 'Vancouver', fn: vancouver },
  { id: 'iso690', name: 'ISO 690', fn: iso690 },
];

function all(meta) {
  const m = prep(meta);
  return STYLES.map((s) => {
    const marked = tidy(s.fn(m));
    return { id: s.id, name: s.name, html: toHtml(marked), text: toPlain(marked) };
  });
}

// ---------- BibTeX va RIS ----------
const tex = (v) => String(v).replace(/\\/g, '\\textbackslash{}').replace(/[&%$#_{}]/g, '\\$&').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}');
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[ʻʼ‘’`'´]/g, '').replace(/[^a-z0-9]+/g, '');
const LANG_NAME = { uz: 'uzbek', ru: 'russian', en: 'english' };

function bibtex(meta) {
  const m = prep(meta);
  const key = (slug(m.names[0] && m.names[0].family) || 'anon') + m.year + (slug(String(m.title).split(/\s+/)[0]) || '');
  const type = m.kind === 'journal' ? 'article' : m.kind === 'conf' ? 'inproceedings' : 'book';
  const f = [];
  const add = (k, v) => { if (v !== undefined && v !== null && String(v) !== '') f.push('  ' + k + ' = {' + tex(v) + '}'); };
  add('author', m.names.map((n) => (n.toks.length ? n.family + ', ' + givenFull(n) : n.family)).join(' and '));
  f.push('  title = {{' + tex(meta.title) + '}}');
  if (m.kind === 'journal') { add('journal', m.journal); add('volume', m.volume); add('number', m.issue); add('pages', m.pages.replace('–', '--')); }
  else if (m.kind === 'conf') { add('booktitle', m.cont); add('pages', m.pages.replace('–', '--')); add('address', m.place || m.confPlace); add('publisher', m.publisher); }
  else { add('publisher', m.publisher); add('address', m.place); add('edition', m.edition); }
  add('year', m.year); add('doi', m.doi); add('url', m.url); add('issn', m.issn); add('isbn', m.isbn);
  add('language', LANG_NAME[m.lang]); add('keywords', (m.keywords || []).join(', '));
  return '@' + type + '{' + key + ',\n' + f.join(',\n') + '\n}\n';
}

function ris(meta) {
  const m = prep(meta);
  const L = [];
  const add = (t, v) => { if (v !== undefined && v !== null && String(v) !== '') L.push(t + '  - ' + String(v).replace(/[\r\n]+/g, ' ')); };
  add('TY', m.kind === 'journal' ? 'JOUR' : m.kind === 'conf' ? 'CPAPER' : 'BOOK');
  for (const n of m.names) add('AU', n.toks.length ? n.family + ', ' + givenFull(n) : n.family);
  add('TI', meta.title);
  if (m.kind === 'journal') { add('JO', m.journal); add('VL', m.volume); add('IS', m.issue); }
  else if (m.kind === 'conf') { add('T2', m.cont); add('CY', m.place || m.confPlace); add('PB', m.publisher); }
  else { add('PB', m.publisher); add('CY', m.place); }
  if (m.pages) { const [a, b] = m.pages.split('–'); add('SP', a); add('EP', b); }
  add('PY', m.year); add('DA', meta.date ? String(meta.date).replace(/-/g, '/') : ''); add('DO', m.doi); add('UR', m.url);
  add('SN', m.issn || m.isbn); add('LA', m.lang); add('AB', meta.abstract);
  for (const k of m.keywords || []) add('KW', k);
  L.push('ER  - ');
  return L.join('\r\n') + '\r\n';
}

module.exports = { all, bibtex, ris, STYLES, parseName };
