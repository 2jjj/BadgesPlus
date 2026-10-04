@echo off
chcp 65001 >nul
title BadgesPlus - Installer / Instalador

rem EN: If install.ps1 isn't next to this file, download it from GitHub.
rem PT: Se o install.ps1 não estiver ao lado deste arquivo, baixa do GitHub.
set "PS1=%~dp0install.ps1"
if not exist "%PS1%" set "PS1=%TEMP%\badgesplus-install.ps1"
if not exist "%~dp0install.ps1" (
    echo Downloading the installer... / Baixando o instalador...
    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol='Tls12'; Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/lirenzzzin/BadgesPlus/main/install.ps1' -OutFile '%TEMP%\badgesplus-install.ps1'"
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
echo.
pause
