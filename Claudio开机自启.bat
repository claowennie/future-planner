@echo off
chcp 65001 >nul
REM ============================================================
REM Claudio 开机自启（最小化后台运行）
REM 现在只起【一个】服务：node 中枢（端口 3000）。
REM 前端已由中枢自己托管，不再需要 python，少一个会坏的东西。
REM 想听时打开浏览器： http://localhost:3000/index.html
REM 取消自启：删掉启动文件夹里的 Claudio.lnk 快捷方式。
REM ============================================================

cd /d "%~dp0claudio\server"

REM 崩了就自动重启，并把日志写到 claudio\claudio.log，方便排查。
:loop
echo [%date% %time%] 启动 Claudio 中枢 >> "%~dp0claudio\claudio.log"
node server.js >> "%~dp0claudio\claudio.log" 2>&1
echo [%date% %time%] 中枢退出(code %errorlevel%)，3 秒后重启 >> "%~dp0claudio\claudio.log"
timeout /t 3 /nobreak >nul
goto loop
