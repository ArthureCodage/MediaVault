@echo off
title MediaVault Launcher
echo ===================================================
echo             Starting MediaVault Server
echo ===================================================
echo Backend:  http://localhost:8000 (API Docs at /docs)
echo Frontend: http://localhost:5173
echo Tailscale / iPhone: http://192.168.2.10:5173
echo ===================================================

start "MediaVault Backend" cmd /c "%~dp0start-backend.bat"
start "MediaVault Frontend" cmd /c "%~dp0start-frontend.bat"

echo MediaVault is starting in separate windows.
timeout /t 3 >nul
start http://localhost:5173
