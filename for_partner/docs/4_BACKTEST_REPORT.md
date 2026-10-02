# Backtest report - SME Baseline v1

*Data: XAU M3 (1 Sep - 1 Oct 2026, broker feed, real spread about 14 points) and gold H1 (Dukascopy, Sep 2023 - Sep 2026, spread assumed 0.20). All results are net of spread. R = the amount risked on one trade.*

## The chosen configuration
- **Fill:** first touch of the block's near edge (limit order), stop at the far edge, one use, then the block is deleted
- **Exit:** the first run flip against the trade (at the next open), or the stop
- **Bias:** previous session's net move, fixed for the session (Asia, London, New York)
- **Entries:** primary blocks only (beta entries off)

## Results

| | Trades | Avg R | Total | PF | Consistency |
|---|---|---|---|---|---|
| **XAU M3, 1 Sep to 1 Oct** | 180 | +0.29 | **+52.4R** | 1.54 | 1-15 Sep **+48.7R**, 16 Sep-1 Oct **+3.6R** |
| **Gold H1, 3 years** | 437 | +0.27 | **+117.1R** | 1.51 | **all 4 years positive** (+23.3, +29.8, +45.8, +18.1R) |
| The original rule, for comparison | 420 / 629 | -0.14 / -0.22 | **-57.7R / -135.7R** | 0.81 / 0.70 | 0 of 4 years |

## What to expect on a trade-by-trade basis
| | M3 month | H1, 3 years |
|---|---|---|
| Win rate | 36% | 35% |
| Average win | +2.33R | +2.31R |
| Average loss | -0.83R | -0.81R |
| Longest losing streak | 11 | 14 |
| Worst dip from a peak | 13.1R | 11.7R |
| Trades ended by the stop | 43% | 43% |
| Trades per active day | about 8.6 | about 1.2 |

It loses about two trades in three. The winners are big enough to pay for them. A run of 10 or more losses is normal.

## What decided it
We compared **64 combinations** (`reference/grid_64_configs_results.txt`). **32 were profitable on both datasets and 20 also held up in every sub-period.**
Every top configuration uses the first-touch fill; none uses the counter-run fill we started with.

- **Fill rule:** first touch beat "wait for a counter-move" on every sample (H1 3 years: +39R vs -136R; M3 month: +50R vs -58R).
- **Bias:** previous-session net move was the strongest bias we tried. It beat a rolling higher-timeframe bias (M3 PF 1.32 vs 1.27; H1 3 years PF 1.43 vs 1.13).
- **Beta entries (trading a failed block from the other side):** add total R but lower the quality (with beta on, H1 PF falls from 1.51 to 1.32). Left out of v1; an option for later.
- **Swing-structure filter (only trade while higher-timeframe highs and lows step the same way):** lifted the M3 month (PF 2.03) but cut the 3-year result from +117R to +27R and made 2023 negative. Not adopted; kept as an option in our research code.
- **"Break must clear the whole V base":** lowered the totals. Not adopted.
- **Minimum zone size, breakeven stops, order expiry, stop buffers, daily loss caps, spread filter:** mixed or no help.
- **Candle validity:** the one-shot "close beyond the flip candle" rule fits the M3 data best.

## What this does and does not prove
- There is **only one month of M3 data**, and its edge **faded in the second half of September** (+3.6R, PF 1.06). That is the number to watch most closely.
- We **picked the winner from 64 options on the same data**, which flatters it. Expect live results to be lower.
- Limit fills at the touch are **optimistic** (no queue, no slippage). Same-candle stops are **pessimistic**.
- The 3-year test is on H1 candles, while the system was designed on M3; the two timeframes agree, but they are not identical tests.
- The H1 sessions are fixed in UTC, so they drift by an hour in winter.
- Nothing here is a guarantee. This is research that now needs forward data.

## To reproduce
```
python code/backtest.py
```
Expected: M3 -> 180 trades, +52.4R, PF 1.54 | H1 -> 437 trades, +117.1R, PF 1.51.
Trade lists for comparison are in `expected/`. Data hashes: M3 `4fbc35b85270`, H1 `810f76854508`.

## Other things we learned along the way (details in `reference/research_notes_full.md`)
- Our first rule (wait for a counter-move before filling) was the **weakest** variant on every sample. The trades it excluded were the best ones.
- Trades filled on a touch that only "qualified" after the candle closed cannot be executed with a resting limit order, and were also the weakest group.
- Higher-timeframe bias held longer than 12 candles did **not** make trades better; a long-held reference mostly means the market is stalled.
- A near-flat previous session gives a poor bias (the biggest losses came from sessions that followed a session with almost no net move). A possible future filter.
