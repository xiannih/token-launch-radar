// Token Launch Radar — page logic. Data comes from data.js (compact rows
// plus the fitted model); farm steps come from board.json, fetched
// relatively, with a plain fallback.
const D = window.RADAR_DATA;
const M = D.meta;
const rows = D.rows.map(r => ({ rank: r[0], slug: r[1], name: r[2], category: r[3] || "—", chains: r[4], tvl: r[5], ch7: r[6], age: r[7], value: r[8], pre: r[9] === 1, watch: r[10] === 1, cm: r[11], size: r[12], growth: r[13], ageF: r[14], odds: r[15], cost: r[16], weeks: r[17], verdict: r[18] === 2 ? "worth" : r[18] === 1 ? "marginal" : "low" }));
let boardBySlug = null;
fetch("../board.json").then(r => r.json()).then(j => { boardBySlug = {}; j.rows.forEach(x => boardBySlug[x.slug] = x); }).catch(() => {});
const $ = id => document.getElementById(id);
const money = n => n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : "$" + Math.round(n).toLocaleString("en-US");
const fmtAge = a => a == null ? "—" : a < 1 ? Math.round(a * 12) + " mo" : a.toFixed(1) + " y";
const fmtCh = c => c == null ? "—" : (c > 0 ? "+" : "") + c.toFixed(1) + "%";
const fmtOdds = o => Math.round(o * 100) + "%";
const verdictLabel = v => v === "worth" ? "WORTH FARMING" : v === "marginal" ? "MARGINAL" : "LOW PRIORITY";
function fillMeta() {
  $("asof").textContent = D.as_of;
  $("stRows").textContent = rows.length;
  $("stWatch").textContent = rows.filter(r => r.watch).length + " / 40";
  $("stTop").textContent = money(rows[0].value);
  $("stHold").textContent = M.holdout.a_to_b.median_factor.toFixed(2) + "× / " + M.holdout.b_to_a.median_factor.toFixed(2) + "×";
  $("mGlobal").textContent = "×" + M.global_median.toFixed(3);
  $("mSize").textContent = M.size_exponent.toFixed(3);
  $("mGrowth").textContent = "k = " + M.growth_k.toFixed(2);
  $("mAge").textContent = M.age_slope.toFixed(3);
  $("mOdds").textContent = Math.round(M.global_token_rate * 100) + "%";
  $("mFitN").textContent = M.launched_fit;
  $("mHoldA").textContent = M.holdout.a_to_b.median_factor.toFixed(2);
  $("mHoldB").textContent = M.holdout.b_to_a.median_factor.toFixed(2);
  $("mBaseA").textContent = M.holdout.a_to_b.baseline_factor.toFixed(2);
  $("mBaseB").textContent = M.holdout.b_to_a.baseline_factor.toFixed(2);
  $("mZero").textContent = M.launched_zero_mcap;
  $("multRows").innerHTML = M.multiples.map(m => `<tr><td>${m.category}</td><td class="num">${m.launched}</td><td class="num">×${m.multiple.toFixed(3)}</td><td class="num">${fmtOdds(m.odds)}</td></tr>`).join("");
  $("exRows").innerHTML = M.excluded_top.map(e => `<tr><td><b>${e.name}</b>${e.category ? ' <span style="color:var(--mut)">· ' + e.category + '</span>' : ""}</td><td class="num">${money(e.tvl_usd)}</td><td class="num">${money(e.mcap_usd)}</td><td class="num">${e.ratio.toFixed(3)}</td></tr>`).join("");
}
function fillSelects() {
  const cats = [...new Set(rows.map(r => r.category))].sort();
  cats.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; $("cat").appendChild(o); });
  const chs = [...new Set(rows.flatMap(r => r.chains))].sort();
  chs.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; $("chain").appendChild(o); });
}
function filtered() {
  const q = $("q").value.trim().toLowerCase(), cat = $("cat").value, ch = $("chain").value;
  let list = rows.filter(r =>
    (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (!cat || r.category === cat) && (!ch || r.chains.includes(ch)) &&
    (!$("preOnly").checked || r.pre) && (!$("watchOnly").checked || r.watch));
  const k = $("sort").value;
  const cmp = { value: (a, b) => b.value - a.value, tvl: (a, b) => b.tvl - a.tvl, growth: (a, b) => (b.ch7 || 0) - (a.ch7 || 0), age: (a, b) => (b.age || 0) - (a.age || 0), odds: (a, b) => b.odds - a.odds, name: (a, b) => a.name.localeCompare(b.name) }[k];
  return list.sort(cmp);
}
function render() {
  const list = filtered();
  $("count").textContent = list.length + " of " + rows.length + " shown";
  $("rows").innerHTML = list.map(r => `<tr data-slug="${r.slug}" class="${window._sel === r.slug ? "sel" : ""}">
    <td>${r.rank}</td><td><b>${r.name}</b>${r.watch ? ' <span class="badge watch">WATCHLIST</span>' : ""}<br><span style="color:var(--mut);font-size:12px">${r.slug}</span></td>
    <td>${r.category}</td><td>${r.chains.slice(0, 3).join(", ")}${r.chains.length > 3 ? " +" + (r.chains.length - 3) : ""}</td>
    <td class="num">${money(r.tvl)}</td><td class="num ${r.ch7 > 0 ? "pos" : r.ch7 < 0 ? "neg" : ""}">${fmtCh(r.ch7)}</td>
    <td class="num">${fmtAge(r.age)}</td><td class="num">${fmtOdds(r.odds)}</td><td class="num"><b>${money(r.value)}</b></td>
    <td><span class="badge v-${r.verdict}">${verdictLabel(r.verdict)}</span><br><span style="color:var(--mut);font-size:12px">$${r.cost} · ${r.weeks}w</span></td></tr>`).join("");
  document.querySelectorAll("#rows tr").forEach(tr => tr.onclick = () => openDetail(tr.dataset.slug));
}
function bar(label, v, max, txt) {
  return `<div class="bar"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.round(100 * v / max)}%"></div></div><b>${txt}</b></div>`;
}
function openDetail(slug) {
  window._sel = slug; render();
  const r = rows.find(x => x.slug === slug); if (!r) return;
  const full = boardBySlug && boardBySlug[slug];
  const steps = full ? full.farm_steps : ["Farm steps are in board.json, loaded when this page is served with the board beside it."];
  const costLine = full ? `Farm cost <b>$${full.farm_cost_usd}</b> ($${full.farm_capital_usd} capital + $${full.farm_gas_usd} gas on ${r.chains[0] || "Ethereum"}) over <b>${full.farm_weeks} weeks</b> — verdict: <b>${verdictLabel(r.verdict)}</b>.` : `Farm cost $${r.cost} over ${r.weeks} weeks — verdict: ${verdictLabel(r.verdict)}.`;
  $("detail").innerHTML = `<h2>${r.name}</h2><p class="meta">#${r.rank} &middot; ${r.category} &middot; ${r.chains.join(", ")} &middot; ${r.watch ? "Watchlist" : "Not on watchlist"} &middot; ${r.pre ? "Records no token" : "Token already trades"}</p>
  <p>Expected launch value <b style="font-size:20px;color:var(--amber)">${money(r.value)}</b> on TVL ${money(r.tvl)}.</p>
  <h3>Value breakdown</h3>
  ${bar("Category ×" + r.cm, r.cm, 1.5, "×" + r.cm.toFixed(2))}
  ${bar("Size", r.size, 1.5, "×" + r.size.toFixed(2))}
  ${bar("Growth ×" + r.growth, r.growth, 1.25, "×" + r.growth.toFixed(2))}
  ${bar("Age ×" + r.ageF, r.ageF, 1.2, "×" + r.ageF.toFixed(2))}
  ${bar("Token odds", r.odds, 1, fmtOdds(r.odds))}
  <p style="color:var(--mut);font-size:13px">TVL ${money(r.tvl)} &middot; 7-day ${fmtCh(r.ch7)} &middot; age ${fmtAge(r.age)} &middot; ${fmtOdds(r.odds)} of its peers already record a token &middot; ${r.pre ? "no token recorded (not proof it has none)" : "token recorded — launch value is residual only"}.</p>
  <h3>How to farm it</h3><p style="font-size:13.5px">${costLine}</p><ol>${steps.map(s => `<li>${s}</li>`).join("")}</ol>`;
  $("detail").scrollTop = 0;
}
window.openDetail = openDetail; window.renderRadar = render;
document.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => { $("sort").value = th.dataset.k === "rank" ? "value" : th.dataset.k; render(); });
["q", "cat", "chain", "sort", "preOnly", "watchOnly"].forEach(id => $(id).addEventListener("input", render));
fillMeta(); fillSelects(); render();
if (location.hash.startsWith("#/detail/")) openDetail(decodeURIComponent(location.hash.slice(9)));
