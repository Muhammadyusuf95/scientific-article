/* Ilmiy Maqolalar Portali: qidiruv, iqtibos, statistika va havola nusxalash.
   Barcha matn sahifada JavaScript'siz ham ko'rinadi (Google uchun). Bu fayl faqat qulaylik qo'shadi. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

  function toast(text) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  // ---------- Qidiruv ----------
  var form = $('[data-search]'), list = $('[data-list]');
  if (form && list) {
    var input = $('input', form);
    var rows = $$('.entry', list), years = $$('[data-year]', list), empty = $('[data-empty]', list), count = $('[data-count]');
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[ʻʼ‘’`´']/g, '').replace(/\s+/g, ' ').trim(); };
    var keys = rows.map(function (r) { return norm(r.getAttribute('data-s')); });
    var run = function () {
      var words = norm(input.value).split(' ').filter(Boolean), shown = 0;
      rows.forEach(function (r, i) {
        var ok = words.every(function (w) { return keys[i].indexOf(w) >= 0; });
        r.hidden = !ok; if (ok) shown++;
      });
      years.forEach(function (y) { y.hidden = !$('.entry:not([hidden])', y); });
      if (empty) empty.hidden = shown > 0;
      if (count) count.textContent = words.length ? shown + ' ta natija' : rows.length + ' ta nashr';
    };
    form.addEventListener('submit', function (e) { e.preventDefault(); run(); });
    input.addEventListener('input', run);
    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; run(); }
  }

  // ---------- Iqtibos uslubi ----------
  var box = $('[data-cite]');
  if (box) {
    var sel = $('[data-cite-select]', box), btn = $('[data-cite-copy]', box), items = $$('.cite-item', box), KEY = 'citeStyle';
    var show = function (id) {
      items.forEach(function (e) { e.classList.toggle('on', e.getAttribute('data-style') === id); });
      try { localStorage.setItem(KEY, id); } catch (e) {}
    };
    var saved = ''; try { saved = localStorage.getItem(KEY) || ''; } catch (e) {}
    if (saved && items.some(function (e) { return e.getAttribute('data-style') === saved; })) sel.value = saved;
    box.classList.add('js'); show(sel.value);
    sel.addEventListener('change', function () { show(sel.value); });
    if (btn) {
      btn.hidden = false;
      btn.addEventListener('click', function () {
        var cur = $('.cite-item.on .cite-text', box); if (!cur) return;
        copy(cur.textContent.trim(), 'Iqtibos nusxalandi');
      });
    }
  }

  function copy(text, okMsg) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg); }, function () { fallback(text, okMsg); });
    } else fallback(text, okMsg);
  }
  function fallback(text, okMsg) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(okMsg); } catch (e) {}
    ta.remove();
  }

  var share = $('[data-share]');
  if (share) share.addEventListener('click', function () {
    var url = (document.querySelector('link[rel=canonical]') || {}).href || location.href;
    copy(url, 'Havola nusxalandi');
  });

  // ---------- Ko'rishlar va yuklab olishlar ----------
  var st = $('[data-stats]');
  if (st) {
    var id = st.getAttribute('data-stats');
    var vEl = $('[data-views]', st), dEl = $('[data-downloads]', st);
    var fmt = function (n) { return Number(n || 0).toLocaleString('uz-UZ'); };
    var paint = function (d) { if (d && d.success !== false) { vEl.textContent = fmt(d.views); dEl.textContent = fmt(d.downloads); } };
    var seenKey = 'v:' + id + ':' + new Date().toISOString().slice(0, 10), seen = false;
    try { seen = !!localStorage.getItem(seenKey); } catch (e) {}
    var req = seen
      ? fetch('/stats?id=' + encodeURIComponent(id), { cache: 'no-store' })
      : fetch('/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) });
    req.then(function (r) { return r.json(); }).then(function (d) {
      paint(d);
      if (!seen && d && d.success) { try { localStorage.setItem(seenKey, '1'); } catch (e) {} }
    }).catch(function () { st.hidden = true; });

    $$('[data-dl]').forEach(function (a) {
      a.addEventListener('click', function () {
        var n = parseInt(String(dEl.textContent).replace(/\D/g, ''), 10);
        if (!isNaN(n)) dEl.textContent = fmt(n + 1);
      });
    });
  }

  // ---------- Umumiy qidiruv (/search/): /data/search.json bo'yicha ----------
  var gform = $('[data-gsearch]'), gbox = $('[data-results]');
  if (gform && gbox) {
    var ginput = $('input', gform), gcount = $('[data-gcount]'), DATA = null, timer = null;
    var nrm = function (s) { return String(s || '').toLowerCase().replace(/[ʻʼ‘’`´']/g, '').replace(/\s+/g, ' ').trim(); };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var item = function (r) {
      return '<li class="entry"><div class="entry-top"><span class="badge">' + esc(r.ty) + '</span><span class="entry-year">' + esc(r.y) + '</span>' + (r.d ? '<span class="badge soft">DOI</span>' : '') + '</div>'
        + '<h3 class="entry-title" lang="' + esc(r.l) + '"><a href="' + esc(r.u) + '">' + esc(r.t) + '</a></h3><p class="entry-by">' + esc(r.a) + '</p><p class="entry-src">' + esc(r.s) + '</p></li>';
    };
    var render = function () {
      var words = nrm(ginput.value).split(' ').filter(Boolean);
      if (!words.length) { gbox.innerHTML = '<p class="empty">Qidirish uchun so\'z kiriting.</p>'; if (gcount) gcount.textContent = ''; return; }
      if (!DATA) { gbox.innerHTML = '<p class="empty">Yuklanmoqda...</p>'; return; }
      var hits = DATA.filter(function (r) { return words.every(function (w) { return r._k.indexOf(w) >= 0; }); });
      if (gcount) gcount.textContent = hits.length + ' ta natija';
      gbox.innerHTML = hits.length ? '<ul class="entries">' + hits.slice(0, 200).map(item).join('') + '</ul>' + (hits.length > 200 ? '<p class="empty">Dastlabki 200 ta natija ko\'rsatildi. So\'rovni aniqlashtiring.</p>' : '')
        : '<p class="empty">Hech narsa topilmadi. Boshqa so\'z bilan qidirib ko\'ring.</p>';
    };
    var sync = function () {
      var q = ginput.value.trim(), u = new URL(location.href);
      if (q) u.searchParams.set('q', q); else u.searchParams.delete('q');
      history.replaceState(null, '', u);
    };
    fetch('/data/search.json').then(function (r) { return r.json(); }).then(function (d) {
      DATA = d.map(function (r) { r._k = nrm(r.k); return r; }); render();
    }).catch(function () { gbox.innerHTML = '<p class="empty">Qidiruv indeksini yuklab bo\'lmadi. <a href="/archive/">Arxiv</a> orqali ko\'ring.</p>'; });
    gform.addEventListener('submit', function (e) { e.preventDefault(); sync(); render(); });
    ginput.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { sync(); render(); }, 180); });
    var gq = new URLSearchParams(location.search).get('q');
    if (gq) ginput.value = gq;
    render();
  }

  // ---------- Sertifikatni chop etish ----------
  var pr = $('[data-print]');
  if (pr) { pr.hidden = false; pr.addEventListener('click', function () { window.print(); }); }

  // ---------- To'liq matn: uzun bo'lsa qisqartirib ko'rsatish (matn HTML da to'liq turadi) ----------
  var ft = $('[data-fulltext]');
  if (ft && !ft.hidden) {
    var ftBody = $('[data-fulltext-body]', ft), ftBtn = $('[data-ft-more]', ft);
    if (ftBody && ftBtn && ftBody.scrollHeight > 900) {
      ftBody.classList.add('clip'); ftBtn.hidden = false;
      ftBtn.addEventListener('click', function () {
        var open = ftBody.classList.toggle('clip');
        ftBtn.textContent = open ? 'Matnni to\'liq ko\'rsatish' : 'Qisqartirish';
        if (open) ft.scrollIntoView({ block: 'start' });
      });
    }
  }

  var fmtN = function (n) { return Number(n || 0).toLocaleString('uz-UZ'); };
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  // ---------- Muallif sahifasi: jami ko'rishlar va yuklab olishlar ----------
  var au = $('[data-author-stats]');
  if (au) {
    var ids = au.getAttribute('data-author-stats');
    if (ids) fetch('/stats?ids=' + encodeURIComponent(ids)).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.success) return;
      var v = $('[data-au-views]'), dl = $('[data-au-downloads]');
      if (v) v.textContent = fmtN(d.total.views);
      if (dl) dl.textContent = fmtN(d.total.downloads);
    }).catch(function () {});
  }

  // ---------- Bosh sahifa: ko'p o'qilgan maqolalar ----------
  var pop = $('[data-popular]');
  if (pop) {
    Promise.all([fetch('/stats?top=6').then(function (r) { return r.json(); }), fetch('/data/search.json').then(function (r) { return r.json(); })])
      .then(function (res) {
        var top = (res[0] && res[0].items) || [], idx = {};
        (res[1] || []).forEach(function (r) { idx[r.i] = r; });
        var rows = top.filter(function (x) { return idx[x.id]; });
        if (rows.length < 3) return;
        $('[data-popular-list]', pop).innerHTML = rows.map(function (x) {
          var r = idx[x.id];
          return '<li><a href="' + escH(r.u) + '" lang="' + escH(r.l) + '">' + escH(r.t) + '</a><span class="muted">' + escH(r.a) + ' · ' + fmtN(x.views) + ' ko\'rish · ' + fmtN(x.downloads) + ' yuklab olish</span></li>';
        }).join('');
        pop.hidden = false;
      }).catch(function () {});
  }
})();
