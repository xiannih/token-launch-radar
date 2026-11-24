# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a frozen snapshot of 758 DeFi protocols and ranks every one of them by the implied value of a token it has not launched yet. The 342 pre-token protocols are ranked by a value model fitted at run time from the 128 protocols whose token already has a measured market cap; the 416 that already trade are listed at $1 — no launch left — with their realized market cap beside them, so no protocol is left unaccounted for.

The model keeps only what blind tests prove: log(market cap / TVL) regressed on log(TVL), with growth, age and category multiples all dropped after leave-one-out and two walk-forward splits showed they do not help. Launch odds come from same-age-band peers, picked by 5-fold time-ordered cross-validation. Every pre-token row carries an 80% conformal value range and the rank range it implies, and every farm plan is netted to the dollar — deposit, gas, hours, break-even airdrop, minimum viable deposit and expected value per hour.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Node 22 or later, standard library only — nothing to install. The program writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1tgem1mj&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
