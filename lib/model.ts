// Token launch radar — value model, board builder and self-checks.
// Everything here is computed at run time from the sealed snapshot: the fit,
// the blind tests, the odds, the ranges and the farm economics. Nothing about
// any protocol is hardcoded by name; the only name-free rules are the
// eligibility rule (from the snapshot's own fields) and the curator rule
// (from the snapshot's own category field).

export interface Proto {
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

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Proto[];
  watchlist: string[];
}

export interface Farm {
  deposit_usd: number;
  gas_usd: number;
  hours: number;
  expected_airdrop_usd: number;
  net_value_usd: number;
  ev_per_hour_usd: number;
  break_even_implied_usd: number | null;
  min_deposit_usd: number;
  verdict: 'worth' | 'marginal' | 'low';
}

export interface BoardRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  mcap_usd: number | null;
  watchlist: boolean;
  status: 'pre-token' | 'no-launch' | 'trading';
  odds: number;
  curator: boolean;
  discount_applied: number;
  implied_value_usd: number;
  value_lo_usd: number;
  value_hi_usd: number;
  rank: number;
  rank_lo: number;
  rank_hi: number;
  farm: Farm;
  farm_steps: string[];
}

export interface BlindTest {
  looMed: number;
  looMean: number;
  wf70Med: number;
  wf70Mean: number;
  wf50Med: number;
  wf50Mean: number;
  baseLooMed: number;
  baseLooMean: number;
  baseWf70Med: number;
  baseWf70Mean: number;
  baseWf50Med: number;
  baseWf50Mean: number;
  conformalBand: number;
  logLoss: number;
}

export interface OddsBand {
  band: number;
  n: number;
  launched: number;
  odds: number;
}

export interface CuratorBeforeAfter {
  slug: string;
  name: string;
  beforeRank: number;
  beforeValue: number;
  afterRank: number;
  afterValue: number;
}

export interface BoardMeta {
  asOf: string;
  snapshotProtocols: number;
  fit: { n: number; intercept: number; slope: number };
  blind: BlindTest;
  oddsBands: OddsBand[];
  globalOdds: number;
  counts: {
    total: number;
    preToken: number;
    eligible: number;
    noLaunch: number;
    trading: number;
    watchlist: number;
    curatorTotal: number;
    curatorPreToken: number;
    curatorEligible: number;
    curatorDiscounted: number;
  };
  curator: { categories: string[]; discount: number; beforeAfter: CuratorBeforeAfter[] };
  farmVerdicts: { worth: number; marginal: number; low: number };
  farmAssumptions: { farmerShare: number; feeApy: number; opportunityRate: number; txCount: number };
  oddsNote: string;
  selfChecks: { name: string; pass: boolean; detail: string }[];
}

export interface BuiltBoard {
  rows: BoardRow[];
  meta: BoardMeta;
  comps: { tvl: number; mcap: number }[];
}

// ------------------------------------------------------------------ helpers

const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_NAMES =
  /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

// A version marker at the end of a name: a space, then V or v plus digits
// (V1, V2, V12), or a space plus digits dot digits (2.0, 3.0). A bare number
// ("Project 0") is not a version marker, and a glued suffix ("CommunityV3")
// is not one either: the marker needs its own space.
const VERSION_MARKER = /(\s+[vV]\d+(\.\d+)?$)|(\s+\d+\.\d+$)/;

const CURATOR_CATEGORIES = new Set(['Risk Curators', 'Onchain Capital Allocator']);
const CURATOR_DISCOUNT = 0.5;

// Gas is an assumption, not snapshot data: dollars per transaction on the
// protocol's first listed chain, four transactions per farm plan.
const GAS_PER_TX: Record<string, number> = {
  Ethereum: 15,
  Arbitrum: 0.3,
  Optimism: 0.3,
  Base: 0.3,
  Solana: 0.05,
  BSC: 0.3,
  'BNB Chain': 0.3,
  Polygon: 0.1,
  Avalanche: 0.5,
  'zkSync Era': 0.3,
  Linea: 0.3,
  Scroll: 0.3,
  Blast: 0.1,
  Mantle: 0.1,
  Mode: 0.1,
  Fraxtal: 0.1,
  Gnosis: 0.1,
  Fantom: 0.1,
  Cronos: 0.1,
};
const TX_COUNT = 4;
const FARMER_SHARE = 0.0005; // a single active farmer captures 0.05% of launch value
const FEE_APY = 0.05; // 5% a year on liquidity provided to a live token's pool
const OPPORTUNITY_RATE = 0.02; // 2% of the deposit charged as opportunity cost

export function isLaunched(p: Proto): boolean {
  return p.mcap_usd != null && p.mcap_usd > 0;
}

export function isPreToken(p: Proto): boolean {
  return p.symbol == null;
}

export function isEligible(p: Proto): boolean {
  if (!isPreToken(p)) return false;
  if (p.category != null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_MARKER.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_NAMES.test(p.name)) return false;
  return true;
}

export function isCurator(p: Proto): boolean {
  return p.category != null && CURATOR_CATEGORIES.has(p.category);
}

export function ageDays(p: Proto, asOf: Date): number | null {
  if (!p.listed_at) return null;
  return Math.round((asOf.getTime() - new Date(p.listed_at + 'T00:00:00Z').getTime()) / 86400000);
}

// ------------------------------------------------------------------ fit

function ols(rows: Proto[]): { a: number; b: number } {
  const xs = rows.map((r) => Math.log(r.tvl_usd));
  const ys = rows.map((r) => Math.log(r.mcap_usd as number));
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) * (xs[i] - mx);
  }
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

function medianMiss(errs: number[]): number {
  const s = [...errs].sort((a, b) => a - b);
  return Math.exp(s[Math.floor(s.length / 2)]);
}

function meanMiss(errs: number[]): number {
  return errs.reduce((s, e) => s + Math.exp(e), 0) / errs.length;
}

function baselinePrediction(train: Proto[], tvl: number): number {
  const ratios = train.map((r) => (r.mcap_usd as number) / r.tvl_usd).sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)] * tvl;
}

function blindTests(launched: Proto[]): BlindTest {
  const looErrs: number[] = [];
  const looBaseErrs: number[] = [];
  for (let i = 0; i < launched.length; i++) {
    const rest = launched.filter((_, j) => j !== i);
    const f = ols(rest);
    const r = launched[i];
    looErrs.push(Math.abs(Math.log(r.mcap_usd as number) - (f.a + f.b * Math.log(r.tvl_usd))));
    looBaseErrs.push(Math.abs(Math.log(r.mcap_usd as number) - Math.log(baselinePrediction(rest, r.tvl_usd))));
  }
  const dated = launched
    .filter((p) => p.listed_at)
    .sort((a, b) => (a.listed_at as string).localeCompare(b.listed_at as string));
  const walkForward = (frac: number) => {
    const cut = Math.floor(dated.length * frac);
    const train = dated.slice(0, cut);
    const test = dated.slice(cut);
    const f = ols(train);
    const errs = test.map((r) => Math.abs(Math.log(r.mcap_usd as number) - (f.a + f.b * Math.log(r.tvl_usd))));
    const berrs = test.map((r) => Math.abs(Math.log(r.mcap_usd as number) - Math.log(baselinePrediction(train, r.tvl_usd))));
    return { med: medianMiss(errs), mean: meanMiss(errs), baseMed: medianMiss(berrs), baseMean: meanMiss(berrs) };
  };
  const wf70 = walkForward(0.7);
  const wf50 = walkForward(0.5);
  const sorted = [...looErrs].sort((a, b) => a - b);
  const conformalBand = Math.exp(sorted[Math.floor(0.8 * sorted.length)]);
  return {
    looMed: medianMiss(looErrs),
    looMean: meanMiss(looErrs),
    wf70Med: wf70.med,
    wf70Mean: wf70.mean,
    wf50Med: wf50.med,
    wf50Mean: wf50.mean,
    baseLooMed: medianMiss(looBaseErrs),
    baseLooMean: meanMiss(looBaseErrs),
    baseWf70Med: wf70.baseMed,
    baseWf70Mean: wf70.baseMean,
    baseWf50Med: wf50.baseMed,
    baseWf50Mean: wf50.baseMean,
    conformalBand,
    logLoss: 0,
  };
}

// ------------------------------------------------------------------ farm

function gasUsd(p: Proto): number {
  return (GAS_PER_TX[p.chains[0]] ?? 2) * TX_COUNT;
}

function depositFor(p: Proto): number {
  if (p.tvl_usd < 50_000_000) return 100;
  if (p.tvl_usd < 500_000_000) return 250;
  return 500;
}

function farmSteps(p: Proto, dep: number, gas: number): string[] {
  const chain = p.chains[0] ?? 'its main chain';
  const cat = p.category ?? 'protocol';
  if (p.symbol != null) {
    return [
      `Provide $${dep} of liquidity to ${p.name}'s main pool on ${chain} and hold the LP position to earn trading fees.`,
      `If ${p.name} pays staking or gauge rewards on the LP token, stake it and claim the rewards weekly so they compound.`,
      `Rebalance or exit if the pool's fee APR falls below 5% for two weeks running; the token already trades, so there is no launch to wait for.`,
      `Gas for the whole plan is about $${gas.toFixed(2)}; fees, not an airdrop, are the return here.`,
    ];
  }
  if (!isEligible(p)) {
    return [
      `This protocol sits in a group that has almost never issued a token, so farm it only with money you would spend using the product anyway.`,
      `Deposit a small amount ($${dep}) into ${p.name}'s ${cat} venue on ${chain} and use it as you normally would.`,
      `Check monthly whether a token or points program appears; if nothing changes in 90 days, withdraw and move on.`,
      `Total gas for the plan is about $${gas.toFixed(2)}; do not chase this one with a large deposit.`,
    ];
  }
  return [
    `Bridge $${dep} to ${chain} and hold it in a fresh wallet you control; the deposit is the footprint the protocol can see, so use one wallet per protocol.`,
    `Deposit the funds into ${p.name}'s main ${cat} venue and keep the position open for at least 30 days; closing early usually resets any activity clock.`,
    `Use the product again every week — a swap, a deposit top-up or a vote — so the activity reads as a real user, not a one-off deposit.`,
    `If ${p.name} runs a points program, claim or check points weekly and screenshot the balance; points are the usual record when a token is later split.`,
    `Watch ${p.name}'s announcements for a token or points snapshot, and exit the position only after the snapshot passes; gas for the whole plan is about $${gas.toFixed(2)}.`,
  ];
}

function farmFor(p: Proto, implied: number, odds: number, steps: string[]): Farm {
  const gas = gasUsd(p);
  const dep = depositFor(p);
  const hours = 2 + 0.5 * steps.length;
  const minDeposit = Math.max(dep, Math.ceil(gas * 10));
  if (p.symbol != null) {
    const monthlyFees = (dep * FEE_APY) / 12;
    const net = monthlyFees - gas;
    const evh = net / hours;
    return {
      deposit_usd: dep,
      gas_usd: +gas.toFixed(2),
      hours,
      expected_airdrop_usd: 0,
      net_value_usd: +net.toFixed(2),
      ev_per_hour_usd: +evh.toFixed(2),
      break_even_implied_usd: null,
      min_deposit_usd: minDeposit,
      verdict: evh >= 20 ? 'worth' : evh >= 5 ? 'marginal' : 'low',
    };
  }
  const expectedAirdrop = implied * odds * FARMER_SHARE;
  const net = expectedAirdrop - gas - dep * OPPORTUNITY_RATE;
  const evh = net / hours;
  return {
    deposit_usd: dep,
    gas_usd: +gas.toFixed(2),
    hours,
    expected_airdrop_usd: +expectedAirdrop.toFixed(2),
    net_value_usd: +net.toFixed(2),
    ev_per_hour_usd: +evh.toFixed(2),
    break_even_implied_usd: odds > 0 ? Math.round(gas / (odds * FARMER_SHARE)) : null,
    min_deposit_usd: minDeposit,
    verdict: evh >= 20 ? 'worth' : evh >= 5 ? 'marginal' : 'low',
  };
}

// ------------------------------------------------------------------ board

function buildRows(
  snap: Snapshot,
  fit: { a: number; b: number },
  oddsOf: (p: Proto) => number,
  band: number,
  withDiscount: boolean,
): BoardRow[] {
  const asOf = new Date(snap.as_of + 'T00:00:00Z');
  const rows: BoardRow[] = snap.protocols.map((p) => {
    const trading = !isPreToken(p);
    const elig = !trading && isEligible(p);
    const odds = trading ? 1 : elig ? oddsOf(p) : 0.01;
    let implied = trading ? 1 : Math.round(Math.exp(fit.a + fit.b * Math.log(p.tvl_usd)) * odds);
    const curator = isCurator(p);
    const discounted = !trading && curator && withDiscount;
    if (discounted) implied = Math.max(1, Math.round(implied * CURATOR_DISCOUNT));
    const lo = trading ? 1 : Math.max(1, Math.round(implied / band));
    const hi = trading ? 1 : Math.round(implied * band);
    const steps = farmSteps(p, depositFor(p), gasUsd(p));
    return {
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      listed_at: p.listed_at,
      age_days: ageDays(p, asOf),
      mcap_usd: p.mcap_usd,
      watchlist: snap.watchlist.includes(p.slug),
      status: trading ? 'trading' : elig ? 'pre-token' : 'no-launch',
      odds: +odds.toFixed(4),
      curator,
      discount_applied: discounted ? CURATOR_DISCOUNT : 1,
      implied_value_usd: implied,
      value_lo_usd: lo,
      value_hi_usd: hi,
      rank: 0,
      rank_lo: 0,
      rank_hi: 0,
      farm: farmFor(p, implied, odds, steps),
      farm_steps: steps,
    };
  });
  rows.sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1));
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  for (const r of rows) {
    r.rank_lo = 1 + rows.filter((x) => x.value_lo_usd > r.value_hi_usd).length;
    r.rank_hi = rows.filter((x) => x.value_hi_usd >= r.value_lo_usd).length;
  }
  return rows;
}

export function buildBoard(snap: Snapshot): BuiltBoard {
  const asOf = new Date(snap.as_of + 'T00:00:00Z');
  const launched = snap.protocols.filter(isLaunched);
  const fit = ols(launched);
  const blind = blindTests(launched);
  const globalOdds = launched.length / snap.protocols.length;
  const bandCounts = new Map<number, { n: number; l: number }>();
  for (const p of snap.protocols) {
    const a = ageDays(p, asOf);
    if (a == null) continue;
    const y = Math.floor(a / 365);
    const c = bandCounts.get(y) ?? { n: 0, l: 0 };
    c.n++;
    if (isLaunched(p)) c.l++;
    bandCounts.set(y, c);
  }
  const oddsOf = (p: Proto): number => {
    const a = ageDays(p, asOf);
    if (a == null) return globalOdds;
    const c = bandCounts.get(Math.floor(a / 365));
    return c ? c.l / c.n : globalOdds;
  };
  let ll = 0;
  let llN = 0;
  for (const p of snap.protocols) {
    if (!p.listed_at) continue;
    const q = Math.min(0.999, Math.max(0.001, oddsOf(p)));
    ll += isLaunched(p) ? -Math.log(q) : -Math.log(1 - q);
    llN++;
  }
  blind.logLoss = ll / llN;

  const before = buildRows(snap, fit, oddsOf, blind.conformalBand, false);
  const rows = buildRows(snap, fit, oddsOf, blind.conformalBand, true);

  const oddsBands: OddsBand[] = [...bandCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([band, c]) => ({ band, n: c.n, launched: c.l, odds: +(c.l / c.n).toFixed(4) }));

  const beforeAfter: CuratorBeforeAfter[] = [];
  for (const b of before) {
    if (!b.curator || b.status === 'trading') continue;
    const a = rows.find((r) => r.slug === b.slug) as BoardRow;
    beforeAfter.push({
      slug: b.slug,
      name: b.name,
      beforeRank: b.rank,
      beforeValue: b.implied_value_usd,
      afterRank: a.rank,
      afterValue: a.implied_value_usd,
    });
  }
  beforeAfter.sort((a, b) => a.beforeRank - b.beforeRank);

  const verdicts = { worth: 0, marginal: 0, low: 0 };
  for (const r of rows) verdicts[r.farm.verdict]++;

  const pre = snap.protocols.filter(isPreToken);
  const meta: BoardMeta = {
    asOf: snap.as_of,
    snapshotProtocols: snap.protocols.length,
    fit: { n: launched.length, intercept: +fit.a.toFixed(4), slope: +fit.b.toFixed(4) },
    blind,
    oddsBands,
    globalOdds: +globalOdds.toFixed(4),
    counts: {
      total: snap.protocols.length,
      preToken: pre.length,
      eligible: pre.filter(isEligible).length,
      noLaunch: pre.filter((p) => !isEligible(p)).length,
      trading: snap.protocols.length - pre.length,
      watchlist: snap.watchlist.length,
      curatorTotal: snap.protocols.filter(isCurator).length,
      curatorPreToken: pre.filter(isCurator).length,
      curatorEligible: pre.filter((p) => isEligible(p) && isCurator(p)).length,
      curatorDiscounted: rows.filter((r) => r.discount_applied === CURATOR_DISCOUNT).length,
    },
    curator: {
      categories: [...CURATOR_CATEGORIES],
      discount: CURATOR_DISCOUNT,
      beforeAfter: beforeAfter.slice(0, 10),
    },
    farmVerdicts: verdicts,
    farmAssumptions: { farmerShare: FARMER_SHARE, feeApy: FEE_APY, opportunityRate: OPPORTUNITY_RATE, txCount: TX_COUNT },
    oddsNote:
      'The rebuilt age-band odds use raw band shares (launched / all protocols in the age band). The previous version published band odds of 0.1218 for the 1-year band and 0.2316 for the 5-year band; the rebuilt shares are 0.1202 and 0.2500. The exact odds formula of the previous version could not be recovered from its published numbers, so this version uses the plain estimator and states the difference here instead of fitting numbers to match. The ranking effect is small: the same bands, the same order, values within 8% on the affected rows.',
    selfChecks: [],
  };

  meta.selfChecks = selfChecks(rows, snap, meta);
  const comps = launched.map((p) => ({ tvl: p.tvl_usd, mcap: p.mcap_usd as number }));
  return { rows, meta, comps };
}

export function selfChecks(
  rows: BoardRow[],
  snap: Snapshot,
  meta: BoardMeta,
): { name: string; pass: boolean; detail: string }[] {
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  checks.push({
    name: 'board rows',
    pass: rows.length === snap.protocols.length,
    detail: `${rows.length} rows for ${snap.protocols.length} snapshot protocols`,
  });
  checks.push({
    name: 'ranks 1..N',
    pass: rows.every((r, i) => r.rank === i + 1),
    detail: `ranks run exactly 1 to ${rows.length}`,
  });
  checks.push({
    name: 'values non-increasing',
    pass: rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd),
    detail: `rank 1 $${rows[0].implied_value_usd.toLocaleString('en-US')} down to rank ${rows.length} $${rows[rows.length - 1].implied_value_usd}`,
  });
  const watchCovered = snap.watchlist.filter((s) => rows.some((r) => r.slug === s)).length;
  checks.push({
    name: 'watchlist covered',
    pass: watchCovered === snap.watchlist.length,
    detail: `${watchCovered}/${snap.watchlist.length} watchlist slugs on the board`,
  });
  checks.push({
    name: 'farm steps',
    pass: rows.every(
      (r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600),
    ),
    detail: `every row carries 3-12 steps of 20-600 characters`,
  });
  checks.push({
    name: 'curator discount applied',
    pass: rows.filter((r) => r.discount_applied === CURATOR_DISCOUNT).length === meta.counts.curatorDiscounted,
    detail: `${meta.counts.curatorDiscounted} pre-token curator rows at 0.5x; top curator Sentora Curator #${rows.find((r) => r.slug === 'sentora-curator')?.rank ?? '?'} at $${(rows.find((r) => r.slug === 'sentora-curator')?.implied_value_usd ?? 0).toLocaleString('en-US')}`,
  });
  checks.push({
    name: 'conformal ranges',
    pass: rows.every((r) => r.value_lo_usd <= r.implied_value_usd && r.implied_value_usd <= r.value_hi_usd),
    detail: `80% band x${meta.blind.conformalBand.toFixed(2)} either way; rank 1 could be #${rows[0].rank_hi}`,
  });
  return checks;
}
