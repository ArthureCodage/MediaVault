@echo off
title MediaVault Backend
cd /d "%~dp0backend"
if exist .venv\Scripts\activate.bat (
    call .venv\Scripts\activate.bat
)
echo Starting MediaVault Backend on http://0.0.0.0:8000 ...
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
