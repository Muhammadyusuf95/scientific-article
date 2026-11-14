const q=document.getElementById('q'),l=document.getElementById('list');
if(q&&l){
  const i=document.createElement('input');
  i.type='search';
  i.placeholder="Sarlavha, muallif yoki kalit so'z bo'yicha qidirish";
  i.setAttribute('aria-label','Maqolalarni qidirish');
  q.appendChild(i);
  const rows=[...l.querySelectorAll('li')],ys=[...l.querySelectorAll('.yr')];
  i.addEventListener('input',()=>{
    const v=i.value.trim().toLowerCase();
    rows.forEach(r=>r.hidden=!!v&&!r.dataset.s.includes(v));
    ys.forEach(y=>y.hidden=!y.querySelector('li:not([hidden])'));
  });
}

const citeSel=document.getElementById('citeStyle'),citeOut=document.getElementById('citeOut');
if(citeSel&&citeOut){
  citeSel.addEventListener('change',()=>{
    const tpl=document.querySelector(`template[data-cite="${citeSel.value}"]`);
    if(tpl)citeOut.textContent=tpl.innerHTML.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  });
}
