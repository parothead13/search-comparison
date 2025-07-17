// public/table-view.js – filters & lazy-paging for parent/child rows
// ---------------------------------------------------------------
(() => {
  document.addEventListener('DOMContentLoaded', () => {

    /* ─ constants ─ */
    const PAGE_SIZE = 50;
    const parents   = [...document.querySelectorAll('tr.parent')];
    const S         = id => document.getElementById(id);
    const ops       = { '>=':(a,b)=>a>=b, '<=':(a,b)=>a<=b };
    const esc       = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
      if (first) {
        // Extract only the query text, not the tag text
        const queryText = first.childNodes[0] ? first.childNodes[0].textContent : '';
        p.dataset.query = queryText.toLowerCase();
      } else {
        p.dataset.query = '';
      }
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

    /* ─ cumulative CTR computation ─ */
    const updateCumulativeCTR = (visibleIndices) => {
      console.log('updateCumulativeCTR called with visibleIndices.length:', visibleIndices.length);
      const summary = S('ctr-summary');
      if (!summary) {
        console.log('No ctr-summary element found');
        return;
      }
      
      if (visibleIndices.length === 0) {
        summary.innerHTML = 'No queries match current filters';
        return;
      }

      let totalClicks = 0;
      let totalCtrlClicks = 0;
      let totalExpClicks = 0;

      visibleIndices.forEach(i => {
        const p = parents[i];
        const clicks = parseFloat(p.dataset.clicks) || 0;
        const ctrlCTR = parseFloat(p.dataset.ctrl) || 0;
        const expCTR = parseFloat(p.dataset.exp) || 0;
        
        totalClicks += clicks;
        totalCtrlClicks += (clicks * ctrlCTR / 100);
        totalExpClicks += (clicks * expCTR / 100);
      });

      const avgCtrlCTR = totalClicks > 0 ? (totalCtrlClicks / totalClicks * 100) : 0;
      const avgExpCTR = totalClicks > 0 ? (totalExpClicks / totalClicks * 100) : 0;
      const delta = avgExpCTR - avgCtrlCTR;
      
      const deltaHtml = delta === 0 ? '0' : 
        `<span class="${delta > 0 ? 'pos' : 'neg'}">${delta > 0 ? '▲' : '▼'}${Math.abs(delta).toFixed(2)}%</span>`;

      summary.innerHTML = `
        <strong>Filtered Results:</strong> ${visibleIndices.length.toLocaleString()} queries, ${totalClicks.toLocaleString()} total clicks<br>
        <strong>Control CTR:</strong> ${avgCtrlCTR.toFixed(2)}% | 
        <strong>Experiment CTR:</strong> ${avgExpCTR.toFixed(2)}% | 
        <strong>Difference:</strong> ${deltaHtml}
      `;
    };

    /* ─ main filter routine ─ */
    const apply = () => {
      console.log('apply() called, parents.length:', parents.length);
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

      const queryMinLength = isFinite(parseInt(S('query-min').value, 10)) ? parseInt(S('query-min').value, 10) : 0;
      const queryMaxLength = isFinite(parseInt(S('query-max').value, 10)) ? parseInt(S('query-max').value, 10) : 200;

      const ctrlF = ops[S('ctrlOp').value];
      const expF  = ops[S('expOp').value];
      const dF  = ops[S('dOp').value];

      visible = [];
      parents.forEach((p,i)=>{
        toggle(p,false);                      // hide everything first

        const textOK = (term === '') || p.dataset.query.includes(term);
        const bkOK   = (ctrlVal===null) || (isFinite(parseFloat(p.dataset.ctrl)) && ctrlF(parseFloat(p.dataset.ctrl), ctrlVal)) || !isFinite(parseFloat(p.dataset.ctrl));
        const duOK   = (expVal===null) || (isFinite(parseFloat(p.dataset.exp)) && expF(parseFloat(p.dataset.exp), expVal)) || !isFinite(parseFloat(p.dataset.exp));
        const dOK    = (dVal ===null) || (isFinite(parseFloat(p.dataset.d)) && dF(parseFloat(p.dataset.d), dVal)) || !isFinite(parseFloat(p.dataset.d));
        const lgOK   = lgVal===0 ? true : (lgVal===1 ? p.dataset.lg==='true' : p.dataset.lg==='false');
        const mcOK   = mcVal===0 ? true : (mcVal===1 ? p.dataset.mc==='true' : p.dataset.mc==='false');
        const p1OK   = p1Val===0 ? true : (p1Val===1 ? p.dataset.p1==='true' : p.dataset.p1==='false');
        
        // Tags filter: OR logic - if any selected tag matches any row tag, show it
        const rowTags = p.dataset.tags ? p.dataset.tags.split(',').map(t => t.trim()) : [];
        const tagsOK = selectedTags.length === 0 || selectedTags.some(tag => rowTags.includes(tag));
        
        // Query length filter
        const queryLength = p.dataset.query ? p.dataset.query.length : 0;
        const queryLengthOK = queryLength >= queryMinLength && queryLength <= queryMaxLength;

        if (textOK && bkOK && duOK && dOK && lgOK && mcOK && p1OK && tagsOK && queryLengthOK) {
          visible.push(i);
        } else {
          // Debug logging for the first few filtered records
          if (i < 3) {
            console.log(`Record ${i} filtered out:`, {
              textOK, bkOK, duOK, dOK, lgOK, mcOK, p1OK, tagsOK, queryLengthOK,
              query: p.dataset.query,
              ctrl: p.dataset.ctrl,
              exp: p.dataset.exp,
              d: p.dataset.d,
              lg: p.dataset.lg,
              mc: p.dataset.mc,
              p1: p.dataset.p1,
              tags: p.dataset.tags,
              queryLength: p.dataset.query ? p.dataset.query.length : 0,
              queryMinLength,
              queryMaxLength
            });
          }
        }
      });

      loaded = 0;
      showNext();
      console.log('About to call updateCumulativeCTR with visible.length:', visible.length);
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

    /* ─ wiring ─ */
    ['q','ctrl','exp','d','ctrlOp','expOp','dOp','lg','mc','p1'].forEach(id=>
      S(id) && S(id).addEventListener('input',apply)
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
      apply();
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
            const parentRow = e.target.closest('tr.parent');
            const rowId = parentRow ? parentRow.dataset.rowid : null;
            
            checkbox.checked = true;
            // Directly call updateSelectedTags to refresh the UI and filters
            if (updateSelectedTags) {
              updateSelectedTags();
            }
            
            // After filtering, scroll back to the clicked row if it's still visible
            setTimeout(() => {
              if (rowId) {
                const targetRow = document.querySelector(`tr.parent[data-rowid="${rowId}"]`);
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

    /* ─ initialise ─ */
    setupTagsDropdown();
    setupQueryLengthSlider();
    setupTagIconClicks();
    apply();        // sets visible[] and shows first PAGE_SIZE rows
  });
})();
