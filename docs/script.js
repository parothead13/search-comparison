// docs/script.js — static CSV viewer (aligned with table-view.js)
// --------------------------------------------------------------
(() => {
  const PAGE_SIZE = 50;
  let DATA = [];
  let CTRL = 'BK';
  let EXP  = 'DU';
  let QUERY_LENGTH_RANGE = { min: 0, max: 200 };

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

  const generateTagColor = (tag) => {
    // Generate a consistent color for each tag based on its hash
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 85%)`;
  };

  const renderTagIcons = (tags) => {
    if (!tags || tags.length === 0) return '';
    return tags.map(tag => 
      `<span class="tag-icon" data-tag="${esc(tag)}" style="background-color: ${generateTagColor(tag)}" title="Filter by ${esc(tag)}">${esc(tag)}</span>`
    ).join('');
  };

  /* ─ CSV parsing helpers (robust) ─ */
  const parseCSVLine = (line) => {
    const cells = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i += 2;
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        cells.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
    cells.push(current.trim());
    return cells;
  };
  
  const parseCSV = text => {
    const lines   = text.trim().split(/\r?\n/); if (!lines.length) return {headers:[],rows:[]};
    console.log(`CSV Debug (client): Total lines: ${lines.length}`);
    const headers = parseCSVLine(lines.shift());
    console.log(`CSV Debug (client): Headers: ${headers.length} columns`);
    const rawRows = lines.filter(Boolean);
    console.log(`CSV Debug (client): Raw data rows: ${rawRows.length}`);
    const rows = rawRows.map((line, index) => {
      const cells = parseCSVLine(line);
      if (cells.length !== headers.length) {
        console.log(`CSV Debug (client): Row ${index + 1} has ${cells.length} cells, expected ${headers.length}`);
        console.log(`CSV Debug (client): Problem row: ${line.substring(0, 100)}...`);
      }
      const obj   = {};
      headers.forEach((h,i)=>{ obj[h] = (cells[i]||'').trim(); });
      return obj;
    });
    console.log(`CSV Debug (client): Parsed rows: ${rows.length}`);
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
  const toRecords = (rows,ctrl,exp) => {
    console.log(`CSV Debug (client): Converting ${rows.length} rows to records`);
    const records = rows.map(r=>{
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
      tags: r.tags ? r.tags.split(',').map(t => t.trim()).filter(t => t && t !== 'NA') : [],
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
  console.log(`CSV Debug (client): Final processed records: ${records.length}`);
  return records;
  };

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
          data-clicks="${r.clicks}"
          data-tags="${r.tags.join(',')}"
          data-lg="${r.largeGap}" data-mc="${r.meaningfulChange}"
          data-p1="${r.set1P1Change}">
        <td>${esc(r.key)}<br><div class="tag-icons">${renderTagIcons(r.tags)}</div></td>
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

    /* ─ cumulative CTR computation ─ */
    const updateCumulativeCTR = (visibleIndices) => {
      const summary = document.getElementById('ctr-summary');
      if (!summary) return;
      
      // Use setTimeout to make computation async and not block UI
      setTimeout(() => {
        if (visibleIndices.length === 0) {
          summary.innerHTML = 'No queries match current filters';
          return;
        }

        let totalClicks = 0;
        let totalCtrlClicks = 0;
        let totalExpClicks = 0;

        visibleIndices.forEach(i => {
          const r = rows[i];
          const clicks = parseFloat(r.dataset.clicks) || 0;
          const ctrlCTR = parseFloat(r.dataset.ctrl) || 0;
          const expCTR = parseFloat(r.dataset.exp) || 0;
          
          totalClicks += clicks;
          totalCtrlClicks += (clicks * ctrlCTR / 100);
          totalExpClicks += (clicks * expCTR / 100);
        });

        const avgCtrlCTR = totalClicks > 0 ? (totalCtrlClicks / totalClicks * 100) : 0;
        const avgExpCTR = totalClicks > 0 ? (totalExpClicks / totalClicks * 100) : 0;
        const deltaVal = avgExpCTR - avgCtrlCTR;
        
        const deltaHtml = deltaVal === 0 ? '0' : 
          `<span class="${deltaVal > 0 ? 'pos' : 'neg'}">${deltaVal > 0 ? '▲' : '▼'}${Math.abs(deltaVal).toFixed(2)}%</span>`;

        summary.innerHTML = `
          <strong>Filtered Results:</strong> ${visibleIndices.length.toLocaleString()} queries, ${totalClicks.toLocaleString()} total clicks<br>
          <strong>Control CTR:</strong> ${avgCtrlCTR.toFixed(2)}% | 
          <strong>Experiment CTR:</strong> ${avgExpCTR.toFixed(2)}% | 
          <strong>Difference:</strong> ${deltaHtml}
        `;
      }, 0);
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

      const selectedTags = [...document.querySelectorAll('.tag-checkbox:checked')].map(cb => cb.value);

      const queryMinLength = parseInt(S('query-min').value, 10);
      const queryMaxLength = parseInt(S('query-max').value, 10);

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
        
        // Tags filter: OR logic - if any selected tag matches any row tag, show it
        const rowTags = r.dataset.tags ? r.dataset.tags.split(',').map(t => t.trim()) : [];
        const tagsOK = selectedTags.length === 0 || selectedTags.some(tag => rowTags.includes(tag));
        
        // Query length filter
        const queryLength = r.dataset.query ? r.dataset.query.length : 0;
        const queryLengthOK = queryLength >= queryMinLength && queryLength <= queryMaxLength;

        if (textOK && bkOK && duOK && dOK && lgOK && mcOK && p1OK && tagsOK && queryLengthOK) visible.push(i);
      });

      loaded = 0;
      showNext();
      updateCumulativeCTR(visible);
    };

    /* ─ tags dropdown functionality ─ */
    let updateSelectedTags; // Define in outer scope for access by other functions
    
    const setupTagsDropdown = () => {
      const tagsBtn = S('tags-btn');
      const tagsDropdown = S('tags-dropdown');
      const selectedTagsDiv = S('selected-tags');
      
      if (!tagsBtn || !tagsDropdown || !selectedTagsDiv) return;
      
      // Toggle dropdown
      tagsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        tagsDropdown.classList.toggle('show');
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        tagsDropdown.classList.remove('show');
      });
      
      // Prevent dropdown from closing when clicking inside
      tagsDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      // Update selected tags display and filter
      updateSelectedTags = () => {
        const selectedTags = [...document.querySelectorAll('.tag-checkbox:checked')].map(cb => cb.value);
        
        // Update pills display
        selectedTagsDiv.innerHTML = selectedTags.map(tag => 
          `<span class="tag-pill" data-tag="${esc(tag)}">${esc(tag)} ×</span>`
        ).join('');
        
        // Update button text
        tagsBtn.textContent = selectedTags.length > 0 ? `${selectedTags.length} tags selected ▼` : 'Select Tags ▼';
        
        // Add click handlers to pills for removal
        selectedTagsDiv.querySelectorAll('.tag-pill').forEach(pill => {
          pill.addEventListener('click', () => {
            const tag = pill.dataset.tag;
            const checkbox = document.querySelector(`.tag-checkbox[value="${tag}"]`);
            if (checkbox) {
              checkbox.checked = false;
              updateSelectedTags();
              apply();
            }
          });
        });
        
        apply();
      };
      
      // Listen for checkbox changes
      document.addEventListener('change', (e) => {
        if (e.target.classList.contains('tag-checkbox')) {
          updateSelectedTags();
        }
      });
    };

    /* ─ query length range slider functionality ─ */
    const setupQueryLengthSlider = () => {
      const queryMin = S('query-min');
      const queryMax = S('query-max');
      const queryMinValue = S('query-min-value');
      const queryMaxValue = S('query-max-value');
      const rangeFill = document.querySelector('.range-fill');
      
      if (!queryMin || !queryMax || !queryMinValue || !queryMaxValue || !rangeFill) return;
      
      const updateSlider = () => {
        const min = parseInt(queryMin.value, 10);
        const max = parseInt(queryMax.value, 10);
        const minRange = parseInt(queryMin.min, 10);
        const maxRange = parseInt(queryMin.max, 10);
        
        // Ensure min doesn't exceed max
        if (min > max) {
          if (queryMin === document.activeElement) {
            queryMin.value = max;
          } else {
            queryMax.value = min;
          }
        }
        
        const actualMin = Math.min(min, max);
        const actualMax = Math.max(min, max);
        
        // Update display values
        queryMinValue.textContent = actualMin;
        queryMaxValue.textContent = actualMax;
        
        // Update range fill
        const leftPercent = ((actualMin - minRange) / (maxRange - minRange)) * 100;
        const rightPercent = ((actualMax - minRange) / (maxRange - minRange)) * 100;
        
        rangeFill.style.left = leftPercent + '%';
        rangeFill.style.width = (rightPercent - leftPercent) + '%';
        
        apply();
      };
      
      queryMin.addEventListener('input', updateSlider);
      queryMax.addEventListener('input', updateSlider);
      
      // Initialize slider
      updateSlider();
    };

    /* wiring */
    ['q','ctrl','exp','d','ctrlOp','expOp','dOp','lg','mc','p1'].forEach(id=>
      S(id) && S(id).addEventListener('input', apply)
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
      // Clear tags selection
      [...document.querySelectorAll('.tag-checkbox')].forEach(cb => cb.checked = false);
      const selectedTagsDiv = S('selected-tags');
      if (selectedTagsDiv) selectedTagsDiv.innerHTML = '';
      const tagsBtn = S('tags-btn');
      if (tagsBtn) tagsBtn.textContent = 'Select Tags ▼';
      // Reset query length slider
      const queryMin = S('query-min');
      const queryMax = S('query-max');
      if (queryMin) queryMin.value = queryMin.min;
      if (queryMax) queryMax.value = queryMax.max;
      // Trigger the slider update to refresh the display
      if (queryMin) queryMin.dispatchEvent(new Event('input'));
      if (queryMax) queryMax.dispatchEvent(new Event('input'));
    });
    window.addEventListener('scroll',()=>{
      if (window.innerHeight+window.scrollY>=document.body.offsetHeight-200){
        if (loaded < visible.length) showNext();
      }
    });

    /* ─ tag icon click functionality ─ */
    const setupTagIconClicks = () => {
      document.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-icon')) {
          const tagValue = e.target.dataset.tag;
          const checkbox = document.querySelector(`.tag-checkbox[value="${tagValue}"]`);
          
          if (checkbox) {
            // Find the parent row to maintain position
            const parentRow = e.target.closest('tr');
            const rowIndex = parentRow ? parentRow.dataset.i : null;
            
            checkbox.checked = true;
            // Directly call updateSelectedTags to refresh the UI and filters
            if (updateSelectedTags) {
              updateSelectedTags();
            }
            
            // After filtering, scroll back to the clicked row if it's still visible
            setTimeout(() => {
              if (rowIndex) {
                const targetRow = document.querySelector(`tr[data-i="${rowIndex}"]`);
                if (targetRow && !targetRow.classList.contains('hide')) {
                  targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  // Briefly highlight the row to show where we are
                  targetRow.style.backgroundColor = '#fff3cd';
                  setTimeout(() => {
                    targetRow.style.backgroundColor = '';
                  }, 1000);
                }
              }
            }, 100);
          }
        }
      });
    };

    /* initialise */
    setupTagsDropdown();
    setupQueryLengthSlider();
    setupTagIconClicks();
    apply();            // sets visible[] and shows first PAGE_SIZE rows
  }

  /* ---- CSV upload hook ---- */
  function updateLabels(){
    const ids = ['ctrlName','ctrlNameFilter','expName','expNameFilter'];
    ids.forEach(id=>{ const el=document.getElementById(id); if(el){
      if(id.includes('ctrl')) el.textContent = CTRL; else el.textContent = EXP;
    }});
  }

  function populateTagsDropdown(data) {
    const tagsDropdown = document.getElementById('tags-dropdown');
    if (!tagsDropdown) return;
    
    const tagSet = new Set();
    data.forEach(rec => rec.tags.forEach(tag => tagSet.add(tag)));
    const allTags = [...tagSet].sort();
    
    tagsDropdown.innerHTML = allTags.map(tag => 
      `<label><input type="checkbox" value="${esc(tag)}" class="tag-checkbox"> ${esc(tag)}</label>`
    ).join('');
  }

  function updateQueryLengthRange(data) {
    const queryLengths = data.map(rec => rec.key.length);
    QUERY_LENGTH_RANGE = {
      min: Math.min(...queryLengths),
      max: Math.max(...queryLengths)
    };
    
    // Update the range sliders
    const queryMin = document.getElementById('query-min');
    const queryMax = document.getElementById('query-max');
    const queryMinValue = document.getElementById('query-min-value');
    const queryMaxValue = document.getElementById('query-max-value');
    
    if (queryMin && queryMax && queryMinValue && queryMaxValue) {
      queryMin.min = QUERY_LENGTH_RANGE.min;
      queryMin.max = QUERY_LENGTH_RANGE.max;
      queryMin.value = QUERY_LENGTH_RANGE.min;
      
      queryMax.min = QUERY_LENGTH_RANGE.min;
      queryMax.max = QUERY_LENGTH_RANGE.max;
      queryMax.value = QUERY_LENGTH_RANGE.max;
      
      queryMinValue.textContent = QUERY_LENGTH_RANGE.min;
      queryMaxValue.textContent = QUERY_LENGTH_RANGE.max;
      
      // Trigger the slider update to refresh the visual range fill
      queryMin.dispatchEvent(new Event('input'));
    }
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
        populateTagsDropdown(DATA);
        updateQueryLengthRange(DATA);
        render(DATA);
        setupTagsDropdown();
        setupQueryLengthSlider();
        setupTagIconClicks();
      };
      reader.readAsText(file);
    });
  });
})();
