# Forward test guide - what to do, what to expect, what to send back

## The goal
Find out whether Baseline v1 behaves on a **demo account in real time** the way it did in the backtest.
We are measuring, not hoping. A boring, unchanged run for 4-6 weeks is a success whatever the result.

## What to do
1. Run `4_run_demo_trading.bat` and leave it running through the trading week with MetaTrader open. Gold trades from Monday morning to Friday night, with a short break around 00:00-01:00 broker time every day.
2. **Do not touch the orders, do not move stops, do not turn it off after a losing run.** The point is to see the system as it is.
3. Check once a day that the window is still running and MT5 is connected.
4. Weekly: double-click `5_make_report.bat`, then send us the files listed below.

## How long
At least **4 weeks and at least 100 closed trades** before drawing any conclusion. On M3 gold we expect roughly **5-9 trades per active day**,
so 100 trades should arrive within 3 weeks. Fewer than 100 trades is noise.

## What normal looks like (from the backtests)
| | M3, Sep 2026 | H1, 3 years |
|---|---|---|
| Win rate | about **36%** | about **35%** |
| Average winner | about **+2.3R** | about **+2.3R** |
| Average loser | about **-0.8R** | about **-0.8R** |
| Longest losing streak | **11** | **14** |
| Worst drop from a peak | about **13R** | about **12R** |
| Profit factor | **1.54** | **1.51** |

("R" = the amount risked on one trade. +2.3R means the trade made 2.3 times what it risked.)
**A streak of 10+ losses is part of the system.** It is not a bug.

## When to STOP and contact us (any of these)
- The runner prints `OFFSET MISMATCH`, `order FAILED` repeatedly, or crashes.
- Orders appear with the wrong side (a buy when the printed bias said sells only) or with a stop-loss on the wrong side.
- The loss on a single trade is clearly bigger than about 1.1x the risk printed in `logs/orders.csv`.
- The demo account is down more than **25R** from its peak (that would be about twice the worst backtest drop).
- Anything that looks odd. Stopping early costs nothing.

## What to send back every week
1. The whole **`logs/`** folder (`decisions.csv` = every decision the runner made, `orders.csv` = every order it placed)
2. **`forward_results.csv`** (made by `5_make_report.bat` - every closed trade with its result in R)
3. A screenshot of the MT5 account history for the week
4. Any notes: times when the PC or MT5 was off, anything odd

## What we will do with it
Compare your trades with what the backtest would have done on the same days, trade by trade. Where they differ
(fills that did not happen, slippage, exits, spread) that is the information we cannot get from history.
It will tell us what to fix before this ever goes near real money.

## Ideas welcome - but write them down, don't change the test
If you notice something (a pattern in the losers, a session that seems bad), keep a note with the date and time and send it.
We will test it on the data properly instead of guessing.

## First-day checklist (the order-sending code is untested on a real demo)
Before leaving it alone, confirm in MetaTrader that the first order the runner places has: the **correct side** for the printed bias
(sell limit when it said "sells only"), an **entry price equal to the block edge** printed in the log, a **stop-loss on the far side**, and a **lot size** that
risks about 0.5% of the balance if the stop is hit. Then confirm that when it closes a trade, the position is really gone from MT5. If any of this is off, stop and send us the log.
