/* PDF ni sahifaning o'zida ko'rsatish (pdf.js, saytning o'zidan yuklanadi).
   Brauzerning ichki PDF oynasiga (iframe) bog'liq emas, shuning uchun "Этот контент заблокирован"
   xatosi chiqmaydi va telefonlarda ham ishlaydi. */
(function () {
  'use strict';
  var sec = document.querySelector('[data-viewer]');
  if (!sec) return;
  var src = sec.getAttribute('data-src');
  var body = sec.querySelector('[data-body]'), tools = sec.querySelector('[data-tools]');
  var info = sec.querySelector('[data-pageinfo]'), zoomEl = sec.querySelector('[data-zoom]');
  var LIB = '/js/vendor/pdf.min.js', WORKER = '/js/vendor/pdf.worker.min.js';
  var doc = null, pages = [], zoom = 1, fitWidth = 0, started = false, current = 1, observer = null, renderObs = null;

  function loadScript(url) {
    return new Promise(function (ok, fail) {
      if (window.pdfjsLib) return ok(window.pdfjsLib);
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = function () { window.pdfjsLib ? ok(window.pdfjsLib) : fail(new Error('pdf.js')); };
      s.onerror = function () { fail(new Error('pdf.js yuklanmadi')); };
      document.head.appendChild(s);
    });
  }

  function fail(err) {
    if (window.console) console.error(err);
    body.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'viewer-ph';
    box.innerHTML = '<p>PDF ni sahifada ko\'rsatib bo\'lmadi.</p>';
    var a = document.createElement('a');
    a.className = 'btn'; a.href = src; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'PDF ni yangi oynada ochish';
    box.appendChild(a); body.appendChild(box);
    tools.hidden = true;
  }

  function availWidth() { return Math.max(240, body.clientWidth - 34); }

  function setInfo() {
    info.textContent = current + ' / ' + pages.length;
    zoomEl.textContent = Math.round(zoom * 100) + '%';
    sec.querySelector('[data-act="prev"]').disabled = current <= 1;
    sec.querySelector('[data-act="next"]').disabled = current >= pages.length;
  }

  function layout() {
    pages.forEach(function (p) {
      var scale = (fitWidth / p.base.width) * zoom;
      var vp = p.page.getViewport({ scale: scale });
      p.vp = vp; p.scale = scale; p.done = false;
      p.canvas.style.width = Math.floor(vp.width) + 'px';
      p.canvas.style.height = Math.floor(vp.height) + 'px';
    });
    pages.forEach(function (p) { if (p.visible) draw(p); });
    setInfo();
  }

  function draw(p) {
    if (p.done || p.busy) return;
    p.busy = true;
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var vp = p.page.getViewport({ scale: p.scale * dpr });
    var c = p.canvas;
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
    var task = p.page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp });
    task.promise.then(function () { p.done = true; p.busy = false; if (p.dirty) { p.dirty = false; p.done = false; draw(p); } },
      function () { p.busy = false; });
  }

  function start() {
    if (started) return;
    started = true;
    body.innerHTML = '<div class="viewer-ph"><div class="spin" aria-hidden="true"></div><p>PDF yuklanmoqda...</p></div>';
    loadScript(LIB).then(function (lib) {
      lib.GlobalWorkerOptions.workerSrc = WORKER;
      return lib.getDocument({ url: src, isEvalSupported: false, disableFontFace: false }).promise;
    }).then(function (d) {
      doc = d;
      var n = Math.min(d.numPages, 200), chain = Promise.resolve();
      for (var i = 1; i <= n; i++) (function (i) {
        chain = chain.then(function () { return d.getPage(i); }).then(function (page) {
          var c = document.createElement('canvas');
          c.setAttribute('role', 'img');
          c.setAttribute('aria-label', 'Sahifa ' + i);
          c.dataset.page = i;
          pages.push({ n: i, page: page, base: page.getViewport({ scale: 1 }), canvas: c });
        });
      })(i);
      return chain;
    }).then(function () {
      body.innerHTML = '';
      pages.forEach(function (p) { body.appendChild(p.canvas); });
      fitWidth = Math.min(availWidth(), 900);
      tools.hidden = false;
      layout();
      renderObs = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          var p = pages[+e.target.dataset.page - 1];
          p.visible = e.isIntersecting;
          if (e.isIntersecting) draw(p);
        });
      }, { root: body, rootMargin: '600px 0px' });
      observer = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio > 0.35) { current = +e.target.dataset.page; setInfo(); } });
      }, { root: body, threshold: [0.35, 0.6] });
      pages.forEach(function (p) { renderObs.observe(p.canvas); observer.observe(p.canvas); });
    }).catch(fail);
  }

  function go(n) {
    n = Math.max(1, Math.min(pages.length, n));
    var c = pages[n - 1] && pages[n - 1].canvas;
    if (c) body.scrollTo({ top: c.offsetTop - body.offsetTop - 12, behavior: 'smooth' });
    current = n; setInfo();
  }

  function setZoom(z) {
    var keep = current;
    zoom = Math.max(0.5, Math.min(3, Math.round(z * 100) / 100));
    pages.forEach(function (p) { if (p.busy) p.dirty = true; });
    layout();
    var c = pages[keep - 1] && pages[keep - 1].canvas;
    if (c) body.scrollTop = c.offsetTop - body.offsetTop - 12;
  }

  function toggleFull() {
    var on = !sec.classList.contains('full');
    sec.classList.toggle('full', on);
    document.documentElement.style.overflow = on ? 'hidden' : '';
    sec.querySelector('[data-act="full"]').textContent = on ? 'Yopish' : "To'liq ekran";
    if (pages.length) { fitWidth = Math.min(availWidth(), on ? 1200 : 900); layout(); }
  }

  sec.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'load') start();
    else if (act === 'prev') go(current - 1);
    else if (act === 'next') go(current + 1);
    else if (act === 'in') setZoom(zoom + 0.15);
    else if (act === 'out') setZoom(zoom - 0.15);
    else if (act === 'fit') { fitWidth = Math.min(availWidth(), sec.classList.contains('full') ? 1200 : 900); setZoom(1); }
    else if (act === 'full') toggleFull();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sec.classList.contains('full')) toggleFull(); });

  var rt = null;
  window.addEventListener('resize', function () {
    if (!pages.length) return;
    clearTimeout(rt);
    rt = setTimeout(function () {
      var w = Math.min(availWidth(), sec.classList.contains('full') ? 1200 : 900);
      if (Math.abs(w - fitWidth) > 20) { fitWidth = w; layout(); }
    }, 200);
  });

  // Bo'lim ekranga yaqinlashganda avtomatik ochiladi (trafikni tejash uchun oldindan emas)
  if ('IntersectionObserver' in window) {
    var auto = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { auto.disconnect(); start(); }
    }, { rootMargin: '200px 0px' });
    auto.observe(sec);
  }
})();
