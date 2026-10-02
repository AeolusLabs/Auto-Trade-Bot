@echo off
cd /d "%~dp0"
echo DRY RUN: watches the market and prints what it WOULD do. Nothing is sent. Close this window to stop.
python code\live_runner.py
pause
