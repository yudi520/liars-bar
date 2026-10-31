@chcp 65001 >nul
@echo off
cd /d "%~dp0"
title 骗子酒馆 - 多人联调
echo ========================================
echo   骗子酒馆 - 启动浏览器多人对战联调
echo ========================================
echo.
echo [1/2] 正在编译前端最新资源...
call npm.cmd run build
echo.
echo [2/2] 正在启动酒馆服务并唤起双人对战窗口...
node test-tabs.js
pause
