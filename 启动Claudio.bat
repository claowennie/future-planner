@echo off
title Claudio Radio - close this window to stop
cd /d "%~dp0claudio\server"

echo.
echo   Starting Claudio radio server (port 3000)...
echo   Open http://localhost:3000 (or your Cloudflare site) to listen.
echo   To STOP the radio: just close this window.
echo.

node server.js

echo.
echo   ====== server exited (see any red text above for the reason) ======
echo   Press any key to close this window.
pause >nul
