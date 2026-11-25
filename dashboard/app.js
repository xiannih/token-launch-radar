// Token Launch Radar — dashboard logic. No network: every number comes from
// window.BOARD_DATA, written by the program next to this page. Views are
// chosen by the URL hash so the four screenshots are reproducible:
//   #board (default)  #detail=<slug>  #filtered  #method
(function () {
  var D = window.BOARD_DATA;
  if (!D) { document.body.innerHTML = '<p style="padding:32px">Board data failed to load.</p>'; return; }
  var rows = D.rows, meta = D.meta, comps = D.comps;
  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function usd(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function usdFull(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function pct(x) { return (x * 100).toFixed(1) + '%'; }
  function xfmt(x) { return '×' + x.toFixed(2); }

  // ---------------------------------------------------------- headline
  $('asof').textContent = meta.asOf;
  $('asof2').textContent = meta.asOf;
  $('kpi-total').textContent = meta.counts.total;
  $('kpi-pretoken').textContent = meta.counts.eligible;
  $('kpi-watchlist').textContent = meta.counts.watchlist + '/' + meta.counts.watchlist;
  $('kpi-fit').textContent = 'log(mcap) = ' + meta.fit.intercept.toFixed(2) + ' + ' + meta.fit.slope.toFixed(2) + '·log(TVL)';
  $('kpi-blind').textContent = xfmt(meta.blind.baseLooMed / meta.blind.looMed) + ' better';
  $('kpi-farm').textContent = meta.farmVerdicts.worth + ' worth · ' + meta.farmVerdicts.marginal + ' marginal';
  var topCur = meta.curator.beforeAfter[0];
  $('curator-text').textContent =
    meta.counts.curatorDiscounted + ' pre-token curator rows are halved because their TVL is nested inside other protocols. ' +
    'Sentora Curator falls from #' + topCur.beforeRank + ' (' + usdFull(topCur.beforeValue) + ') to #' + topCur.afterRank +
    ' (' + usdFull(topCur.afterValue) + '). The rule is by category, never by name.';

  // ---------------------------------------------------------- charts
  function scatterSvg() {
    var W = 640, H = 300, L = 56, R = 14, T = 12, B = 34;
    var xs = [], ys = [];
    comps.forEach(function (c) { xs.push(Math.log10(c.tvl)); ys.push(Math.log10(c.mcap)); });
    var pre = rows.filter(function (r) { return r.status === 'pre-token'; });
    pre.forEach(function (r) { xs.push(Math.log10(r.tvl_usd)); ys.push(Math.log10(r.implied_value_usd)); });
    var x0 = Math.floor(Math.min.apply(null, xs)), x1 = Math.ceil(Math.max.apply(null, xs));
    var y0 = Math.floor(Math.min.apply(null, ys)), y1 = Math.ceil(Math.max.apply(null, ys));
    var X = function (v) { return L + ((v - x0) / (x1 - x0)) * (W - L - R); };
    var Y = function (v) { return T + (1 - (v - y0) / (y1 - y0)) * (H - T - B); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scatter chart of TVL against value">';
    var t;
    for (t = x0; t <= x1; t++) {
      s += '<line x1="' + X(t) + '" y1="' + Y(y0) + '" x2="' + X(t) + '" y2="' + Y(y1) + '" stroke="#e5e8ea"/>';
      s += '<text x="' + X(t) + '" y="' + (H - 12) + '" font-size="10" fill="#5d6b7d" text-anchor="middle">10^' + t + '</text>';
    }
    for (t = y0; t <= y1; t++) {
      s += '<line x1="' + X(x0) + '" y1="' + Y(t) + '" x2="' + X(x1) + '" y2="' + Y(t) + '" stroke="#e5e8ea"/>';
      s += '<text x="' + (L - 8) + '" y="' + (Y(t) + 3) + '" font-size="10" fill="#5d6b7d" text-anchor="end">$10^' + t + '</text>';
    }
    // Fitted line: log10(mcap) = (a + b ln TVL) / ln 10.
    var ln10 = Math.LN10;
    var fy = function (lx) { return (meta.fit.intercept + meta.fit.slope * lx * ln10) / ln10; };
    s += '<line x1="' + X(x0) + '" y1="' + Y(fy(x0)) + '" x2="' + X(x1) + '" y2="' + Y(fy(x1)) + '" stroke="#0f766e" stroke-width="2" stroke-dasharray="6 4"/>';
    comps.forEach(function (c) {
      s += '<circle cx="' + X(Math.log10(c.tvl)).toFixed(1) + '" cy="' + Y(Math.log10(c.mcap)).toFixed(1) + '" r="2.4" fill="#9aa7b4"/>';
    });
    pre.forEach(function (r) {
      var ring = r.curator ? ' stroke="#b45309" stroke-width="1.6"' : '';
      s += '<circle cx="' + X(Math.log10(r.tvl_usd)).toFixed(1) + '" cy="' + Y(Math.log10(r.implied_value_usd)).toFixed(1) + '" r="3" fill="#0f766e"' + ring + '/>';
    });
    s += '<text x="' + (W / 2) + '" y="' + (H - 0) + '" font-size="0" fill="none"></text></svg>';
    return s;
  }

  function distSvg() {
    var W = 440, H = 300, L = 44, R = 12, T = 12, B = 34;
    var pre = rows.filter(function (r) { return r.status === 'pre-token'; });
    var vals = pre.map(function (r) { return Math.log10(r.implied_value_usd); });
    var lo = Math.floor(Math.min.apply(null, vals)), hi = Math.ceil(Math.max.apply(null, vals));
    var bins = 12, counts = [];
    var i;
    for (i = 0; i < bins; i++) counts.push(0);
    vals.forEach(function (v) {
      var b = Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins));
      counts[b]++;
    });
    var max = Math.max.apply(null, counts);
    var bw = (W - L - R) / bins;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Histogram of implied values">';
    for (i = 0; i < bins; i++) {
      var h = (counts[i] / max) * (H - T - B);
      var x = L + i * bw + 1;
      s += '<rect x="' + x.toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + (bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#0f766e"/>';
      if (counts[i] > 0) s += '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - B - h - 4).toFixed(1) + '" font-size="10" fill="#1c2430" text-anchor="middle">' + counts[i] + '</text>';
    }
    for (var t = lo; t <= hi; t++) {
      var tx = L + ((t - lo) / (hi - lo)) * (W - L - R);
      s += '<text x="' + tx.toFixed(1) + '" y="' + (H - 12) + '" font-size="10" fill="#5d6b7d" text-anchor="middle">$10^' + t + '</text>';
    }
    return s + '</svg>';
  }

  $('scatter').innerHTML = scatterSvg();
  $('dist').innerHTML = distSvg();

  // ---------------------------------------------------------- method tables
  $('m-formula').textContent =
    'implied = exp(' + meta.fit.intercept.toFixed(4) + ' + ' + meta.fit.slope.toFixed(4) + ' · ln TVL) × launch odds' +
    ' — fitted by least squares on the ' + meta.fit.n + ' protocols that record a market cap above zero.' +
    ' No-launch rows (a group that has almost never issued a token) use odds 0.01; already-trading rows sit at $1.' +
    ' Curator rows are then halved (see the curator table).';
  var blindRows = [
    ['Leave-one-out', meta.blind.looMed, meta.blind.baseLooMed],
    ['Walk-forward, last 30%', meta.blind.wf70Med, meta.blind.baseWf70Med],
    ['Walk-forward, last 50%', meta.blind.wf50Med, meta.blind.baseWf50Med],
  ];
  $('m-blind').querySelector('tbody').innerHTML = blindRows.map(function (r) {
    return '<tr><td>' + r[0] + '</td><td>' + xfmt(r[1]) + '</td><td>' + xfmt(r[2]) + '</td><td>' + xfmt(r[2] / r[1]) + ' better</td></tr>';
  }).join('');
  $('m-odds').querySelector('tbody').innerHTML = meta.oddsBands.map(function (b) {
    return '<tr><td>' + b.band + '–' + (b.band + 1) + ' years</td><td>' + b.n + '</td><td>' + b.launched + '</td><td>' + pct(b.odds) + '</td></tr>';
  }).join('') + '<tr><td>No listing date</td><td>—</td><td>—</td><td>' + pct(meta.globalOdds) + ' (global)</td></tr>';
  $('m-curator').querySelector('tbody').innerHTML = meta.curator.beforeAfter.slice(0, 6).map(function (c) {
    return '<tr><td>' + esc(c.name) + '</td><td>#' + c.beforeRank + ' · ' + usdFull(c.beforeValue) + '</td><td>#' + c.afterRank + ' · ' + usdFull(c.afterValue) + '</td></tr>';
  }).join('');
  $('m-checks').innerHTML = meta.selfChecks.map(function (c) {
    return '<li class="' + (c.pass ? '' : 'fail') + '"><strong>' + esc(c.name) + ':</strong> ' + esc(c.detail) + '</li>';
  }).join('');

  // ---------------------------------------------------------- board table
  var cats = [];
  rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category); });
  cats.sort();
  $('category').innerHTML = '<option value="all">All categories</option>' + cats.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');

  function currentFilter() {
    return {
      q: $('q').value.trim().toLowerCase(),
      status: $('status').value,
      category: $('category').value,
      verdict: $('verdict').value,
      curatorOnly: $('curator-only').checked,
      watchlistOnly: $('watchlist-only').checked,
      sort: $('sort').value,
    };
  }
  function applyFilter(list, f) {
    var out = list.filter(function (r) {
      if (f.q && (r.name.toLowerCase().indexOf(f.q) === -1 && r.slug.indexOf(f.q) === -1)) return false;
      if (f.status !== 'all' && r.status !== f.status) return false;
      if (f.category !== 'all' && r.category !== f.category) return false;
      if (f.verdict !== 'all' && r.farm.verdict !== f.verdict) return false;
      if (f.curatorOnly && !r.curator) return false;
      if (f.watchlistOnly && !r.watchlist) return false;
      return true;
    });
    if (f.sort === 'tvl') out.sort(function (a, b) { return b.tvl_usd - a.tvl_usd; });
    else if (f.sort === 'ev') out.sort(function (a, b) { return b.farm.ev_per_hour_usd - a.farm.ev_per_hour_usd; });
    else if (f.sort === 'odds') out.sort(function (a, b) { return b.odds - a.odds; });
    else out.sort(function (a, b) { return a.rank - b.rank; });
    return out;
  }
  function renderTable() {
    var f = currentFilter();
    var list = applyFilter(rows, f);
    var shown = list.slice(0, 200);
    $('rows').innerHTML = shown.map(function (r) {
      var tags = (r.curator ? '<span class="tag curator">curator 0.5×</span>' : '') +
        (r.watchlist ? '<span class="tag watch">watchlist</span>' : '');
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' + tags + '<br><span style="color:#5d6b7d;font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td class="num">' + usd(r.tvl_usd) + '</td>' +
        '<td class="num val">' + usd(r.implied_value_usd) + '</td>' +
        '<td class="num">' + usd(r.value_lo_usd) + ' – ' + usd(r.value_hi_usd) + '</td>' +
        '<td class="num">' + (r.status === 'trading' ? '—' : pct(r.odds)) + '</td>' +
        '<td><span class="verdict ' + r.farm.verdict + '">' + r.farm.verdict + '</span></td>' +
        '<td class="num">$' + r.farm.ev_per_hour_usd.toFixed(2) + '</td>' +
        '</tr>';
    }).join('');
    $('showing').textContent = 'Showing ' + shown.length + ' of ' + list.length + ' matching rows (of ' + rows.length + ' on the board). Click a row for its detail and farm plan.';
    var sel = document.querySelector('#rows tr.selected');
    if (sel) sel.classList.add('selected');
  }
  function renderDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) { $('detail').hidden = true; return; }
    $('detail').hidden = false;
    $('d-name').textContent = '#' + r.rank + ' · ' + r.name;
    var cells = [
      [usdFull(r.implied_value_usd), 'implied launch value'],
      [usd(r.value_lo_usd) + ' – ' + usd(r.value_hi_usd), '80% range (×' + meta.blind.conformalBand.toFixed(2) + ')'],
      ['#' + r.rank_lo + ' – #' + r.rank_hi, 'rank range the value range implies'],
      [r.status === 'trading' ? 'already trading' : pct(r.odds), 'launch odds (peer rate)'],
      [usd(r.tvl_usd), 'TVL · ' + (r.change_7d == null ? '7d change n/a' : (r.change_7d * 100).toFixed(1) + '% in 7d')],
      [r.farm.verdict + ' · $' + r.farm.ev_per_hour_usd.toFixed(2) + '/h', 'farm verdict and expected value per hour'],
      ['$' + r.farm.deposit_usd + ' deposit · $' + r.farm.gas_usd.toFixed(2) + ' gas · ' + r.farm.hours + 'h', 'farm cost and time'],
      [r.farm.break_even_implied_usd == null ? 'n/a — token trades' : usdFull(r.farm.break_even_implied_usd), 'implied value at which farming breaks even'],
    ];
    $('d-grid').innerHTML = cells.map(function (c) {
      return '<div class="cell"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>';
    }).join('');
    $('d-steps').innerHTML = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('d-note').textContent =
      (r.curator ? 'Curator row: implied value halved (0.5×) because this TVL is nested inside the protocols it allocates to. ' : '') +
      (r.status === 'trading' ? 'This token already trades, so the row sits at $1 and the plan earns fees instead of chasing a launch. ' : '') +
      'Minimum viable deposit $' + r.farm.min_deposit_usd + ' (gas should stay under a tenth of the deposit). ' +
      'Expected airdrop value $' + r.farm.expected_airdrop_usd.toFixed(2) + ' after the 0.05% farmer-share assumption; net value $' + r.farm.net_value_usd.toFixed(2) + '.';
    var tr = document.querySelector('#rows tr[data-slug="' + r.slug + '"]');
    if (tr) tr.classList.add('selected');
  }

  ['q', 'status', 'category', 'verdict', 'curator-only', 'watchlist-only', 'sort'].forEach(function (id) {
    $(id).addEventListener('input', renderTable);
    $(id).addEventListener('change', renderTable);
  });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    location.hash = '#detail=' + tr.getAttribute('data-slug');
  });
  $('d-close').addEventListener('click', function () { location.hash = '#board'; });

  function route() {
    var h = location.hash || '#board';
    if (h.indexOf('#detail=') === 0) {
      renderTable();
      renderDetail(h.slice(8));
      $('detail').scrollIntoView();
    } else if (h === '#filtered') {
      $('status').value = 'pre-token';
      $('verdict').value = 'worth';
      $('sort').value = 'ev';
      renderTable();
      $('detail').hidden = true;
    } else if (h === '#method') {
      renderTable();
      $('detail').hidden = true;
      $('method').scrollIntoView();
    } else {
      renderTable();
      $('detail').hidden = true;
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();
