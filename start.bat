@chcp 936 >nul
@echo off
cd /d "%~dp0"
title 骗子酒馆 - Liars Bar
echo ========================================
echo   骗子酒馆 (Liar's Bar) 一键启动服务
echo ========================================
echo.
echo  请选择启动模式：
echo.
echo   [1] 多房间模式 - 可同时开多桌, 房主界面显示房间码,
echo       朋友输码入座 (多房间功能测试用这个)
echo   [2] 单间模式 - 等价改造前现状 (旧 APK / 局域网单桌兼容验证)
echo   [3] 运行自动化测试 (npm test, 不启动服务器)
echo.
choice /C 123 /N /M "请输入选项 [1/2/3]: "

if errorlevel 3 goto runtest
if errorlevel 2 goto single
if errorlevel 1 goto multi

:multi
set MULTI_ROOM_ENABLED=true
set MODE_NAME=多房间模式
goto build

:single
set MULTI_ROOM_ENABLED=false
set MODE_NAME=单间模式(等价现状)
goto build

:build
echo.
echo 当前模式：%MODE_NAME%
echo [1/2] 正在编译前端 H5 静态资源...
call npm.cmd run build
if errorlevel 1 (
  echo.
  echo [错误] 前端编译失败, 请检查上方报错信息。
  pause
  exit /b 1
)
echo.
echo [2/2] 正在开启酒馆服务器并唤起浏览器...
echo 提示: 双房测试请用「普通窗口 + 无痕窗口」各开一个页面;
echo       若 9527 端口被占用, 服务器会自动换端口, 以横幅实际地址为准。
echo.
start "" http://localhost:9527
node server/embedded-server.js
pause
exit /b 0

:runtest
echo.
echo 正在运行自动化测试 (既有规则 + 多房间单元 + 双模式 e2e)...
call npm.cmd test
echo.
pause
