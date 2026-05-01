@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title MediaVault

set PORT=8765
set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"

echo.
echo  MediaVault 启动中...
echo.

:: 关闭占用端口的旧进程
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)

:: 检测 Python
python --version >nul 2>&1
if !errorlevel! equ 0 (
  echo  使用 Python 启动服务...
  start "" /B cmd /c "python -m http.server %PORT% --directory "%DIR%""
  goto :waitstart
)

python3 --version >nul 2>&1
if !errorlevel! equ 0 (
  echo  使用 Python3 启动服务...
  start "" /B cmd /c "python3 -m http.server %PORT% --directory "%DIR%""
  goto :waitstart
)

:: 检测 Node.js
npx --version >nul 2>&1
if !errorlevel! equ 0 (
  echo  使用 npx serve 启动服务...
  start "" /B cmd /c "npx --yes serve "%DIR%" -l %PORT% -s"
  goto :waitstart
)

:: 都没有：尝试 PowerShell 内置 HTTP（兜底方案）
powershell -Command "Get-Command powershell" >nul 2>&1
if !errorlevel! equ 0 (
  echo  使用 PowerShell 启动服务...
  start "" /B powershell -NoProfile -Command ^
    "$listener = [System.Net.HttpListener]::new(); $listener.Prefixes.Add('http://+:%PORT%/'); $listener.Start(); Write-Host 'listening'; while($listener.IsListening){ $ctx = $listener.GetContext(); $path = '%DIR%' + ($ctx.Request.Url.LocalPath -replace '/','\'); if(Test-Path $path -PathType Container){ $path = Join-Path $path 'index.html' }; if(Test-Path $path){ $bytes=[IO.File]::ReadAllBytes($path); $ctx.Response.ContentLength64=$bytes.Length; $ext=[IO.Path]::GetExtension($path); switch($ext){'.html'{$ct='text/html'} '.css'{$ct='text/css'} '.js'{$ct='application/javascript'} '.json'{$ct='application/json'} '.jpg'{$ct='image/jpeg'} '.png'{$ct='image/png'} '.svg'{$ct='image/svg+xml'} default{$ct='application/octet-stream'}}; $ctx.Response.ContentType=$ct; $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length) }else{ $ctx.Response.StatusCode=404 }; $ctx.Response.Close() }"
  goto :waitstart
)

echo.
echo  错误：未找到 Python 或 Node.js
echo.
echo  请安装以下任意一个后重试：
echo    Python：https://www.python.org/downloads/
echo      安装时务必勾选 Add Python to PATH
echo    Node.js：https://nodejs.org
echo.
pause
exit /b 1

:waitstart
:: 等待服务就绪（最多 10 秒）
echo  等待服务就绪...
set /a tries=0
:loop
timeout /t 1 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri 'http://localhost:%PORT%' -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if !errorlevel! equ 0 goto :ready
set /a tries+=1
if !tries! lss 10 goto :loop

echo.
echo  服务似乎启动失败，请手动打开 http://localhost:%PORT% 查看
echo.
goto :opened

:ready
echo.
echo  MediaVault 已启动：http://localhost:%PORT%
echo.

:opened
start "" "http://localhost:%PORT%"

echo  按任意键停止服务并退出...
pause >nul

:: 停止服务
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
  taskkill /PID %%a /F >nul 2>&1
)
echo  服务已停止。
