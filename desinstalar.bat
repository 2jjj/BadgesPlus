@echo off
chcp 65001 >nul
title BadgesPlus - Desinstalador

set "PS1=%~dp0uninstall.ps1"
if not exist "%PS1%" set "PS1=%TEMP%\badgesplus-uninstall.ps1"
if not exist "%~dp0uninstall.ps1" (
    echo Baixando o desinstalador...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/lirenzzzin/BadgesPlus/main/uninstall.ps1' -OutFile '%TEMP%\badgesplus-uninstall.ps1'"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
echo.
pause
