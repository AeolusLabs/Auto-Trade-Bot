# Dashboard

One self-contained HTML page: the pack of agents, the strategy lab, risk rules and the control hub. No server, no packages. Works on phones, tablets and desktops (checked from 320 to 1920 px).

```
python dashboard/build.py            # writes dashboard/dist/auto-trade-bot.html
```

Open that file in a browser. Demo mode: Ridge is the real SME Baseline v1 (its backtest figures and trade list are real). Scout, Dusk and Ember are example agents, and every live number, position and decision is simulated. Nothing connects to MetaTrader.

## Layout

```
src/index.body.html     page markup
src/styles/             base.css, extra.css (OKLCH tokens, container queries, phone rules)
src/js/                 numbered scripts, concatenated in order by build.py
  01_core  helpers      02_wolf  wolf art         03_engine  research engine (pure, runs in Node too)
  04_data  catalogs     05_pack  pack view        06_agents  agent editor
  07_rules rules        08_lab   strategy lab     09_lab_detail  detail, gates
  10_evidence           11_main  tabs, control hub
src/data/               generated JSON: candles, track record, seed strategies and agents
scripts/                prepare_data.py, build_seed.js (regenerate src/data from for_partner/)
tests/                  engine.test.js, run_ui_tests.py (+ ui_selftest.js), responsive_check.py
dist/                   build output
```

## Regenerate the data

```
python dashboard/scripts/prepare_data.py     # reads for_partner/data and for_partner/expected
node   dashboard/scripts/build_seed.js       # runs the research engine to score the starter strategies
python dashboard/build.py
```

## Persistence

When published as a Claude artifact, agents, strategies, rules, gate runs and the audit log are saved in the artifact's database (collections `agents`, `strategies`, `settings`, `audit`). Opened as a plain file, it runs on the seed data and shows "Not saved: no database".

## Tests

```
node dashboard/tests/engine.test.js            # engine: determinism, trial counting, SME import, score bounds
python dashboard/tests/run_ui_tests.py         # 31 click-through checks in headless Chrome/Edge
python dashboard/tests/responsive_check.py     # 11 widths x 8 tabs, fails on horizontal overflow (--shots saves screenshots)
```
