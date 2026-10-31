@echo off
chcp 65001 >nul
setlocal

echo ========================================
echo Build APK - RPS Royale
echo ========================================

set "PROJECT_DIR=%~dp0"
if "%PROJECT_DIR:~-1%"=="\" set "PROJECT_DIR=%PROJECT_DIR:~0,-1%"

set "CORDOVA=%PROJECT_DIR%\cordova-app"
set "WWW=%CORDOVA%\www"
set "NODEPROJ=%WWW%\nodejs-project"
set "PLATFORM_WWW=%CORDOVA%\platforms\android\platform_www"
set "ANDROID_BUILD_DIR=%CORDOVA%\platforms\android\app\build"

if not defined ANDROID_HOME set "ANDROID_HOME=F:\Android\Sdk"
if not defined GRADLE_USER_HOME set "GRADLE_USER_HOME=E:\gradle-cache"
if not defined JAVA_HOME set "JAVA_HOME=E:\JavaJDK\JDK21"
set "PATH=E:\gradle-9.2.1\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin;E:\nodejs\node_global;%PATH%"

cd /d "%PROJECT_DIR%"

echo.
echo [1/7] Build H5...
call npm run build
if errorlevel 1 (
  echo [ERROR] H5 build failed
  pause
  exit /b 1
)

echo.
echo [2/7] Clean Cordova www app output...
if exist "%WWW%\assets" rmdir /s /q "%WWW%\assets"
if exist "%WWW%\build" rmdir /s /q "%WWW%\build"
if exist "%WWW%\index.html" del /f /q "%WWW%\index.html"
if exist "%WWW%\start-nodejs.js" del /f /q "%WWW%\start-nodejs.js"
if exist "%NODEPROJ%" rmdir /s /q "%NODEPROJ%"

echo.
echo [3/7] Copy dist to Cordova www...
xcopy /E /I /Y "%PROJECT_DIR%\dist\*" "%WWW%\"

echo.
echo [4/7] Prepare embedded Node project...
node "%PROJECT_DIR%\scripts\prepare-embedded-server.js" "%PROJECT_DIR%" "%CORDOVA%"
if errorlevel 1 (
  echo [ERROR] prepare-embedded-server.js failed
  pause
  exit /b 1
)

echo Inject scripts into index.html...
node "%PROJECT_DIR%\scripts\inject-cordova-head.js" "%WWW%\index.html"
if errorlevel 1 (
  echo [ERROR] inject-cordova-head.js failed
  pause
  exit /b 1
)

echo Ensure Android platform has nodejs-mobile-cordova native binding...
node "%PROJECT_DIR%\scripts\ensure-cordova-nodejs-plugin.js" "%CORDOVA%"
if errorlevel 1 (
  echo [ERROR] ensure-cordova-nodejs-plugin.js failed
  pause
  exit /b 1
)

echo.
echo [5/7] Clean stale Android platform web assets...
if exist "%PLATFORM_WWW%\assets" rmdir /s /q "%PLATFORM_WWW%\assets"
if exist "%PLATFORM_WWW%\build" rmdir /s /q "%PLATFORM_WWW%\build"
if exist "%PLATFORM_WWW%\nodejs-project" rmdir /s /q "%PLATFORM_WWW%\nodejs-project"
if exist "%PLATFORM_WWW%\static" rmdir /s /q "%PLATFORM_WWW%\static"
if exist "%PLATFORM_WWW%\index.html" del /f /q "%PLATFORM_WWW%\index.html"
if exist "%PLATFORM_WWW%\start-nodejs.js" del /f /q "%PLATFORM_WWW%\start-nodejs.js"
if exist "%ANDROID_BUILD_DIR%" rmdir /s /q "%ANDROID_BUILD_DIR%"

echo.
echo [6/7] Cordova prepare android...
cd /d "%CORDOVA%"
echo Patch Cordova config for status bar...
node "%PROJECT_DIR%\scripts\patch-cordova-config.js" "%CORDOVA%\config.xml"
call cordova prepare android
if errorlevel 1 (
  echo [ERROR] cordova prepare android failed
  pause
  exit /b 1
)

echo Re-apply Android platform repairs after prepare...
node "%PROJECT_DIR%\scripts\ensure-cordova-nodejs-plugin.js" "%CORDOVA%"
if errorlevel 1 (
  echo [ERROR] post-prepare ensure-cordova-nodejs-plugin.js failed
  pause
  exit /b 1
)

echo Patch Android activity system bar styling...
node "%PROJECT_DIR%\scripts\patch-android-ui.js" "%CORDOVA%\platforms\android\app\src\main\java\com\liarsbar\game\MainActivity.java"
if errorlevel 1 (
  echo [ERROR] patch-android-ui.js failed
  pause
  exit /b 1
)

echo Apply Android branding assets (Themed Icon)...
powershell -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\apply-android-branding.ps1" "%PROJECT_DIR%\icon.png" "%CORDOVA%\platforms\android\app\src\main\res"
if errorlevel 1 (
  echo [ERROR] apply-android-branding.ps1 failed
  pause
  exit /b 1
)

echo Apply Android template branding assets...
powershell -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\apply-android-branding.ps1" "%PROJECT_DIR%\icon.png" "%CORDOVA%\node_modules\cordova-android\templates\project\res"
if errorlevel 1 (
  echo [ERROR] apply-android-branding.ps1 failed on cordova template
  pause
  exit /b 1
)

echo Write Android dark themes...
node "%PROJECT_DIR%\scripts\write-android-themes.js" "%CORDOVA%\platforms\android\app\src\main\res\values\themes.xml"
if errorlevel 1 (
  echo [ERROR] write-android-themes.js failed on platform themes
  pause
  exit /b 1
)
node "%PROJECT_DIR%\scripts\write-android-themes.js" "%CORDOVA%\node_modules\cordova-android\templates\project\res\values\themes.xml"
if errorlevel 1 (
  echo [ERROR] write-android-themes.js failed on template themes
  pause
  exit /b 1
)

echo.
echo [7/7] Build Android APK...
call cordova build android
if errorlevel 1 (
  echo [ERROR] cordova build android failed
  pause
  exit /b 1
)

if exist "platforms\android\app\build\outputs\apk\debug\app-debug.apk" (
  copy /Y "platforms\android\app\build\outputs\apk\debug\app-debug.apk" "%PROJECT_DIR%\liars-bar.apk" >nul
  copy /Y "platforms\android\app\build\outputs\apk\debug\app-debug.apk" "%PROJECT_DIR%\liars-bar-debug.apk" >nul
  echo.
  echo ========================================================
  echo 馃殌 鏋勫缓鎴愬姛锛?
  echo 馃摝 APK 宸茶嚜鍔ㄥ悓姝ヨ嚦鏍圭洰褰?
  echo   %PROJECT_DIR%\liars-bar-debug.apk
  echo 馃摝 Cordova 鍘熺敓璺緞:
  echo   %CORDOVA%\platforms\android\app\build\outputs\apk\debug\app-debug.apk
  echo ========================================================
) else (
  echo [ERROR] APK not found after build
)

pause

