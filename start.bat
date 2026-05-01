@echo off
title MediaVault

set PORT=8765

echo.
echo  [MediaVault] Starting...
echo.

python --version >nul 2>&1
if %errorlevel%==0 (
  echo  [OK] Found Python
  start /B python -m http.server %PORT% --directory "%~dp0"
  goto :ok
)

python3 --version >nul 2>&1
if %errorlevel%==0 (
  echo  [OK] Found Python3
  start /B python3 -m http.server %PORT% --directory "%~dp0"
  goto :ok
)

node --version >nul 2>&1
if %errorlevel%==0 (
  echo  [OK] Found Node.js
  start /B npx --yes serve "%~dp0" -p %PORT%
  goto :ok
)

echo.
echo  [ERROR] Python or Node.js not found.
echo.
echo  Please install one of these:
echo    Python : https://www.python.org/downloads/
echo    Node.js: https://nodejs.org
echo.
pause
exit /b 1

:ok
timeout /t 3 /nobreak >nul
echo.
echo  [OK] Open http://localhost:%PORT%
echo.
start http://localhost:%PORT%
echo  Press any key to stop the server...
pause >nul
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM python3.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo  [OK] Server stopped.
