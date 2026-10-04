# BadgesPlus - instalador automático para o Vesktop
# https://github.com/lirenzzzin/BadgesPlus
#
# O que ele faz:
#   1. Confere (e se precisar, instala) Git, Node.js e pnpm
#   2. Baixa ou atualiza o código do Vencord em Documentos\Vencord
#   3. Copia o plugin para Vencord\src\userplugins\badgesPlus
#   4. Compila o Vencord
#   5. Fecha o Vesktop e encontra onde ele guarda as configurações
#   6. Aponta o Vesktop para o Vencord compilado (Vencord Location)
#   7. Abre o Vesktop de novo

param(
    [string]$VencordDir = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Vencord"),
    [switch]$Yes,          # responde "sim" para todas as perguntas
    [switch]$SkipVesktop   # só compila, não mexe no Vesktop
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoZipUrl = "https://github.com/lirenzzzin/BadgesPlus/archive/refs/heads/main.zip"
$PluginFolder = "badgesPlus"
$TotalSteps = 7

function Step($n, $msg) { Write-Host ""; Write-Host "[$n/$TotalSteps] $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }
function Fail($msg) {
    Write-Host ""
    Write-Host "   ERRO: $msg" -ForegroundColor Red
    Write-Host ""
    exit 1
}
function Ask($question) {
    if ($Yes) { return $true }
    $answer = Read-Host "   $question (S/N)"
    return $answer -match "^[sSyY]"
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
                [Environment]::GetEnvironmentVariable("Path", "User") + ";" +
                (Join-Path $env:APPDATA "npm")
}
function Run($what, [scriptblock]$block) {
    & $block
    if ($LASTEXITCODE -ne 0) { Fail "Falhou ao $what (código $LASTEXITCODE). Veja as mensagens acima." }
}

# Arquivos que o Vesktop exige na pasta do Vencord. Se faltar algum quando o Vesktop
# abre, ele baixa o Vencord oficial POR CIMA da pasta, apagando o plugin.
$RequiredFiles = @("vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css")

function Get-VesktopDataDirs {
    $exes = New-Object System.Collections.Generic.List[string]

    Get-Process -Name vesktop -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.Path) { $exes.Add($_.Path) }
    }

    $installed = @(
        (Join-Path $env:LOCALAPPDATA "Programs\vesktop\Vesktop.exe"),
        (Join-Path $env:LOCALAPPDATA "vesktop\Vesktop.exe"),
        (Join-Path $env:ProgramFiles "Vesktop\Vesktop.exe")
    )
    foreach ($p in $installed) { if (Test-Path $p) { $exes.Add($p) } }

    # versão portátil: procura vesktop.exe nas pastas mais comuns
    $places = @(
        [Environment]::GetFolderPath("Desktop"),
        [Environment]::GetFolderPath("MyDocuments"),
        (Join-Path $env:USERPROFILE "Downloads"),
        $env:USERPROFILE
    ) | Select-Object -Unique
    foreach ($place in $places) {
        if (-not (Test-Path $place)) { continue }
        Get-ChildItem -Path $place -Filter "vesktop.exe" -Recurse -Depth 3 -File -ErrorAction SilentlyContinue |
            ForEach-Object { $exes.Add($_.FullName) }
    }

    $dirs = New-Object System.Collections.Generic.List[string]
    if ($env:VENCORD_USER_DATA_DIR) { $dirs.Add($env:VENCORD_USER_DATA_DIR) }

    foreach ($exe in ($exes | Select-Object -Unique)) {
        $exeDir = Split-Path $exe -Parent
        # mesma regra do Vesktop: sem "Uninstall Vesktop.exe" ao lado = portátil
        if (Test-Path (Join-Path $exeDir "Uninstall Vesktop.exe")) {
            $dirs.Add((Join-Path $env:APPDATA "vesktop"))
        } else {
            $dirs.Add((Join-Path $exeDir "Data"))
        }
    }

    if ($dirs.Count -eq 0 -and (Test-Path (Join-Path $env:APPDATA "vesktop"))) {
        $dirs.Add((Join-Path $env:APPDATA "vesktop"))
    }

    return [pscustomobject]@{
        DataDirs = @($dirs | Select-Object -Unique)
        Exes     = @($exes | Select-Object -Unique)
    }
}

function Set-VencordLocation($dataDir, $distDir) {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
    $file = Join-Path $dataDir "state.json"

    $state = $null
    if (Test-Path $file) {
        Copy-Item $file "$file.bak" -Force
        try { $state = Get-Content $file -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $state = $null }
    }
    if (-not $state) { $state = New-Object PSObject }

    if ($state.PSObject.Properties["vencordDir"]) { $state.vencordDir = $distDir }
    else { $state | Add-Member -NotePropertyName vencordDir -NotePropertyValue $distDir }

    # UTF-8 SEM BOM: com BOM o Vesktop não consegue ler o arquivo
    $json = $state | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($file, $json, (New-Object Text.UTF8Encoding($false)))
}

Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Magenta
Write-Host "    BadgesPlus - instalador para o Vesktop" -ForegroundColor Magenta
Write-Host "  ==============================================" -ForegroundColor Magenta
Write-Host "   Pasta do Vencord: $VencordDir"

# ---------------------------------------------------------------------------
Step 1 "Conferindo Git, Node.js e pnpm"

$missing = @()
if (-not (Has git)) { $missing += [pscustomobject]@{ Name = "Git"; Id = "Git.Git" } }
if (-not (Has node)) { $missing += [pscustomobject]@{ Name = "Node.js"; Id = "OpenJS.NodeJS.LTS" } }

if ($missing.Count -gt 0) {
    Warn ("Faltando: " + (($missing | ForEach-Object Name) -join ", "))
    if (-not (Has winget)) {
        Fail "Instale manualmente o Git (https://git-scm.com) e o Node.js LTS (https://nodejs.org) e rode o instalador de novo."
    }
    if (-not (Ask "Instalar agora pelo winget?")) {
        Fail "Instalação cancelada. Instale o Git e o Node.js e rode o instalador de novo."
    }
    foreach ($m in $missing) {
        Write-Host "   Instalando $($m.Name)..."
        Run "instalar $($m.Name)" { winget install --id $m.Id -e --accept-source-agreements --accept-package-agreements }
    }
    Refresh-Path
    if (-not (Has git) -or -not (Has node)) {
        Fail "Os programas foram instalados, mas o Windows ainda não os reconhece. Feche esta janela e rode o instalador de novo."
    }
}
Ok "Git $((git --version) -replace 'git version ', '')"
Ok "Node.js $(node --version)"

if (-not (Has pnpm)) {
    Write-Host "   Instalando pnpm..."
    Run "instalar o pnpm" { npm install -g pnpm }
    Refresh-Path
    if (-not (Has pnpm)) { Fail "O pnpm foi instalado mas não foi encontrado. Feche esta janela e rode o instalador de novo." }
}
Ok "pnpm $(pnpm --version)"

# ---------------------------------------------------------------------------
Step 2 "Baixando / atualizando o Vencord"

if (Test-Path (Join-Path $VencordDir "package.json")) {
    Push-Location $VencordDir
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Warn "Não consegui atualizar o Vencord. Continuando com a versão que já está na pasta." }
    else { Ok "Vencord atualizado" }
    Pop-Location
} elseif ((Test-Path $VencordDir) -and (Get-ChildItem $VencordDir -Force | Select-Object -First 1)) {
    Fail "A pasta $VencordDir já existe e não é o Vencord. Renomeie ou apague essa pasta e rode de novo."
} else {
    Run "baixar o Vencord" { git clone --depth 1 https://github.com/Vendicated/Vencord "$VencordDir" }
    Ok "Vencord baixado"
}

# ---------------------------------------------------------------------------
Step 3 "Copiando o plugin BadgesPlus"

$source = Join-Path $PSScriptRoot $PluginFolder
if (-not (Test-Path (Join-Path $source "index.tsx"))) {
    Write-Host "   Baixando a versão mais recente do GitHub..."
    $tmp = Join-Path $env:TEMP "badgesplus-download"
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp "repo.zip"
    Invoke-WebRequest -UseBasicParsing -Uri $RepoZipUrl -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $source = Get-ChildItem $tmp -Directory -Recurse -Filter $PluginFolder | Select-Object -First 1 -ExpandProperty FullName
    if (-not $source) { Fail "Não encontrei a pasta do plugin no download." }
}

$userplugins = Join-Path $VencordDir "src\userplugins"
$target = Join-Path $userplugins $PluginFolder
New-Item -ItemType Directory -Force -Path $userplugins | Out-Null
Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $source $target -Recurse
Ok "Plugin copiado para $target"

# ---------------------------------------------------------------------------
Step 4 "Compilando o Vencord (pode levar alguns minutos na primeira vez)"

Push-Location $VencordDir
Run "instalar as dependências do Vencord" { pnpm install --frozen-lockfile }
Run "compilar o Vencord" { pnpm build }
Pop-Location

$dist = Join-Path $VencordDir "dist"
foreach ($f in $RequiredFiles) {
    if (-not (Test-Path (Join-Path $dist $f))) { Fail "A compilação não gerou $f." }
}
Ok "Vencord compilado em $dist"

if ($SkipVesktop) {
    Write-Host ""
    Ok "Pronto (o Vesktop não foi alterado por causa do -SkipVesktop)."
    exit 0
}

# ---------------------------------------------------------------------------
Step 5 "Procurando o Vesktop"

$found = Get-VesktopDataDirs
if ($found.DataDirs.Count -eq 0) {
    Warn "Não encontrei o Vesktop neste computador."
    Write-Host "   Configure manualmente: Vesktop > Configurações > Vesktop > Open Developer Settings"
    Write-Host "   > Vencord Location > escolha a pasta: $dist"
    exit 0
}
foreach ($d in $found.DataDirs) { Ok "Configurações em $d" }

$running = Get-Process -Name vesktop -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "   O Vesktop está aberto e precisa ser fechado para mudar a configuração."
    if (-not (Ask "Fechar o Vesktop agora?")) {
        Write-Host "   Feche o Vesktop (ícone perto do relógio > Sair) e rode o instalador de novo."
        exit 0
    }
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Ok "Vesktop fechado"
}

# ---------------------------------------------------------------------------
Step 6 "Apontando o Vesktop para o Vencord com o plugin"

foreach ($d in $found.DataDirs) {
    Set-VencordLocation $d $dist
    Ok "Vencord Location = $dist  ($d\state.json)"
}

# ---------------------------------------------------------------------------
Step 7 "Finalizando"

$exe = @($running | ForEach-Object Path) + $found.Exes | Where-Object { $_ } | Select-Object -First 1
if ($exe -and (Ask "Abrir o Vesktop agora?")) {
    Start-Process $exe
    Ok "Vesktop aberto"
}

Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host "    Instalado!" -ForegroundColor Green
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host "   Agora no Vesktop: Configurações > Vencord > Plugins"
Write-Host "   procure BadgesPlus e ative."
Write-Host ""
Write-Host "   Para atualizar no futuro, é só rodar este instalador de novo."
Write-Host ""
