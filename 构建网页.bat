@echo off
title future - build web (vite)
cd /d "%~dp0"

echo.
echo   Building future web app into dist\ ...
echo   (run this after ANY code change, so the Claudio server / Cloudflare
echo    serves the latest version)
echo.

call npm run build

echo.
echo   ====== build finished ======
echo   - Local: start "启动Claudio.bat", then open http://localhost:3000
echo   - Cloudflare Pages: upload the dist\ folder (Direct Upload)
echo.
pause >nul
