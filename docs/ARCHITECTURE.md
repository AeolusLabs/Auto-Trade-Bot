# Architecture

## The pipeline

```
strategy -> research agent -> gates 0-5 -> agent (own rules) -> RiskGate -> MT5 runner -> broker (demo)
(idea, file,  (backtest,      (criteria    (one strategy,      (hard limits, (orders,       Guardian can only
 template)     rank)           locked)      one rule set)       kill files)   guard loop)    reduce, never open
```

- **Strategy**: a documented idea, an uploaded script or trade list, or a template. Separate from agents.
- **Research agent** (dashboard, `03_engine.js`): bounded grid search on the first 66% of data, judged on the last 34% (out-of-sample). It counts trials, deflates the t-statistic for them, stress-tests costs, and scores 0-100.
- **Gates 0-5**: data checks, backtest, robustness, demo forward test, micro-live, owner sign-off. Criteria lock when a stage starts. Overriding needs a typed OVERRIDE and a reason, and is logged.
- **Agent**: one strategy plus its own risk rules. One to four agents can run.
- **RiskGate** (`for_partner/code/risk_gate.py`): daily loss 5%, max drawdown 12.5%, open risk 1.5%, retire at 80% of start equity, 20 trades/day, cost budget, stale-quote refusal, HALT and KILL files.
- **Guardian**: separate from the engine, reduce-only (pause, cancel, flatten, kill).

## Ranking score

edge 30 + robustness 25 + significance 20 + risk 15 + sample 10, minus penalties (profit concentrated in a few trades, one-sided long/short), times 0.85 for unverified imports, plus an adjustment from forward results. Eligible for recommendation needs: 150+ trades, at least +0.10R per trade, survives cost stress, gates 0-2 passed.

## Dashboard data model (artifact database)

| Collection | Holds |
| --- | --- |
| `agents/{id}` | name, style, instruments, `strategyId`, rules |
| `strategies/{id}` | source, hypothesis, backtest metrics, forward, gates, trials |
| `strategies/{id}/runs/{backtest,forward,code}` | trade lists and uploaded code |
| `settings/pack` | pack-wide rules |
| `audit/{id}` | append-only command and change log |

## Real vs simulated

| Real | Simulated or not built |
| --- | --- |
| SME Baseline v1 engine, backtest, 437-trade list, validation findings | Live account numbers, positions and decision stream in the dashboard |
| RiskGate, redaction, alerts and their tests | Scout, Dusk, Ember (example agents) |
| Research engine and ranking on gold H1 candles | The link from dashboard commands to the MT5 runner |
| | Strategy library import, prop-firm presets, restricting database writes to the owner |

## Findings to keep in mind

The baseline is heavy-tailed: the top 5 trades are about 65% of total R, the total is about zero without the best 10, and longs (+110.5R) far outweigh shorts (+6.5R). Forward demo results decide, not the backtest. Details in [for_partner/docs/5_VALIDATION_REPORT.md](../for_partner/docs/5_VALIDATION_REPORT.md).

## Roadmap

See [PLAN.md](PLAN.md).
