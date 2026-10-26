@echo off
chcp 65001 >nul
title Aoun - عون
cd /d "%~dp0"
echo.
echo   ==========================================
echo     Aoun - عون
echo     لا تغلق هذه النافذة اثناء العرض
echo     Keep this window open while using Aoun
echo   ==========================================
echo.

rem ---- Node.js: use an installed one (v20+), otherwise download a private copy once ----
set "NODEDIR=%LOCALAPPDATA%\Taree\node"
set "NODE="
if exist "%NODEDIR%\node.exe" set "NODE=%NODEDIR%\node.exe"
if not defined NODE (
  node -e "process.exit(+process.versions.node.split(String.fromCharCode(46))[0]>=20?0:1)" >nul 2>nul && set "NODE=node"
)
if not defined NODE (
  echo [1/4] Downloading Node.js ^(first run only^)...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $d=Join-Path $env:LOCALAPPDATA 'Taree'; New-Item -ItemType Directory -Force -Path $d | Out-Null; $z=Join-Path $d 'node.zip'; Invoke-WebRequest -UseBasicParsing 'https://nodejs.org/dist/v22.12.0/node-v22.12.0-win-x64.zip' -OutFile $z; Expand-Archive -Force $z $d; if (Test-Path (Join-Path $d 'node')) { Remove-Item -Recurse -Force (Join-Path $d 'node') }; Rename-Item (Join-Path $d 'node-v22.12.0-win-x64') 'node'; Remove-Item $z"
  if errorlevel 1 goto :fail
  set "NODE=%NODEDIR%\node.exe"
)
if "%NODE%"=="node" (
  for /f "delims=" %%p in ('where node') do if not defined NODEPATH set "NODEPATH=%%~dpp"
) else (
  set "NODEPATH=%NODEDIR%\"
)
set "PATH=%NODEPATH%;%PATH%"

rem ---- Components (first run, or after an update) ----
set "NEEDINSTALL="
if not exist "node_modules\.taree-installed" set "NEEDINSTALL=1"
if defined NEEDINSTALL (
  echo [2/4] Installing components ^(first run only, a few minutes^)...
  call npm ci --no-audit --no-fund
  if errorlevel 1 goto :fail
  "%NODE%" node_modules\prisma\build\index.js generate
  if errorlevel 1 goto :fail
  echo done> "node_modules\.taree-installed"
)

rem ---- Stop an older running copy (after an update) ----
if exist ".taree-data\taree.pid" (
  set /p OLDPID=<".taree-data\taree.pid"
  set "RUNB="
  set "NEWB="
  if exist ".taree-data\running-build" set /p RUNB=<".taree-data\running-build"
  if exist ".next\BUILD_ID" set /p NEWB=<".next\BUILD_ID"
)
if defined OLDPID if not "%RUNB%"=="%NEWB%" (
  taskkill /PID %OLDPID% /T /F >nul 2>nul
  del ".taree-data\taree.pid" >nul 2>nul
)

echo [3/4] Starting the database and the website...
echo [4/4] The browser will open automatically: http://localhost:3000
echo.
"%NODE%" scripts\launcher.mjs
if errorlevel 1 goto :fail
goto :eof

:fail
echo.
echo   حدث خطأ - تحقق من الاتصال بالانترنت ثم حاول مرة اخرى
echo   Something went wrong - check your internet connection and try again.
echo.
pause
