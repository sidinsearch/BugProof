@echo off
REM Reproduce the hang. Use --timeout when capturing or this will run forever.
cd /d "%~dp0"
python app.py
