@echo off
chcp 65001 >nul
title LM 局域网聊天
cd /d "%~dp0"

echo.
echo   ╔══════════════════════════════╗
echo   ║   LM Studio 局域网聊天      ║
echo   ╚══════════════════════════════╝
echo.
echo   正在安装依赖...
call npm install --silent 2>nul
echo.
echo   启动服务器...
node server.js
pause
