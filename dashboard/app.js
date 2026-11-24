// Token Radar V6 — the dashboard. It reads window.RADAR (written beside
// dashboard/ by main.ts) and renders the ranked board, a filterable table,
// a per-protocol detail view, the blind-tested methodology and the cover's
// self-checks. No network: every byte it shows is in data.js.
(function () {
  var DATA = window.RADAR;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', watch: false, sort: 'implied', dir: -1, selected: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(n) { return n == null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function ageText(days) {
    if (days == null) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30) + 'mo';
    return (days / 365).toFixed(1) + 'y';
  }
  function statusPill(r) {
    if (r.status === 'pre-token') return '<span class="pill pre">pre-token</span>';
    if (r.status === 'non-launch') return '<span class="pill non">no launch</span>';
    return '<span class="pill trd">trading</span>';
  }
  function verdictPill(r) {
    if (r.status === 'trading') return '<span class="pill trd">n/a</span>';
    var v = r.farm.verdict;
    return '<span class="pill ' + (v === 'worth' ? 'worth' : v === 'marginal' ? 'marg' : 'low') + '">' + v + '</span>';
  }

  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q') != null) state.q = p.get('q');
    if (p.get('cat')) state.category = p.get('cat');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('tab')) state.tab = p.get('tab');
    if (p.get('watch')) state.watch = p.get('watch') === '1';
    if (p.get('sort')) state.sort = p.get('sort');
    if (p.get('dir')) state.dir = p.get('dir') === '1' ? 1 : -1;
    if (p.get('sel')) state.selected = p.get('sel');
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('cat', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.tab !== 'pre-token') p.set('tab', state.tab);
    if (state.watch) p.set('watch', '1');
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.dir === 1) p.set('dir', '1');
    if (state.selected) p.set('sel', state.selected);
    var next = p.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function rows() {
    var list = DATA.rows.filter(function (r) {
      if (state.tab === 'pre-token' && r.status !== 'pre-token') return false;
      if (state.tab === 'non-launch' && r.status !== 'non-launch') return false;
      if (state.tab === 'trading' && r.status !== 'trading') return false;
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q) {
        var q = state.q.toLowerCase();
        if ((r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var va, vb;
      if (key === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (key === 'tvl') { va = a.tvl_usd; vb = b.tvl_usd; }
      else if (key === 'growth') { va = a.change_7d == null ? -999 : a.change_7d; vb = b.change_7d == null ? -999 : b.change_7d; }
      else if (key === 'age') { va = a.age_days == null ? -1 : a.age_days; vb = b.age_days == null ? -1 : b.age_days; }
      else if (key === 'odds') { va = a.odds; vb = b.odds; }
      else { va = a.implied_value_usd; vb = b.implied_value_usd; }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return a.rank - b.rank;
    });
  }

  function headerHtml() {
    var c = DATA.counts;
    var v = DATA.verdicts;
    return '<header class="hero"><h1>Token Radar <span>— the next token launches, ranked</span></h1>' +
      '<p class="sub">Snapshot ' + esc(DATA.as_of) + ' · ' + c.protocols + ' protocols · model ' + esc(DATA.model_version) +
      ' · fitted at run time from ' + DATA.fit.n + ' launched protocols. Source: ' + esc(DATA.source) + '</p>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + c.board + '</b><span>protocols on the board</span></div>' +
      '<div class="stat"><b>' + c.pre_token + '</b><span>pre-token, ranked by value</span></div>' +
      '<div class="stat"><b>' + c.non_launch + '</b><span>pre-token but no launch</span></div>' +
      '<div class="stat"><b>' + c.trading + '</b><span>already trading</span></div>' +
      '<div class="stat"><b>' + v.worth + ' / ' + v.marginal + ' / ' + v.low + '</b><span>farm verdicts worth / marginal / low</span></div>' +
      '<div class="stat"><b>' + DATA.fit.final.loo.median + '×</b><span>leave-one-out median miss (baseline ' + DATA.fit.baseline.loo.median + '×)</span></div>' +
      '</div></header>';
  }

  function checksHtml() {
    var items = DATA.checks.map(function (c) {
      return '<li><span class="' + (c.pass ? 'ok' : 'no') + '">' + (c.pass ? '✓' : '✗') + '</span> <b>' + esc(c.label) + '</b> — <small>' + esc(c.detail) + '</small></li>';
    }).join('');
    return '<div class="checks"><h2>Self-checks — the cover answers its own checks</h2><ul>' + items + '</ul></div>';
  }

  function methodHtml() {
    var f = DATA.fit;
    var kept = Object.keys(f.terms).filter(function (k) { return f.terms[k]; }).join(', ') || 'none';
    var rows = f.term_tests.map(function (t) {
      var w = t.without, u = t.with;
      return '<tr><td>' + esc(t.term) + '</td><td>' + w.loo.median + ' / ' + w.loo.mean + '</td><td>' + w.wf70.median + ' / ' + w.wf70.mean + '</td><td>' + w.wf50.median + ' / ' + w.wf50.mean + '</td>' +
        '<td>' + u.loo.median + ' / ' + u.loo.mean + '</td><td>' + u.wf70.median + ' / ' + u.wf70.mean + '</td><td>' + u.wf50.median + ' / ' + u.wf50.mean + '</td>' +
        '<td class="' + (t.verdict === 'keep' ? 'keep' : 'drop') + '">' + t.verdict + ' (' + t.improved + ' better, ' + t.worsened + ' worse)</td></tr>';
    }).join('');
    var odds = DATA.odds;
    var cv = odds.cv.map(function (c) { return '<tr><td>' + esc(c.kind) + '</td><td>' + c.logloss + '</td><td>' + c.brier + '</td></tr>'; }).join('');
    var bands = odds.bands.map(function (b) { return '<tr><td>' + esc(b.band) + '</td><td>' + (b.odds * 100).toFixed(1) + '%</td><td>' + b.n + '</td></tr>'; }).join('');
    return '<section class="method"><h2>How the value is built — and how it was tested</h2>' +
      '<p><b>Value model.</b> log(market cap / TVL) = ' + f.intercept + ' ' + (f.slope < 0 ? '−' : '+') + ' ' + Math.abs(f.slope) + ' × log(TVL), fitted at run time on the ' + f.n +
      ' protocols whose token already has a measured market cap. The median launched protocol is worth ' + f.median_ratio + '× its TVL. ' +
      'Implied value = TVL × fitted ratio × launch odds. No protocol name is ever special-cased: the same function scores every row.</p>' +
      '<p><b>Blind tests.</b> Every candidate term was kept only if adding it improved at least 4 of 6 numbers — median and mean miss on leave-one-out and two walk-forward splits ' +
      '(train on the earliest listings, test on the latest). Kept: <b>' + esc(kept) + '</b>. The table shows median / mean miss in multiples, without the term, then with it.</p>' +
      '<table class="mini"><thead><tr><th>Term</th><th>LOO w/o</th><th>WF 70/30 w/o</th><th>WF 50/50 w/o</th><th>LOO with</th><th>WF 70/30 with</th><th>WF 50/50 with</th><th>Verdict</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<p>Final model vs the global-median baseline — leave-one-out ' + f.final.loo.median + '× vs ' + f.baseline.loo.median + '× (' + (f.baseline.loo.median / f.final.loo.median).toFixed(2) + '× better), ' +
      'walk-forward 70/30 ' + f.final.wf70.median + '× vs ' + f.baseline.wf70.median + '× (' + (f.baseline.wf70.median / f.final.wf70.median).toFixed(2) + '×), ' +
      '50/50 ' + f.final.wf50.median + '× vs ' + f.baseline.wf50.median + '× (' + (f.baseline.wf50.median / f.final.wf50.median).toFixed(2) + '×). ' +
      'The fit explains little and the page says so: the typical miss is still about threefold.</p>' +
      '<p><b>Launch odds.</b> The ' + esc(odds.chosen) + ' model won the 5-fold time-ordered cross-validation on log-loss (global ' + odds.global + ' launch rate as the prior). ' +
      'Odds are the share of same-age-band peers that already have a priced token, shrunk toward the global rate.</p>' +
      '<table class="mini"><thead><tr><th>Odds model</th><th>Log-loss</th><th>Brier</th></tr></thead><tbody>' + cv + '</tbody></table>' +
      '<table class="mini"><thead><tr><th>Age band</th><th>Launch odds</th><th>Protocols</th></tr></thead><tbody>' + bands + '</tbody></table>' +
      '<p><b>Uncertainty.</b> Every pre-token row carries an 80% conformal range from the leave-one-out residuals (×' + Math.exp(f.conformal_q80).toFixed(1) +
      ' either way) and the rank range that interval implies — a point value alone would pretend the model knows more than it does.</p>' +
      '<p><b>Farm economics.</b> Each plan is netted in dollars: deposit (sized so gas stays under 5% of it), total gas, hours, break-even airdrop (gas alone), and expected value per hour ' +
      'under the stated assumption that one farmer captures at most 0.1% of the row’s low-end implied value. Worth means ≥ $25/hour, marginal ≥ $5/hour, low below that. ' +
      'Trading rows have no launch to farm: their steps earn fees instead, and their implied value is $1 — no launch left — with the realized market cap shown beside it.</p>' +
      '<p><b>Tiers.</b> Pre-token rows are protocols with no token record that could plausibly launch one. No-launch rows are pre-token but wrapped, staked, bridged, versioned or exchange products ' +
      '(odds set to 1% by rule, never by name). Trading rows record a token already: their value is the market’s, not the model’s.</p></section>';
  }

  function controlsHtml() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (a, r) { return a.concat(r.chains); }, []))).sort();
    var tabs = [['pre-token', 'Pre-token'], ['non-launch', 'No launch'], ['trading', 'Already trading'], ['all', 'All 758']];
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Name, slug, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat">' + '<option value="all">All categories</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain">' + '<option value="all">All chains</option>' + chains.map(function (c) { return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Watchlist only</label><button type="button" class="tab" id="watch" aria-pressed="' + state.watch + '">' + (state.watch ? 'Watchlist ✓' : 'Watchlist') + '</button></div>' +
      '</div><div class="tabs">' + tabs.map(function (t) { return '<button type="button" class="tab" data-tab="' + t[0] + '" aria-pressed="' + (state.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div>';
  }

  function sortHead(key, label) {
    var arrow = state.sort === key ? (state.dir < 0 ? ' ▼' : ' ▲') : '';
    return '<th><button type="button" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }

  function tableHtml(list) {
    if (!list.length) return '<div class="empty"><h2>No protocol matches that filter</h2><p>Clear the search or pick another category to see the board again.</p></div>';
    var body = list.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '"><td>' + r.rank + (r.watchlist ? ' ★' : '') + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span><br><span class="slug">' + esc(r.slug) + ' · ' + esc(r.category || 'Other') + ' · ' + esc(r.chains.slice(0, 2).join(', ')) + '</span></td>' +
        '<td>' + usd(r.tvl_usd) + '</td><td>' + pct(r.change_7d) + '</td><td>' + ageText(r.age_days) + '</td>' +
        '<td>' + (r.status === 'trading' ? '—' : (r.odds * 100).toFixed(1) + '%') + '</td>' +
        '<td><b>' + usd(r.implied_value_usd) + '</b>' + (r.status === 'trading' ? '<span class="range">realized ' + (r.mcap_usd != null ? usd(r.mcap_usd) : 'not recorded') + '</span>' : '<span class="range">' + usd(r.value_lo_usd) + ' – ' + usd(r.value_hi_usd) + ' · ranks ' + r.rank_hi + '–' + r.rank_lo + '</span>') + '</td>' +
        '<td>' + statusPill(r) + '</td><td>' + verdictPill(r) + '</td></tr>';
    }).join('');
    return '<table class="board"><thead><tr>' + sortHead('implied', 'Rank') + sortHead('name', 'Protocol') + sortHead('tvl', 'TVL') + sortHead('growth', '7d') + sortHead('age', 'Age') + sortHead('odds', 'Odds') + sortHead('implied', 'Implied value') + '<th>Status</th><th>Farm</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function detailHtml(r) {
    var f = r.farm;
    var farmKv = r.status === 'trading'
      ? '<p class="note">This protocol already trades. There is no token launch left to farm; the plan below earns fees from the protocol instead, and the implied value is $1 because no launch remains. Realized market cap: ' + (r.mcap_usd != null ? usdFull(r.mcap_usd) : 'not recorded') + '.</p>'
      : '<div class="kv">' +
        '<div><b>' + usdFull(f.deposit_usd) + '</b><span>deposit (gas stays under 5% of it)</span></div>' +
        '<div><b>' + usdFull(f.gas_usd) + '</b><span>total gas</span></div>' +
        '<div><b>' + f.hours + ' h</b><span>total time</span></div>' +
        '<div><b>' + usdFull(f.cost_per_hour_usd) + '/h</b><span>cost per hour</span></div>' +
        '<div><b>' + usdFull(f.break_even_usd) + '</b><span>break-even airdrop</span></div>' +
        '<div><b>' + usdFull(f.min_deposit_usd) + '</b><span>minimum viable deposit</span></div>' +
        '<div><b>$' + f.ev_per_hour_usd.toFixed(2) + '/h</b><span>expected value per hour (≤0.1% of low-end value to one farmer)</span></div>' +
        '<div><b>' + f.verdict + '</b><span>farm verdict</span></div></div>';
    return '<div class="detail-inner"><button type="button" class="close" id="close-detail">Close</button>' +
      '<h2>' + esc(r.name) + '</h2><p class="meta">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'Other') + ' · ' + esc(r.chains.join(', ')) + ' · ' + statusPill(r) + (r.watchlist ? ' ★ watchlist' : '') + '</p>' +
      '<div class="kv">' +
      '<div><b>' + usdFull(r.implied_value_usd) + '</b><span>implied value</span></div>' +
      '<div><b>' + usd(r.value_lo_usd) + ' – ' + usd(r.value_hi_usd) + '</b><span>80% conformal range</span></div>' +
      '<div><b>#' + r.rank_hi + ' – #' + r.rank_lo + '</b><span>rank range</span></div>' +
      '<div><b>' + usd(r.tvl_usd) + '</b><span>TVL</span></div>' +
      '<div><b>' + pct(r.change_7d) + '</b><span>7-day TVL change</span></div>' +
      '<div><b>' + ageText(r.age_days) + '</b><span>age' + (r.listed_at ? ' (since ' + esc(r.listed_at) + ')' : '') + '</span></div>' +
      '<div><b>' + (r.status === 'trading' ? '—' : (r.odds * 100).toFixed(1) + '%') + '</b><span>launch odds</span></div>' +
      '<div><b>' + (r.mcap_usd != null ? usd(r.mcap_usd) : '—') + '</b><span>realized market cap</span></div></div>' +
      '<h3>Farm economics</h3>' + farmKv +
      '<h3>Farm plan</h3><ol class="steps">' + r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></div>';
  }

  var dialog;
  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.innerHTML = detailHtml(row);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    var c = document.getElementById('close-detail');
    if (c) c.addEventListener('click', function () { dialog.close(); });
  }
  function render() {
    var list = rows();
    app.innerHTML = '<div class="wrap">' + headerHtml() + checksHtml() + methodHtml() + controlsHtml() +
      '<p class="count">Showing ' + list.length + ' of ' + DATA.rows.length + ' rows. Click a row for its detail view, farm economics and plan.</p>' +
      tableHtml(list) +
      '<footer>Data: DefiLlama protocols snapshot ' + esc(DATA.as_of) + ' (' + esc(DATA.source) + '). ' +
      'Values are a model’s estimate, not a promise: the typical miss is about threefold, which is why every row carries a range. ' +
      'Nothing here is financial advice.</footer></div>';
    app.setAttribute('aria-busy', 'false');
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = document.getElementById('chain');
    if (ch) ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var w = document.getElementById('watch');
    if (w) w.addEventListener('click', function () { state.watch = !state.watch; writeHash(); render(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); writeHash(); render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sort === k) state.dir = -state.dir;
        else { state.sort = k; state.dir = -1; }
        writeHash(); render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
    });
    if (state.selected) {
      var sel = DATA.rows.filter(function (r) { return r.slug === state.selected; })[0];
      if (sel) openDetail(state.selected);
    }
  }

  dialog = document.createElement('dialog');
  dialog.className = 'detail';
  dialog.id = 'detail';
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  document.body.appendChild(dialog);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
  readHash();
  render();
})();
