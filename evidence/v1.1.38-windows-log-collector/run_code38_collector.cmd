@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0collect_code38_crash.ps1"
echo.
pause
