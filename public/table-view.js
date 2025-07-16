// public/table-view.js – filters & lazy-paging for parent/child rows
// ---------------------------------------------------------------
(() => {
  document.addEventListener('DOMContentLoaded', () => {

    /* ─ constants ─ */
    const PAGE_SIZE = 50;
    const parents   = [...document.querySelectorAll('tr.parent')];
    const S         = id => document.getElementById(id);
    const ops       = { '>=':(a,b)=>a>=b, '<=':(a,b)=>a<=b };
    const updateDial = d => {
      d.classList.toggle('true', d.value === '1');
      d.classList.toggle('false', d.value === '-1');
      d.classList.toggle('any', d.value === '0');
    };
    const cycleDial = d => {
      const v = parseInt(d.value, 10);
      d.value = v === 0 ? 1 : (v === 1 ? -1 : 0);
    };

    ['lg','mc','p1'].forEach(id=>{
      const el = S(id); if(!el) return;
      updateDial(el);
      el.addEventListener('input', ()=>updateDial(el));
      el.addEventListener('mousedown', e=>{
        e.preventDefault();
        cycleDial(el);
        el.dispatchEvent(new Event('input'));
      });
    });

    /* ─ build search index from Query column only ─ */
    parents.forEach(p=>{
      const first = p.querySelector('td');
      p.dataset.query = (first ? first.textContent : '').toLowerCase();
    });

    /* ─ helpers ─ */
    const toggle = (par, show) => {
      par.classList.toggle('hide', !show);
      document.querySelectorAll(`tr.child[data-parent="${par.dataset.rowid}"]`)
              .forEach(c => c.classList.toggle('hide', !show));
    };

    /* ─ pagination state ─ */
    let visible = parents.map((_,i)=>i);
    let loaded  = 0;

    const showNext = () => {
      const end = Math.min(loaded + PAGE_SIZE, visible.length);
      visible.slice(loaded, end).forEach(i=>toggle(parents[i], true));
      loaded = end;
    };

    /* ─ main filter routine ─ */
    const apply = () => {
      const term = S('q').value.toLowerCase().trim();

      const ctrlRaw = S('ctrl').value.trim();
      const expRaw  = S('exp').value.trim();
      const dRaw  = S('d').value.trim();
      const ctrlVal = ctrlRaw === '' ? null : parseFloat(ctrlRaw);
      const expVal  = expRaw  === '' ? null : parseFloat(expRaw);
      const dVal  = dRaw  === '' ? null : parseFloat(dRaw);

      const lgVal = parseInt(S('lg').value,10);
      const mcVal = parseInt(S('mc').value,10);
      const p1Val = parseInt(S('p1').value,10);

      const ctrlF = ops[S('ctrlOp').value];
      const expF  = ops[S('expOp').value];
      const dF  = ops[S('dOp').value];

      visible = [];
      parents.forEach((p,i)=>{
        toggle(p,false);                      // hide everything first

        const textOK = (term === '') || p.dataset.query.includes(term);
        const bkOK   = (ctrlVal===null) || ctrlF(parseFloat(p.dataset.ctrl), ctrlVal);
        const duOK   = (expVal===null) || expF(parseFloat(p.dataset.exp), expVal);
        const dOK    = (dVal ===null) || dF (parseFloat(p.dataset.d ), dVal);
        const lgOK   = lgVal===0 ? true : (lgVal===1 ? p.dataset.lg==='true' : p.dataset.lg==='false');
        const mcOK   = mcVal===0 ? true : (mcVal===1 ? p.dataset.mc==='true' : p.dataset.mc==='false');
        const p1OK   = p1Val===0 ? true : (p1Val===1 ? p.dataset.p1==='true' : p.dataset.p1==='false');

        if (textOK && bkOK && duOK && dOK && lgOK && mcOK && p1OK) visible.push(i);
      });

      loaded = 0;
      showNext();
    };

    /* ─ wiring ─ */
    ['q','ctrl','exp','d','ctrlOp','expOp','dOp','lg','mc','p1'].forEach(id=>
      S(id).addEventListener('input',apply)
    );
    S('q').addEventListener('keydown',e=>{
      if (e.key==='Enter'){ e.preventDefault(); apply(); }
    });
    S('clear').addEventListener('click',e=>{
      e.preventDefault();
      ['q','ctrl','exp','d'].forEach(id=>S(id).value='');
      ['ctrlOp','expOp','dOp'].forEach(id=>S(id).value='>=');
      ['lg','mc','p1'].forEach(id=>{
        const el = S(id);
        el.value = 0;
        el.dispatchEvent(new Event('input'));
      });
      apply();
    });
    window.addEventListener('scroll',()=>{
      if (window.innerHeight+window.scrollY>=document.body.offsetHeight-200){
        if (loaded < visible.length) showNext();
      }
    });

    /* ─ initialise ─ */
    apply();        // sets visible[] and shows first PAGE_SIZE rows
  });
})();
