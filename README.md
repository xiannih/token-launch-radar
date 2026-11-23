# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Which pre-token protocol is worth farming next — and what to do about it.

The radar reads a sealed snapshot of every protocol DefiLlama tracks (758 protocols at or above $5M TVL, snapshot 2026-11-14), finds the ones that record no token and are not a wrapped, staked or bridged product of one that trades, and ranks them by what their launch would be worth. The board holds 198 rows: every eligible pre-token protocol, no filler. Token-trading protocols are excluded outright — even a heavy penalty leaves a $100B-TVL token protocol above a $5M pre-token one, so including them would break the board's value order — and the twelve biggest of them are listed on the dashboard with their market-cap-to-TVL ratios. Every row carries a costed farm plan with a verdict.

## How the value is worked out — fitted from the snapshot, not guessed

```
expected value = TVL × category multiple × size × growth × age × token odds
```

Every coefficient is fitted at run time from the snapshot's own launched protocols (128 with a positive market cap; 16 more record a market cap of $0 or less and are left out of the fit):

- **Category multiple** — the median market-cap-per-TVL of launched protocols in the same category, shrunk toward the global median (×0.214) with three pseudo-protocols at the global rate, clamped to 0.05–1.50. Basis Trading ×0.522, RWA ×0.260, Lending ×0.146, Dexs ×0.315; a category with no launched peer takes the global median. It is a category rate, never a list of names.
- **Size** — `(TVL / $100M)` raised to the fitted log-log slope of −0.437, clamped to a factor of 0.50–1.50. Big protocols trade at far lower multiples: the median ratio is ×0.419 at $5–50M TVL and ×0.032 at $1–10B.
- **Growth** — `1 + k × clamp(7-day TVL change, −25%, +40%) / 100` with k fitted from launched protocols that grew against ones that shrank. On this snapshot k = 0: growing paid nothing, so the term stays ×1.00, and the dashboard says so.
- **Age** — `exp(−0.223 × min(years since first tracked, 4))`, clamped to 0.80–1.20. Younger protocols trade at higher multiples, so age is a small penalty, not a bonus. Missing date is neutral (×1.00).
- **Token odds** — the share of the protocol's peers (same category, same age band: under two years tracked, or two and over) that already record a token, shrunk toward the snapshot's overall launch rate of 19%. Risk Curators sit at 4% — only 1 of 39 has launched — so the $2.76B Sentora Curator ranks 7th at $13.9M, behind BitFi Basis at $26.2M. The value is an expected value: what a launch would be worth, times the chance a protocol like it launches at all.

**Hold-out test.** The 128 launched protocols are split in half by slug; the terms are fitted on one half and used to predict the other's market caps. Median miss 4.01× one way and 3.97× the other, against 5.11× and 5.47× for a global-median-only baseline. The fit explains little — market-cap-per-TVL is noisy — so the board is a ranking by the fitted median, never a price forecast.

**Farm verdicts.** Each row's cost is its first chain's gas rate times 12 transactions plus a capital tier by TVL band ($200–$1,000), over 8–12 weeks. The verdict comes from expected value per dollar of cost, cut at the board's quartiles: 50 worth farming, 99 marginal, 49 low priority.

A protocol here **records** no token — that is DefiLlama's record, not proof it has none. The implied value is this radar's claim, never a prediction of whether or when a token launches, or at what price.

## The dashboard

`dashboard/` is a static page that renders with no network: a sortable, filterable board (category, chain, pre-token only, watchlist only, text search, token odds), a detail view for every protocol with its value breakdown, token odds and costed farm plan, a fitted-multiples table, the excluded already-trading protocols, and a methodology strip that states the fitted coefficients and the hold-out test in full. Serve the output directory and open `dashboard/index.html`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json`, the dashboard data, copies `dashboard/` and `screenshots/` to the output directory, and writes `dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. Run it twice and the output is byte-identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1tgem1mj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
