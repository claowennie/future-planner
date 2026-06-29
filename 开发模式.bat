@echo off
title future - dev server (vite, hot reload)
cd /d "%~dp0"

echo.
echo   Starting Vite dev server (http://localhost:5173)...
echo   - Edits to src\ hot-reload instantly, no build needed.
echo   - Claudio radio works too if the radio server (port 3000) is running:
echo     /api /tts /media are proxied automatically.
echo   To STOP: close this window.
echo.

call npm run dev
pause >nul
