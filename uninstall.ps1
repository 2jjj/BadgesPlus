# BadgesPlus - uninstaller / desinstalador
# EN: Makes Vesktop go back to the official Vencord (without the plugin).
# PT: Faz o Vesktop voltar a usar o Vencord oficial (sem o plugin).

param(
    [string]$VencordDir = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Vencord"),
    [ValidateSet("auto", "en", "pt")][string]$Lang = "auto",
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

if ($Lang -eq "auto") { $Lang = if ((Get-UICulture).Name -like "pt*") { "pt" } else { "en" } }
function T($en, $pt) { if ($Lang -eq "pt") { $pt } else { $en } }

function Ok($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }
function Ask($question) {
    if ($Yes) { return $true }
    $answer = Read-Host ("   $question " + (T "(Y/N)" "(S/N)"))
    return $answer -match "^[sSyY]"
}

Write-Host ""
Write-Host ("  BadgesPlus - " + (T "uninstaller" "desinstalador")) -ForegroundColor Magenta
Write-Host ""

# same rules as the installer to find Vesktop's settings / mesmas regras do instalador
$exes = @(Get-Process -Name vesktop -ErrorAction SilentlyContinue | ForEach-Object Path)
$exes += @(
    (Join-Path $env:LOCALAPPDATA "Programs\vesktop\Vesktop.exe"),
    (Join-Path $env:LOCALAPPDATA "vesktop\Vesktop.exe"),
    (Join-Path $env:ProgramFiles "Vesktop\Vesktop.exe")
) | Where-Object { Test-Path $_ }
foreach ($place in @([Environment]::GetFolderPath("Desktop"), [Environment]::GetFolderPath("MyDocuments"), (Join-Path $env:USERPROFILE "Downloads"), $env:USERPROFILE)) {
    if (Test-Path $place) {
        $exes += @(Get-ChildItem -Path $place -Filter "vesktop.exe" -Recurse -Depth 3 -File -ErrorAction SilentlyContinue | ForEach-Object FullName)
    }
}

$dataDirs = @()
if ($env:VENCORD_USER_DATA_DIR) { $dataDirs += $env:VENCORD_USER_DATA_DIR }
foreach ($exe in ($exes | Where-Object { $_ } | Select-Object -Unique)) {
    $dir = Split-Path $exe -Parent
    if (Test-Path (Join-Path $dir "Uninstall Vesktop.exe")) { $dataDirs += (Join-Path $env:APPDATA "vesktop") }
    else { $dataDirs += (Join-Path $dir "Data") }
}
$dataDirs += (Join-Path $env:APPDATA "vesktop")
$stateFiles = $dataDirs | Select-Object -Unique | ForEach-Object { Join-Path $_ "state.json" } | Where-Object { Test-Path $_ }

if (-not $stateFiles) {
    Warn (T "Couldn't find Vesktop's settings. Nothing to undo." "Não encontrei as configurações do Vesktop. Nada para desfazer.")
    exit 0
}

$running = Get-Process -Name vesktop -ErrorAction SilentlyContinue
if ($running) {
    if (-not (Ask (T "Vesktop needs to be closed. Close it now?" "O Vesktop precisa ser fechado. Fechar agora?"))) {
        Write-Host ("   " + (T "Close Vesktop and run the uninstaller again." "Feche o Vesktop e rode o desinstalador de novo."))
        exit 0
    }
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    Ok (T "Vesktop closed" "Vesktop fechado")
}

foreach ($file in $stateFiles) {
    $state = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.PSObject.Properties["vencordDir"]) {
        $state.PSObject.Properties.Remove("vencordDir")
        [IO.File]::WriteAllText($file, ($state | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
        Ok ((T "Vesktop is back to the official Vencord" "Vesktop volta a usar o Vencord oficial") + " ($file)")
    }
}

$plugin = Join-Path $VencordDir "src\userplugins\badgesPlus"
if (Test-Path $plugin) {
    Remove-Item $plugin -Recurse -Force
    Ok ((T "Plugin removed from" "Plugin removido de") + " $plugin")
}

$askDelete = T "Also delete the Vencord folder ($VencordDir)? Only say Y if you don't use other plugins of your own" `
               "Apagar também a pasta do Vencord ($VencordDir)? Só diga S se você não usa outros plugins seus"
if ((Test-Path $VencordDir) -and (Ask $askDelete)) {
    Remove-Item $VencordDir -Recurse -Force
    Ok (T "Vencord folder deleted" "Pasta do Vencord apagada")
}

Write-Host ""
Write-Host ("   " + (T "Done! Open Vesktop normally." "Pronto! Abra o Vesktop normalmente.")) -ForegroundColor Green
Write-Host ""
