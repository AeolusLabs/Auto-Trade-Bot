"""
SME BASELINE v1 - settings. Change ONLY the items marked  <-- CHANGE.  Do not change the rules during the test.
Run `python code/check_setup.py` first: it prints the right values for your broker.
"""

SYMBOL = "XAUUSDr"                 # <-- CHANGE: your broker's gold symbol exactly as shown in Market Watch (e.g. XAUUSD, XAUUSDm)
SERVER_UTC_OFFSET_HOURS = 3        # <-- CHANGE: broker server time minus UTC (check_setup.py shows it). Summer 3, winter usually 2.

RISK_PCT = 0.5                     # <-- percent of account balance risked per trade (demo). Keep 0.5 for the test.
MAX_LOTS = 5.0                     # hard cap on any single order, whatever the maths says
MAX_SPREAD_POINTS = 40             # do not place new orders while the spread is wider than this (points)
MAX_PENDING = 20                   # never keep more than this many pending orders

MAGIC = 26100201                   # id the runner stamps on its orders; it only ever touches orders/positions with this id
WARMUP_BARS = 6000                 # closed M3 bars replayed each cycle to rebuild the engine state (about 2 weeks)
POLL_SECONDS = 5                   # how often to look for a newly closed M3 candle
DEVIATION = 30                     # max slippage (points) when closing at market

# ---- RiskGate (added on branch krypt/validation-riskgate; see docs/6_RISKGATE_AND_CHANGES.md) ----
# Chosen from the backtest, not tuned: worst backtest day was -8.6R (= 4.3% at 0.5% risk), worst drawdown 13.1R (= 6.5%),
# and Allan's own stop rule is 25R (= 12.5%). The gate is a circuit breaker for abnormal behaviour, not an optimiser.
DAILY_LOSS_PCT = 5.0               # halt new orders when equity is this % below the day's starting equity (UTC day)
MAX_DD_PCT = 12.5                  # halt when equity is this % below the high-water mark
MAX_OPEN_RISK_PCT = 1.5            # max money-at-stop of open positions + pending orders, % of equity (3 trades at 0.5%)
MAX_POSITIONS = 1                  # baseline rule: one position at a time; extras are closed (reduce-only)
STALE_TICK_SECONDS = 300           # no new orders if the latest quote is older than this
MAX_PENDING_AGE_HOURS = 24         # cancel pending orders older than this (the baseline has no expiry; this bounds orphans)
CANCEL_PENDING_ON_EXIT = True      # cancel our pending orders when the runner stops (Ctrl+C or crash with a Python error)

# ---- More RiskGate limits and alerts (ideas from imikerussell/beebots, MIT; see docs/6_RISKGATE_AND_CHANGES.md) ----
RETIRE_AT_PCT = 80                 # equity at or below this % of the starting equity: RETIRED file, stopped until a person deletes it
MAX_TRADES_PER_DAY = 20            # entries per UTC day (backtest averaged about 8.6 per active day on M3); circuit breaker, not a tuned limit
COST_BUDGET_PCT_DAY = 1.0          # estimated spread cost of the day's entries, % of equity; resets 00:00 UTC
COOLDOWN_MINUTES = 0               # minimum minutes between entries; 0 = off (the baseline has none)
# Alerts: set ATB_ALERT_WEBHOOK_URL (https) or ATB_TELEGRAM_BOT_TOKEN + ATB_TELEGRAM_CHAT_ID in the environment. Never commit them.
