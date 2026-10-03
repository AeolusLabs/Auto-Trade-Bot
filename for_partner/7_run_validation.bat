@echo off
cd /d "%~dp0"
echo Stress, bootstrap and significance study of the baseline (about 30 seconds, no MetaTrader needed)...
python code\validate.py
pause
