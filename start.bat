@echo off
chcp 65001 >nul
title MediaVault

set PORT=8765
set DIR=%~dp0

:: Kill any previous process on this port
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%PORT% "') do (
  taskkill /PID %%a /F >nul 2>&1
)

:: Pick an available HTTP server
where python >nul 2>&1
if %errorlevel%==0 (
  echo Starting server with Python...
  start /B python -m http.server %PORT% --directory "%DIR%"
  goto :wait
)

where python3 >nul 2>&1
if %errorlevel%==0 (
  echo Starting server with Python3...
  start /B python3 -m http.server %PORT% --directory "%DIR%"
  goto :wait
)

where npx >nul 2>&1
if %errorlevel%==0 (
  echo Starting server with npx serve...
  start /B npx --yes serve "%DIR%" -p %PORT%
  goto :wait
)

echo.
echo [Error] Python or Node.js not found.
echo Please install Python (https://python.org) or Node.js (https://nodejs.org)
echo.
pause
exit /b 1

:wait
:: Wait for server to be ready (up to 5 s)
set /a tries=0
:loop
ping -n 2 127.0.0.1 >nul
curl -s http://localhost:%PORT% >nul 2>&1
if %errorlevel%==0 goto :open
set /a tries+=1
if %tries% lss 5 goto :loop

:open
echo MediaVault is running at http://localhost:%PORT%
start "" "http://localhost:%PORT%"

echo.
echo Press any key to stop the server and exit.
pause >nul

:: Clean up
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%PORT% "') do (
  taskkill /PID %%a /F >nul 2>&1
)
