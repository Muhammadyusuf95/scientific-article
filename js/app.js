const q=document.getElementById('q'),l=document.getElementById('list');
if(q&&l){const i=document.createElement('input');i.type='search';i.placeholder="Sarlavha, muallif yoki kalit so'z bo'yicha qidirish";i.setAttribute('aria-label','Maqolalarni qidirish');q.appendChild(i);
const rows=[...l.querySelectorAll('li')],ys=[...l.querySelectorAll('.yr')];
i.addEventListener('input',()=>{const v=i.value.trim().toLowerCase();rows.forEach(r=>r.hidden=!!v&&!r.dataset.s.includes(v));ys.forEach(y=>y.hidden=!y.querySelector('li:not([hidden])'))})}
