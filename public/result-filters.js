// public/results-filters.js — tiny helper for the standalone “results” page
// ------------------------------------------------------------------------
// Page elements:
//   #searchBox ⟶ free-text search
//   #meaningful (checkbox) filters rows with data-meaningful="true"
//   #largeGap   (checkbox) filters rows with data-largegap="true"
// All rows live directly under #results tbody.

(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const searchBox  = document.getElementById('searchBox');
    const meaningful = document.getElementById('meaningful');
    const largeGap   = document.getElementById('largeGap');

    // Abort if the page doesn’t have these elements (lets the file be shared).
    if (!searchBox || !meaningful || !largeGap) return;

    // operate on top-level rows so nested cells stay visible together
    const rows = [...document.querySelectorAll('#results tbody > tr')];

    // cache text from first cell
    rows.forEach(r => {
      const first = r.querySelector('td');
      r.dataset.query = (first ? first.textContent : '').toLowerCase().trim();
    });

    const apply = () => {
      const q = searchBox.value.toLowerCase();
      rows.forEach(r => {
        const text   = r.dataset.query || '';
        const showMeaningful = meaningful.checked ? r.dataset.meaningful === 'true' : true;
        const showLargeGap   = largeGap.checked   ? r.dataset.largegap   === 'true' : true;
        const match = text.includes(q);
        r.style.display = (match && showMeaningful && showLargeGap) ? '' : 'none';
      });
    };

    searchBox.addEventListener('input', apply);
    searchBox.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    [meaningful, largeGap].forEach(el => el.addEventListener('change', apply));
  });
})();