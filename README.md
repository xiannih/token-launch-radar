# Token Launch Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/xiannih/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for make.fun's "Build the best token launch radar"
bounty: 758 DeFi protocols ranked by what their token would be worth if
they launched one today, with a costed farm plan on every row and an
offline, sortable dashboard with a per-protocol detail view.

## The model, in one paragraph

The implied value is `exp(6.9646 + 0.5223 × ln TVL) × launch odds`, fitted
at run time from the snapshot's own 128 live-token protocols. Launch odds
are the share of protocols in the protocol's age band that already
launched. Blind tests: leave-one-out median miss 3.40× vs 5.09× for a
naive median-multiple baseline (1.50× better); walk-forward 3.41× and
3.06×. The fit is weak and the board says so — every row carries an 80%
conformal range spanning ×11.43 either way. V7 adds a 0.5× structural
discount for curator protocols whose TVL is nested inside other protocols
(Sentora Curator falls from #1 to #3) and a much thicker dashboard: KPI
band, SVG charts, a full METHOD.md, and a fourth screenshot of the model.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` reads the snapshot from `$MAKEFUN_INPUT_DIR` (else `/input`),
writes the board to `$MAKEFUN_OUTPUT_DIR/board.json`, the dashboard's data
to `$MAKEFUN_OUTPUT_DIR/data.js`, and the dossier to
`$MAKEFUN_OUTPUT_DIR/dossier.json`. It takes no arguments, reads no
network, and writes the same bytes on every run. The full method,
calibration, audit and limits are in `dashboard/METHOD.md`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
