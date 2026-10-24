@echo off
title MediaVault Frontend
cd /d "%~dp0frontend"
echo Starting MediaVault Frontend on http://0.0.0.0:5173 ...
npm run dev -- --host 0.0.0.0
pause
