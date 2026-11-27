@echo off
chcp 65001 >nul
cd /d "%~dp0"
node wellness\sincronizar.mjs %*
if /i "%~1"=="--auto" exit /b
echo.
pause
