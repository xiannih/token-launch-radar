// Token Launch Radar — the scoring model, fitted from the snapshot itself.
//
// One sealed DefiLlama snapshot goes in; one ranked board comes out. The
// board holds only the protocols that record no token: the radar's job is to
// find the launches that have not happened yet, not to re-rank tokens that
// already trade. A protocol that already records a token is left off the
// board entirely — no dampener can honestly put a $100B token protocol below
// a $5M pre-token one on a board ordered by value, so the separation is done
// by exclusion, and the excluded protocols are listed on the dashboard with
// their market-cap-to-TVL ratios, so the separation is visible, not hidden.
//
// Nothing in the model is a hand-set constant for a name or a category.
// Every coefficient below is fitted at run time from the snapshot's own
// launched protocols (the ones that record a market cap), by the same code
// that scores the board:
//
//   implied = TVL x category multiple x size x growth x age x token odds
//
//   category multiple  the median market-cap-per-TVL of the launched
//                      protocols in the same category, shrunk toward the
//                      global median (three pseudo-protocols at the global
//                      rate) and clamped to 0.05-1.50. A category with no
//                      launched peer takes the global median.
//   size               (TVL / $100M) raised to the log-log slope of
//                      market-cap-per-TVL against TVL over the launched
//                      protocols, clamped to an exponent of -0.80..0 and a
//                      factor of 0.50-1.50. Big protocols trade at far
//                      lower multiples: the fitted slope is about -0.48.
//   growth             1 + k x clamp(7-day change, -25%, +40%) / 100,
//                      where k is fitted from the launched protocols that
//                      grew against the ones that shrank, clamped to
//                      0-1.50. On this snapshot the fitted k is 0: growing
//                      protocols did not trade at higher multiples, so the
//                      term stays 1.00 and the dashboard says so.
//   age                exp(slope x min(age in years, 4)), where slope is
//                      the log-slope of market-cap-per-TVL against age
//                      over the launched protocols, clamped to a factor of
//                      0.80-1.20. On this snapshot the slope is about
//                      -0.22 a year: younger protocols trade at higher
//                      multiples, so age is a small penalty, not a bonus.
//   token odds         the share of the protocol's peers (same category,
//                      same age band: under two years tracked, or two and
//                      over) that already record a token, shrunk toward
//                      the snapshot's overall launch rate with three
//                      pseudo-protocols. The implied value is an expected
//                      value: what the launch would be worth, times the
//                      chance a protocol like it launches at all.
//
// The fit is tested, not trusted: the launched protocols are split in half
// by slug (even and odd positions), the terms are fitted on one half and
// used to predict the other's market caps, and the median miss is reported
// on the dashboard and in the README — twice, once in each direction,
// beside the same miss from a global-median-only baseline. The miss is
// large (a few times over): market-cap-per-TVL is noisy, and the board is
// a ranking by the fitted median, never a price forecast.
//
// A farm plan per row carries a costed verdict: the gas for the protocol's
// first chain at that chain's per-transaction rate, a capital tier by TVL
// band, a time in weeks, and a verdict (worth farming, marginal, low
// priority) from the row's expected value per dollar of cost, cut at the
// board's quartiles. The steps name the chain, the gas, the capital and the
// weeks; they promise no airdrop, price or date.

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
  sizeFactor: number;
  growthFactor: number;
  ageFactor: number;
  tokenOdds: number;
  ageYears: number | null;
}

/** One fitted multiple, for the dashboard's table. */
export interface FittedMultiple {
  category: string;
  launched: number;
  multiple: number;
  odds: number;
}

/** One already-trading protocol the board excludes, for the dashboard. */
export interface ExcludedProtocol {
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
}

/** One direction of the hold-out test. */
export interface HoldOutDirection {
  train: number;
  test: number;
  median_factor: number;
  baseline_factor: number;
}

/** Everything the fit found, for the dashboard and board.json. */
export interface ModelMeta {
  launched_fit: number;
  launched_zero_mcap: number;
  global_median: number;
  global_token_rate: number;
  size_exponent: number;
  growth_k: number;
  age_slope: number;
  holdout: { a_to_b: HoldOutDirection; b_to_a: HoldOutDirection };
  multiples: FittedMultiple[];
  excluded_top: ExcludedProtocol[];
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
    size_factor: number;
    growth_factor: number;
    age_factor: number;
    token_odds: number;
    token_penalty: number;
  };
  farm_cost_usd: number;
  farm_capital_usd: number;
  farm_gas_usd: number;
  farm_weeks: number;
  farm_verdict: string;
  farm_steps: string[];
}

/** The dashboard's compact dataset: one tuple per row, plus the fitted model. */
export interface RadarData {
  as_of: string;
  floor_usd: number;
  meta: ModelMeta;
  rows: Array<[number, string, string, string | null, string[], number, number | null, number | null, number, number, number, number, number, number, number, number, number, number, number]>;
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
/** Pseudo-protocols at the global rate, for shrinking small-sample fits. */
const SHRINK = 3;
/** One ratio above this is a data quirk, not a multiple: winsorised away. */
const RATIO_CAP = 3;
/** The age band split for token odds: under two years, or two and over. */
const OLD_YEARS = 2;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** The middle value of a list, or null when it holds nothing. */
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Years from a first-tracked day to the snapshot day; null when unrecorded. */
export function ageInYears(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const first = new Date(`${listedAt}T00:00:00Z`).getTime();
  const snap = new Date(`${asOf}T00:00:00Z`).getTime();
  if (!Number.isFinite(first) || snap < first) return 0;
  return (snap - first) / YEAR_MS;
}

/** Whether a protocol records a token (a market cap is the record that counts). */
export function isLaunched(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null;
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** The launched protocols the fit can learn from: a positive market cap and TVL. */
function fittable(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** A launched protocol's market-cap-per-TVL, winsorised against data quirks. */
function ratioOf(p: SnapshotProtocol): number {
  return clamp(p.mcap_usd! / p.tvl_usd, 0, RATIO_CAP);
}

/** The log-log slope of ratio against TVL, or 0 when it cannot be fitted. */
function sizeExponentOf(launched: SnapshotProtocol[]): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of launched) {
    xs.push(Math.log10(p.tvl_usd / 1e8));
    ys.push(Math.log10(ratioOf(p)));
  }
  if (xs.length < 4) return 0;
  const mx = mean(xs)!;
  const my = mean(ys)!;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my);
    den += (xs[i]! - mx) * (xs[i]! - mx);
  }
  if (den === 0) return 0;
  return clamp(num / den, -0.8, 0);
}

/**
 * The growth premium k: how much more, per 100 points of 7-day change, the
 * launched protocols that grew trade at than the ones that shrank, from
 * their median ratios. Zero when growing paid nothing.
 */
function growthKOf(launched: SnapshotProtocol[]): number {
  const grown: number[] = [];
  const shrunk: number[] = [];
  const grownCh: number[] = [];
  const shrunkCh: number[] = [];
  for (const p of launched) {
    if (p.change_7d === null) continue;
    if (p.change_7d >= 0) {
      grown.push(ratioOf(p));
      grownCh.push(p.change_7d);
    } else {
      shrunk.push(ratioOf(p));
      shrunkCh.push(p.change_7d);
    }
  }
  const medGrown = median(grown);
  const medShrunk = median(shrunk);
  const meanGrown = mean(grownCh);
  const meanShrunk = mean(shrunkCh);
  if (medGrown === null || medShrunk === null || medShrunk <= 0 || meanGrown === null || meanShrunk === null) return 0;
  const spread = (meanGrown - meanShrunk) / 100;
  if (spread <= 0) return 0;
  return clamp((medGrown - medShrunk) / medShrunk / spread, 0, 1.5);
}

/**
 * The age slope: the log-slope of ratio against age, from the median ratio
 * of launched protocols tracked two years or more against the younger ones.
 * Zero when age paid nothing.
 */
function ageSlopeOf(launched: SnapshotProtocol[], asOf: string): number {
  const oldRatios: number[] = [];
  const youngRatios: number[] = [];
  const oldAges: number[] = [];
  const youngAges: number[] = [];
  for (const p of launched) {
    const a = ageInYears(asOf, p.listed_at);
    if (a === null) continue;
    if (a >= OLD_YEARS) {
      oldRatios.push(ratioOf(p));
      oldAges.push(a);
    } else {
      youngRatios.push(ratioOf(p));
      youngAges.push(a);
    }
  }
  const medOld = median(oldRatios);
  const medYoung = median(youngRatios);
  const meanOld = mean(oldAges);
  const meanYoung = mean(youngAges);
  if (medOld === null || medYoung === null || medOld <= 0 || medYoung <= 0 || meanOld === null || meanYoung === null) return 0;
  const spread = meanOld - meanYoung;
  if (spread <= 0) return 0;
  return clamp(Math.log(medOld / medYoung) / spread, -0.5, 0.5);
}

/** The fitted terms of one set of launched protocols. */
interface FittedTerms {
  globalMedian: number;
  multiples: Map<string, number>;
  sizeExponent: number;
  growthK: number;
  ageSlope: number;
}

function fitTerms(launched: SnapshotProtocol[], asOf: string): FittedTerms {
  const ratios = launched.map(ratioOf);
  const globalMedian = median(ratios) ?? 0.2;
  const byCategory = new Map<string, number[]>();
  for (const p of launched) {
    const c = p.category ?? 'None';
    const list = byCategory.get(c) ?? [];
    list.push(ratioOf(p));
    byCategory.set(c, list);
  }
  const multiples = new Map<string, number>();
  for (const [c, rs] of byCategory) {
    const m = median(rs) ?? globalMedian;
    multiples.set(c, clamp((rs.length * m + SHRINK * globalMedian) / (rs.length + SHRINK), 0.05, 1.5));
  }
  return {
    globalMedian,
    multiples,
    sizeExponent: sizeExponentOf(launched),
    growthK: growthKOf(launched),
    ageSlope: ageSlopeOf(launched, asOf),
  };
}

function multipleOf(terms: FittedTerms, category: string | null): number {
  if (category === null) return terms.globalMedian;
  return terms.multiples.get(category) ?? terms.globalMedian;
}

/** A protocol's implied value from fitted terms, without token odds. */
function rawValue(p: SnapshotProtocol, asOf: string, terms: FittedTerms): { implied: number; size: number; growth: number; age: number } {
  const cm = multipleOf(terms, p.category);
  const size = clamp(Math.pow(p.tvl_usd / 1e8, terms.sizeExponent), 0.5, 1.5);
  const change = typeof p.change_7d === 'number' ? clamp(p.change_7d, -25, 40) : 0;
  const growth = 1 + (terms.growthK * change) / 100;
  const years = ageInYears(asOf, p.listed_at);
  const age = years === null ? 1.0 : clamp(Math.exp(terms.ageSlope * Math.min(years, 4)), 0.8, 1.2);
  return { implied: Math.max(1, Math.round(p.tvl_usd * cm * size * growth * age)), size, growth, age };
}

/**
 * One hold-out direction: fit the terms on the train half, predict the
 * test half's market caps, and report the median factor the predictions
 * miss by, beside the same miss from the train half's global median alone.
 */
function holdOutDirection(train: SnapshotProtocol[], test: SnapshotProtocol[], asOf: string): HoldOutDirection {
  const terms = fitTerms(train, asOf);
  const trainGlobal = terms.globalMedian;
  const errs: number[] = [];
  const baseErrs: number[] = [];
  for (const p of test) {
    const pred = rawValue(p, asOf, terms).implied;
    const actual = p.mcap_usd!;
    errs.push(Math.abs(Math.log10(pred / actual)));
    baseErrs.push(Math.abs(Math.log10((p.tvl_usd * trainGlobal) / actual)));
  }
  const medErr = median(errs) ?? 0;
  const medBase = median(baseErrs) ?? 0;
  return {
    train: train.length,
    test: test.length,
    median_factor: round2(Math.pow(10, medErr)),
    baseline_factor: round2(Math.pow(10, medBase)),
  };
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

/** Gas per transaction, in dollars, by first chain: the chain's own rate, not a name list. */
const GAS_USD: Record<string, number> = {
  Ethereum: 6,
  Base: 0.05,
  Arbitrum: 0.1,
  Optimism: 0.05,
  Solana: 0.01,
  'BNB Chain': 0.15,
  Polygon: 0.05,
  Avalanche: 0.3,
  Monad: 0.01,
  Berachain: 0.05,
  Hyperliquid: 0.01,
  Sui: 0.01,
  Aptos: 0.01,
};

function gasPerTx(chain: string): number {
  return GAS_USD[chain] ?? 0.5;
}

/** The capital tier for a farm, by TVL band. */
function capitalFor(tvlUsd: number): number {
  if (tvlUsd >= 1e9) return 1000;
  if (tvlUsd >= 2e8) return 500;
  if (tvlUsd >= 5e7) return 300;
  return 200;
}

/** Weeks for a farm, by capital tier: bigger positions take longer to build. */
function weeksFor(capitalUsd: number): number {
  if (capitalUsd >= 1000) return 12;
  if (capitalUsd >= 500) return 10;
  return 8;
}

/**
 * One protocol's farm plan: six concrete steps carrying the plan's own
 * numbers (chain gas, capital tier, weeks), plus a costed verdict. The steps
 * are shaped by the protocol's own record (category, first chain, name),
 * never by a hand-written list of names, and they promise no airdrop, price
 * or date.
 */
export function farmPlan(
  p: SnapshotProtocol,
  verdict: string,
  evPerDollar: number,
): { steps: string[]; costUsd: number; capitalUsd: number; gasUsd: number; weeks: number } {
  const chain = (p.chains !== null && p.chains.length > 0 && p.chains[0]) || 'Ethereum';
  const gas = gasPerTx(chain);
  const txCount = 12;
  const gasUsd = Math.round(gas * txCount * 100) / 100;
  const capitalUsd = capitalFor(p.tvl_usd);
  const weeks = weeksFor(capitalUsd);
  const costUsd = Math.round((capitalUsd + gasUsd) * 100) / 100;
  const verb = actionVerb(p.category);
  const name = p.name;
  const cat = p.category || 'DeFi';
  const evText = `$${Math.round(evPerDollar).toLocaleString('en-US')}`;
  const verdictLine =
    verdict === 'worth'
      ? `This one is worth farming: about ${evText} of expected launch value per dollar of farming cost.`
      : verdict === 'marginal'
        ? `This one is marginal: about ${evText} of expected launch value per dollar of farming cost — farm it only if you already use ${cat}.`
        : `This one is low priority: about ${evText} of expected launch value per dollar of farming cost — skip it unless you already use ${cat}.`;
  const steps = [
    `Set up a fresh wallet for ${name} and fund it with $${capitalUsd} on ${chain}; gas here runs about $${gas} a transaction, so keep $${Math.max(5, Math.ceil(gasUsd))} aside for about ${txCount} transactions, and never reuse an exchange hot wallet for farming.`,
    `Bridge or buy the assets you need on ${chain}, then ${verb} on ${name} with a first $${Math.round(capitalUsd / 4)} position to learn the flow before sizing up.`,
    `Grow the position to $${capitalUsd} over ${Math.max(2, weeks - 4)}-${weeks} weeks, splitting it across 2-3 actions (deposit, then a second interaction a week later) so activity looks sustained, not one-off.`,
    `Use the ${cat} feature at least once a week for ${weeks} weeks: repeat the core action, check the position, and keep a small running note of dates, amounts and transaction hashes.`,
    `Join ${name}'s public community and governance channels, vote or comment when a proposal is live, and watch for official quests or points programmes before acting on rumours.`,
    `After ${weeks} weeks, review the position: harvest or restake any rewards, keep the principal deployed while the protocol is active, and exit only if fees exceed the position's yield. ${verdictLine}`,
  ];
  return { steps, costUsd, capitalUsd, gasUsd, weeks };
}

/** One protocol's implied value and its terms, from the fitted terms. */
export function valueOf(
  p: SnapshotProtocol,
  asOf: string,
  terms: FittedTerms,
  tokenOdds: number,
): ValueTerms {
  const raw = rawValue(p, asOf, terms);
  const cm = multipleOf(terms, p.category);
  const implied = Math.max(1, Math.round(raw.implied * tokenOdds));
  return {
    implied,
    categoryMultiple: cm,
    sizeDampener: raw.size,
    growthFactor: raw.growth,
    ageFactor: raw.age,
    tokenOdds,
    ageYears: ageInYears(asOf, p.listed_at),
  };
}

/** The age band a protocol's peers are drawn from. */
function ageBand(asOf: string, listedAt: string | null): 'old' | 'young' | 'unknown' {
  const a = ageInYears(asOf, listedAt);
  if (a === null) return 'unknown';
  return a >= OLD_YEARS ? 'old' : 'young';
}

/**
 * A protocol's token odds: the share of its peers (same category, same age
 * band) that already record a token, shrunk toward the snapshot's overall
 * launch rate. Protocols with no recorded first-tracked date take their
 * category's overall rate.
 */
export function tokenOddsOf(p: SnapshotProtocol, snapshot: Snapshot, globalRate: number): number {
  const band = ageBand(snapshot.as_of, p.listed_at);
  const peers = snapshot.protocols.filter((q) => {
    if ((q.category ?? 'None') !== (p.category ?? 'None')) return false;
    if (band === 'unknown') return true;
    return ageBand(snapshot.as_of, q.listed_at) === band;
  });
  const launched = peers.filter(isLaunched).length;
  return (launched + SHRINK * globalRate) / (peers.length + SHRINK);
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
    round3(row.value_breakdown.size_factor),
    round3(row.value_breakdown.growth_factor),
    round3(row.value_breakdown.age_factor),
    round3(row.value_breakdown.token_odds),
    row.farm_cost_usd,
    row.farm_weeks,
    row.farm_verdict === 'worth' ? 2 : row.farm_verdict === 'marginal' ? 1 : 0,
  ];
}

/**
 * Score the snapshot: fit the terms from its launched protocols, test the
 * fit held out, rank every eligible protocol by expected launch value, and
 * cost a farm plan for each. The board is exactly the eligible set — the
 * watchlist is its floor, and the eligible protocols below the floor are the
 * early rows the radar exists to find.
 */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; meta: ModelMeta } {
  const watchlist = new Set(snapshot.watchlist);
  const launched = fittable(snapshot.protocols);
  const zeroMcap = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0).length;
  const terms = fitTerms(launched, snapshot.as_of);
  const globalRate = snapshot.protocols.filter(isLaunched).length / snapshot.protocols.length;

  // Hold-out: split the launched protocols in half by slug, fit on one half,
  // predict the other, in both directions.
  const ordered = [...launched].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const halfA = ordered.filter((_, i) => i % 2 === 0);
  const halfB = ordered.filter((_, i) => i % 2 === 1);
  const holdout = {
    a_to_b: holdOutDirection(halfA, halfB, snapshot.as_of),
    b_to_a: holdOutDirection(halfB, halfA, snapshot.as_of),
  };

  // Token odds and values for every eligible protocol.
  const scored = snapshot.protocols.filter(isEligible).map((p) => {
    const odds = tokenOddsOf(p, snapshot, globalRate);
    const v = valueOf(p, snapshot.as_of, terms, odds);
    return { p, v, odds };
  });
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // Farm verdicts from expected value per dollar of cost, cut at quartiles.
  const costs = scored.map((s) => {
    const chain = (s.p.chains !== null && s.p.chains.length > 0 && s.p.chains[0]) || 'Ethereum';
    return capitalFor(s.p.tvl_usd) + Math.round(gasPerTx(chain) * 12 * 100) / 100;
  });
  const evPerDollar = scored.map((s, i) => s.v.implied / costs[i]!);
  const sortedEv = [...evPerDollar].sort((a, b) => a - b);
  const q1 = sortedEv[Math.floor(sortedEv.length / 4)]!;
  const q3 = sortedEv[Math.floor((sortedEv.length * 3) / 4)]!;
  const verdictOf = (ev: number): string => (ev >= q3 ? 'worth' : ev >= q1 ? 'marginal' : 'low');

  const board: BoardRow[] = scored.map((s, i) => {
    const p = s.p;
    const v = s.v;
    const ev = evPerDollar[i]!;
    const verdict = verdictOf(ev);
    const plan = farmPlan(p, verdict, ev);
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
        category_multiple: round3(v.categoryMultiple),
        size_factor: round3(v.sizeDampener),
        growth_factor: round3(v.growthFactor),
        age_factor: round3(v.ageFactor),
        token_odds: round3(v.tokenOdds),
        token_penalty: isPreToken(p) ? 1 : 0.07,
      },
      farm_cost_usd: plan.costUsd,
      farm_capital_usd: plan.capitalUsd,
      farm_gas_usd: plan.gasUsd,
      farm_weeks: plan.weeks,
      farm_verdict: verdict,
      farm_steps: plan.steps,
    };
  });

  // The fitted multiples table: every category on the board, with its
  // launched peer count and its token odds overall.
  const boardCats = [...new Set(board.map((r) => r.category ?? 'None'))].sort();
  const multiples: FittedMultiple[] = boardCats.map((c) => {
    const peers = snapshot.protocols.filter((q) => (q.category ?? 'None') === c);
    const launchedPeers = peers.filter(isLaunched).length;
    return {
      category: c,
      launched: launched.filter((q) => (q.category ?? 'None') === c).length,
      multiple: round3(multipleOf(terms, c === 'None' ? null : c)),
      odds: round3((launchedPeers + SHRINK * globalRate) / (peers.length + SHRINK)),
    };
  });

  // The excluded protocols the board leaves out, top twelve by TVL.
  const excludedTop: ExcludedProtocol[] = snapshot.protocols
    .filter(isLaunched)
    .filter((p) => p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, 12)
    .map((p) => ({
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd!,
      ratio: round3(p.mcap_usd! / p.tvl_usd),
    }));

  const meta: ModelMeta = {
    launched_fit: launched.length,
    launched_zero_mcap: zeroMcap,
    global_median: round3(terms.globalMedian),
    global_token_rate: round3(globalRate),
    size_exponent: round3(terms.sizeExponent),
    growth_k: round3(terms.growthK),
    age_slope: round3(terms.ageSlope),
    holdout,
    multiples,
    excluded_top: excludedTop,
  };
  return {
    board,
    radar: { as_of: snapshot.as_of, floor_usd: snapshot.floor_usd, meta, rows: board.map(compactRow) },
    meta,
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
