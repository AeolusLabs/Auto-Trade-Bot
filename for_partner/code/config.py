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
