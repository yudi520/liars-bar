@chcp 65001 >nul
@echo off
cd /d "%~dp0"
title 骗子酒馆 - Liars Bar
echo ========================================
echo   骗子酒馆 (Liar's Bar) 一键启动服务
echo ========================================
echo.
echo [1/2] 正在编译前端 H5 静态资源...
call npm.cmd run build
echo.
echo [2/2] 正在开启酒馆服务器并唤起浏览器...
start http://localhost:9527
node server/embedded-server.js
pause
