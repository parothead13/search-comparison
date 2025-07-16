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
const cellHtml = o => {
  const txt  = esc(joinText(o));
  const img  = (o.img && !o.img.includes('NA'))
               ? `<img src="${esc(o.img)}" class=result-img>`
               : '';
  const open = o.url ? `<a href="${esc(o.url)}" target="_blank">` : '';
  const close= o.url ? '</a>' : '';
  return `${open}${img}${txt}${close}`;
};

/* csv → records */
function parseCsv(file){
  return new Promise((res,rej)=>{
    const out=[];
    let prefixes=[];
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
      .on('data',r=>out.push(r))
      .on('end',()=>{
        const [CTRL,EXP] = prefixes;
        if(!CTRL||!EXP) return rej(new Error('CSV must contain two CTR_* or *_set1_* columns'));
        CTRL_PREFIX = CTRL;
        EXP_PREFIX  = EXP;
        const recs = out.map(r=>{
          const key    = r.search_string || r.id || r.query || '(blank)';
          const clicks = +r[TOTAL_CLICKS_COL] || 0;
        const bool = v => String(v).toLowerCase()==='true';
        const rec = {
          key,
          clicks,
          ctrCtrl: asPct(r[`CTR_${CTRL}`]),
          ctrExp : asPct(r[`CTR_${EXP}`]),
          largeGap: bool(r.large_gap),
          meaningfulChange: bool(r.meaningful_change),
          set1P1Change: bool(r.set1_p1_change),
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
        res(recs);
      })
      .on('error',rej);
  });
}

/* in-memory dataset */
let DATA = [];

/* upload */
app.post('/upload', upload.single('csvFile'), (req,res)=>{
  if (!req.file) return res.send('No file');
  parseCsv(req.file.path)
    .then(r => { DATA = r; res.redirect('/'); })
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
      data-d="${(r.ctrExp-r.ctrCtrl).toFixed(2)}"
      data-lg="${r.largeGap}" data-mc="${r.meaningfulChange}"
      data-p1="${r.set1P1Change}">
      <td>${esc(r.key)}</td>
      <td class=ctr>total clicks: ${r.clicks.toLocaleString()}<br>
                     ${CTRL_PREFIX} ${pct(r.ctrCtrl)}<br>${EXP_PREFIX} ${pct(r.ctrExp)}<br>
                     ${delta(r.ctrExp,r.ctrCtrl)}</td>
      <td>${setTbl('set1',r)}${setTbl('set2',r)}</td>
    </tr>`).join('');

  res.send(`<!doctype html><html><head><meta charset=utf-8>
<title>${CTRL_PREFIX} vs ${EXP_PREFIX} POC</title>
<style>
body{font-family:system-ui,sans-serif;margin:16px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:6px;vertical-align:top}
.result-img{width:60px;height:60px;object-fit:cover;display:block;margin-bottom:2px}
.parent>td:nth-child(3){padding:0;}      /* empty cell in parent row   */
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
  .child td:nth-child(3){
    border:none;          /* no 1-pixel grey frame */
    padding:0;            /* let the nested table sit flush          */
    vertical-align:top;   /* keep Set1 / Set2 tables top-aligned     */
  }
  
  /* 2. remove the extra horizontal rule that appears *between*
        the Set 1 and Set 2 child rows (keep bottom border of whole set) */
  .child + .child td:nth-child(3){
    border-top:none;
  }
  
  /* 3. optional: tighten the nested table itself so its own
        inner grid is the only visible border work */
  .set{
    margin:0;             /* kill default (if any) vertical spacing  */
  }
</style></head><body>
<h1>Search Results – ${CTRL_PREFIX} (Control) vs ${EXP_PREFIX} (Experiment)</h1>
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
  <button id=clear>clear</button>
</div>
<div id=pager style="margin:8px 0">Scroll for more results</div>
<table id=tbl><thead>
  <tr><th>Query</th><th>CTR</th><th>Set 1 & 2</th></tr>
</thead><tbody>${rowsHtml}</tbody></table>
<script src="/public/table-view.js"></script>
</body></html>`);
});

app.listen(PORT, ()=>console.log(`http://localhost:${PORT}`));
