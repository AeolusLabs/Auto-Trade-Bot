@echo off
cd /d "%~dp0"
echo Checking your setup (this only READS, it sends nothing)...
python code\check_setup.py
echo.
pause
