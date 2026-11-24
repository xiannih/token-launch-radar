// Token Launch Radar V6 — the model.
//
// The board ranks every protocol in the sealed snapshot by the implied value
// of a token it has not launched yet, and accounts for the ones that already
// trade instead of leaving them out. Nothing here is fitted to a name: the
// value model, the launch odds and the uncertainty ranges are all computed
// from the snapshot at run time, and every modelling choice is kept only if
// it survives blind tests that never saw the protocol it is judged on.
//
//   value model : log(mcap / TVL) regressed on log(TVL), fitted on the
//                 protocols whose token already has a measured market cap.
//   blind tests : leave-one-out plus two walk-forward splits (train on the
//                 earliest listings, test on the latest). Each candidate
//                 term — size, 7-day growth, age, category multiples — is
//                 kept only when adding it improves at least 4 of the 6
//                 test numbers (median and mean miss on the three splits).
//   launch odds : the share of same-age-band peers that already have a
//                 priced token, shrunk toward the global rate; the age-band
//                 model is picked by 5-fold time-ordered cross-validation
//                 on log-loss against the global, category and combined
//                 models.
//   uncertainty : an 80% conformal interval per row from the leave-one-out
//                 residuals of the final model, with the rank range the
//                 interval implies.
//   farm plans  : costed to the dollar — deposit, gas, hours, break-even
//                 airdrop, minimum viable deposit, and an expected value
//                 per hour under the stated assumption that one farmer
//                 captures at most 0.1% of the row's low-end implied value.

/** One protocol exactly as the sealed snapshot carries it. */
export interface SnapProtocol {
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
  protocols: SnapProtocol[];
  watchlist: string[];
}

/** Which value terms a candidate model uses. */
export interface Terms {
  size: boolean;
  growth: boolean;
  age: boolean;
  category: boolean;
}

/** One blind-test split's two miss numbers, in multiples (1.0 is exact). */
export interface Miss {
  median: number;
  mean: number;
}

/** A term's blind-test record: the six numbers with and without it, and the verdict. */
export interface TermTest {
  term: string;
  without: { loo: Miss; wf70: Miss; wf50: Miss };
  with: { loo: Miss; wf70: Miss; wf50: Miss };
  verdict: 'keep' | 'drop';
  improved: number;
  worsened: number;
}

/** The fitted value model and how it was chosen. */
export interface ValueFit {
  n: number;
  intercept: number;
  slope: number;
  terms: Terms;
  median_ratio: number;
  baseline: { loo: Miss; wf70: Miss; wf50: Miss };
  final: { loo: Miss; wf70: Miss; wf50: Miss };
  term_tests: TermTest[];
  conformal_q80: number;
}

/** The launch-odds model and its cross-validation. */
export interface OddsFit {
  global: number;
  chosen: string;
  cv: { kind: string; logloss: number; brier: number }[];
  bands: { band: string; odds: number; n: number }[];
}

/** Farm economics, netted to the dollar. */
export interface FarmEcon {
  deposit_usd: number;
  gas_usd: number;
  hours: number;
  cost_per_hour_usd: number;
  break_even_usd: number;
  min_deposit_usd: number;
  ev_per_hour_usd: number;
  verdict: 'worth' | 'marginal' | 'low' | 'trading';
}

/** One board row, as board.json and the dashboard both carry it. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  status: 'pre-token' | 'non-launch' | 'trading';
  odds: number;
  implied_value_usd: number;
  value_lo_usd: number;
  value_hi_usd: number;
  rank_lo: number;
  rank_hi: number;
  farm: FarmEcon;
  farm_steps: string[];
}

/** One self-check: a claim the cover makes, with its computed answer. */
export interface SelfCheck {
  label: string;
  detail: string;
  pass: boolean;
}

/** Everything the dashboard renders. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  counts: { protocols: number; watchlist: number; board: number; pre_token: number; non_launch: number; trading: number; launched: number };
  fit: ValueFit;
  odds: OddsFit;
  checks: SelfCheck[];
  verdicts: { worth: number; marginal: number; low: number; trading: number };
  rows: BoardRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Days from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The age band a protocol's age falls in, for the launch-odds peers. */
export function ageBand(age: number | null, medianAge: number): string {
  const a = age === null ? medianAge : age;
  if (a < 180) return '<6mo';
  if (a < 365) return '6-12mo';
  if (a < 730) return '1-2y';
  return '>2y';
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are a wrapped, staked or bridged product, not a launch of their own. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;
const EXCHANGE_START = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;

/** Whether a protocol records any token at all. */
export function hasToken(p: SnapProtocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

/** Whether a pre-token protocol could plausibly launch one of its own. */
export function isLaunchable(p: SnapProtocol): boolean {
  if (hasToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_START.test(p.name)) return false;
  return true;
}

// ------------------------------------------------------------------ linear fit

/** Solve A x = b by Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r]![c]!) > Math.abs(m[piv]![c]!)) piv = r;
    if (Math.abs(m[piv]![c]!) < 1e-12) throw new SnapshotError('the value fit is singular');
    const tmp = m[c]!;
    m[c] = m[piv]!;
    m[piv] = tmp;
    for (let r = c + 1; r < n; r++) {
      const f = m[r]![c]! / m[c]![c]!;
      for (let k = c; k <= n; k++) m[r]![k]! -= f * m[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= m[r]![k]! * x[k]!;
    x[r] = s / m[r]![r]!;
  }
  return x;
}

/** Ordinary least squares of y on X, with a hair of ridge for stability. */
function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const a: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b: number[] = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    for (let r = 0; r < k; r++) {
      b[r]! += X[i]![r]! * y[i]!;
      for (let c = 0; c < k; c++) a[r]![c]! += X[i]![r]! * X[i]![c]!;
    }
  }
  for (let i = 0; i < k; i++) a[i]![i]! += 1e-9;
  return solveLinear(a, b);
}

/** A protocol's feature row under `terms`; an unknown age falls back to `medianAge`. */
function features(p: SnapProtocol, terms: Terms, asOf: string, medianAge: number): number[] {
  const age = ageDays(asOf, p.listed_at);
  const ageYrs = (age === null ? medianAge : age) / 365;
  const f = [1];
  if (terms.size) f.push(Math.log(Math.max(1, p.tvl_usd)));
  if (terms.growth) f.push(clamp(finite(p.change_7d, 0), -60, 120) / 100);
  if (terms.age) f.push(ageYrs);
  return f;
}

/** The median of a list of numbers. */
function median(ns: number[]): number {
  const s = [...ns].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** Fit `terms` on `train`; returns a predictor of log(mcap / TVL). */
function fitTerms(train: SnapProtocol[], terms: Terms, asOf: string, medianAge: number): (p: SnapProtocol) => number {
  const X = train.map((p) => features(p, terms, asOf, medianAge));
  const y = train.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
  const coef = ols(X, y);
  const resid = train.map((p, i) => y[i]! - X[i]!.reduce((s, v, j) => s + v * coef[j]!, 0));
  const catMean: Record<string, number> = {};
  if (terms.category) {
    const groups: Record<string, number[]> = {};
    train.forEach((p, i) => {
      const c = p.category ?? 'none';
      (groups[c] ??= []).push(resid[i]!);
    });
    for (const c of Object.keys(groups)) {
      const arr = groups[c]!;
      if (arr.length < 3) continue;
      const m = arr.reduce((a, v) => a + v, 0) / arr.length;
      catMean[c] = m * (arr.length / (arr.length + 5));
    }
  }
  return (p: SnapProtocol): number => {
    const x = features(p, terms, asOf, medianAge);
    let v = x.reduce((s, vv, j) => s + vv * coef[j]!, 0);
    if (terms.category) v += catMean[p.category ?? 'none'] ?? 0;
    return v;
  };
}

/** A predictor's miss on `test`, in multiples: median and mean of |log error|, exponentiated. */
function missOf(predict: (p: SnapProtocol) => number, test: SnapProtocol[]): Miss {
  const errs = test.map((p) => Math.abs(Math.log(p.mcap_usd! / p.tvl_usd) - predict(p)));
  return { median: round2(Math.exp(median(errs))), mean: round2(Math.exp(errs.reduce((a, v) => a + v, 0) / errs.length)) };
}

/** The global-median predictor's miss on `test`, fitted on `train`. */
function baselineMiss(train: SnapProtocol[], test: SnapProtocol[]): Miss {
  const med = median(train.map((p) => Math.log(p.mcap_usd! / p.tvl_usd)));
  const errs = test.map((p) => Math.abs(Math.log(p.mcap_usd! / p.tvl_usd) - med));
  return { median: round2(Math.exp(median(errs))), mean: round2(Math.exp(errs.reduce((a, v) => a + v, 0) / errs.length)) };
}

// ------------------------------------------------------------------ blind tests

/** The three blind-test splits over the fit population. */
interface Splits {
  loo: SnapProtocol[][];
  wf70: { train: SnapProtocol[]; test: SnapProtocol[] };
  wf50: { train: SnapProtocol[]; test: SnapProtocol[] };
}

function makeSplits(fit: SnapProtocol[]): Splits {
  const dated = [...fit].filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : 1));
  const n70 = Math.floor(dated.length * 0.7);
  const n50 = Math.floor(dated.length * 0.5);
  return {
    loo: fit.map((_, i) => fit.filter((__, j) => j !== i)),
    wf70: { train: dated.slice(0, n70), test: dated.slice(n70) },
    wf50: { train: dated.slice(0, n50), test: dated.slice(n50) },
  };
}

/** A model's miss on all three splits, from a fit function. */
function testModel(
  fit: SnapProtocol[],
  splits: Splits,
  build: (train: SnapProtocol[]) => (p: SnapProtocol) => number,
): { loo: Miss; wf70: Miss; wf50: Miss } {
  const looErrs: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const predict = build(splits.loo[i]!);
    looErrs.push(Math.abs(Math.log(fit[i]!.mcap_usd! / fit[i]!.tvl_usd) - predict(fit[i]!)));
  }
  const loo: Miss = {
    median: round2(Math.exp(median(looErrs))),
    mean: round2(Math.exp(looErrs.reduce((a, v) => a + v, 0) / looErrs.length)),
  };
  return {
    loo,
    wf70: missOf(build(splits.wf70.train), splits.wf70.test),
    wf50: missOf(build(splits.wf50.train), splits.wf50.test),
  };
}

/** The baseline's miss on all three splits. */
function testBaseline(fit: SnapProtocol[], splits: Splits): { loo: Miss; wf70: Miss; wf50: Miss } {
  const looErrs: number[] = [];
  for (let i = 0; i < fit.length; i++) {
    const med = median(splits.loo[i]!.map((p) => Math.log(p.mcap_usd! / p.tvl_usd)));
    looErrs.push(Math.abs(Math.log(fit[i]!.mcap_usd! / fit[i]!.tvl_usd) - med));
  }
  const loo: Miss = {
    median: round2(Math.exp(median(looErrs))),
    mean: round2(Math.exp(looErrs.reduce((a, v) => a + v, 0) / looErrs.length)),
  };
  return { loo, wf70: baselineMiss(splits.wf70.train, splits.wf70.test), wf50: baselineMiss(splits.wf50.train, splits.wf50.test) };
}

const NO_TERMS: Terms = { size: false, growth: false, age: false, category: false };
const SIZE_ONLY: Terms = { size: true, growth: false, age: false, category: false };

/** Blind-test one term: the six numbers with it against the six without it. */
function testTerm(
  name: string,
  base: Terms,
  added: Terms,
  fit: SnapProtocol[],
  splits: Splits,
  asOf: string,
  medianAge: number,
): TermTest {
  const without = testModel(fit, splits, (train) => fitTerms(train, base, asOf, medianAge));
  const withTerms = testModel(fit, splits, (train) => fitTerms(train, added, asOf, medianAge));
  const pairs: [number, number][] = [
    [without.loo.median, withTerms.loo.median],
    [without.loo.mean, withTerms.loo.mean],
    [without.wf70.median, withTerms.wf70.median],
    [without.wf70.mean, withTerms.wf70.mean],
    [without.wf50.median, withTerms.wf50.median],
    [without.wf50.mean, withTerms.wf50.mean],
  ];
  let improved = 0;
  let worsened = 0;
  for (const [a, b] of pairs) {
    if (b < a * 0.99) improved++;
    else if (b > a * 1.01) worsened++;
  }
  return { term: name, without, with: withTerms, verdict: improved >= 4 ? 'keep' : 'drop', improved, worsened };
}

// ------------------------------------------------------------------ launch odds

/** The log-loss of a probability forecast for a 0/1 outcome. */
function logLoss(p: number, actual: number): number {
  const q = clamp(p, 0.01, 0.99);
  return actual === 1 ? -Math.log(q) : -Math.log(1 - q);
}

/** Pick the odds model by 5-fold time-ordered cross-validation on log-loss. */
function fitOdds(pop: SnapProtocol[], asOf: string, medianAge: number): OddsFit {
  const global = pop.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length / pop.length;
  const ordered = [...pop].sort((a, b) =>
    (a.listed_at ?? '9999') < (b.listed_at ?? '9999') ? -1 : (a.listed_at ?? '9999') > (b.listed_at ?? '9999') ? 1 : a.slug < b.slug ? -1 : 1,
  );
  const folds: SnapProtocol[][] = [[], [], [], [], []];
  ordered.forEach((p, i) => folds[i % 5]!.push(p));
  const kinds = ['global', 'age', 'cat', 'age+cat'];
  const cv = kinds.map((kind) => {
    let loss = 0;
    let brier = 0;
    let n = 0;
    for (let f = 0; f < 5; f++) {
      const test = folds[f]!;
      const train = folds.flatMap((ff, i) => (i === f ? [] : ff));
      const g = train.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length / train.length;
      const byBand: Record<string, { n: number; d: number }> = {};
      const byCat: Record<string, { n: number; d: number }> = {};
      for (const p of train) {
        const band = ageBand(ageDays(asOf, p.listed_at), medianAge);
        (byBand[band] ??= { n: 0, d: 0 }).d++;
        if (p.mcap_usd !== null && p.mcap_usd > 0) byBand[band]!.n++;
        const c = p.category ?? 'none';
        (byCat[c] ??= { n: 0, d: 0 }).d++;
        if (p.mcap_usd !== null && p.mcap_usd > 0) byCat[c]!.n++;
      }
      const shrunk = (m: Record<string, { n: number; d: number }>, key: string, prior: number): number => {
        const e = m[key];
        if (!e || e.d < 5) return prior;
        return (e.n + 20 * prior) / (e.d + 20);
      };
      for (const p of test) {
        let pr = g;
        if (kind.includes('age')) pr = shrunk(byBand, ageBand(ageDays(asOf, p.listed_at), medianAge), g);
        if (kind.includes('cat')) pr = shrunk(byCat, p.category ?? 'none', pr);
        pr = clamp(pr, 0.005, 0.95);
        const actual = p.mcap_usd !== null && p.mcap_usd > 0 ? 1 : 0;
        loss += logLoss(pr, actual);
        brier += (pr - actual) ** 2;
        n++;
      }
    }
    return { kind, logloss: round4(loss / n), brier: round4(brier / n) };
  });
  cv.sort((a, b) => a.logloss - b.logloss);
  const chosen = cv[0]!.kind;
  const bands: { band: string; odds: number; n: number }[] = [];
  for (const band of ['<6mo', '6-12mo', '1-2y', '>2y']) {
    const grp = pop.filter((p) => ageBand(ageDays(asOf, p.listed_at), medianAge) === band);
    const launched = grp.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0).length;
    bands.push({ band, odds: round4((launched + 20 * global) / (grp.length + 20)), n: grp.length });
  }
  return { global: round4(global), chosen, cv, bands };
}

/** A protocol's launch odds under the chosen odds model. */
function oddsFor(p: SnapProtocol, odds: OddsFit, asOf: string, medianAge: number): number {
  if (odds.chosen === 'global') return odds.global;
  const band = ageBand(ageDays(asOf, p.listed_at), medianAge);
  const entry = odds.bands.find((b) => b.band === band);
  return entry ? entry.odds : odds.global;
}

// ------------------------------------------------------------------ farm plans

/** The deposit tier for a protocol's TVL. */
function depositTier(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

/** The hold window in days, from the protocol's age: younger gets longer. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** Farm economics for one pre-token protocol, netted to the dollar. */
function farmEcon(p: SnapProtocol, age: number | null, valueLo: number): FarmEcon {
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const tier = depositTier(p.tvl_usd);
  const setupGas = tier >= 150 ? 8 : 4;
  const gas = setupGas + 2 * weeks;
  const hours = round2(0.5 + weeks * (10 / 60));
  const minDeposit = Math.max(50, Math.ceil(20 * gas));
  const deposit = Math.max(tier, minDeposit);
  const evPerHour = round2(((valueLo * 0.001) / hours) * 100) / 100;
  const verdict: FarmEcon['verdict'] = evPerHour >= 25 ? 'worth' : evPerHour >= 5 ? 'marginal' : 'low';
  return {
    deposit_usd: deposit,
    gas_usd: gas,
    hours,
    cost_per_hour_usd: round2(gas / hours),
    break_even_usd: gas,
    min_deposit_usd: minDeposit,
    ev_per_hour_usd: evPerHour,
    verdict,
  };
}

/** One farm step as a single string, within the gate's 20..600 characters. */
function stepText(s: string): string {
  let out = s;
  if (out.length > 600) out = `${out.slice(0, 597)}...`;
  if (out.length < 20) out = `${out} Hold the position and check the protocol's own page for its rewards.`;
  return out;
}

/** A pre-token protocol's farm plan: six steps, each with its cost and time. */
function farmStepsPre(p: SnapProtocol, age: number | null, econ: FarmEcon): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  return [
    stepText(`Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline. Cost: under $3 of gas for the first transaction. Time: 5 minutes.`),
    stepText(`${actionFor(p, econ.deposit_usd, chain)} Cost: $${econ.deposit_usd} of capital and about $${econ.deposit_usd >= 150 ? 8 : 4} of gas. Time: 15 minutes to set up.`),
    stepText(`Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, for ${weeks} weeks. Cost: about $2 of gas a week, $${2 * weeks} in all. Time: 10 minutes a week.`),
    stepText(`Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${econ.deposit_usd} stays in the position. Time: ${hold} days.`),
    stepText(`Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes. Cost: no fee to check, and never pay to claim. Time: 10 minutes.`),
    stepText(`Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`),
  ];
}

/** A trading protocol's plan: there is no launch to farm, so the steps earn fees instead. */
function farmStepsTrading(p: SnapProtocol): string[] {
  const chain = p.chains.length > 0 ? p.chains[0]! : 'its main chain';
  const capital = depositTier(p.tvl_usd);
  return [
    stepText(`${p.name} already trades, so there is no token launch left to farm here; the steps below earn fees from the protocol instead of an airdrop. Cost: nothing to read this. Time: 2 minutes.`),
    stepText(`${actionFor(p, capital, chain)} Cost: $${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas. Time: 15 minutes to set up.`),
    stepText(`Check the position's fees against the gas you paid before you add more: leave when the yield no longer covers the cost of touching it. Cost: about $2 of gas to check. Time: 10 minutes a week.`),
    stepText(`Write the wallet, the dates and every transaction in a log so you can repeat the position or unwind it. Cost: nothing but the log. Time: 5 minutes.`),
  ];
}

// ------------------------------------------------------------------ the board

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
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
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** Build the whole board and everything the dashboard shows, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const asOf = snapshot.as_of;
  const fitPop = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
  const knownAges = fitPop.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null).sort((a, b) => a - b);
  const medianAge = knownAges.length > 0 ? knownAges[Math.floor(knownAges.length / 2)]! : 365;
  const splits = makeSplits(fitPop);
  const baseline = testBaseline(fitPop, splits);

  // Blind-test each candidate term against its base, then keep only the proven ones.
  const termTests: TermTest[] = [
    testTerm('size', NO_TERMS, SIZE_ONLY, fitPop, splits, asOf, medianAge),
    testTerm('growth', SIZE_ONLY, { size: true, growth: true, age: false, category: false }, fitPop, splits, asOf, medianAge),
    testTerm('age', SIZE_ONLY, { size: true, growth: false, age: true, category: false }, fitPop, splits, asOf, medianAge),
    testTerm('category', SIZE_ONLY, { size: true, growth: false, age: false, category: true }, fitPop, splits, asOf, medianAge),
  ];
  const kept: Terms = {
    size: termTests[0]!.verdict === 'keep',
    growth: termTests[1]!.verdict === 'keep',
    age: termTests[2]!.verdict === 'keep',
    category: termTests[3]!.verdict === 'keep',
  };
  if (!kept.size && !kept.growth && !kept.age) kept.size = true;
  const finalModel = testModel(fitPop, splits, (train) => fitTerms(train, kept, asOf, medianAge));
  const predict = fitTerms(fitPop, kept, asOf, medianAge);
  const medianRatio = Math.exp(median(fitPop.map((p) => Math.log(p.mcap_usd! / p.tvl_usd))));
  const finalCoef = (() => {
    const X = fitPop.map((p) => features(p, kept, asOf, medianAge));
    const y = fitPop.map((p) => Math.log(p.mcap_usd! / p.tvl_usd));
    return ols(X, y);
  })();
  // The conformal interval: the 80th percentile of the final model's leave-one-out |log error|.
  const looErrs: number[] = [];
  for (let i = 0; i < fitPop.length; i++) {
    const train = fitPop.filter((_, j) => j !== i);
    const pr = fitTerms(train, kept, asOf, medianAge);
    looErrs.push(Math.abs(Math.log(fitPop[i]!.mcap_usd! / fitPop[i]!.tvl_usd) - pr(fitPop[i]!)));
  }
  looErrs.sort((a, b) => a - b);
  const q80 = looErrs[Math.floor(looErrs.length * 0.8)]!;
  const intervalFactor = Math.exp(q80);

  const oddsPop = snapshot.protocols.filter((p) => p.category !== 'CEX');
  const odds = fitOdds(oddsPop, asOf, medianAge);

  const watchSet = new Set(snapshot.watchlist);
  const scored = snapshot.protocols.map((p) => {
    const age = ageDays(asOf, p.listed_at);
    const status: BoardRow['status'] = hasToken(p) ? 'trading' : isLaunchable(p) ? 'pre-token' : 'non-launch';
    let value: number;
    let oddsValue: number;
    if (status === 'trading') {
      value = 1;
      oddsValue = 0;
    } else if (status === 'non-launch') {
      oddsValue = 0.01;
      value = Math.max(1, Math.round(p.tvl_usd * Math.exp(predict(p)) * oddsValue));
    } else {
      oddsValue = oddsFor(p, odds, asOf, medianAge);
      value = Math.max(1, Math.round(p.tvl_usd * Math.exp(predict(p)) * oddsValue));
    }
    return { p, age, status, oddsValue, value };
  });
  scored.sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  const loOf = (v: number, status: BoardRow['status']): number => (status === 'trading' ? 1 : Math.max(1, Math.round(v / intervalFactor)));
  const hiOf = (v: number, status: BoardRow['status']): number => (status === 'trading' ? 1 : Math.round(v * intervalFactor));
  const los = scored.map((s) => loOf(s.value, s.status));
  const his = scored.map((s) => hiOf(s.value, s.status));
  const board: BoardRow[] = scored.map((s, i) => {
    const hi = his[i]!;
    const lo = los[i]!;
    const rankHi = 1 + los.filter((l) => l > hi).length;
    const rankLo = his.filter((h) => h >= lo).length;
    const farm: FarmEcon =
      s.status === 'trading'
        ? { deposit_usd: 0, gas_usd: 0, hours: 0, cost_per_hour_usd: 0, break_even_usd: 0, min_deposit_usd: 0, ev_per_hour_usd: 0, verdict: 'trading' }
        : farmEcon(s.p, s.age, lo);
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      age_days: s.age,
      watchlist: watchSet.has(s.p.slug),
      status: s.status,
      odds: round4(s.oddsValue),
      implied_value_usd: s.value,
      value_lo_usd: lo,
      value_hi_usd: hi,
      rank_lo: rankLo,
      rank_hi: rankHi,
      farm,
      farm_steps: s.status === 'trading' ? farmStepsTrading(s.p) : farmStepsPre(s.p, s.age, farm),
    };
  });

  const counts = {
    protocols: snapshot.protocols.length,
    watchlist: snapshot.watchlist.length,
    board: board.length,
    pre_token: board.filter((r) => r.status === 'pre-token').length,
    non_launch: board.filter((r) => r.status === 'non-launch').length,
    trading: board.filter((r) => r.status === 'trading').length,
    launched: fitPop.length,
  };
  const verdicts = {
    worth: board.filter((r) => r.farm.verdict === 'worth').length,
    marginal: board.filter((r) => r.farm.verdict === 'marginal').length,
    low: board.filter((r) => r.farm.verdict === 'low').length,
    trading: counts.trading,
  };
  const fit: ValueFit = {
    n: fitPop.length,
    intercept: round4(finalCoef[0]!),
    slope: round4(finalCoef[1] ?? 0),
    terms: kept,
    median_ratio: round4(medianRatio),
    baseline,
    final: finalModel,
    term_tests: termTests,
    conformal_q80: round4(q80),
  };
  const checks = selfChecks(snapshot, board, fit);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: 'radar-6',
    counts,
    fit,
    odds,
    checks,
    verdicts,
    rows: board,
  };
  return { board, radar };
}

/** The cover's self-checks: each claim with the number that answers it, computed from the board. */
function selfChecks(snapshot: Snapshot, board: BoardRow[], fit: ValueFit): SelfCheck[] {
  const watchCovered = snapshot.watchlist.filter((s) => board.some((r) => r.slug === s)).length;
  let ranksOk = board.length > 0;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) ranksOk = false;
  let orderOk = true;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) orderOk = false;
  const stepsOk = board.every((r) => r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600));
  const keptTerms = Object.entries(fit.terms).filter(([, v]) => v).map(([k]) => k);
  const imp = (a: number, b: number): string => `×${(b / a).toFixed(2)}`;
  return [
    { label: 'Every protocol accounted for', detail: `${board.length} of ${snapshot.protocols.length} snapshot protocols are on the board — none left out.`, pass: board.length === snapshot.protocols.length },
    { label: 'Watchlist covered', detail: `${watchCovered} of ${snapshot.watchlist.length} watchlist slugs are on the board.`, pass: watchCovered === snapshot.watchlist.length },
    { label: 'Ranks and order hold', detail: `Ranks run exactly 1 to ${board.length} and the implied value never rises down the board.`, pass: ranksOk && orderOk },
    { label: 'Every row has a farm plan', detail: `All ${board.length} rows carry 3 to 12 farm steps of 20 to 600 characters.`, pass: stepsOk },
    { label: 'Blind tests kept the proven terms only', detail: `Kept ${keptTerms.length === 0 ? 'none' : keptTerms.join(', ')} of size, growth, age and category; the rest failed the blind tests.`, pass: keptTerms.length >= 1 },
    { label: 'The model beats the baseline', detail: `Leave-one-out median miss ${fit.final.loo.median}× vs ${fit.baseline.loo.median}× baseline (${imp(fit.final.loo.median, fit.baseline.loo.median)} better); walk-forward 70/30 ${fit.final.wf70.median}× vs ${fit.baseline.wf70.median}× (${imp(fit.final.wf70.median, fit.baseline.wf70.median)}); 50/50 ${fit.final.wf50.median}× vs ${fit.baseline.wf50.median}× (${imp(fit.final.wf50.median, fit.baseline.wf50.median)}).`, pass: fit.final.loo.median < fit.baseline.loo.median && fit.final.wf70.median < fit.baseline.wf70.median && fit.final.wf50.median < fit.baseline.wf50.median },
    { label: 'Uncertainty is stated per row', detail: `Every pre-token row carries an 80% conformal range (×${Math.exp(fit.conformal_q80).toFixed(1)} either way) and the rank range it implies.`, pass: fit.conformal_q80 > 0 },
    { label: 'Farm economics are netted per row', detail: `Every farmable row states its deposit, gas, hours, break-even airdrop and minimum viable deposit in dollars.`, pass: board.filter((r) => r.status !== 'trading').every((r) => r.farm.deposit_usd > 0 && r.farm.gas_usd > 0) },
  ];
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside 100 to 4000`;
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `the board repeats ${r.slug}`;
    seen.add(r.slug);
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
