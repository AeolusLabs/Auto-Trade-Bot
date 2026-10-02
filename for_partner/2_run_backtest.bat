@echo off
cd /d "%~dp0"
echo Re-running our backtests on your machine...
python code\backtest.py
echo.
pause
