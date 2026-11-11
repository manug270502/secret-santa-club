@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installa Node.js 22.13 o superiore da https://nodejs.org
  pause
  exit /b 1
)
call npm start
pause
