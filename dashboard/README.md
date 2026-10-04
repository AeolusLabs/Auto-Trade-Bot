# Auto Trade Bot dashboard previews

- `auto-trade-bot-pack.html`: the wolf-pack view (three strategy wolves, the Sentinel guardian, pack board, decision stream, reduce-only controls). Ridge is the real SME Baseline v1; Scout and Dusk are example slots; all live numbers are simulated.
- `auto-trade-bot.html`: the track-record and control-hub view described below.

A single-file layout preview of the dashboard and control hub (open `auto-trade-bot.html` in a browser; no server needed).

- **Real data:** the track-record numbers, charts, monthly returns, statistics and trade history come from the H1 backtest trade list in `for_partner/expected/`. They are backtest results, not live results.
- **Example data:** the live account, forward test, positions, execution quality and the command flow in the Control hub are sample data. Nothing connects to MetaTrader.
- **Rebuild:** `python dashboard/build_dashboard.py` regenerates `auto-trade-bot.html` from the template and the trade list.
- **Design notes:** light and dark themes, profit/loss as blue/orange (never red/green alone), every status has an icon and a label, every chart has a table or tooltip alternative.
