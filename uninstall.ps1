# BadgesPlus - desinstalador
# Faz o Vesktop voltar a usar o Vencord oficial (sem o plugin).

param(
    [string]$VencordDir = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Vencord"),
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Ok($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }
function Ask($question) {
    if ($Yes) { return $true }
    $answer = Read-Host "   $question (S/N)"
    return $answer -match "^[sSyY]"
}

Write-Host ""
Write-Host "  BadgesPlus - desinstalador" -ForegroundColor Magenta
Write-Host ""

# mesmas regras do instalador para achar onde o Vesktop guarda as configurações
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
    Warn "Não encontrei as configurações do Vesktop. Nada para desfazer."
    exit 0
}

$running = Get-Process -Name vesktop -ErrorAction SilentlyContinue
if ($running) {
    if (-not (Ask "O Vesktop precisa ser fechado. Fechar agora?")) {
        Write-Host "   Feche o Vesktop e rode o desinstalador de novo."
        exit 0
    }
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    Ok "Vesktop fechado"
}

foreach ($file in $stateFiles) {
    $state = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.PSObject.Properties["vencordDir"]) {
        $state.PSObject.Properties.Remove("vencordDir")
        [IO.File]::WriteAllText($file, ($state | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
        Ok "Vesktop volta a usar o Vencord oficial ($file)"
    }
}

$plugin = Join-Path $VencordDir "src\userplugins\badgesPlus"
if (Test-Path $plugin) {
    Remove-Item $plugin -Recurse -Force
    Ok "Plugin removido de $plugin"
}

if ((Test-Path $VencordDir) -and (Ask "Apagar também a pasta do Vencord ($VencordDir)? Só diga S se você não usa outros plugins seus")) {
    Remove-Item $VencordDir -Recurse -Force
    Ok "Pasta do Vencord apagada"
}

Write-Host ""
Write-Host "   Pronto! Abra o Vesktop normalmente." -ForegroundColor Green
Write-Host ""
