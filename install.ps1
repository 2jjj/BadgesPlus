# BadgesPlus - automatic installer for Vesktop / instalador automático para o Vesktop
# https://github.com/lirenzzzin/BadgesPlus
#
# EN: 1. Checks (and if needed installs) Git, Node.js and pnpm
#     2. Downloads or updates the Vencord source in Documents\Vencord
#     3. Copies the plugin to Vencord\src\userplugins\badgesPlus
#     4. Builds Vencord
#     5. Finds Vesktop (installed or portable) and closes it
#     6. Points Vesktop to the built Vencord (Vencord Location)
#     7. Opens Vesktop again
#
# PT: 1. Confere (e se precisar, instala) Git, Node.js e pnpm
#     2. Baixa ou atualiza o código do Vencord em Documentos\Vencord
#     3. Copia o plugin para Vencord\src\userplugins\badgesPlus
#     4. Compila o Vencord
#     5. Encontra o Vesktop (instalado ou portátil) e fecha ele
#     6. Aponta o Vesktop para o Vencord compilado (Vencord Location)
#     7. Abre o Vesktop de novo

param(
    [string]$VencordDir = (Join-Path ([Environment]::GetFolderPath("MyDocuments")) "Vencord"),
    [ValidateSet("auto", "en", "pt")][string]$Lang = "auto",
    [switch]$Yes,          # answer "yes" to everything / responde "sim" para tudo
    [switch]$SkipVesktop   # only build, don't touch Vesktop / só compila, não mexe no Vesktop
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$RepoZipUrl = "https://github.com/lirenzzzin/BadgesPlus/archive/refs/heads/main.zip"
$PluginFolder = "badgesPlus"
$TotalSteps = 7

if ($Lang -eq "auto") { $Lang = if ((Get-UICulture).Name -like "pt*") { "pt" } else { "en" } }
function T($en, $pt) { if ($Lang -eq "pt") { $pt } else { $en } }

function Step($n, $msg) { Write-Host ""; Write-Host "[$n/$TotalSteps] $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "   OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }
function Fail($msg) {
    Write-Host ""
    Write-Host ("   " + (T "ERROR" "ERRO") + ": $msg") -ForegroundColor Red
    Write-Host ""
    exit 1
}
function Ask($question) {
    if ($Yes) { return $true }
    $answer = Read-Host ("   $question " + (T "(Y/N)" "(S/N)"))
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
    if ($LASTEXITCODE -ne 0) {
        Fail (T "Failed to $($what.en) (exit code $LASTEXITCODE). See the messages above." "Falhou ao $($what.pt) (código $LASTEXITCODE). Veja as mensagens acima.")
    }
}

# Files Vesktop requires in the Vencord folder. If any is missing when Vesktop starts,
# it downloads the official Vencord ON TOP of the folder, wiping the plugin.
# Arquivos que o Vesktop exige. Se faltar algum quando ele abre, ele baixa o Vencord
# oficial POR CIMA da pasta, apagando o plugin.
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

    # portable version: look for vesktop.exe in common folders / versão portátil
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
        # same rule as Vesktop: no "Uninstall Vesktop.exe" next to it = portable
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

    # UTF-8 WITHOUT BOM: Vesktop can't read the file with a BOM / SEM BOM: com BOM o Vesktop não lê
    $json = $state | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($file, $json, (New-Object Text.UTF8Encoding($false)))
}

Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Magenta
Write-Host ("    BadgesPlus - " + (T "installer for Vesktop" "instalador para o Vesktop")) -ForegroundColor Magenta
Write-Host "  ==============================================" -ForegroundColor Magenta
Write-Host ("   " + (T "Vencord folder" "Pasta do Vencord") + ": $VencordDir")

# ---------------------------------------------------------------------------
Step 1 (T "Checking Git, Node.js and pnpm" "Conferindo Git, Node.js e pnpm")

$missing = @()
if (-not (Has git)) { $missing += [pscustomobject]@{ Name = "Git"; Id = "Git.Git" } }
if (-not (Has node)) { $missing += [pscustomobject]@{ Name = "Node.js"; Id = "OpenJS.NodeJS.LTS" } }

if ($missing.Count -gt 0) {
    Warn ((T "Missing" "Faltando") + ": " + (($missing | ForEach-Object Name) -join ", "))
    if (-not (Has winget)) {
        Fail (T "Install Git (https://git-scm.com) and Node.js LTS (https://nodejs.org) manually and run the installer again." `
                "Instale manualmente o Git (https://git-scm.com) e o Node.js LTS (https://nodejs.org) e rode o instalador de novo.")
    }
    if (-not (Ask (T "Install them now with winget?" "Instalar agora pelo winget?"))) {
        Fail (T "Installation cancelled. Install Git and Node.js and run the installer again." "Instalação cancelada. Instale o Git e o Node.js e rode o instalador de novo.")
    }
    foreach ($m in $missing) {
        Write-Host ("   " + (T "Installing" "Instalando") + " $($m.Name)...")
        Run @{ en = "install $($m.Name)"; pt = "instalar $($m.Name)" } { winget install --id $m.Id -e --accept-source-agreements --accept-package-agreements }
    }
    Refresh-Path
    if (-not (Has git) -or -not (Has node)) {
        Fail (T "The programs were installed, but Windows doesn't see them yet. Close this window and run the installer again." `
                "Os programas foram instalados, mas o Windows ainda não os reconhece. Feche esta janela e rode o instalador de novo.")
    }
}
Ok "Git $((git --version) -replace 'git version ', '')"
Ok "Node.js $(node --version)"

if (-not (Has pnpm)) {
    Write-Host ("   " + (T "Installing pnpm..." "Instalando pnpm..."))
    Run @{ en = "install pnpm"; pt = "instalar o pnpm" } { npm install -g pnpm }
    Refresh-Path
    if (-not (Has pnpm)) {
        Fail (T "pnpm was installed but can't be found. Close this window and run the installer again." "O pnpm foi instalado mas não foi encontrado. Feche esta janela e rode o instalador de novo.")
    }
}
Ok "pnpm $(pnpm --version)"

# ---------------------------------------------------------------------------
Step 2 (T "Downloading / updating Vencord" "Baixando / atualizando o Vencord")

if (Test-Path (Join-Path $VencordDir "package.json")) {
    Push-Location $VencordDir
    git pull --ff-only
    if ($LASTEXITCODE -ne 0) { Warn (T "Couldn't update Vencord. Continuing with the version already in the folder." "Não consegui atualizar o Vencord. Continuando com a versão que já está na pasta.") }
    else { Ok (T "Vencord updated" "Vencord atualizado") }
    Pop-Location
} elseif ((Test-Path $VencordDir) -and (Get-ChildItem $VencordDir -Force | Select-Object -First 1)) {
    Fail (T "The folder $VencordDir already exists and isn't Vencord. Rename or delete it and run again." `
            "A pasta $VencordDir já existe e não é o Vencord. Renomeie ou apague essa pasta e rode de novo.")
} else {
    Run @{ en = "download Vencord"; pt = "baixar o Vencord" } { git clone --depth 1 https://github.com/Vendicated/Vencord "$VencordDir" }
    Ok (T "Vencord downloaded" "Vencord baixado")
}

# ---------------------------------------------------------------------------
Step 3 (T "Copying the BadgesPlus plugin" "Copiando o plugin BadgesPlus")

$source = Join-Path $PSScriptRoot $PluginFolder
if (-not (Test-Path (Join-Path $source "index.tsx"))) {
    Write-Host ("   " + (T "Downloading the latest version from GitHub..." "Baixando a versão mais recente do GitHub..."))
    $tmp = Join-Path $env:TEMP "badgesplus-download"
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $tmp | Out-Null
    $zip = Join-Path $tmp "repo.zip"
    Invoke-WebRequest -UseBasicParsing -Uri $RepoZipUrl -OutFile $zip
    Expand-Archive -Path $zip -DestinationPath $tmp -Force
    $source = Get-ChildItem $tmp -Directory -Recurse -Filter $PluginFolder | Select-Object -First 1 -ExpandProperty FullName
    if (-not $source) { Fail (T "Couldn't find the plugin folder in the download." "Não encontrei a pasta do plugin no download.") }
}

$userplugins = Join-Path $VencordDir "src\userplugins"
$target = Join-Path $userplugins $PluginFolder
New-Item -ItemType Directory -Force -Path $userplugins | Out-Null
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Copy-Item $source $target -Recurse
Ok ((T "Plugin copied to" "Plugin copiado para") + " $target")

# ---------------------------------------------------------------------------
Step 4 (T "Building Vencord (may take a few minutes the first time)" "Compilando o Vencord (pode levar alguns minutos na primeira vez)")

Push-Location $VencordDir
Run @{ en = "install Vencord's dependencies"; pt = "instalar as dependências do Vencord" } { pnpm install --frozen-lockfile }
Run @{ en = "build Vencord"; pt = "compilar o Vencord" } { pnpm build }
Pop-Location

$dist = Join-Path $VencordDir "dist"
foreach ($f in $RequiredFiles) {
    if (-not (Test-Path (Join-Path $dist $f))) { Fail (T "The build didn't create $f." "A compilação não gerou $f.") }
}
Ok ((T "Vencord built in" "Vencord compilado em") + " $dist")

if ($SkipVesktop) {
    Write-Host ""
    Ok (T "Done (Vesktop was not changed because of -SkipVesktop)." "Pronto (o Vesktop não foi alterado por causa do -SkipVesktop).")
    exit 0
}

# ---------------------------------------------------------------------------
Step 5 (T "Looking for Vesktop" "Procurando o Vesktop")

$found = Get-VesktopDataDirs
if ($found.DataDirs.Count -eq 0) {
    Warn (T "Couldn't find Vesktop on this computer." "Não encontrei o Vesktop neste computador.")
    Write-Host ("   " + (T "Set it up manually: Vesktop > Settings > Vesktop > Open Developer Settings" "Configure manualmente: Vesktop > Configurações > Vesktop > Open Developer Settings"))
    Write-Host ("   " + (T "> Vencord Location > pick the folder" "> Vencord Location > escolha a pasta") + ": $dist")
    exit 0
}
foreach ($d in $found.DataDirs) { Ok ((T "Settings in" "Configurações em") + " $d") }

$running = Get-Process -Name vesktop -ErrorAction SilentlyContinue
if ($running) {
    Write-Host ("   " + (T "Vesktop is open and needs to be closed to change its settings." "O Vesktop está aberto e precisa ser fechado para mudar a configuração."))
    if (-not (Ask (T "Close Vesktop now?" "Fechar o Vesktop agora?"))) {
        Write-Host ("   " + (T "Close Vesktop (tray icon near the clock > Quit) and run the installer again." "Feche o Vesktop (ícone perto do relógio > Sair) e rode o instalador de novo."))
        exit 0
    }
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 15 -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    Ok (T "Vesktop closed" "Vesktop fechado")
}

# ---------------------------------------------------------------------------
Step 6 (T "Pointing Vesktop to Vencord with the plugin" "Apontando o Vesktop para o Vencord com o plugin")

foreach ($d in $found.DataDirs) {
    Set-VencordLocation $d $dist
    Ok "Vencord Location = $dist  ($d\state.json)"
}

# ---------------------------------------------------------------------------
Step 7 (T "Finishing" "Finalizando")

$exe = @($running | ForEach-Object Path) + $found.Exes | Where-Object { $_ } | Select-Object -First 1
if ($exe -and (Ask (T "Open Vesktop now?" "Abrir o Vesktop agora?"))) {
    Start-Process $exe
    Ok (T "Vesktop opened" "Vesktop aberto")
}

Write-Host ""
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host ("    " + (T "Installed!" "Instalado!")) -ForegroundColor Green
Write-Host "  ==============================================" -ForegroundColor Green
Write-Host ("   " + (T "Now in Vesktop: Settings > Vencord > Plugins" "Agora no Vesktop: Configurações > Vencord > Plugins"))
Write-Host ("   " + (T "search for BadgesPlus and enable it." "procure BadgesPlus e ative."))
Write-Host ""
Write-Host ("   " + (T "To update later, just run this installer again." "Para atualizar no futuro, é só rodar este instalador de novo."))
Write-Host ""
