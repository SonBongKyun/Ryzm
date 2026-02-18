@echo off
title Ryzm Terminal v5.6
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║     RYZM TERMINAL ENGINE v5.6       ║
echo  ║     Starting server...              ║
echo  ╚══════════════════════════════════════╝
echo.

:: Kill any existing Python server
taskkill /f /im python.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start server
start "" /min cmd /c "cd /d %~dp0 && .venv\Scripts\python.exe main.py"

:: Wait for server to start
echo  Waiting for server to boot...
timeout /t 3 /nobreak >nul

:: Open browser
start "" "http://127.0.0.1:8000"

echo.
echo  ✓ Server running at http://127.0.0.1:8000
echo  ✓ Browser opened
echo.
echo  Press any key to STOP the server and exit...
pause >nul

taskkill /f /im python.exe >nul 2>&1
echo  Server stopped. Goodbye!
timeout /t 2 /nobreak >nul
