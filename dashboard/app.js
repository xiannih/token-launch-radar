// Token Launch Radar — page logic. Data comes from data.js (compact rows);
// farm steps come from board.json, fetched relatively, with a plain fallback.
const D = window.RADAR_DATA;
const rows = D.rows.map(r => ({ rank: r[0], slug: r[1], name: r[2], category: r[3] || "—", chains: r[4], tvl: r[5], ch7: r[6], age: r[7], value: r[8], pre: r[9] === 1, watch: r[10] === 1, cm: r[11], size: r[12], growth: r[13], ageF: r[14] }));
let boardBySlug = null;
fetch("../board.json").then(r => r.json()).then(j => { boardBySlug = {}; j.rows.forEach(x => boardBySlug[x.slug] = x); }).catch(() => {});
const $ = id => document.getElementById(id);
const money = n => n >= 1e9 ? "$" + (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? "$" + (n / 1e6).toFixed(1) + "M" : "$" + Math.round(n).toLocaleString("en-US");
const fmtAge = a => a == null ? "—" : a < 1 ? Math.round(a * 12) + " mo" : a.toFixed(1) + " y";
const fmtCh = c => c == null ? "—" : (c > 0 ? "+" : "") + c.toFixed(1) + "%";
function fillSelects() {
  const cats = [...new Set(rows.map(r => r.category))].sort();
  cats.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; $("cat").appendChild(o); });
  const chs = [...new Set(rows.flatMap(r => r.chains))].sort();
  chs.forEach(c => { const o = document.createElement("option"); o.value = c; o.textContent = c; $("chain").appendChild(o); });
}
let sortKey = "value";
function filtered() {
  const q = $("q").value.trim().toLowerCase(), cat = $("cat").value, ch = $("chain").value;
  let list = rows.filter(r =>
    (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (!cat || r.category === cat) && (!ch || r.chains.includes(ch)) &&
    (!$("preOnly").checked || r.pre) && (!$("watchOnly").checked || r.watch));
  const k = $("sort").value;
  const cmp = { value: (a, b) => b.value - a.value, tvl: (a, b) => b.tvl - a.tvl, growth: (a, b) => (b.ch7 || 0) - (a.ch7 || 0), age: (a, b) => (b.age || 0) - (a.age || 0), name: (a, b) => a.name.localeCompare(b.name) }[k];
  return list.sort(cmp);
}
function render() {
  const list = filtered();
  $("count").textContent = list.length + " of " + rows.length + " shown";
  $("rows").innerHTML = list.map(r => `<tr data-slug="${r.slug}" class="${window._sel === r.slug ? "sel" : ""}">
    <td>${r.rank}</td><td><b>${r.name}</b>${r.watch ? ' <span class="badge watch">WATCHLIST</span>' : ""}<br><span style="color:var(--mut);font-size:12px">${r.slug}</span></td>
    <td>${r.category}</td><td>${r.chains.slice(0, 3).join(", ")}${r.chains.length > 3 ? " +" + (r.chains.length - 3) : ""}</td>
    <td class="num">${money(r.tvl)}</td><td class="num ${r.ch7 > 0 ? "pos" : r.ch7 < 0 ? "neg" : ""}">${fmtCh(r.ch7)}</td>
    <td class="num">${fmtAge(r.age)}</td><td class="num"><b>${money(r.value)}</b></td>
    <td><span class="badge ${r.pre ? "pre" : "tok"}">${r.pre ? "NO TOKEN" : "TOKEN TRADES"}</span></td></tr>`).join("");
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
  $("detail").innerHTML = `<h2>${r.name}</h2><p class="meta">#${r.rank} &middot; ${r.category} &middot; ${r.chains.join(", ")} &middot; ${r.watch ? "Watchlist" : "Below the $50M floor"} &middot; ${r.pre ? "Records no token" : "Token already trades"}</p>
  <p>Implied launch value <b style="font-size:20px;color:var(--amber)">${money(r.value)}</b> on TVL ${money(r.tvl)}.</p>
  <h3>Value breakdown</h3>
  ${bar("Category ×" + r.cm, r.cm, 1.2, "×" + r.cm.toFixed(2))}
  ${bar("Size dampener", r.size, 1.25, "×" + r.size.toFixed(2))}
  ${bar("Growth ×" + r.growth, r.growth, 1.25, "×" + r.growth.toFixed(2))}
  ${bar("Age ×" + r.ageF, r.ageF, 1.0, "×" + r.ageF.toFixed(2))}
  <p style="color:var(--mut);font-size:13px">TVL ${money(r.tvl)} &middot; 7-day ${fmtCh(r.ch7)} &middot; age ${fmtAge(r.age)} &middot; ${r.pre ? "no token recorded (not proof it has none)" : "token recorded — launch value is residual only, ×0.07"}.</p>
  <h3>How to farm it</h3><ol>${steps.map(s => `<li>${s}</li>`).join("")}</ol>`;
  $("detail").scrollTop = 0;
}
window.openDetail = openDetail; window.renderRadar = render;
document.querySelectorAll("th[data-k]").forEach(th => th.onclick = () => { $("sort").value = th.dataset.k === "rank" ? "value" : th.dataset.k; render(); });
["q", "cat", "chain", "sort", "preOnly", "watchOnly"].forEach(id => $(id).addEventListener("input", render));
$("asof").textContent = D.as_of;
$("stRows").textContent = rows.length;
$("stWatch").textContent = rows.filter(r => r.watch).length + " / 40";
$("stPre").textContent = rows.filter(r => r.pre).length;
$("stTop").textContent = money(rows[0].value);
fillSelects(); render();
if (location.hash.startsWith("#/detail/")) openDetail(decodeURIComponent(location.hash.slice(9)));
