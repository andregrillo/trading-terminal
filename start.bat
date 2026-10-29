@echo off
rem Double-click this on Windows to start Trade Terminal.
cd /d "%~dp0"
node scripts/launch.js %*
pause
