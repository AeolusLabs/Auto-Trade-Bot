@echo off
cd /d "%~dp0"
echo Running the RiskGate and simulated-broker checks (no MetaTrader needed)...
python code\test_risk_gate.py
python code\test_runner_sim.py
echo.
pause
