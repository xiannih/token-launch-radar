# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Which pre-token protocol is worth farming next — and what to do about it.

The radar reads a sealed snapshot of every protocol DefiLlama tracks (758 protocols at or above $5M TVL, snapshot 2026-11-14), finds the ones that record no token and are not a wrapped, staked or bridged product of one that trades, and ranks them by what their launch would be worth. The board holds 198 rows: every eligible pre-token protocol, no filler. Token-trading protocols are excluded outright — even a heavy penalty leaves a $100B-TVL token protocol above a $5M pre-token one, so including them would break the board's value order. Every row carries a concrete farm plan with cost and time.

## How the value is worked out

```
implied value = TVL × category multiple × size dampener × growth × age
```

- **TVL** — the snapshot's own figure. A dollar of TVL counts less at $2B than at $50M, so the size dampener is `(TVL / $100M)^-0.12`, clamped to 0.65–1.25.
- **Category multiple** (0.80–1.15) — what comparable launched tokens trade at per dollar of TVL, by category: Risk Curators 1.15, RWA and Onchain Capital Allocators 1.05, Lending 0.95, Dexs 0.85, the rest 0.80–0.90. It is a category rate, never a list of names.
- **Growth** — `1 + 0.6 × clamp(7-day TVL change, −25%, +40%) / 100`. A protocol growing 40% in a week gets ×1.24; one shrinking 25% gets ×0.85. Missing change counts as 0.
- **Age** — `0.88 + 0.12 × min(years since first tracked, 4) / 4`. Older protocols are more credible; missing date is neutral (×1.00).
- **Token exclusion** — a protocol that already records a token is not ranked at all. It is not a launch candidate, and no penalty can place it honestly on a value-ordered board (see above).

A protocol here **records** no token — that is DefiLlama's record, not proof it has none. The implied value is this radar's claim, never a prediction of whether or when a token launches, or at what price.

## The dashboard

`dashboard/` is a static page that renders with no network: a sortable, filterable board (category, chain, pre-token only, watchlist only, text search), a detail view for every protocol with its value breakdown and farm plan, and a methodology box that states the formula in full. Serve the output directory and open `dashboard/index.html`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes `board.json`, the dashboard data, copies `dashboard/` and `screenshots/` to the output directory, and writes `dossier.json` with `buildDossier` from `vendor/makefun-board.ts`. Run it twice and the output is byte-identical.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1tgem1mj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
