@echo off
chcp 65001 >nul
title BadgesPlus - Instalador

rem Se o install.ps1 não estiver ao lado deste arquivo, baixa do GitHub.
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" set "PS1=%TEMP%\badgesplus-install.ps1"
if not exist "%~dp0install.ps1" (
    echo Baixando o instalador...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/lirenzzzin/BadgesPlus/main/install.ps1' -OutFile '%TEMP%\badgesplus-install.ps1'"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
echo.
pause
