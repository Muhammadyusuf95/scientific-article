/* Iqtibos bloki: uslub tanlash va nusxalash. build.js yaratgan [data-cite] bloki bilan ishlaydi.
   JavaScript o'chiq bo'lsa ham barcha uslublar sahifada matn sifatida ko'rinadi (Google uchun ham). */
(function () {
  'use strict';
  var box = document.querySelector('[data-cite]');
  if (!box) return;
  var sel = box.querySelector('[data-cite-select]'), btn = box.querySelector('[data-cite-copy]');
  var items = [].slice.call(box.querySelectorAll('.cite-item')), KEY = 'citeStyle';
  function show(id) {
    items.forEach(function (e) { e.classList.toggle('on', e.getAttribute('data-style') === id); });
    try { localStorage.setItem(KEY, id); } catch (e) {}
  }
  var saved = ''; try { saved = localStorage.getItem(KEY) || ''; } catch (e) {}
  if (saved && items.some(function (e) { return e.getAttribute('data-style') === saved; })) sel.value = saved;
  box.classList.add('js'); show(sel.value);
  sel.addEventListener('change', function () { show(sel.value); });
  if (btn && navigator.clipboard) {
    btn.hidden = false;
    btn.addEventListener('click', function () {
      var cur = box.querySelector('.cite-item.on .cite-text'); if (!cur) return;
      navigator.clipboard.writeText(cur.textContent.trim()).then(function () {
        var t = btn.textContent; btn.textContent = 'Nusxalandi ✓'; setTimeout(function () { btn.textContent = t; }, 1800);
      });
    });
  }
})();
