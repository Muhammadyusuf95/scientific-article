<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Maqola yuklash paneli</title>
<style>
:root{--bg:#f3f5f9;--card:#fff;--text:#17202e;--muted:#5d6b82;--line:#d9dfea;--brand:#1a56db;--brand-d:#1445b0;--ok:#0e7a43;--err:#b42318;--field:#fff;--warn:#8a5a00;--warnbg:#fff6df}
@media (prefers-color-scheme:dark){:root{--bg:#0e1420;--card:#161e2e;--text:#e8edf6;--muted:#98a6bf;--line:#2a3650;--brand:#5b8def;--brand-d:#7aa3f5;--ok:#46c37f;--err:#ff7b72;--field:#0f1726;--warn:#f0c36a;--warnbg:#2a2412}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 64px}
header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}
h1{font-size:1.5rem;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;margin-bottom:18px}
.grid{display:grid;gap:14px;grid-template-columns:1fr 1fr}
.full{grid-column:1/-1}
@media (max-width:640px){.grid{grid-template-columns:1fr}}
label{display:block;font-weight:600;font-size:.92rem;margin-bottom:5px}
.opt{font-weight:400;color:var(--muted)}
.req::after{content:" *";color:var(--err)}
.hint{display:block;font-weight:400;color:var(--muted);font-size:.82rem;margin-top:4px}
input,textarea,select{width:100%;padding:10px 12px;font:inherit;color:var(--text);background:var(--field);border:1px solid var(--line);border-radius:9px}
textarea{resize:vertical;min-height:110px}
input:focus,textarea:focus,select:focus,button:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
input:user-invalid,textarea:user-invalid{border-color:var(--err)}
button{font:inherit;cursor:pointer}
button.go{width:100%;padding:13px;font-weight:600;color:#fff;background:var(--brand);border:0;border-radius:10px;margin-top:18px}
button.go:hover{background:var(--brand-d)}
button:disabled{opacity:.6;cursor:not-allowed}
.link{background:none;border:0;color:var(--brand);font-size:.95rem;padding:4px}
.bar{height:8px;background:var(--line);border-radius:99px;overflow:hidden;margin-top:14px;display:none}
.bar i{display:block;height:100%;width:0;background:var(--brand);transition:width .15s}
.msg{margin-top:14px;font-weight:600;min-height:1.4em}
.msg.ok{color:var(--ok)}.msg.err{color:var(--err)}.msg.info{color:var(--brand)}
.note{background:var(--warnbg);color:var(--warn);border-radius:10px;padding:10px 14px;font-size:.9rem;margin-bottom:14px}
[hidden]{display:none!important}
@media (prefers-reduced-motion:reduce){.bar i{transition:none}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Maqola yuklash paneli</h1>
    <button class="link" id="logout" type="button" hidden>Chiqish</button>
  </header>

  <!-- Kirish -->
  <section class="card" id="loginCard">
    <form id="loginForm" autocomplete="off">
      <label for="token" class="req">Admin kaliti</label>
      <input type="password" id="token" required autocomplete="current-password">
      <span class="hint">Kalit faqat shu brauzer oynasida saqlanadi va oynani yopganingizda oʻchadi.</span>
      <button class="go" type="submit">Kirish</button>
    </form>
  </section>

  <!-- Yuklash -->
  <form id="uploadForm" class="card" hidden novalidate>
    <div class="grid">
      <div class="full">
        <label for="id" class="req">ID</label>
        <input type="text" id="id" placeholder="maqola-2026-1" maxlength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" required>
        <span class="hint">Faqat kichik lotin harflari, raqamlar va chiziqcha. Bir xil ID eski yozuvni almashtirishi mumkin.</span>
      </div>
      <div>
        <label for="item_type" class="req">Turi</label>
        <select id="item_type" required>
          <option value="jurnal">Jurnal maqolasi</option>
          <option value="konferensiya">Konferensiya materiali</option>
        </select>
      </div>
      <div>
        <label for="year" class="req">Nashr yili</label>
        <input type="number" id="year" min="1950" max="2100" required>
      </div>
      <div class="full">
        <label for="title" class="req">Sarlavha (oʻzbek tilida)</label>
        <input type="text" id="title" maxlength="300" required>
      </div>
      <div class="full">
        <label for="authors" class="req">Mualliflar</label>
        <input type="text" id="authors" placeholder="Aliyev V., Valiyev S." required>
        <span class="hint">Vergul bilan ajrating.</span>
      </div>
      <div class="full">
        <label for="journal" class="req">Jurnal yoki konferensiya nomi</label>
        <input type="text" id="journal" maxlength="300" required>
      </div>
      <div>
        <label for="vol_issue">Tom / son <span class="opt">(ixtiyoriy)</span></label>
        <input type="text" id="vol_issue" placeholder="Tom 1, Son 2" maxlength="60">
      </div>
      <div>
        <label for="pages" class="req">Betlar</label>
        <input type="text" id="pages" placeholder="10-15" maxlength="30" required>
      </div>
      <div class="full">
        <label for="abstract" class="req">Annotatsiya</label>
        <textarea id="abstract" rows="5" required></textarea>
      </div>
      <div class="full">
        <label for="pdfFile" class="req">PDF fayl</label>
        <input type="file" id="pdfFile" accept="application/pdf,.pdf" required>
        <span class="hint" id="fileInfo">Eng koʻpi bilan 4 MB.</span>
      </div>
    </div>

    <button class="go" type="submit" id="submitBtn">Maqolani yuklash</button>
    <div class="bar" id="bar"><i id="barFill"></i></div>
    <p class="msg" id="status" role="status" aria-live="polite"></p>
  </form>
</div>

<script>
(function () {
  var ENDPOINT = '/.netlify/functions/upload';
  var MAX_BYTES = 4 * 1024 * 1024;       // Netlify cheklovi sababli ~4 MB
  var TIMEOUT_MS = 120000;
  var KEY = 'adminToken';

  var $ = function (id) { return document.getElementById(id); };
  var loginCard = $('loginCard'), loginForm = $('loginForm'), form = $('uploadForm');
  var logoutBtn = $('logout'), statusEl = $('status'), btn = $('submitBtn');
  var bar = $('bar'), fill = $('barFill');

  function getToken() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch (e) {} }

  function say(text, kind) { statusEl.textContent = text; statusEl.className = 'msg ' + (kind || ''); }
  function showApp(on) {
    loginCard.hidden = on; form.hidden = !on; logoutBtn.hidden = !on;
    if (on) $('id').focus(); else $('token').focus();
  }

  $('year').value = new Date().getFullYear();
  showApp(!!getToken());

  loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = $('token').value.trim();
    if (!t) return;
    setToken(t); $('token').value = ''; say('', ''); showApp(true);
  });

  logoutBtn.addEventListener('click', function () { setToken(''); showApp(false); });

  $('pdfFile').addEventListener('change', function () {
    var f = this.files[0], info = $('fileInfo');
    if (!f) { info.textContent = 'Eng koʻpi bilan 4 MB.'; return; }
    info.textContent = f.name + ' — ' + (f.size / 1048576).toFixed(2) + ' MB';
  });

  function readAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('Faylni oʻqib boʻlmadi.')); };
      r.onload = function () {
        var s = String(r.result), i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);   // "data:...;base64," qismini olib tashlaymiz
      };
      r.readAsDataURL(file);
    });
  }

  function send(payload, token) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT);
      xhr.timeout = TIMEOUT_MS;
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) fill.style.width = Math.round(e.loaded / e.total * 100) + '%';
      };
      xhr.onerror = function () { reject(new Error('Tarmoq xatosi. Ulanishni tekshiring.')); };
      xhr.ontimeout = function () { reject(new Error('Vaqt tugadi. Qayta urinib koʻring.')); };
      xhr.onload = function () {
        var data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) {}
        if (xhr.status === 401 || xhr.status === 403) {
          var err = new Error('Admin kaliti notoʻgʻri.'); err.auth = true; return reject(err);
        }
        if (xhr.status === 413) return reject(new Error('Fayl serverga sigʻmaydi. Kichikroq PDF tanlang.'));
        if (xhr.status < 200 || xhr.status >= 300 || !data.success) {
          return reject(new Error(data.error || 'Server xatosi (' + xhr.status + ').'));
        }
        resolve(data);
      };
      xhr.send(JSON.stringify(payload));
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (btn.disabled) return;

    if (!form.checkValidity()) { form.reportValidity(); return; }

    var file = $('pdfFile').files[0];
    if (!file) { say('PDF fayl tanlang.', 'err'); return; }
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) { say('Faqat PDF fayl yuklash mumkin.', 'err'); return; }
    if (file.size > MAX_BYTES) { say('Fayl 4 MB dan katta (' + (file.size / 1048576).toFixed(1) + ' MB). Hajmini kamaytiring.', 'err'); return; }

    var authors = $('authors').value.split(',').map(function (a) { return a.trim(); }).filter(Boolean);
    if (!authors.length) { say('Kamida bitta muallif kiriting.', 'err'); return; }

    var token = getToken();
    if (!token) { showApp(false); return; }

    var pdfName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
    if (!/\.pdf$/i.test(pdfName)) pdfName += '.pdf';

    var articleData = {
      id: $('id').value.trim(),
      item_type: $('item_type').value,
      title_uz: $('title').value.trim(),
      authors: authors,
      year: parseInt($('year').value, 10),
      journal_name: $('journal').value.trim(),
      vol_issue: $('vol_issue').value.trim(),
      pages: $('pages').value.trim(),
      pdf: pdfName,
      abstract_uz: $('abstract').value.trim()
    };

    btn.disabled = true;
    fill.style.width = '0'; bar.style.display = 'block';
    say('Yuklanmoqda. Iltimos, sahifani yopmang…', 'info');

    readAsBase64(file)
      .then(function (pdfBase64) { return send({ pdfBase64: pdfBase64, pdfName: pdfName, articleData: articleData }, token); })
      .then(function () {
        say('Maqola yuklandi. 1–2 daqiqadan soʻng saytda paydo boʻladi.', 'ok');
        form.reset();
        $('year').value = new Date().getFullYear();
        $('fileInfo').textContent = 'Eng koʻpi bilan 4 MB.';
      })
      .catch(function (err) {
        if (err.auth) { setToken(''); showApp(false); }
        say('Xatolik: ' + err.message, 'err');
      })
      .then(function () { btn.disabled = false; bar.style.display = 'none'; });
  });
})();
</script>
</body>
</html>
