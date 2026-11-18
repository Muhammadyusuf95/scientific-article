/* PDF dan "Foydalanilgan adabiyotlar" ro'yxatini ajratib oladi (faqat admin panelida, brauzerda ishlaydi).
   Ishlatilishi: RefsExtract.fromFile(file, pdfjsLib) -> { pages, firstChars, firstPage, found, refs[] } */
(function (root) {
  'use strict';
  // Sarlavha: harf tushib qolgan yoki ortiqcha yozilgan shakllarga ham chidamli ("Foydalanilga adabiyotlar", "Adabiyot", "Manbalar")
  var HEAD = /^(?:\d{1,2}\s*[.)]?\s*)?(?:(?:(?:foyd?alanil\p{L}*|ishlatil\p{L}*|qo'?llanil\p{L}*)\s+)?(?:adabiyot(?:lar)?|manba(?:lar)?)(?:\s+(?:va\s+manbalar|ro'?yxati))*|(?:фойдаланил\p{L}*\s+)?(?:адабиёт(?:лар)?|манба(?:лар)?)(?:\s+рўйхати)?|references?(?:\s+list)?|bibliography|literature(?:\s+cited)?|список\s+(?:использованн\p{L}*\s+)?(?:литератур\p{L}*|источник\p{L}*)|использованн\p{L}*\s+литератур\p{L}*|литератур\p{L}*|библиографический\s+список|библиография)\s*[:.]?$/iu;
  var STOP = /^(?:ilova(?:lar)?|приложени[ея]|appendix|appendices|mualliflar\s+haqida|about\s+the\s+authors?|сведения\s+об\s+авторах)\b/i;
  var MARK = /^\s*(?:\[(\d{1,3})\]|(\d{1,3})\s*[.)](?!\d))\s*(?=\S)/;
  var AUTHOR = /^\p{Lu}[\p{L}'-]+(?:,|\s+\p{Lu}\.)/u;
  var MAX_BACK = 120, MAX_REFS = 300;

  function norm(s) { return String(s).replace(/[ʻʼ’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); }

  // Bitta manbani tozalash: raqam, ortiqcha bo'shliq, URL dagi bo'shliq va kuzatuv (utm) parametrlari
  function clean(r) {
    var s = String(r).replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:\[\d{1,3}\]|\d{1,3}\s*[.)])\s*/, '');
    s = s.replace(/([OoGg])\s+([ʻʼ‘’'`´])\s*(?=\p{L})/gu, '$1$2'); // "O ‘RGANISH" -> "O‘RGANISH"
    s = s.replace(/https?:\s+\/\//g, function (m) { return m.replace(/\s+/g, ''); });
    s = s.replace(/https?:\/\/\S+/g, function (u) {
      return u.replace(/([?&])(?:utm_[a-z]+|fbclid|gclid|yclid)(?:=[^&\s]*)?(&)?/gi, function (m, p1, p2) { return p2 ? p1 : ''; }).replace(/[?&]$/, '');
    });
    return s.replace(/\s+,/g, ',').trim();
  }

  // Qatorlar: { t: matn, h: shrift balandligi, y: betdagi o'rni (pastdan) }
  function toRows(items) {
    var rows = [], cur = null, lastY = null, prevEnd = null;
    items.forEach(function (it) {
      if (typeof it.str !== 'string') return;
      var y = it.transform[5], x = it.transform[4], h = it.height || 10;
      if (lastY !== null && Math.abs(y - lastY) > Math.max(2, h * 0.45)) { rows.push(cur); cur = null; prevEnd = null; }
      if (!cur) cur = { t: '', h: 0, y: y };
      if (cur.t && prevEnd !== null && !/\s$/.test(cur.t) && !/^\s/.test(it.str) && x - prevEnd > h * 0.12) cur.t += ' ';
      cur.t += it.str; if (it.str.trim() && h > cur.h) cur.h = h;
      lastY = y; prevEnd = x + (it.width || 0);
    });
    if (cur) rows.push(cur);
    return rows.map(function (r) { r.t = r.t.replace(/\s+/g, ' ').trim(); return r; }).filter(function (r) { return r.t; });
  }
  function toLines(items) { return toRows(items).map(function (r) { return r.t; }); }

  // Sahifa osti izohlari (snoskalar) va kolontitullar adabiyotlardan kichikroq shriftda, bet chetida turadi:
  // adabiyotlar shriftidan sezilarli kichik bo'lgan va betning pastki 35% yoki yuqori 12% qismidagi qatorlar tashlab yuboriladi.
  function dropSmall(pages, refH) {
    if (!refH) return pages.map(function (P) { return P.rows.map(function (r) { return r.t; }); });
    return pages.map(function (P) {
      return P.rows.filter(function (r) { return !(r.h && r.h < refH * 0.9 && (r.y < P.H * 0.35 || r.y > P.H * 0.88)); }).map(function (r) { return r.t; });
    });
  }
  function median(a) { a = a.filter(Boolean).sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : 0; }

  function glue(buf, next) {
    if (!buf) return next;
    if (/-$/.test(buf)) {
      if (/(?:https?:\/\/|doi)\S*-$/i.test(buf)) return buf + next;
      if (/\p{L}-$/u.test(buf) && /^\p{Ll}/u.test(next)) return buf.slice(0, -1) + next;
      return buf + next;
    }
    return buf + ' ' + next;
  }

  function split(lines) {
    var body = [];
    for (var i = 0; i < lines.length; i++) { if (STOP.test(norm(lines[i]))) break; if (!/^\d{1,4}$/.test(lines[i])) body.push(lines[i]); }
    var marked = body.filter(function (l) { return MARK.test(l); }).length;
    var out = [], buf = '', last = 0;
    if (marked >= 2) {
      // Qatorda keyingi raqam bilan boshlangan manba yopishib qolgan bo'lsa ("... – Б.9. 5. Ходжиева ..."), ajratadi
      var feed = function (text) {
        for (;;) {
          // keyingi raqam yoki muallifdan oldin takrorlangan joriy raqam (PDF dagi raqamlash xatosi)
          var re = new RegExp('(^|\\s)' + (last + 1) + '\\s*[.)]\\s+(?=[\\p{Lu}«"“\\[])|([.)\\]]\\s+)' + last + '\\s*[.)]\\s+(?=\\p{Lu}[\\p{L}\'’-]+,?\\s+\\p{Lu}\\.)', 'u');
          var mm = re.exec(text);
          if (mm && mm[2]) { mm = { index: mm.index + mm[2].length, 0: mm[0].slice(mm[2].length) }; last--; }
          if (!mm || (mm.index === 0 && !buf)) { buf = glue(buf, text); return; }
          var before = text.slice(0, mm.index).trim();
          if (before) buf = glue(buf, before);
          if (buf) out.push(buf);
          buf = ''; last++;
          text = text.slice(mm.index + mm[0].length).trim();
        }
      };
      body.forEach(function (l) {
        var m = MARK.exec(l), n = m ? parseInt(m[1] || m[2], 10) : 0;
        if (m && ((n > last && n <= last + 3) || (n === last && /[.)\]]$/.test(buf) && AUTHOR.test(l.slice(m[0].length))))) { if (buf) out.push(buf); buf = ''; last = n; feed(l.slice(m[0].length).trim()); }
        else feed(l);
      });
    } else {
      body.forEach(function (l) {
        var ends = /[.)\]]$|https?:\/\/\S+$/.test(buf) && /\b(?:19|20)\d{2}\b/.test(buf);
        if (buf && ((AUTHOR.test(l) && /[.)\]]$/.test(buf)) || (ends && /^\p{Lu}/u.test(l)))) { out.push(buf); buf = l; }
        else buf = glue(buf, l);
      });
    }
    if (buf) out.push(buf);
    var seen = {};
    return out.map(clean).filter(function (s) {
      var k = s.toLowerCase();
      if (s.length < 15 || seen[k]) return false;
      seen[k] = 1; return true;
    }).slice(0, MAX_REFS);
  }

  // Bir necha betning boshi yoki oxirida takrorlanadigan qatorlar (jurnal/to'plam kolontituli) adabiyotlar orasiga tushib qolmasin
  var TOP = 10, BOT = 6; // kolontitul qidiriladigan qatorlar: bet boshidan va oxiridan
  var runKey = function (l) { return norm(l).toLowerCase().replace(/\d+/g, '#'); };
  function running(samples) {
    var cnt = {};
    samples.forEach(function (L) {
      var seen = {};
      L.slice(0, TOP).concat(L.slice(-BOT)).forEach(function (l) { var k = runKey(l); if (k.length > 3 && !seen[k]) { seen[k] = 1; cnt[k] = (cnt[k] || 0) + 1; } });
    });
    var rep = {}; Object.keys(cnt).forEach(function (k) { if (cnt[k] >= 2) rep[k] = 1; });
    return rep;
  }
  function stripRunning(pageLines, rep) {
    return pageLines.map(function (L) { return L.filter(function (l, i) { return !((i < TOP || i >= L.length - BOT) && rep[runKey(l)]); }); });
  }

  function parseDoc(pageLines) {
    var n = pageLines.length, found = false, refs = [];
    for (var i = n - 1; i >= 0; i--) {
      var L = pageLines[i], h = -1;
      for (var j = L.length - 1; j >= 0; j--) if (HEAD.test(norm(L[j]))) { h = j; break; }
      if (h >= 0) {
        var rest = L.slice(h + 1);
        for (var k = i + 1; k < n; k++) rest = rest.concat(pageLines[k]);
        refs = split(rest); found = true; break;
      }
    }
    return { found: found, refs: refs };
  }

  async function fromFile(file, pdfjs) {
    var buf = new Uint8Array(await file.arrayBuffer());
    var doc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
    var n = doc.numPages, cache = {};
    async function page(i) {
      if (!cache[i]) { var p = await doc.getPage(i); cache[i] = { rows: toRows((await p.getTextContent()).items), H: p.getViewport({ scale: 1 }).height }; p.cleanup(); }
      return cache[i];
    }
    async function lines(i) { return (await page(i)).rows.map(function (r) { return r.t; }); }
    var first = await lines(1), start = Math.max(1, n - MAX_BACK + 1);
    for (var i = n; i >= start; i--) { // oxiridan boshlab sarlavha topilguncha o'qiydi
      var L = await lines(i);
      if (L.some(function (l) { return HEAD.test(norm(l)); })) { start = i; break; }
    }
    var pgs = []; for (var q = start; q <= n; q++) pgs.push(await page(q));
    // adabiyotlar shrifti: sarlavhadan keyingi qatorlarning o'rtacha (mediana) balandligi
    var hs = [], hi = -1;
    pgs[0].rows.forEach(function (r, k) { if (HEAD.test(norm(r.t))) hi = k; });
    if (hi >= 0) { hs = pgs[0].rows.slice(hi + 1, hi + 16).map(function (r) { return r.h; }); if (hs.length < 3 && pgs[1]) hs = hs.concat(pgs[1].rows.slice(0, 15).map(function (r) { return r.h; })); }
    var arr = dropSmall(pgs, median(hs));
    var samp = []; for (var w = Math.max(1, start - 3); w <= n; w++) samp.push(await lines(w));
    var r = parseDoc(n > 1 ? stripRunning(arr, running(samp)) : arr), chars = first.join(' ').length;
    await doc.destroy();
    return { pages: n, firstChars: chars, firstPage: first.join(' '), found: r.found, refs: r.refs };
  }

  var api = { fromFile: fromFile, parseDoc: parseDoc, running: running, stripRunning: stripRunning, dropSmall: dropSmall, split: split, toLines: toLines, toRows: toRows, clean: clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RefsExtract = api;
})(typeof window !== 'undefined' ? window : globalThis);
