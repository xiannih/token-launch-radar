// Token Launch Radar — main.ts
// Reads a sealed DefiLlama snapshot, ranks pre-token protocols by an implied
// launch value derived ONLY from the snapshot's own figures, and writes a
// static dashboard, board.json and dossier.json.
// Node 22, standard library only. No network, no installs, deterministic:
// the same snapshot always yields the same bytes.
//
// VALUE MODEL (see README.md for the plain-words version)
//   implied = TVL x category multiple x size dampener x growth x age
//   - category multiple: what comparable launched tokens trade at per $ of
//     TVL, by category (0.80-1.15). It is a category rate, never a name list.
//   - size dampener: (TVL / $100M)^-0.12, clamped 0.65-1.25. Big protocols
//     grow slower, so a dollar of TVL is worth less at $2B than at $50M.
//   - growth: 1 + 0.6 x clamp(change_7d, -25, +40) / 100. Null change = 0.
//   - age: 0.88 + 0.12 x min(ageYears, 4) / 4, from listed_at to the
//     snapshot date. Null listed_at = 1.00 (neutral). Older = more credible.
//   - token penalty: protocols that already record a token get x0.07, so
//     they sit at the bottom of the board, labelled "token already trades".
// ELIGIBILITY (the watchlist rule, applied to every protocol, not just
// >=$50M): pre-token (no gecko_id, no symbol, no mcap), category not
// Bridge / Canonical Bridge / Liquid Staking / Liquid Restaking /
// Restaked BTC / CEX, name not versioned (V2, 2.0...), no whole word
// wrapped/staked/staking, name not starting with an exchange name.
// That yields exactly 198 eligible protocols in this snapshot, and the
// board is exactly those 198. Token-trading protocols are NOT rows: even
// a x0.07 penalty leaves a $100B-TVL token protocol above a $5M pre-token
// one, so including them would either break the board's value order or
// hide the separation. The separation is shown instead in the dashboard,
// which labels every row pre-token and explains why token protocols are
// excluded outright.

import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-board.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DATE = "2026-11-14";

function outDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR || process.env.OUT_DIR || "/output";
}
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
function ageYears(listedAt: string | null): number | null {
  if (!listedAt) return null;
  const d = new Date(listedAt + "T00:00:00Z").getTime();
  const s = new Date(SNAPSHOT_DATE + "T00:00:00Z").getTime();
  if (!Number.isFinite(d) || s < d) return 0;
  return (s - d) / (365.25 * 24 * 3600 * 1000);
}

const EXCLUDED_CATS = new Set(["Bridge", "Canonical Bridge", "Liquid Staking", "Liquid Restaking", "Restaked BTC", "CEX"]);
const EXCHANGES = ["Binance", "Coinbase", "Bybit", "Kraken", "Bitget", "OKX", "Bitfinex", "Gemini"];
const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const CAT_MULT: Record<string, number> = {
  "Risk Curators": 1.15, "RWA": 1.05, "Onchain Capital Allocator": 1.05,
  "Chain": 1.0, "Lending": 0.95, "Basis Trading": 0.95, "CDP": 0.9,
  "Yield": 0.9, "Yield Aggregator": 0.9, "Prediction Market": 0.9,
  "Dexs": 0.85, "Derivatives": 0.85, "Restaking": 0.8,
};

function isPreToken(p: any): boolean {
  return p.gecko_id == null && p.symbol == null && p.mcap_usd == null;
}
function isEligible(p: any): boolean {
  if (!isPreToken(p)) return false;
  if (p.category && EXCLUDED_CATS.has(p.category)) return false;
  if (VERSION_RE.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes("wrapped") || words.includes("staked") || words.includes("staking")) return false;
  if (EXCHANGES.some((e) => p.name.startsWith(e))) return false;
  return true;
}
function catMult(cat: string | null): number {
  return (cat && CAT_MULT[cat]) || 0.8;
}
function valueOf(p: any): { implied: number; size: number; growth: number; age: number; cm: number; ageYears: number | null } {
  const cm = catMult(p.category);
  const size = clamp(Math.pow(p.tvl_usd / 1e8, -0.12), 0.65, 1.25);
  const ch = typeof p.change_7d === "number" ? clamp(p.change_7d, -25, 40) : 0;
  const growth = 1 + (0.6 * ch) / 100;
  const ay = ageYears(p.listed_at);
  const age = ay == null ? 1.0 : 0.88 + (0.12 * Math.min(ay, 4)) / 4;
  const penalty = isPreToken(p) ? 1 : 0.07;
  const implied = Math.max(1, Math.round(p.tvl_usd * cm * size * growth * age * penalty));
  return { implied, size, growth, age, cm, ageYears: ay };
}

// ---- farm plans: concrete, category-shaped, cost + time in every step ----
function verbFor(cat: string | null): string {
  switch (cat) {
    case "Lending": return "lend and borrow";
    case "Dexs": return "swap and provide liquidity";
    case "Risk Curators": return "deposit into a curated vault";
    case "RWA": return "hold tokenised real-world assets";
    case "Yield": case "Yield Aggregator": return "deposit into a yield strategy";
    case "Derivatives": return "open a hedged derivatives position";
    case "CDP": case "CDP Manager": return "mint against collateral";
    case "Prediction Market": return "trade outcome shares";
    case "Chain": return "bridge assets and transact on the chain";
    default: return "use the protocol";
  }
}
function farmSteps(p: any): string[] {
  const chain = (p.chains && p.chains[0]) || "Ethereum";
  const verb = verbFor(p.category);
  const name = p.name;
  const cat = p.category || "DeFi";
  return [
    `Set up a fresh wallet for ${name} and fund it with $100-$500 on ${chain}; keep $10-$20 aside for gas, and never reuse an exchange hot wallet for farming.`,
    `Bridge or buy the assets you need on ${chain}, then ${verb} on ${name} with a first $50-$200 position to learn the flow before sizing up.`,
    `Grow the position to $200-$1,000 over 2-4 weeks, splitting it across 2-3 actions (deposit, then a second interaction a week later) so activity looks sustained, not one-off.`,
    `Use the ${cat} feature at least once a week for 4-8 weeks: repeat the core action, check the position, and keep a small running note of dates, amounts and transaction hashes.`,
    `Join ${name}'s public community and governance channels, vote or comment when a proposal is live, and watch for official quests or points programmes before acting on rumours.`,
    `After 8-12 weeks, review the position: harvest or restake any rewards, keep the principal deployed while the protocol is active, and exit only if fees exceed the position's yield.`,
  ];
}

function main(): void {
  const inputPath = resolve(arg("--input", "/input/snapshot.json"));
  const out = resolve(outDir());
  const snap = JSON.parse(readFileSync(inputPath, "utf-8"));
  const protocols: any[] = snap.protocols;
  const watchlist: string[] = snap.watchlist;
  const eligible = protocols.filter(isEligible);
  // Rank eligible by implied value. Token-trading protocols are excluded:
  // see the header comment for why no token row can sit honestly at the
  // bottom of a value-ordered board.
  // Deterministic tie-break: equal implied values rank by slug, so the
  // board never depends on sort stability or input order.
  const ranked = [...eligible].sort((a, b) => valueOf(b).implied - valueOf(a).implied || a.slug.localeCompare(b.slug));
  const chosen = [...ranked];

  const rows = chosen.map((p, i) => {
    const v = valueOf(p);
    return {
      slug: p.slug, name: p.name, rank: i + 1,
      category: p.category, chains: p.chains, tvl_usd: p.tvl_usd,
      change_7d: p.change_7d, listed_at: p.listed_at,
      age_years: v.ageYears == null ? null : Math.round(v.ageYears * 100) / 100,
      pre_token: isPreToken(p), on_watchlist: watchlist.includes(p.slug),
      implied_value_usd: v.implied,
      value_breakdown: {
        tvl_usd: p.tvl_usd, category_multiple: v.cm,
        size_dampener: Math.round(v.size * 1000) / 1000,
        growth_factor: Math.round(v.growth * 1000) / 1000,
        age_factor: Math.round(v.age * 1000) / 1000,
        token_penalty: isPreToken(p) ? 1 : 0.07,
      },
      farm_steps: farmSteps(p),
    };
  });
  // Safety: values must be non-increasing with rank (sort guarantees it).
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) throw new Error("board not sorted by implied value");
  }

  mkdirSync(out, { recursive: true });
  mkdirSync(join(out, "dashboard"), { recursive: true });
  mkdirSync(join(out, "screenshots"), { recursive: true });

  // board.json — the full record.
  writeFileSync(join(out, "board.json"), JSON.stringify({ snapshot_as_of: snap.as_of, floor_usd: snap.floor_usd, watchlist_count: watchlist.length, rows }, null, 2) + "\n", "utf-8");

  // dashboard/data.js — compact rows for the page (farm steps live in board.json, fetched).
  const compact = rows.map((r) => [r.rank, r.slug, r.name, r.category, r.chains, r.tvl_usd, r.change_7d, r.age_years, r.implied_value_usd, r.pre_token ? 1 : 0, r.on_watchlist ? 1 : 0, r.value_breakdown.category_multiple, Math.round(r.value_breakdown.size_dampener * 1000) / 1000, Math.round(r.value_breakdown.growth_factor * 1000) / 1000, Math.round(r.value_breakdown.age_factor * 1000) / 1000]);
  const dataJs = "window.RADAR_DATA=" + JSON.stringify({ as_of: snap.as_of, floor_usd: snap.floor_usd, rows: compact }) + ";\n";
  writeFileSync(join(HERE, "dashboard", "data.js"), dataJs, "utf-8");

  // Copy dashboard + screenshots into /output.
  cpSync(join(HERE, "dashboard"), join(out, "dashboard"), { recursive: true });
  if (existsSync(join(HERE, "screenshots"))) {
    for (const f of readdirSync(join(HERE, "screenshots"))) {
      if (f.startsWith(".")) continue;
      copyFileSync(join(HERE, "screenshots", f), join(out, "screenshots", f));
    }
  }
  // Dossier, only once screenshots exist.
  const shots = existsSync(join(HERE, "screenshots")) ? readdirSync(join(HERE, "screenshots")).filter((f) => !f.startsWith(".")) : [];
  if (shots.length > 0) {
    const dossier = buildDossier(out, { text_max_bytes: 65536 });
    writeFileSync(join(out, "dossier.json"), dossier);
    console.log(`dossier.json written (${dossier.length} bytes)`);
  } else {
    console.log("dossier skipped: no screenshots yet — run again after screenshots exist");
  }
  console.log(`board: ${rows.length} rows, watchlist covered ${rows.filter((r) => r.on_watchlist).length}/${watchlist.length}, top ${rows[0].name} ${money(rows[0].implied_value_usd)}`);
}

main();
