// Token Launch Radar — the scoring model.
//
// One sealed DefiLlama snapshot goes in; one ranked board comes out. The board
// is only the protocols that record no token: the radar's job is to find the
// launches that have not happened yet, not to re-rank tokens that already
// trade. A protocol that already records a token is left off the board
// entirely — no dampener can honestly put a $100B token protocol below a $5M
// pre-token one on a board ordered by value, so the separation is done by
// exclusion and stated on the dashboard, not by a penalty inside the ranking.
//
// An implied value is built from the snapshot's own numbers only:
//
//   implied = TVL x category multiple x size dampener x growth x age
//
//   category multiple  what launched tokens in the same category trade at
//                      per dollar of TVL (0.80-1.15); a rate per category,
//                      never a list of names.
//   size dampener      (TVL / $100M)^-0.12, clamped to 0.65-1.25: a dollar
//                      of TVL counts for less at $2B than at $50M.
//   growth             1 + 0.6 x clamp(change_7d, -25, +40) / 100; a missing
//                      7-day change counts as zero.
//   age                0.88 + 0.12 x min(age in years, 4) / 4; a missing
//                      first-tracked date is neutral (1.00). Older is more
//                      credible, but only a little: age is the weakest term.
//
// Nothing here is keyed to a protocol's name, and every row is scored by the
// same function. Equal implied values break ties by slug, so the board never
// depends on sort stability or on the order the snapshot lists protocols.

/** One protocol as the sealed snapshot carries it: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The terms behind one protocol's implied value, for the detail view. */
export interface ValueTerms {
  implied: number;
  categoryMultiple: number;
  sizeDampener: number;
  growthFactor: number;
  ageFactor: number;
  ageYears: number | null;
}

/** One row of board.json. */
export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_years: number | null;
  pre_token: boolean;
  on_watchlist: boolean;
  implied_value_usd: number;
  value_breakdown: {
    tvl_usd: number;
    category_multiple: number;
    size_dampener: number;
    growth_factor: number;
    age_factor: number;
    token_penalty: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact dataset: one tuple per row, no farm plans. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  rows: Array<[number, string, string, string | null, string[], number, number | null, number | null, number, number, number, number, number, number, number]>;
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 24 * 3600 * 1000;
const YEAR_MS = 365.25 * DAY_MS;

/** Clamp a number into [lo, hi]. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Round to three decimals, for the breakdown the detail view shows. */
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Years from a first-tracked day to the snapshot day; null when unrecorded. */
export function ageInYears(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const first = new Date(`${listedAt}T00:00:00Z`).getTime();
  const snap = new Date(`${asOf}T00:00:00Z`).getTime();
  if (!Number.isFinite(first) || snap < first) return 0;
  return (snap - first) / YEAR_MS;
}

/** The category rate, or the default for a category with no rate of its own. */
const CATEGORY_RATE: Record<string, number> = {
  'Risk Curators': 1.15,
  RWA: 1.05,
  'Onchain Capital Allocator': 1.05,
  Chain: 1.0,
  Lending: 0.95,
  'Basis Trading': 0.95,
  CDP: 0.9,
  Yield: 0.9,
  'Yield Aggregator': 0.9,
  'Prediction Market': 0.9,
  Dexs: 0.85,
  Derivatives: 0.85,
  Restaking: 0.8,
};

function categoryRate(category: string | null): number {
  return (category !== null && CATEGORY_RATE[category]) || 0.8;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** Categories the radar never ranks: bridges, staking products and exchanges. */
const BARRED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names: a protocol starting with one is the exchange's own product. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A name ending in a version marker is a versioned copy, not a protocol. */
const VERSIONED_NAME = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/**
 * Whether a protocol belongs on the board: pre-token, in a rankable category,
 * not a versioned copy, not a wrapped or staked product of a token that
 * already trades, and not an exchange's own product.
 */
export function isEligible(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && BARRED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED_NAME.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** One protocol's implied value and its terms, from the snapshot alone. */
export function valueOf(p: SnapshotProtocol, asOf: string): ValueTerms {
  const cm = categoryRate(p.category);
  const size = clamp(Math.pow(p.tvl_usd / 1e8, -0.12), 0.65, 1.25);
  const change = typeof p.change_7d === 'number' ? clamp(p.change_7d, -25, 40) : 0;
  const growth = 1 + (0.6 * change) / 100;
  const years = ageInYears(asOf, p.listed_at);
  const age = years === null ? 1.0 : 0.88 + (0.12 * Math.min(years, 4)) / 4;
  const penalty = isPreToken(p) ? 1 : 0.07;
  const implied = Math.max(1, Math.round(p.tvl_usd * cm * size * growth * age * penalty));
  return { implied, categoryMultiple: cm, sizeDampener: size, growthFactor: growth, ageFactor: age, ageYears: years };
}

/** The one action a category's farm plan revolves around. */
function actionVerb(category: string | null): string {
  switch (category) {
    case 'Lending':
      return 'lend and borrow';
    case 'Dexs':
      return 'swap and provide liquidity';
    case 'Risk Curators':
      return 'deposit into a curated vault';
    case 'RWA':
      return 'hold tokenised real-world assets';
    case 'Yield':
    case 'Yield Aggregator':
      return 'deposit into a yield strategy';
    case 'Derivatives':
      return 'open a hedged derivatives position';
    case 'CDP':
    case 'CDP Manager':
      return 'mint against collateral';
    case 'Prediction Market':
      return 'trade outcome shares';
    case 'Chain':
      return 'bridge assets and transact on the chain';
    default:
      return 'use the protocol';
  }
}

/**
 * One protocol's farm plan: six concrete steps, each with what it costs and
 * how long it takes. The steps are shaped by the protocol's own record
 * (category, first chain, name), never by a hand-written list of names, and
 * they promise no airdrop, price or date.
 */
export function farmSteps(p: SnapshotProtocol): string[] {
  const chain = (p.chains !== null && p.chains.length > 0 && p.chains[0]) || 'Ethereum';
  const verb = actionVerb(p.category);
  const name = p.name;
  const cat = p.category || 'DeFi';
  return [
    `Set up a fresh wallet for ${name} and fund it with $100-$500 on ${chain}; keep $10-$20 aside for gas, and never reuse an exchange hot wallet for farming.`,
    `Bridge or buy the assets you need on ${chain}, then ${verb} on ${name} with a first $50-$200 position to learn the flow before sizing up.`,
    `Grow the position to $200-$1,000 over 2-4 weeks, splitting it across 2-3 actions (deposit, then a second interaction a week later) so activity looks sustained, not one-off.`,
    `Use the ${cat} feature at least once a week for 4-8 weeks: repeat the core action, check the position, and keep a small running note of dates, amounts and transaction hashes.`,
    `Join ${name}'s public community and governance channels, vote or comment when a proposal is live, and watch for official quests or points programmes before acting on rumours.`,
    `After 8-12 weeks, review the position: harvest or restake any rewards, keep the principal deployed while the protocol is active, and exit only if fees exceed the position's yield.`,
  ];
}

/** One board row's compact form for data.js. */
function compactRow(row: BoardRow): RadarData['rows'][number] {
  return [
    row.rank,
    row.slug,
    row.name,
    row.category,
    row.chains,
    row.tvl_usd,
    row.change_7d,
    row.age_years,
    row.implied_value_usd,
    row.pre_token ? 1 : 0,
    row.on_watchlist ? 1 : 0,
    row.value_breakdown.category_multiple,
    round3(row.value_breakdown.size_dampener),
    round3(row.value_breakdown.growth_factor),
    round3(row.value_breakdown.age_factor),
  ];
}

/**
 * Score the snapshot: every eligible protocol ranked by implied value, most
 * valuable first, ranks 1..n. The board is exactly the eligible set — the
 * watchlist is its floor, and the eligible protocols below the floor are the
 * early rows the radar exists to find.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isEligible)
    .map((p) => ({ p, v: valueOf(p, snapshot.as_of) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  const board: BoardRow[] = scored.map((s, i) => {
    const p = s.p;
    const v = s.v;
    return {
      slug: p.slug,
      name: p.name,
      rank: i + 1,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_years: v.ageYears === null ? null : Math.round(v.ageYears * 100) / 100,
      pre_token: isPreToken(p),
      on_watchlist: watchlist.has(p.slug),
      implied_value_usd: v.implied,
      value_breakdown: {
        tvl_usd: p.tvl_usd,
        category_multiple: v.categoryMultiple,
        size_dampener: round3(v.sizeDampener),
        growth_factor: round3(v.growthFactor),
        age_factor: round3(v.ageFactor),
        token_penalty: isPreToken(p) ? 1 : 0.07,
      },
      farm_steps: farmSteps(p),
    };
  });
  return {
    board,
    radar: { as_of: snapshot.as_of, floor_usd: snapshot.floor_usd, rows: board.map(compactRow) },
  };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols: SnapshotProtocol[] = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/**
 * Why a board is not one the gate will take, or null: watchlist coverage,
 * ranks 1..n, implied value not rising with rank, no shared value across the
 * whole board, and farm steps in shape.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) {
      return `${r.slug} has ${r.farm_steps.length} farm steps`;
    }
    for (const s of r.farm_steps) {
      const n = s.trim().length;
      if (n < 20 || n > 600) return `${r.slug} has a farm step of ${n} characters`;
    }
  }
  return null;
}

/** The compact dataset as one script the page loads with no fetch: `window.RADAR_DATA`. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR_DATA=${JSON.stringify(radar)};\n`;
}
