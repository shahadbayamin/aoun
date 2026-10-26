@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist ".taree-data\taree.pid" (
  set /p PID=<".taree-data\taree.pid"
)
if defined PID (
  taskkill /PID %PID% /T /F >nul 2>nul
  del ".taree-data\taree.pid" >nul 2>nul
  echo تم ايقاف عون - Aoun has been stopped.
) else (
  echo عون غير قيد التشغيل - Aoun is not running.
)
timeout /t 3 >nul
