/* Muallif paneli: har bir muallif uchun Familiya / Ism / Otasining ismi alohida maydonlarda.
 *
 * Eski usul ishlashda qoladi: ostidagi "Mualliflar" matn maydoni (#authors) avtomatik
 * "Familiya, Ism Otasining ismi; ..." ko'rinishida to'ldiriladi, shuning uchun admin.js dagi
 * barcha tekshiruvlar (PDF tekshiruvi, ogohlantirishlar, saqlash) avvalgidek ishlaydi.
 * Matn maydoniga qo'lda yozilsa, qatorlar undan qayta quriladi.
 *
 * Serverga qo'shimcha yashirin maydon `author_names` (JSON) yuboriladi:
 *   [{ "family": "Ikromov", "given": "Maxamadyusub", "patronymic": "Tursunali o'g'li" }, ...]
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX = 30;

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/[;\n]+/g, ' ').trim();

  // Bitta muallif uchun yagona yozuv: "Familiya, Ism Otasining ismi"
  function compose(p) {
    const family = clean(p.family), rest = [clean(p.given), clean(p.patronymic)].filter(Boolean).join(' ');
    return rest ? `${family}, ${rest}` : family;
  }

  // Matndan qatorga: "Familiya, Ism Otasi" yoki "Familiya Ism Otasi" (vergulsiz: birinchi so'z familiya)
  function parse(text) {
    const s = clean(text);
    if (!s) return { family: '', given: '', patronymic: '' };
    let family = s, rest = '';
    const k = s.indexOf(',');
    if (k >= 0) { family = s.slice(0, k).trim(); rest = s.slice(k + 1).trim(); }
    else { const sp = s.indexOf(' '); if (sp > 0) { family = s.slice(0, sp); rest = s.slice(sp + 1).trim(); } }
    const toks = rest.split(' ').filter(Boolean);
    return { family, given: toks[0] || '', patronymic: toks.slice(1).join(' ') };
  }

  let box, hidden, textarea, writing = false;

  function rows() { return [...box.querySelectorAll('.ap-row')]; }

  function readRows() {
    return rows().map((r) => ({
      family: clean(r.querySelector('[data-f="family"]').value),
      given: clean(r.querySelector('[data-f="given"]').value),
      patronymic: clean(r.querySelector('[data-f="patronymic"]').value),
    }));
  }

  // Qatorlardan matn maydoni va yashirin JSON ni yangilash
  function push() {
    const list = readRows().filter((p) => p.family || p.given || p.patronymic);
    hidden.value = list.length ? JSON.stringify(list) : '';
    renumber();
    // writing bayrog'i qatorlarning o'zi qayta qurilib, kursor yo'qolishining oldini oladi
    writing = true;
    textarea.value = list.map(compose).filter(Boolean).join('; ');
    // Eski kod (qatorlar soniga qarab "Mualliflar haqida" balandligi va h.k.) ishlashi uchun
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    writing = false;
  }

  function renumber() {
    const rs = rows();
    rs.forEach((r, i) => {
      r.querySelector('.ap-no').textContent = String(i + 1);
      r.querySelector('.ap-up').disabled = i === 0;
      r.querySelector('.ap-down').disabled = i === rs.length - 1;
      r.querySelector('.ap-del').disabled = rs.length === 1;
    });
    $('ap_add').disabled = rs.length >= MAX;
  }

  function field(key, label, ph, req) {
    return `<label class="ap-f"><span class="ap-l${req ? ' req' : ''}">${label}</span><input type="text" data-f="${key}" maxlength="60" autocomplete="off" placeholder="${ph}"></label>`;
  }

  function addRow(p, focus) {
    p = p || {};
    const r = document.createElement('div');
    r.className = 'ap-row';
    r.innerHTML = `<span class="ap-no" aria-hidden="true"></span>`
      + field('family', 'Familiya', 'Ikromov', true) + field('given', 'Ism', 'Maxamadyusub', true) + field('patronymic', 'Otasining ismi', "Tursunali o'g'li", false)
      + `<span class="ap-btns"><button type="button" class="ap-up" title="Yuqoriga" aria-label="Yuqoriga">↑</button><button type="button" class="ap-down" title="Pastga" aria-label="Pastga">↓</button><button type="button" class="ap-del" title="O'chirish" aria-label="Muallifni o'chirish">×</button></span>`;
    r.querySelector('[data-f="family"]').value = p.family || '';
    r.querySelector('[data-f="given"]').value = p.given || '';
    r.querySelector('[data-f="patronymic"]').value = p.patronymic || '';
    box.appendChild(r);
    if (focus) r.querySelector('[data-f="family"]').focus();
    return r;
  }

  function setRows(list) {
    box.innerHTML = '';
    (list && list.length ? list : [{}]).slice(0, MAX).forEach((p) => addRow(p));
    renumber();
    hidden.value = list && list.length ? JSON.stringify(list) : '';
  }

  // Matn maydonidan (qo'lda yozilgan yoki eski yozuv) qatorlarni qayta qurish
  function fromTextarea() {
    const list = textarea.value.split(/[;\n]+/).map(parse).filter((p) => p.family);
    setRows(list);
  }

  // Tahrirlash rejimi: maqolada author_names bo'lsa shuni, bo'lmasa eski "Familiya, Ism" matnini ishlatadi
  function load(article) {
    const names = article && Array.isArray(article.author_names) ? article.author_names : null;
    if (names && names.length) {
      setRows(names.map((n) => ({ family: n.family || '', given: n.given || '', patronymic: n.patronymic || '' })));
      writing = true; textarea.value = names.map(compose).join('; '); writing = false;
    } else {
      setRows((article && article.authors || []).map(parse));
    }
  }

  function init() {
    box = $('ap_rows'); hidden = $('author_names'); textarea = $('authors');
    if (!box || !hidden || !textarea) return;

    box.addEventListener('input', (e) => { if (e.target.matches('input')) push(); });
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const r = b.closest('.ap-row');
      if (b.classList.contains('ap-del') && rows().length > 1) r.remove();
      else if (b.classList.contains('ap-up') && r.previousElementSibling) r.parentNode.insertBefore(r, r.previousElementSibling);
      else if (b.classList.contains('ap-down') && r.nextElementSibling) r.parentNode.insertBefore(r.nextElementSibling, r);
      push();
    });
    // Enter: keyingi maydonga o'tadi (formani yubormaydi); oxirgi maydonda Enter yangi muallif qo'shadi
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('input')) return;
      e.preventDefault();
      const inputs = [...box.querySelectorAll('input')], i = inputs.indexOf(e.target);
      if (i < inputs.length - 1) inputs[i + 1].focus();
      else if (rows().length < MAX) { addRow({}, true); push(); }
    });
    $('ap_add').addEventListener('click', () => { addRow({}, true); push(); });

    // Eski matn maydoni: qo'lda o'zgartirilsa qatorlar qayta quriladi
    textarea.addEventListener('input', () => { if (!writing) fromTextarea(); });
    // Forma tozalanganda (yangi maqola) panel ham tozalanadi
    $('form').addEventListener('reset', () => setTimeout(() => setRows([]), 0));

    setRows([]);
  }

  window.AuthorPanel = { load, compose, parse };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
