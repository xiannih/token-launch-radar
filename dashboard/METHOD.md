# Token launch radar — method, calibration and audit

Evidence record for this radar. Everything here was measured against the
sealed DefiLlama snapshot (as_of 2026-11-14, 758 protocols) or computed from
it by the entry's own build code. Nothing was fetched live: the snapshot
carries circulating market cap only, no FDV, so every multiple below is
mcap/TVL, not FDV/TVL.

## 1. What this radar claims

A protocol's launch is the token it may issue one day. This board says what
that token would be worth if the protocol's record stayed as it is, and what
a reader should do to farm the protocol before or after it issues one. It
does not predict whether or when a token is issued. An implied value is this
entry's own claim, never make.fun's.

## 2. The snapshot

758 protocols at or above $5,000,000 of TVL, one object each. Each carries
`slug`, `name`, `category`, `chains`, `tvl_usd`, `change_7d`, `mcap_usd`
(null when it records no token), `listed_at`, `gecko_id` and `symbol`.
The watchlist holds 40 protocols: TVL at or above the $50,000,000 floor,
no token recorded, not a wrapped, staked or bridged product of a protocol
whose token already trades, and passing the category, name and exchange
rules in the bounty text. The board covers all 40, and all 758 protocols.

## 3. The value model

One formula produces every implied value on the board:

    implied = exp(6.9646 + 0.5223 × ln TVL) × launch odds

The fit is a least-squares line of log market cap on log TVL, fitted at run
time on the 128 protocols that record a market cap above zero. Ten times the
TVL is worth about 3.3× more, not 10×. No other term survived: size, growth,
age and category were each tested against the blind tests below, and only
size improved at least 4 of the 6 blind-test numbers, so only size is in.

### Blind tests

The model is scored against a naive baseline — the global median mcap/TVL
times TVL — on three splits. "Miss" is how far the typical prediction lands
from the truth, in multiples; lower is better.

| Test | Model miss (median / mean) | Baseline miss (median / mean) | Gain |
| --- | --- | --- | --- |
| Leave-one-out (128 comps) | 3.40× / 22.48× | 5.09× / 39.86× | 1.50× |
| Walk-forward, last 30% by listing date | 3.41× / 44.14× | 5.22× / 96.76× | 1.53× |
| Walk-forward, last 50% by listing date | 3.06× / 25.28× | 5.33× / 61.58× | 1.74× |

The walk-forward splits train on older listings and test on newer ones, so
no test row's own label leaks into its prediction. The mean misses are much
worse than the medians: a few comps are off by 50× or more, and the mean
carries them. The median is the honest headline.

The fit explains little. Size alone carries an R² near 0.17, and the median
prediction is still off by 3.4×. That is why every row carries a range
(section 6) instead of a bare point value, and why the board never presents
a value as a price.

## 4. Launch odds

Odds are the share of protocols in the protocol's age band (whole years
since listing) that already launched — a peer rate, not a forecast.

| Age band | Protocols | Launched | Odds |
| --- | --- | --- | --- |
| 0–1 years | 160 | 10 | 0.0625 |
| 1–2 years | 183 | 22 | 0.1202 |
| 2–3 years | 139 | 21 | 0.1511 |
| 3–4 years | 89 | 22 | 0.2472 |
| 4–5 years | 66 | 18 | 0.2727 |
| 5+ years | 8 | 2 | 0.2500 |

Protocols with no listing date get the global rate, 128/758 = 0.1689.
Log-loss of the odds model on the 645 dated protocols is 0.3978.

A note on the previous version: it published band odds of 0.1218 for the
1-year band and 0.2316 for the 5-year band. The exact odds formula of that
version could not be recovered from its published numbers, so this version
uses the plain band shares above (0.1202 and 0.2500) and states the
difference here instead of fitting numbers to match. The ranking effect is
small: the same bands, the same order, values within 8% on the affected
rows. The curator discount in section 5 is the material change in V7, not
the odds.

Rows in the no-launch group — pre-token protocols in a category that has
almost never issued a token, with a versioned name, a wrapped/staked word,
or an exchange name — get odds 0.01, not the band rate. There are 144 of
them. Rows whose token already trades sit at $1: the launch already
happened, so there is nothing left to value.

## 5. The curator discount (new in V7)

Some protocols are curators: they allocate capital into other protocols,
and the TVL they report sits inside those underlying protocols. Counting
their TVL at face value counts the same dollars twice — once in the
underlying protocol, once in the curator. This board halves the implied
value of every pre-token row in the Risk Curators and Onchain Capital
Allocator categories: 54 rows, a structural rule by category, never by
name. No protocol is named in the rule; any protocol in those categories
gets the same 0.5×.

Before and after, top 10 curator rows (before values are this build's own
undiscounted model, so the comparison is apples to apples):

| Protocol | Before | After |
| --- | --- | --- |
| Sentora Curator | #1 · $10,841,951 | #3 · $5,420,976 |
| Steakhouse Financial | #2 · $10,834,548 | #4 · $5,417,274 |
| Gauntlet | #3 · $8,099,414 | #7 · $4,049,707 |
| Veda | #4 · $8,061,070 | #9 · $4,030,535 |
| Upshift | #8 · $4,440,181 | #21 · $2,220,091 |
| Hyperithm | #17 · $2,905,945 | #41 · $1,452,973 |
| K3 Capital | #19 · $2,809,099 | #45 · $1,404,550 |
| Clearstar | #23 · $2,465,323 | #55 · $1,232,662 |
| Lagoon | #25 · $2,380,333 | #58 · $1,190,167 |
| Nonce Capital | #26 · $2,343,653 | #62 · $1,171,827 |

The new top 5: Polymarket International $7,323,129; USDD $6,566,725;
Sentora Curator $5,420,976; Steakhouse Financial $5,417,274; Defi Saver
Asset Management $4,580,474. The discount is a structural prior, not a
fitted number: nothing in the snapshot can fit it, because no curator has
launched a token to learn from. It is the one judgement call in the model,
and it is shown here, not hidden.

## 6. Ranges

Every pre-token row carries an 80% conformal range: the value divided and
multiplied by 11.43, where 11.43 is exp of the 80th percentile of the
leave-one-out absolute log errors. Rank 1 could be #287 on that range; the
board says so on the row. The rank range on each row counts how many other
rows' ranges overlap it. Trading rows sit at $1 with a range of $1 to $1:
their value is known, not estimated.

## 7. Farm economics

Each row's farm plan is netted to the dollar. The assumptions are stated
here because they are assumptions, not snapshot data:

- Gas: dollars per transaction on the protocol's first listed chain
  (Ethereum $15, Avalanche $0.50, Arbitrum / Optimism / Base / BSC /
  zkSync Era / Linea / Scroll $0.30, Polygon / Blast / Mantle / Mode /
  Fraxtal / Gnosis / Fantom / Cronos $0.10, Solana $0.05, anything else
  $2), four transactions per plan.
- Deposit: $100 below $50M TVL, $250 below $500M, $500 above.
- Time: 2 hours plus 30 minutes per farm step.
- Expected airdrop value: implied value × launch odds × 0.0005 — a single
  active farmer capturing 0.05% of the launch value.
- Net value: expected airdrop minus gas minus 2% of the deposit as
  opportunity cost. Expected value per hour: net value divided by hours.
- Break-even: the implied value at which the expected airdrop exactly
  covers gas. Minimum viable deposit: the larger of the deposit tier and
  ten times the gas, so gas stays under a tenth of the deposit.
- Verdicts: worth at $20/hour or more, marginal at $5/hour or more, low
  below that. Across the board: 35 worth, 59 marginal, 664 low. Most farms
  do not pay after gas — the board says that, instead of dressing every
  protocol up as an opportunity.
- Already-trading rows farm fees, not a launch: 5% a year on the deposit,
  one month of fees against gas. Their expected airdrop is $0 by
  construction.

## 8. Coverage

758 rows: 198 pre-token ranked by implied value, 144 pre-token in the
no-launch group at odds 0.01, 416 already trading at $1. Watchlist 40/40.
Farm steps: 3–12 per row, each 20–600 characters, written for the
protocol's own category and chain.

## 9. Limitations

- The fit is weak (section 3). Every value is an order of magnitude.
- Odds are backward-looking peer rates, not forecasts.
- Gas prices and the farmer's share are assumptions; move them and the
  farm verdicts move. The assumptions are listed in section 7 so a reader
  can re-do the arithmetic.
- The curator discount is a prior, not a fit (section 5).
- A protocol that records no token may still have one its DefiLlama record
  does not carry; "pre-token" means "records no token", never "has none".

## 10. Audit — the program grades its own output

Before writing anything, the program checks its own board and reports the
results on the dashboard: 758 rows for 758 protocols; ranks exactly 1–758;
values non-increasing down the ranks; watchlist 40/40; every row's farm
steps 3–12 strings of 20–600 characters; the curator discount applied to
exactly the pre-token curator rows; every range bracketing its value. If
any check fails, the program exits 1 and writes nothing.

## 11. Reproducibility

Run `node main.ts` with the snapshot at `$MAKEFUN_INPUT_DIR/snapshot.json`
(or `/input/snapshot.json`) and the output at `$MAKEFUN_OUTPUT_DIR` (or
`$OUT_DIR`, or `/output`). The program takes no arguments, reads no
network, and writes the same bytes on every run: same board, same data,
same dossier.
