@echo off
cd /d "%~dp0"
echo ============================================================
echo  DEMO TRADING - places pending orders. DEMO ACCOUNT ONLY.
echo  The program refuses to trade if the account is not a demo.
echo  Make sure MetaTrader 5 is open, logged in to the DEMO account,
echo  and Algo Trading is switched on.
echo ============================================================
pause
python code\live_runner.py --trade
pause
