@echo off
chcp 65001 >nul 2>&1
title MediaVault

set PORT=8765

echo.
echo  MediaVault
echo.

:: 尝试 Python
python --version >nul 2>&1
if %errorlevel%==0 (
  echo  Starting with Python...
  start /B python -m http.server %PORT% --directory "%~dp0"
  goto :ok
)

python3 --version >nul 2>&1
if %errorlevel%==0 (
  echo  Starting with Python3...
  start /B python3 -m http.server %PORT% --directory "%~dp0"
  goto :ok
)

:: 尝试 Node
node --version >nul 2>&1
if %errorlevel%==0 (
  echo  Starting with npx serve...
  start /B npx --yes serve "%~dp0" -l %PORT%
  goto :ok
)

echo.
echo  Error: Python or Node.js not found.
echo.
echo  Install one of these:
echo    Python: https://www.python.org/downloads/
echo    Node.js: https://nodejs.org
echo.
pause
exit /b 1

:ok
echo  Waiting...
timeout /t 3 /nobreak >nul

echo.
echo  Open: http://localhost:%PORT%
echo.
start http://localhost:%PORT%

echo  Press any key to stop...
pause >nul

taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM python3.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
