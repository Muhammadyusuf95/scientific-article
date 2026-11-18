/* PDF dan "Foydalanilgan adabiyotlar" ro'yxatini ajratib oladi (faqat admin panelida, brauzerda ishlaydi).
   Ishlatilishi: RefsExtract.fromFile(file, pdfjsLib) -> { pages, firstChars, firstPage, found, refs[] } */
(function (root) {
  'use strict';
  var HEAD = /^(?:\d{1,2}\s*[.)]?\s*)?(?:foydalanilgan\s+adabiyotlar(?:\s+ro'?yxati)?|ishlatilgan\s+adabiyotlar|adabiyotlar(?:\s+ro'?yxati)?|фойдаланилган\s+адабиётлар|адабиётлар(?:\s+рўйхати)?|references?(?:\s+list)?|bibliography|literature(?:\s+cited)?|список\s+(?:использованн(?:ой|ых)\s+)?(?:литературы|источников)|использованная\s+литература|литература|библиографический\s+список|библиография)\s*[:.]?$/i;
  var STOP = /^(?:ilova(?:lar)?|приложени[ея]|appendix|appendices|mualliflar\s+haqida|about\s+the\s+authors?|сведения\s+об\s+авторах)\b/i;
  var MARK = /^\s*(?:\[(\d{1,3})\]|(\d{1,3})\s*[.)](?!\d))\s*(?=\S)/;
  var AUTHOR = /^\p{Lu}[\p{L}'-]+(?:,|\s+\p{Lu}\.)/u;
  var MAX_BACK = 120, MAX_REFS = 300;

  function norm(s) { return String(s).replace(/[ʻʼ’‘`´]/g, "'").replace(/\s+/g, ' ').trim(); }

  // Bitta manbani tozalash: raqam, ortiqcha bo'shliq, URL dagi bo'shliq va kuzatuv (utm) parametrlari
  function clean(r) {
    var s = String(r).replace(/\s+/g, ' ').trim();
    s = s.replace(/^(?:\[\d{1,3}\]|\d{1,3}\s*[.)])\s*/, '');
    s = s.replace(/https?:\s+\/\//g, function (m) { return m.replace(/\s+/g, ''); });
    s = s.replace(/https?:\/\/\S+/g, function (u) {
      return u.replace(/([?&])(?:utm_[a-z]+|fbclid|gclid|yclid)(?:=[^&\s]*)?(&)?/gi, function (m, p1, p2) { return p2 ? p1 : ''; }).replace(/[?&]$/, '');
    });
    return s.replace(/\s+,/g, ',').trim();
  }

  function toLines(items) {
    var lines = [], cur = '', lastY = null, prevEnd = null;
    items.forEach(function (it) {
      if (typeof it.str !== 'string') return;
      var y = it.transform[5], x = it.transform[4], h = it.height || 10;
      if (lastY !== null && Math.abs(y - lastY) > Math.max(2, h * 0.45)) { lines.push(cur); cur = ''; prevEnd = null; }
      if (cur && prevEnd !== null && !/\s$/.test(cur) && !/^\s/.test(it.str) && x - prevEnd > h * 0.12) cur += ' ';
      cur += it.str; lastY = y; prevEnd = x + (it.width || 0);
    });
    if (cur) lines.push(cur);
    return lines.map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  }

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
          var re = new RegExp('(^|\\s)' + (last + 1) + '\\s*[.)]\\s+(?=[\\p{Lu}«"“\\[])', 'u');
          var mm = re.exec(text);
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
        if (m && n > last && n <= last + 3) { if (buf) out.push(buf); buf = ''; last = n; feed(l.slice(m[0].length).trim()); }
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
    async function lines(i) {
      if (!cache[i]) { var p = await doc.getPage(i); cache[i] = toLines((await p.getTextContent()).items); p.cleanup(); }
      return cache[i];
    }
    var first = await lines(1), start = Math.max(1, n - MAX_BACK + 1);
    for (var i = n; i >= start; i--) { // oxiridan boshlab sarlavha topilguncha o'qiydi
      var L = await lines(i);
      if (L.some(function (l) { return HEAD.test(norm(l)); })) { start = i; break; }
    }
    var arr = []; for (var q = start; q <= n; q++) arr.push(await lines(q));
    var r = parseDoc(arr), chars = first.join(' ').length;
    await doc.destroy();
    return { pages: n, firstChars: chars, firstPage: first.join(' '), found: r.found, refs: r.refs };
  }

  var api = { fromFile: fromFile, parseDoc: parseDoc, split: split, toLines: toLines, clean: clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RefsExtract = api;
})(typeof window !== 'undefined' ? window : globalThis);
