# SME Baseline v1 - Gold (XAUUSD) demo forward test

**Read this page first. It takes 5 minutes.**

## What this is
A rule-based gold trading system we built and tested on past data. It waits for price to come back to a "block"
(a specific candle where the market made a clear move), puts a pending limit order there, uses a stop-loss on the
far side of the block, and only trades in the direction of the previous session (Asia, London, New York).

In the backtests it **won about 1 trade in 3, but the winners were about 2.3x the size of the losers.** It lost
money on our *old* rule and made money on this *new* one - but that is only history. **What we need from you is
real forward data on a demo account.** That is the whole point of this folder.

## THE ONE RULE THAT MATTERS
**DEMO ACCOUNT ONLY. NEVER A REAL ACCOUNT.**
The auto-trader checks the account type and refuses to send any order if it is not a demo. Do not try to get
around that. Nothing in this folder is financial advice and there is no guarantee of any result.

## What you need
- A Windows PC (or Windows VPS) that can stay on during market hours
- MetaTrader 5 with a **demo** account at your broker (a demo balance of about 10,000 USD works well)
- Python 3.10 or newer (python.org)

## The 6 steps
1. Read `docs/2_SETUP.md` and do the install (about 10 minutes).
2. Double-click **`1_check_setup.bat`** - it tells you if everything is connected and which numbers to put in `code/config.py`.
3. Double-click **`2_run_backtest.bat`** - it re-runs our tests on your machine. It must say **"all reproduced"**.
4. Double-click **`3_run_dry_run.bat`** - it watches the market and prints what it *would* do, sending nothing. Leave it for a day to see how it behaves.
5. When you are happy, double-click **`4_run_demo_trading.bat`** - it places real orders, **on the demo account only**.
6. Every week double-click **`5_make_report.bat`** and send us the results (see `docs/3_FORWARD_TEST_GUIDE.md`).

## What is in this folder
| Where | What |
|---|---|
| `docs/1_RULES_BASELINE_v1.md` | The exact rules, in plain language |
| `docs/2_SETUP.md` | Install and set up |
| `docs/3_FORWARD_TEST_GUIDE.md` | What to do, what to expect, what to send back |
| `docs/4_BACKTEST_REPORT.md` | The results report: what we tested, what won, what it does and does not prove |
| `docs/5_VALIDATION_REPORT.md` | (Krypt branch) Cost stress, bootstrap, bias placebo, significance: verdict and weak points |
| `docs/6_RISKGATE_AND_CHANGES.md` | (Krypt branch) What changed in the runner, the RiskGate limits, proposed forward-test pass criteria |
| `code/` | The engine, the demo auto-trader, the report tool (all Python) |
| `data/` | The price data used for the backtests |
| `expected/` | The exact trades the backtest produced (to compare with) |
| `reference/` | Full research notes, confirmed examples, the 64-configuration comparison |
| `logs/` | Created when you run it: every decision the runner makes |

## Extra safety on the `krypt/validation-riskgate` branch
The runner now has a RiskGate (daily loss cap, drawdown halt, open-risk cap, kill file) and cancels resting orders the moment a position exists. To stop everything at any time, create an empty file named `KILL` in this folder. If it halts itself (`logs/HALT`), read the reason in the file, then delete it to resume. Run `6_run_tests.bat` after any change. Details: `docs/6_RISKGATE_AND_CHANGES.md`.

## Be honest with yourself about the risks
- This system **loses about two trades out of three**. Streaks of 10+ losses in a row happened in the backtests. That is normal for it, not a sign it is broken.
- The backtest has weaknesses (see the report): only one month of the fine-grained data, and we chose the final setup from 64 options on the same data. **Live results will probably be worse than the backtest.** That is exactly what the demo test measures.
- Do not change the rules or settings in the middle of the test. If you think of an improvement, write it down and send it to us.

## Honest status of the code (please read)
- The **rules engine** reproduces our backtest exactly on your machine (that is what `2_run_backtest.bat` proves).
- The **auto-trader's logic** was checked against all 180 historical M3 trades: for every one, the runner would have had the exact order waiting. The dry-run mode works.
- What we could **not** test ourselves is the real **order sending and closing** on a demo account (the only account we had was a live one, and the program correctly refused it). So **watch the first few orders in MetaTrader by hand**: check the side, the entry price, the stop-loss and the lot size. If anything is wrong, stop it (Ctrl+C) and tell us.
