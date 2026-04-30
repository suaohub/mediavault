@echo off
chcp 65001 >nul
title MediaVault

set PORT=8765
set DIR=%~dp0

echo.
echo  ╔══════════════════════════════════════╗
echo  ║          MediaVault 启动中           ║
echo  ╚══════════════════════════════════════╝
echo.

:: 关闭占用端口的旧进程
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%PORT% "') do (
  taskkill /PID %%a /F >nul 2>&1
)

:: 优先使用 Python 启动
where python >nul 2>&1
if %errorlevel%==0 (
  echo  [1/2] 使用 Python 启动服务...
  start /B python -m http.server %PORT% --directory "%DIR%"
  goto :wait
)

where python3 >nul 2>&1
if %errorlevel%==0 (
  echo  [1/2] 使用 Python3 启动服务...
  start /B python3 -m http.server %PORT% --directory "%DIR%"
  goto :wait
)

:: 备用：使用 Node.js npx serve
where npx >nul 2>&1
if %errorlevel%==0 (
  echo  [1/2] 使用 npx serve 启动服务...
  start /B npx --yes serve "%DIR%" -p %PORT% -s
  goto :wait
)

:: 两者都没有则报错
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  错误：未找到 Python 或 Node.js                         ║
echo  ║                                                          ║
echo  ║  请安装以下任意一个后重试：                             ║
echo  ║  · Python：https://www.python.org/downloads/            ║
echo  ║    安装时勾选 "Add Python to PATH"                      ║
echo  ║  · Node.js：https://nodejs.org                          ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
pause
exit /b 1

:wait
:: 等待服务就绪（最多 8 秒）
echo  [2/2] 等待服务就绪...
set /a tries=0
:loop
ping -n 2 127.0.0.1 >nul
curl -s -o nul http://localhost:%PORT% >nul 2>&1
if %errorlevel%==0 goto :open
set /a tries+=1
if %tries% lss 8 goto :loop

:open
echo.
echo  ✓ MediaVault 已启动：http://localhost:%PORT%
echo.
start "" "http://localhost:%PORT%"

echo  按任意键停止服务并退出...
pause >nul

:: 停止服务
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%PORT% "') do (
  taskkill /PID %%a /F >nul 2>&1
)
echo  服务已停止。
