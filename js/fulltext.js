/* PDF dan maqolaning to'liq matnini xatboshi va sarlavhalar bilan ajratib oladi (admin panelida, brauzerda).
   Natija maqola sahifasining o'zida HTML ko'rinishida chiqadi: Google matnni to'liq o'qiydi.
   Ishlatilishi: FullText.fromFile(file, pdfjsLib) -> { pages, chars, blocks: [{ t: 'h'|'p', x: '...' }] }
   refs.js dagi RefsExtract.toRows ga tayanadi. */
(function (root) {
  'use strict';
  var MAX_CHARS = 300000;
  var norm = function (s) { return String(s).replace(/[ʻʼ’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); };
  var key = function (l) { return norm(l).toLowerCase().replace(/\d+/g, '#'); };
  var median = function (a) { a = a.filter(function (v) { return v > 0; }).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  var pct = function (a, p) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : 0; };

  // Bet raqami, "~ 268 ~", "- 12 -" kabi qatorlar
  var PAGE_NO = /^[-–—~\s]*\d{1,4}[-–—~\s]*$/;
  // Bir necha betning boshi yoki oxirida takrorlanadigan qatorlar (kolontitul)
  function runningKeys(pages) {
    var cnt = {};
    pages.forEach(function (P) {
      var seen = {}, r = P.rows;
      r.slice(0, 10).concat(r.slice(-6)).forEach(function (row) { var k = key(row.t); if (k.length > 3 && !seen[k]) { seen[k] = 1; cnt[k] = (cnt[k] || 0) + 1; } });
    });
    var rep = {}; Object.keys(cnt).forEach(function (k) { if (cnt[k] >= 2) rep[k] = 1; });
    return rep;
  }

  function glue(a, b) {
    if (!a) return b;
    if (/\p{L}-$/u.test(a) && /^\p{Ll}/u.test(b)) return a.slice(0, -1) + b; // so'z bo'linishi
    if (/[-/]$/.test(a) && /^\S/.test(b) && /https?:|doi/i.test(a.slice(-60))) return a + b; // havola
    return a + ' ' + b;
  }
  var isCaps = function (t) { var l = t.replace(/[^\p{L}]/gu, ''); return l.length > 3 && l === l.toUpperCase() && l !== l.toLowerCase(); };
  var ENDS = /[.!?:;…»")\]]$/;
  var CONTACT = /^(?:(?:tel|phone|telefon|e-?mail|email|pochta)\s*[:.]?\s*)?(?:\+?\d[\d\s()-]{7,}\d|[\w.+-]+@[\w-]+\.[\w.-]+)[\s,;]*$/i;

  function toBlocks(pages) {
    var rep = pages.length > 1 ? runningKeys(pages) : {};
    var all = [];
    pages.forEach(function (P, pi) {
      var n = P.rows.length;
      P.rows.forEach(function (r, i) {
        var t = r.t.trim();
        if (!t || PAGE_NO.test(t) || CONTACT.test(t)) return;
        if ((i < 10 || i >= n - 6) && rep[key(t)]) return;
        all.push({ t: t, h: r.h, y: r.y, x: r.x, x2: r.x2, page: pi });
      });
    });
    if (!all.length) return [];
    // Asosiy matn shrifti: harflar soni bo'yicha eng ko'p uchraydigan balandlik
    var hc = {};
    all.forEach(function (r) { var k = Math.round(r.h * 2) / 2; hc[k] = (hc[k] || 0) + r.t.length; });
    var body = Number(Object.keys(hc).sort(function (a, b) { return hc[b] - hc[a]; })[0]) || 10;
    var left = {}, right = {}, gap = {};
    pages.forEach(function (P, pi) {
      var rows = all.filter(function (r) { return r.page === pi && Math.abs(r.h - body) < body * 0.15; });
      left[pi] = pct(rows.map(function (r) { return r.x; }), 0.1);
      right[pi] = pct(rows.map(function (r) { return r.x2; }), 0.9);
      var d = []; for (var k = 1; k < rows.length; k++) d.push(rows[k - 1].y - rows[k].y);
      gap[pi] = median(d.filter(function (v) { return v > 0 && v < body * 3; })) || body * 1.3;
    });

    var blocks = [], cur = null, prev = null, chars = 0;
    var flush = function () { if (cur && cur.x.trim()) { blocks.push(cur); chars += cur.x.length; } cur = null; };
    for (var i = 0; i < all.length && chars < MAX_CHARS; i++) {
      var r = all[i], pi = r.page;
      var heading = (r.h >= body * 1.15 && r.t.length < 200) || (isCaps(r.t) && r.t.length < 160 && !ENDS.test(r.t) && Math.abs(r.h - body) < body * 0.3);
      var small = r.h < body * 0.85; // snoska, izoh
      var newPara = true;
      if (prev && cur) {
        var samePage = prev.page === pi;
        var dy = samePage ? prev.y - r.y : 0;
        var indent = r.x - left[pi] > body * 0.9;
        var prevShort = prev.x2 < right[prev.page] - body * 3;
        if (cur.t === 'h') newPara = !heading || (samePage && dy > gap[pi] * 1.8);
        else if (heading) newPara = true;
        else if (samePage) newPara = dy > gap[pi] * 1.45 || dy < -body || indent || (prevShort && ENDS.test(prev.t)) || (small !== cur.small);
        else newPara = indent || (ENDS.test(prev.t) && prevShort) || small !== cur.small; // keyingi betga o'tgan xatboshi davom etadi
      }
      if (newPara) { flush(); cur = { t: heading ? 'h' : 'p', x: r.t, small: small }; }
      else cur.x = glue(cur.x, r.t);
      prev = r;
    }
    flush();
    return blocks.map(function (b) {
      var x = norm(b.x).replace(/^[o•▪■●◦]\s+(?=\S)/u, '• '); // Word ro'yxat belgilari
      // Uzun yoki vergul bilan tugagan "sarlavha" aslida ajratilgan matn (masalan, raqamli misol)
      var t = b.t === 'h' && (x.length > 150 || /[,;]$/.test(x) || /^\d+[.)]\s+\S+.*[.!?)]\s+\S/.test(x)) ? 'p' : b.t;
      return { t: t, x: x };
    }).filter(function (b) {
      // Bo'sh, faqat telefon raqami yoki faqat e-pochtadan iborat qatorlar sahifaga chiqarilmaydi (spam yig'uvchilardan himoya)
      return b.x.length > 1 && !CONTACT.test(b.x);
    });
  }

  async function fromFile(file, pdfjs) {
    var buf = new Uint8Array(await file.arrayBuffer());
    var doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
    var pages = [];
    for (var i = 1; i <= doc.numPages; i++) {
      var p = await doc.getPage(i);
      pages.push({ rows: root.RefsExtract.toRows((await p.getTextContent()).items) });
      p.cleanup();
    }
    var n = doc.numPages;
    await doc.destroy();
    var blocks = toBlocks(pages);
    return { pages: n, chars: blocks.reduce(function (s, b) { return s + b.x.length; }, 0), blocks: blocks };
  }

  var api = { fromFile: fromFile, toBlocks: toBlocks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.FullText = api;
})(typeof window !== 'undefined' ? window : globalThis);
