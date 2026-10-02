# Setup (Windows) - about 10 minutes

## 1. What to install
1. **Python 3.10 or newer** from python.org. During install tick **"Add Python to PATH"**.
2. **MetaTrader 5** from your broker, then open a **DEMO account** (File -> Open an Account -> choose a demo). Use a balance of about **10,000 USD** (a very small demo balance makes the smallest lot too big for the stop sizes and orders will be skipped).
3. In MT5, turn algorithmic trading on: **Tools -> Options -> Expert Advisors -> tick "Allow algorithmic trading"**, and make sure the **Algo Trading** button on the toolbar is green.
4. Add gold to Market Watch (right-click Market Watch -> Symbols -> find the gold symbol, e.g. `XAUUSD`, `XAUUSDm`, `XAUUSDr` -> Show), and open its **M3 chart** once. Scroll the chart back a few weeks so MT5 downloads history.

## 2. Install the one Python package
Open the folder, click the address bar, type `cmd`, press Enter, then:
```
pip install -r code/requirements.txt
```

## 3. Check your setup
Keep MetaTrader open and logged in to the **demo**. Double-click **`1_check_setup.bat`**.
It prints:
- the account type (it must say **DEMO**)
- the exact name of the gold symbol on your broker
- your broker's **server time offset** (server time minus UTC) - this matters, the sessions depend on it
- lot sizes, minimum stop distance, spread

Then open `code/config.py` and set the two items marked `<-- CHANGE`:
```
SYMBOL = "XAUUSD"                 # whatever check_setup showed
SERVER_UTC_OFFSET_HOURS = 3       # whatever check_setup showed (it can change twice a year)
```
Leave everything else alone for the test.

## 4. Prove the install is right
Double-click **`2_run_backtest.bat`**. At the end it must say:
```
RESULT: all reproduced - the setup on this machine is correct
```
If it does not, send us a screenshot. Do not continue.

## 5. Watch it (dry run)
Double-click **`3_run_dry_run.bat`**. It prints a line every time an M3 candle closes, for example:
```
new candle  2026-10-02 11:45 close 4179.50 | next-candle bias BULL (buys only)
WOULD PLACE buy limit 4172.31 sl 4168.80 lots 0.12 risk 50.00 ...
```
**Nothing is sent in this mode.** Leave it running for a day to see how it behaves. Close the window to stop.

## 6. Turn on demo trading
Only when you have done steps 1-5: double-click **`4_run_demo_trading.bat`**. It places **pending limit orders on the demo account**.
Watch the first few orders in MT5 to confirm they look right (entry, stop-loss, lot size). Keep MT5 open and the PC awake.

## 7. Twice a year: the broker's clock change
Most brokers move their server clock in autumn and spring (for example UTC+3 in summer, UTC+2 in winter).
When that happens the runner prints `OFFSET MISMATCH` and **stops placing new orders** until you change
`SERVER_UTC_OFFSET_HOURS` in `code/config.py` to the value it tells you, and restart.

## Stopping
Close the black window (or press Ctrl+C). Pending orders stay in MT5 - delete them by hand if you stop for good.
