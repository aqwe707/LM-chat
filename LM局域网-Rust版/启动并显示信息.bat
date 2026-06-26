@echo off
chcp 65001 >nul
title LM Chat
powershell -ExecutionPolicy Bypass -File "%~dp0start-server.ps1"
pause