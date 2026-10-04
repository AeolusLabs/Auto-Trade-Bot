# Auto Trade Bot

An automated forex and gold trading platform for MetaTrader 5 (MT5), built by Leigh and Allan. Personal capital first, adaptable to prop-firm rules later.

**Status: demo only.** Nothing here trades a real account. The runner refuses to send orders unless the account is a demo account. Not financial advice.

## Start here (reading order)

1. [for_partner/START_HERE.md](for_partner/START_HERE.md): what the trading system does and how to run it on a demo account (5 minutes).
2. [for_partner/docs/1_RULES_BASELINE_v1.md](for_partner/docs/1_RULES_BASELINE_v1.md): the exact strategy rules.
3. [for_partner/docs/5_VALIDATION_REPORT.md](for_partner/docs/5_VALIDATION_REPORT.md): how robust the backtest really is (it is heavy-tailed and mostly long-side; read this before trusting any number).
4. [for_partner/docs/6_RISKGATE_AND_CHANGES.md](for_partner/docs/6_RISKGATE_AND_CHANGES.md): the risk limits added around Allan's engine, and the proposed forward-test pass criteria.
5. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the pieces fit, what is real and what is not built yet.
6. [docs/PLAN.md](docs/PLAN.md): the full platform plan and roadmap.

## What is in the repo

| Folder | What it is |
| --- | --- |
| `for_partner/` | Allan's trading package: the SME Baseline v1 strategy, backtester, MT5 live runner, data and expected results. Our additions here: `risk_gate.py`, `redact.py`, `alerts.py`, `validate.py`, tests, docs 5 and 6. |
| `dashboard/` | The control-room web page (single HTML file): the wolf pack of agents, strategy lab, rules, control hub. See [dashboard/README.md](dashboard/README.md). |
| `docs/` | Architecture and plan. |

## Run things

Windows, Python 3.10+. No MetaTrader needed for the first three.

| What | Command |
| --- | --- |
| Python tests (RiskGate, redaction, alerts, simulated broker: 32 checks) | `for_partner\6_run_tests.bat` |
| Robustness study of the baseline (about 30 s) | `for_partner\7_run_validation.bat` |
| Reproduce the backtest (must say "all reproduced") | `for_partner\2_run_backtest.bat` |
| Build the dashboard | `python dashboard/build.py`, then open `dashboard/dist/auto-trade-bot.html` |
| Dashboard tests (Node 18+, Chrome or Edge) | `node dashboard/tests/engine.test.js`, `python dashboard/tests/run_ui_tests.py`, `python dashboard/tests/responsive_check.py` |
| Trade on a demo account | `for_partner\3_run_dry_run.bat`, then `4_run_demo_trading.bat` (see START_HERE) |

## Branches

- `allan/for_partner`: Allan's original package. Untouched.
- `atb/validation-riskgate`: our work (RiskGate, validation, dashboard, docs). Open a pull request from here when ready.
