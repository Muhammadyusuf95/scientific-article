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
})();
