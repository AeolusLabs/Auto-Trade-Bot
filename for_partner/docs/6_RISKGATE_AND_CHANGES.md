# RiskGate and runner changes (branch `krypt/validation-riskgate`)

Changes on top of Allan's `allan` branch. The strategy and the backtest engine are **untouched**: `engine.py`, `bias.py`, `backtest.py` and all rules in `docs/1_RULES_BASELINE_v1.md` are exactly as before, and `python code/backtest.py` still reproduces 180 trades +52.4R and 437 trades +117.1R. All changes are in the live runner and around it.

## 1. Problems found in the original runner, and the fix

| # | Problem | Fix |
|---|---|---|
| 1 | Up to 20 limit orders rest at once. One fast spike can fill several before the next candle close cancels the rest, giving up to about 10% risk instead of 0.5%. The backtest allows only one position. | `guard()` runs every `POLL_SECONDS` (5 s), not once per candle: the moment a position exists, every pending order of ours is cancelled. Plus a hard cap on total money-at-stop (`MAX_OPEN_RISK_PCT`, 1.5% = 3 trades). Orders are placed nearest-to-price first so the budget goes to the ones most likely to fill. |
| 2 | Only the first open position was managed for the exit rule. | Every position is managed. Extras beyond `MAX_POSITIONS` (1) are closed, newest first (reduce-only). |
| 3 | No account-level protection (daily loss, drawdown, kill switch, connection, stale quotes). | `risk_gate.py`: see section 2. |
| 4 | Pending orders never expire and survive a stopped runner. | Orders older than `MAX_PENDING_AGE_HOURS` (24) are cancelled; pending orders are cancelled when the runner stops (Ctrl+C or a Python error). A hard process kill or PC power loss can still leave orders in MT5: delete orders with magic 26100201 by hand. |
| 5 | Position size used balance only. | Uses `min(balance, equity)`, so sizing never grows on floating profit. |

## 2. RiskGate (`code/risk_gate.py`, pure Python, unit-tested)

Fail-closed: if it cannot decide, there is no new order.

- **Daily loss cap** `DAILY_LOSS_PCT` = 5%: equity vs the UTC day's starting equity.
- **Max drawdown** `MAX_DD_PCT` = 12.5%: equity vs the high-water mark (this is Allan's own 25R stop rule at 0.5% risk).
- Either trips a **HALT**: `logs/HALT` is written, no new orders, pending orders cancelled. Open positions keep their stops. To resume, delete `logs/HALT`; the gate then re-baselines to current equity.
- **KILL file**: create an empty file named `KILL` in the project folder: no new orders, pending orders cancelled (positions keep their stops).
- **Open-risk cap** (section 1, row 1), **MT5 connected / Algo Trading on**, **quote not older than 300 s**.
- State persists in `logs/risk_state.json`, so a same-day restart keeps its baselines. If the runner is first started mid-day, that day's earlier losses are not counted.
- The limits are **circuit breakers, not tuned parameters**: worst backtest day was -8.6R (4.3%), worst drawdown 13.1R (6.5%).
  **Expect the gate to trip occasionally** (see `docs/5_VALIDATION_REPORT.md`, point 4): it is a pause-and-review point.

## 3. Tests (no MT5 needed, run `6_run_tests.bat`)

- `code/test_risk_gate.py`: 9 checks (day roll, drawdown across days, halt and re-enable, restart persistence, kill file, risk cap, fail-closed inputs).
- `code/test_runner_sim.py`: 8 checks against a **fake MetaTrader5** module: order carries a stop and about 0.5% risk, the 4th order is refused by the cap, a position cancels all pendings, extra positions are closed, halt and kill block orders, stale quote and Algo-off block orders, old pendings are cancelled.
- **These prove our logic, not the broker.** Order sending on a real demo is still untested (Allan's note stands). Do the first-day manual checks in `docs/3_FORWARD_TEST_GUIDE.md`.
- `python code/validate.py` runs the stress and significance study.

## 4. Proposed forward-test pass criteria (to be agreed by both owners BEFORE the first trade)

The thresholds below are fixed in advance on purpose: choosing them after seeing results is how backtests lie.

Let "forward trades" = closed demo trades after the start date, R measured against the real risk at the stop (as `5_make_report.bat` does), net of real spread, commission and slippage.

| Check | Proposed pass |
|---|---|
| Sample | at least 150 forward trades (about 6 months at the H1 rate, about 4 weeks at the M3 rate); do not judge earlier |
| Expectancy | average R >= +0.10 (backtest +0.27; allows for realistic costs and optimism) |
| Profit factor | >= 1.20 |
| Drawdown | peak-to-trough <= 25R; a breach triggers a review, not an automatic fail |
| Fills vs model | at least 90% of the backtest's trades for the same days have a matching live trade; mean extra slippage per trade <= 0.5 price units |
| Operational | zero rule violations by the runner (wrong side, missing stop, second position, risk > 1.1x target); zero unexplained gate trips |

Failing any row sends the strategy back to research; passing all moves it to **micro-live at minimum size**, then scale-up only with both owners signing off. Nothing here is a guarantee of profit.

## 5. Not done, on purpose

- No change to the strategy, parameters or rules (the expiry and minimum-zone settings looked slightly better on H1 and worse on M3; not adopted).
- No broker-side order expiry (broker-clock handling for `expiration` differs by broker; use the age cancel above).
- No dashboard integration yet: `logs/decisions.csv` is the interface (a future bridge can emit these as `decision` events).
