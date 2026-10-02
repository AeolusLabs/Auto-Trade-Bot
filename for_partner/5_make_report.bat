@echo off
cd /d "%~dp0"
echo Building the forward-test report from the demo account history...
python code\forward_report.py
echo.
echo Send us: the logs folder, forward_results.csv, and a screenshot of the account history.
pause
