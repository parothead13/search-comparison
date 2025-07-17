/* server.js – dynamic diff viewer (v13, 2025-05-23)
   ───────────────────────────────────────────────
   • each record is now THREE <tr>s:
       – 1 parent  (query + CTR)
       – 2 children (Set 1, Set 2)
   • the client script toggles children with their parent, so
     mini-tables are never orphaned by a search / numeric filter.
*/

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const express = require('express');
const csv     = require('csv-parser');
const multer  = require('multer');

// When running on Cloud Run, the container file system is read-only except for
// the /tmp directory. Use a temp folder for uploads so the server works both
// locally and in the cloud.
const tmpUploadDir = path.join(os.tmpdir(), 'uploads');
fs.mkdirSync(tmpUploadDir, { recursive: true });
const upload  = multer({ dest: tmpUploadDir });
const app  = express();
const PORT = process.env.PORT || 8080;

/* ─ Config ─ */
const TOTAL_CLICKS_COL = 'total_clicks';
let   CTRL_PREFIX      = 'BK';   // default until a CSV is loaded
let   EXP_PREFIX       = 'DU';
/* ─────────── */

app.use('/public', express.static(path.join(__dirname, 'public')));

/* helpers */
const esc = s => (s||'').replace(/&/g,'&amp;')
                        .replace(/</g,'&lt;')
                        .replace(/>/g,'&gt;');
const pct = n => `${n.toFixed(2)}%`;
const asPct = raw=>{
  let n = parseFloat(String(raw || '').replace('%', ''));
  if (!isFinite(n)) return 0;
  if (n > 1) return n;   // already a percentage like 5 or 75
  return n * 100;         // convert fraction to percent
};
const delta = (du,bk)=>{
  const d = du - bk; if (!isFinite(d)||d===0) return '0';
  return `<span class="${d>0?'pos':'neg'}">${d>0?'▲':'▼'}${Math.abs(d).toFixed(2)}%</span>`;
};
const joinText = o => [o?.title?.replace('NA',''),
                       o?.type && !o.type.includes('NA') ? `(${o.type})` : '']
                      .filter(Boolean).join(' ');

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
const cellHtml = o => {
  const txt  = esc(joinText(o));
  const img  = (o.img && !o.img.includes('NA'))
               ? `<img src="${esc(o.img)}" class=result-img>`
               : '';
  const open = o.url ? `<a href="${esc(o.url)}" target="_blank">` : '';
  const close= o.url ? '</a>' : '';
  return `${open}${img}${txt}${close}`;
};

const entityHtml = entity => {
  const txt = esc(entity.name) + (entity.type ? ` (${esc(entity.type)})` : '');
  const percentage = `${entity.percentage.toFixed(1)}%`;
  const img = (entity.img && !entity.img.includes('NA')) 
              ? `<img src="${esc(entity.img)}" class="entity-img">`
              : '';
  const open = entity.url ? `<a href="${esc(entity.url)}" target="_blank">` : '';
  const close = entity.url ? '</a>' : '';
  return `${open}${img}${txt}${close}<br><small>${percentage} of searches</small>`;
};

/* csv → records */
function parseCsv(file){
  return new Promise((res,rej)=>{
    const out=[];
    let prefixes=[];
    let totalRawLines = 0;
    let parsedRows = 0;
    
    // Count total lines in file first
    const rawContent = fs.readFileSync(file, 'utf8');
    totalRawLines = rawContent.split(/\r?\n/).filter(line => line.trim()).length;
    console.log(`CSV Debug: Total lines in file: ${totalRawLines}`);
    
    fs.createReadStream(file)
      .pipe(csv())
      .on('headers', hdrs => {
        const ctrCols = hdrs.filter(h=>h.startsWith('CTR_'));
        if (ctrCols.length >= 2){
          prefixes = ctrCols.map(h=>h.slice(4));
        } else {
          const seen = new Set();
          hdrs.forEach(h=>{
            const m = h.match(/^([^_]+)_set1_/);
            if(m && !seen.has(m[1])) seen.add(m[1]);
          });
          prefixes = [...seen];
        }
      })
      .on('data',r=>{
        parsedRows++;
        out.push(r);
      })
      .on('end',()=>{
        console.log(`CSV Debug: Parsed rows: ${parsedRows}, Output records: ${out.length}`);
        console.log(`CSV Debug: Expected ${totalRawLines - 1} data rows (minus header), got ${out.length}`);
        if (totalRawLines - 1 !== out.length) {
          console.log(`CSV Debug: WARNING - Row count mismatch! Missing ${(totalRawLines - 1) - out.length} rows`);
        }
        const [CTRL,EXP] = prefixes;
        if(!CTRL||!EXP) return rej(new Error('CSV must contain two CTR_* or *_set1_* columns'));
        CTRL_PREFIX = CTRL;
        EXP_PREFIX  = EXP;
        const recs = out.map(r=>{
          const key    = r.search_string || r.id || r.query || '(blank)';
          const clicks = +r[TOTAL_CLICKS_COL] || 0;
        const bool = v => String(v).toLowerCase()==='true';
        const searchCount = +r.search_count || 0;
        const entities = [];
        
        // Helper function to find image for entity ID
        const findImageForEntity = (entityId) => {
          if (!entityId || entityId === 'NA') return '';
          
          // Check all result images to see if any match this entity ID
          const resultFields = ['Ctrl_set1_result1', 'Ctrl_set1_result2', 'Ctrl_set1_result3', 
                               'Ctrl_set2_result1', 'Ctrl_set2_result2', 'Ctrl_set2_result3',
                               'Exp_set1_result1', 'Exp_set1_result2', 'Exp_set1_result3',
                               'Exp_set2_result1', 'Exp_set2_result2', 'Exp_set2_result3'];
          
          for (const field of resultFields) {
            const resultId = r[`${field}_id`];
            const resultImg = r[`${field}_img`];
            if (resultId === entityId && resultImg && resultImg !== 'NA') {
              return resultImg;
            }
          }
          
          return '';
        };

        // Parse entity data (up to 5 entities)
        for (let i = 1; i <= 5; i++) {
          const entityName = r[`top${i}_entity_name`];
          const entityType = r[`top${i}_entity_type`];
          const entityId = r[`top${i}_entity_id`];
          const entityHyperlink = r[`top${i}_entity_id_hyperlink`];
          const clickCount = +r[`top${i}_click_count`] || 0;
          
          if (entityName && entityName !== 'NA' && clickCount > 0) {
            entities.push({
              name: entityName,
              type: entityType && entityType !== 'NA' ? entityType : '',
              id: entityId && entityId !== 'NA' ? entityId : '',
              url: entityHyperlink && entityHyperlink !== 'NA' ? entityHyperlink : '',
              img: findImageForEntity(entityId),
              clickCount,
              percentage: searchCount > 0 ? (clickCount / searchCount * 100) : 0
            });
          }
        }
        
        // Sort entities by click count (descending)
        entities.sort((a, b) => b.clickCount - a.clickCount);
        
        const rec = {
          key,
          clicks,
          searchCount,
          entities,
          ctrCtrl: asPct(r[`CTR_${CTRL}`]),
          ctrExp : asPct(r[`CTR_${EXP}`]),
          largeGap: bool(r.large_gap),
          meaningfulChange: bool(r.meaningful_change),
          set1P1Change: bool(r.set1_p1_change),
          tags: r.tags ? r.tags.split(',').map(t => t.trim()).filter(t => t && t !== 'NA') : [],
          titlesCtrl:{set1:r[`${CTRL}_set1_title`]||'',
                      set2:r[`${CTRL}_set2_title`]||''},
          titlesExp :{set1:r[`${EXP}_set1_title`]||'',
                      set2:r[`${EXP}_set2_title`]||''},
          resCtrl:{set1:[],set2:[]}, resExp:{set1:[],set2:[]}
        };
          ['set1','set2'].forEach(set=>{
            for (let i=1;i<=3;i++){
              rec.resCtrl[set].push({
                title:r[`${CTRL}_${set}_result${i}_title`]||'',
                type :r[`${CTRL}_${set}_result${i}_type`] ||'',
                img  :r[`${CTRL}_${set}_result${i}_img`]  ||'',
                url  :r[`${CTRL}_${set}_result${i}_id_hyperlink`] || r[`${CTRL}_${set}_result${i}_hyperlink`] || ''
              });
              rec.resExp[set].push({
                title:r[`${EXP}_${set}_result${i}_title`]||'',
                type :r[`${EXP}_${set}_result${i}_type`] ||'',
                img  :r[`${EXP}_${set}_result${i}_img`]  ||'',
                url  :r[`${EXP}_${set}_result${i}_id_hyperlink`] || r[`${EXP}_${set}_result${i}_hyperlink`] || ''
              });
            }
          });
          return rec;
        }).sort((a,b)=>b.clicks-a.clicks);
        console.log(`CSV Debug: Final processed records: ${recs.length}`);
        if (recs.length > 0) {
          console.log(`CSV Debug: First record sample:`, {
            key: recs[0].key,
            clicks: recs[0].clicks,
            ctrCtrl: recs[0].ctrCtrl,
            ctrExp: recs[0].ctrExp,
            largeGap: recs[0].largeGap,
            meaningfulChange: recs[0].meaningfulChange,
            set1P1Change: recs[0].set1P1Change,
            tags: recs[0].tags
          });
        }
        res(recs);
      })
      .on('error',rej);
  });
}

/* in-memory dataset */
let DATA = [];
let ALL_TAGS = [];
let QUERY_LENGTH_RANGE = { min: 0, max: 200 };

/* upload */
app.post('/upload', upload.single('csvFile'), (req,res)=>{
  if (!req.file) return res.send('No file');
  parseCsv(req.file.path)
    .then(r => { 
      DATA = r; 
      // Extract all unique tags
      const tagSet = new Set();
      r.forEach(rec => rec.tags.forEach(tag => tagSet.add(tag)));
      ALL_TAGS = [...tagSet].sort();
      
      // Calculate query length range
      const queryLengths = r.map(rec => rec.key.length);
      QUERY_LENGTH_RANGE = {
        min: Math.min(...queryLengths),
        max: Math.max(...queryLengths)
      };
      
      res.redirect('/'); 
    })
    .catch(e => res.send('Parse error: '+e.message));
});

/* mini-table builder */
const setTbl = (k,r)=>{
  const [tCtrl,tExp] = [r.titlesCtrl[k], r.titlesExp[k]].map(esc);
  const hdrCtrl = tCtrl===tExp ? esc(tCtrl) : `<span class="control">${tCtrl}</span>`;
  const hdrExp  = tCtrl===tExp ? esc(tExp) : `<span class="experiment">${tExp}</span>`;
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
              <tr><th>${CTRL_PREFIX}: ${hdrCtrl||'-'}</th><th>${EXP_PREFIX}: ${hdrExp||'-'}</th></tr>
            </thead><tbody>${rows}</tbody></table>`;
};

/* main page */
app.get('/', (_,res)=>{
    const rowsHtml = DATA.map((r,i)=>`
    <tr class="parent hide" data-rowid="${i}"
      data-ctrl="${r.ctrCtrl}" data-exp="${r.ctrExp}"
      data-d="${isFinite(r.ctrExp-r.ctrCtrl) ? (r.ctrExp-r.ctrCtrl).toFixed(2) : '0'}"
      data-clicks="${r.clicks}"
      data-tags="${r.tags.join(',')}"
      data-lg="${r.largeGap}" data-mc="${r.meaningfulChange}"
      data-p1="${r.set1P1Change}">
      <td>${esc(r.key)}<br><div class="tag-icons">${renderTagIcons(r.tags)}</div></td>
      <td class=ctr>total clicks: ${r.clicks.toLocaleString()}<br>
                     ${CTRL_PREFIX} ${pct(r.ctrCtrl)}<br>${EXP_PREFIX} ${pct(r.ctrExp)}<br>
                     ${delta(r.ctrExp,r.ctrCtrl)}</td>
      <td class="entities-column">${r.entities.length > 0 ? r.entities.map(entityHtml).join('<br><br>') : 'No entity data'}</td>
      <td>${setTbl('set1',r)}${setTbl('set2',r)}</td>
    </tr>`).join('');

  res.send(`<!doctype html><html><head><meta charset=utf-8>
<title>${CTRL_PREFIX} vs ${EXP_PREFIX} POC</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:6px;vertical-align:top}
.result-img{width:60px;height:60px;object-fit:cover;display:block;margin-bottom:2px}
.parent>td:nth-child(4){padding:0;}      /* results cell in parent row   */
.set{border-collapse:collapse;width:100%;font-size:.9em}
.set th,.set td{border:1px solid #aaa;padding:2px 4px}
.set th{background:#eee}
.control{background:#f9c7c7}.experiment{background:#b7f5b7}
.ctr{text-align:right;white-space:nowrap}
.pos{color:#138000;font-weight:600}.neg{color:#b00000;font-weight:600}
.hide{display:none}
.controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}
  .controls label{display:flex;align-items:center;gap:4px}
  .controls input[type=number]{width:60px}
  .search input{width:200px}
  .controls select[multiple]{height:2.4em}
  .controls input.dial{width:40px;appearance:none;background:#ccc;height:4px;border-radius:2px;padding:0;margin:0}
  .controls input.dial::-webkit-slider-thumb{appearance:none;width:14px;height:14px;border-radius:50%;background:#777}
  .controls input.dial.true::-webkit-slider-thumb{background:#138000}
  .controls input.dial.false::-webkit-slider-thumb{background:#b00000}
  .controls input.dial.any::-webkit-slider-thumb{background:#777}
  .child td:nth-child(4){
    border:none;          /* no 1-pixel grey frame */
    padding:0;            /* let the nested table sit flush          */
    vertical-align:top;   /* keep Set1 / Set2 tables top-aligned     */
  }
  
  /* 2. remove the extra horizontal rule that appears *between*
        the Set 1 and Set 2 child rows (keep bottom border of whole set) */
  .child + .child td:nth-child(4){
    border-top:none;
  }
  
  /* 3. optional: tighten the nested table itself so its own
        inner grid is the only visible border work */
  .set{
    margin:0;             /* kill default (if any) vertical spacing  */
  }
  
  /* Entities column styling */
  .entities-column {
    width: 200px;
    font-size: 0.9em;
    line-height: 1.3;
  }
  .entities-column a {
    color: #0066cc;
    text-decoration: none;
  }
  .entities-column a:hover {
    text-decoration: underline;
  }
  .entities-column small {
    color: #666;
    font-size: 0.85em;
  }
  .entity-img {
    width: 40px;
    height: 40px;
    object-fit: cover;
    display: inline-block;
    margin-right: 8px;
    vertical-align: middle;
    border-radius: 4px;
  }
  
  /* Tags dropdown styling */
  .tags-filter { display: flex; align-items: center; gap: 8px; }
  .tags-dropdown { position: relative; display: inline-block; }
  .tags-button { 
    background: #fff; border: 1px solid #ccc; padding: 4px 8px; 
    cursor: pointer; border-radius: 3px; min-width: 100px; text-align: left;
  }
  .tags-button:hover { background: #f5f5f5; }
  .tags-dropdown-content { 
    display: none; position: absolute; top: 100%; left: 0; 
    background: #fff; border: 1px solid #ccc; border-radius: 3px; 
    box-shadow: 0 2px 8px rgba(0,0,0,0.1); z-index: 1000; 
    min-width: 150px; max-height: 200px; overflow-y: auto;
  }
  .tags-dropdown-content.show { display: block; }
  .tags-dropdown-content label { 
    display: block; padding: 6px 12px; cursor: pointer; 
    border-bottom: 1px solid #eee; white-space: nowrap;
  }
  .tags-dropdown-content label:hover { background: #f5f5f5; }
  .tags-dropdown-content label:last-child { border-bottom: none; }
  .selected-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag-pill { 
    background: #e1f5fe; border: 1px solid #0277bd; border-radius: 12px; 
    padding: 2px 8px; font-size: 0.85em; cursor: pointer; 
  }
  .tag-pill:hover { background: #b3e5fc; }
  
  /* Query length range slider styling */
  .query-length-filter { display: flex; align-items: center; gap: 8px; }
  .range-slider { position: relative; width: 200px; height: 20px; }
  .range-track { 
    position: absolute; top: 50%; left: 0; right: 0; height: 4px; 
    background: #ddd; border-radius: 2px; transform: translateY(-50%); 
  }
  .range-fill { 
    position: absolute; height: 100%; background: #0277bd; 
    border-radius: 2px; 
  }
  .range-min, .range-max { 
    position: absolute; width: 100%; height: 100%; 
    background: transparent; pointer-events: none; 
    -webkit-appearance: none; appearance: none; 
  }
  .range-min::-webkit-slider-thumb, .range-max::-webkit-slider-thumb { 
    width: 16px; height: 16px; border-radius: 50%; background: #0277bd; 
    border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); 
    cursor: pointer; pointer-events: auto; -webkit-appearance: none; 
  }
  .range-min::-moz-range-thumb, .range-max::-moz-range-thumb { 
    width: 16px; height: 16px; border-radius: 50%; background: #0277bd; 
    border: 2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); 
    cursor: pointer; pointer-events: auto; 
  }
  .range-values { 
    font-size: 0.85em; color: #666; white-space: nowrap; 
  }
  
  /* Tag icons styling */
  .tag-icons { 
    margin-top: 4px; display: flex; flex-wrap: wrap; gap: 3px; 
  }
  .tag-icon { 
    display: inline-block; padding: 2px 6px; border-radius: 10px; 
    font-size: 0.75em; font-weight: 500; cursor: pointer; 
    border: 1px solid rgba(0,0,0,0.2); transition: all 0.2s ease; 
    white-space: nowrap; 
  }
  .tag-icon:hover { 
    transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0,0,0,0.2); 
    border-color: rgba(0,0,0,0.4); 
  }
  .tag-icon:active { 
    transform: translateY(0); box-shadow: 0 1px 2px rgba(0,0,0,0.2); 
  }
</style></head><body>
<h1>Search Results – Control vs Experiment</h1>
<form action="/upload" method=post enctype=multipart/form-data>
  <input type=file name=csvFile accept=".csv" required>
  <button>Load CSV</button>
</form><br>
<div class=controls>
  <label class=search>🔍 <input id=q placeholder="search…"></label>
  <label>CTR ${CTRL_PREFIX} <select id=ctrlOp><option value=">=">&ge;</option><option value="<=">&le;</option></select>
        <input id=ctrl type=number></label>
  <label>CTR ${EXP_PREFIX} <select id=expOp><option value=">=">&ge;</option><option value="<=">&le;</option></select>
        <input id=exp type=number></label>
  <label>Δ <select id=dOp><option value=">=">&ge;</option><option value="<=">&le;</option></select>
        <input id=d type=number></label>
  <label>Large gap <input id=lg class=dial type=range min=-1 max=1 step=1 value=0></label>
  <label>Meaningful change <input id=mc class=dial type=range min=-1 max=1 step=1 value=0></label>
  <label>P1 change <input id=p1 class=dial type=range min=-1 max=1 step=1 value=0></label>
  <div class="tags-filter">
    <label>Tags</label>
    <div class="tags-dropdown">
      <button id="tags-btn" class="tags-button">Select Tags ▼</button>
      <div id="tags-dropdown" class="tags-dropdown-content">
        ${ALL_TAGS.map(tag => `<label><input type="checkbox" value="${esc(tag)}" class="tag-checkbox"> ${esc(tag)}</label>`).join('')}
      </div>
    </div>
    <div id="selected-tags" class="selected-tags"></div>
  </div>
  <div class="query-length-filter">
    <label>Query Length</label>
    <div class="range-slider">
      <div class="range-track">
        <div class="range-fill"></div>
      </div>
      <input type="range" id="query-min" class="range-min" min="${QUERY_LENGTH_RANGE.min}" max="${QUERY_LENGTH_RANGE.max}" value="${QUERY_LENGTH_RANGE.min}">
      <input type="range" id="query-max" class="range-max" min="${QUERY_LENGTH_RANGE.min}" max="${QUERY_LENGTH_RANGE.max}" value="${QUERY_LENGTH_RANGE.max}">
    </div>
    <div class="range-values">
      <span id="query-min-value">${QUERY_LENGTH_RANGE.min}</span> - <span id="query-max-value">${QUERY_LENGTH_RANGE.max}</span> chars
    </div>
  </div>
  <button id=clear>clear</button>
</div>
<div id=cumulative-ctr style="margin:16px 0;padding:12px;border:1px solid #ddd;background:#f9f9f9;border-radius:4px">
  <h3 style="margin:0 0 8px 0">Cumulative CTR Analysis</h3>
  <div id=ctr-summary style="font-size:0.9em;color:#666">Computing...</div>
</div>
<div id=pager style="margin:8px 0">Scroll for more results</div>
<table id=tbl><thead>
  <tr><th>Query</th><th>CTR</th><th>Most Clicked Entities</th><th>Set 1 & 2</th></tr>
</thead><tbody>${rowsHtml}</tbody></table>
<script src="/public/table-view.js"></script>
</body></html>`);
});

app.listen(PORT, ()=>console.log(`http://localhost:${PORT}`));
