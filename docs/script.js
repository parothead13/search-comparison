// docs/script.js — static CSV viewer (aligned with table-view.js)
// --------------------------------------------------------------
(() => {
  const PAGE_SIZE = 50;
  let DATA = [];
  let CTRL = 'BK';
  let EXP  = 'DU';

  /* ─ helpers ─ */
  const esc = s => (s||'').replace(/&/g,'&amp;')
                          .replace(/</g,'&lt;')
                          .replace(/>/g,'&gt;');
  const pct = n => `${(+n).toFixed(2)}%`;
  const asPct = raw=>{
    let n = parseFloat(String(raw || '').replace('%', ''));
    if (!isFinite(n)) return 0;
    if (n > 1) return n;    // already expressed as a percentage
    return n * 100;          // convert fraction to percent
  };
  const delta = (du,bk)=>{
    const d = du - bk; if (!isFinite(d)||d===0) return '0';
    return `<span class="${d>0?'pos':'neg'}">${d>0?'▲':'▼'}${Math.abs(d).toFixed(2)}%</span>`;
  };
  const joinText = o => [o?.title?.replace('NA',''),
                         o?.type && !o.type.includes('NA') ? `(${o.type})` : '']
                        .filter(Boolean).join(' ');
  const cellHtml = o => {
    const txt  = esc(joinText(o));
    const img  = (o.img && !o.img.includes('NA'))
                 ? `<img src="${esc(o.img)}" class=result-img>`
                 : '';
    const open = o.url ? `<a href="${esc(o.url)}" target="_blank">` : '';
    const close= o.url ? '</a>' : '';
    return `${open}${img}${txt}${close}`;
  };

  /* ─ CSV parsing helpers (unchanged) ─ */
  const parseCSV = text => {
    const lines   = text.trim().split(/\r?\n/); if (!lines.length) return {headers:[],rows:[]};
    const headers = lines.shift().split(',').map(h=>h.trim());
    const rows = lines.filter(Boolean).map(line=>{
      const cells = line.split(',');
      const obj   = {};
      headers.forEach((h,i)=>{ obj[h] = (cells[i]||'').trim(); });
      return obj;
    });
    return {headers, rows};
  };

  const bool = v => String(v).toLowerCase()==='true';
  const detectPrefixes = headers => {
    const ctrCols = headers.filter(h=>h.startsWith('CTR_'));
    if (ctrCols.length >= 2){
      return ctrCols.map(h=>h.slice(4));
    }
    const seen = new Set();
    headers.forEach(h=>{
      const m = h.match(/^([^_]+)_set1_/);
      if(m && !seen.has(m[1])) seen.add(m[1]);
    });
    return [...seen];
  };
  const toRecords = (rows,ctrl,exp) => rows.map(r=>{
    const key    = r.search_string||r.id||r.query||'(blank)';
    const clicks = +r.total_clicks||0;
    const rec = {
      key,
      clicks,
      ctrCtrl: asPct(r[`CTR_${ctrl}`]),
      ctrExp : asPct(r[`CTR_${exp}`]),
      largeGap: bool(r.large_gap),
      meaningfulChange: bool(r.meaningful_change),
      set1P1Change: bool(r.set1_p1_change),
      titlesCtrl:{set1:r[`${ctrl}_set1_title`]||'', set2:r[`${ctrl}_set2_title`]||''},
      titlesExp :{set1:r[`${exp}_set1_title`]||'', set2:r[`${exp}_set2_title`]||''},
      resCtrl:{set1:[],set2:[]}, resExp:{set1:[],set2:[]} };
    ['set1','set2'].forEach(set=>{
      for (let i=1;i<=3;i++){
        rec.resCtrl[set].push({
          title:r[`${ctrl}_${set}_result${i}_title`]||'',
          type :r[`${ctrl}_${set}_result${i}_type`] ||'',
          img  :r[`${ctrl}_${set}_result${i}_img`]  ||'',
          url  :r[`${ctrl}_${set}_result${i}_id_hyperlink`] || r[`${ctrl}_${set}_result${i}_hyperlink`] || ''
        });
        rec.resExp[set].push({
          title:r[`${exp}_${set}_result${i}_title`]||'',
          type :r[`${exp}_${set}_result${i}_type`] ||'',
          img  :r[`${exp}_${set}_result${i}_img`]  ||'',
          url  :r[`${exp}_${set}_result${i}_id_hyperlink`] || r[`${exp}_${set}_result${i}_hyperlink`] || ''
        });
      }
    });
    return rec;
  }).sort((a,b)=>b.clicks-a.clicks);

  /* ---- mini-table ---- */
  const setTbl = (k,r)=>{
    const [tC,tE] = [r.titlesCtrl[k], r.titlesExp[k]].map(esc);
    const hdrC = tC===tE ? tC : `<span class="control">${tC}</span>`;
    const hdrE = tC===tE ? tE : `<span class="experiment">${tE}</span>`;
    const rows  = [0,1,2].map(i=>{
      const cObj = r.resCtrl[k][i];
      const eObj = r.resExp[k][i];
      const cTxt = joinText(cObj);
      const eTxt = joinText(eObj);
      const same  = cTxt.trim()===eTxt.trim();
      const cHtml = cellHtml(cObj);
      const eHtml = cellHtml(eObj);
      return `<tr><td>${same?cHtml:`<span class="control">${cHtml}</span>`}</td>`+
             `<td>${same?eHtml:`<span class="experiment">${eHtml}</span>`}</td></tr>`;
    }).join('');
    return `<table class=set>
              <thead>
                <tr><th colspan=2>${k.toUpperCase()}</th></tr>
                <tr><th>${CTRL}: ${hdrC||'-'}</th><th>${EXP}: ${hdrE||'-'}</th></tr>
              </thead><tbody>${rows}</tbody></table>`;
  };

  /* ---- render full table ---- */
  const render = data => {
    const tbody = document.querySelector('#tbl tbody');
    tbody.innerHTML = data.map((r,i)=>`
      <tr class="hide" data-i="${i}"
          data-ctrl="${r.ctrCtrl}" data-exp="${r.ctrExp}"
          data-d="${(r.ctrExp-r.ctrCtrl).toFixed(2)}"
          data-lg="${r.largeGap}" data-mc="${r.meaningfulChange}"
          data-p1="${r.set1P1Change}">
        <td>${esc(r.key)}</td>
        <td class=ctr>total clicks: ${r.clicks.toLocaleString()}<br>
                       ${CTRL} ${pct(r.ctrCtrl)}<br>${EXP} ${pct(r.ctrExp)}<br>
                       ${delta(r.ctrExp,r.ctrCtrl)}</td>
        <td>${setTbl('set1',r)}${setTbl('set2',r)}</td>
      </tr>`).join('');
    setupFilters();
  };

  /* ---- filters & lazy-paging (mirrors table-view.js) ---- */
  function setupFilters(){
    const rows = [...document.querySelectorAll('#tbl tbody > tr')];
    const S    = id => document.getElementById(id);
    const ops  = { '>=':(a,b)=>a>=b, '<=':(a,b)=>a<=b };
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

    /* search index = Query column ONLY */
    rows.forEach(r=>{
      const first = r.querySelector('td');
      r.dataset.query = (first ? first.textContent : '').toLowerCase();
    });

    let visible = rows.map((_,i)=>i);
    let loaded  = 0;
    const showNext = ()=>{
      const end = Math.min(loaded + PAGE_SIZE, visible.length);
      visible.slice(loaded,end).forEach(i=>rows[i].classList.remove('hide'));
      loaded = end;
    };

    const apply = ()=>{
      const prevLoaded = loaded;
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
      rows.forEach((r,i)=>{
        r.classList.add('hide');      // start hidden each time

        const textOK = term==='' || r.dataset.query.includes(term);
        const bkOK   = ctrlVal===null || ctrlF(parseFloat(r.dataset.ctrl), ctrlVal);
        const duOK   = expVal===null || expF(parseFloat(r.dataset.exp), expVal);
        const dOK    = dVal ===null || dF (parseFloat(r.dataset.d ), dVal);
        const lgOK   = lgVal===0 ? true : (lgVal===1 ? r.dataset.lg==='true' : r.dataset.lg==='false');
        const mcOK   = mcVal===0 ? true : (mcVal===1 ? r.dataset.mc==='true' : r.dataset.mc==='false');
        const p1OK   = p1Val===0 ? true : (p1Val===1 ? r.dataset.p1==='true' : r.dataset.p1==='false');

        if (textOK && bkOK && duOK && dOK && lgOK && mcOK && p1OK) visible.push(i);
      });

      loaded = 0;
      showNext();
    };

    /* wiring */
    ['q','ctrl','exp','d','ctrlOp','expOp','dOp','lg','mc','p1'].forEach(id=>
      S(id).addEventListener('input', apply)
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
    });
    window.addEventListener('scroll',()=>{
      if (window.innerHeight+window.scrollY>=document.body.offsetHeight-200){
        if (loaded < visible.length) showNext();
      }
    });

    /* initialise */
    apply();            // sets visible[] and shows first PAGE_SIZE rows
  }

  /* ---- CSV upload hook ---- */
  function updateLabels(){
    const ids = ['ctrlName','ctrlNameFilter','expName','expNameFilter'];
    ids.forEach(id=>{ const el=document.getElementById(id); if(el){
      if(id.includes('ctrl')) el.textContent = CTRL; else el.textContent = EXP;
    }});
  }

  document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csv');
    if (!fileInput) return;
    fileInput.addEventListener('change', e=>{
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        const {headers, rows} = parseCSV(reader.result);
        [CTRL,EXP] = detectPrefixes(headers);
        updateLabels();
        DATA = toRecords(rows, CTRL, EXP);
        render(DATA);
      };
      reader.readAsText(file);
    });
  });
})();
