# Build LedgerFlow Windows portable .exe for first testers.
#
# Usage (from repo root, PowerShell):
#   .\scripts\build-desktop.ps1
#
# Steps:
#   1) Package FastAPI with PyInstaller → desktop/resources/api
#   2) Static-export Next.js UI → desktop/resources/ui
#   3) electron-builder portable → desktop/dist/LedgerFlow-*-Portable.exe
#
# Prerequisites: Python 3.11+ with backend venv deps, Node 18+, npm.

param(
    [switch]$SkipApi,
    [switch]$SkipUi,
    [switch]$SkipElectron,
    [string]$UpdateManifestUrl = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$Desktop = Join-Path $Root "desktop"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
$VenvPyInstaller = Join-Path $Backend ".venv\Scripts\pyinstaller.exe"
$Resources = Join-Path $Desktop "resources"
$ApiOut = Join-Path $Resources "api"
$UiOut = Join-Path $Resources "ui"
$VersionFile = Join-Path $Root "VERSION"
$ChannelUrlFile = Join-Path $Root "updates\channel.url"

function Write-Step([string]$Msg) {
    Write-Host ""
    Write-Host "==> $Msg" -ForegroundColor Cyan
}

Set-Location $Root
Write-Host "LedgerFlow desktop build" -ForegroundColor Green
Write-Host "  Root: $Root"

# --- Version + update channel ---
if (-not (Test-Path $VersionFile)) {
    throw "Missing VERSION file at repo root."
}
$AppVersion = (Get-Content $VersionFile -Raw).Trim()
if (-not $AppVersion) { throw "VERSION file is empty." }

if (-not $UpdateManifestUrl) {
    if ($env:LEDGERFLOW_UPDATE_MANIFEST_URL) {
        $UpdateManifestUrl = $env:LEDGERFLOW_UPDATE_MANIFEST_URL.Trim()
    } elseif (Test-Path $ChannelUrlFile) {
        $UpdateManifestUrl = (Get-Content $ChannelUrlFile -Raw).Trim()
    }
}

Write-Host "  Version: $AppVersion"
if ($UpdateManifestUrl) {
    Write-Host "  Update manifest: $UpdateManifestUrl"
} else {
    Write-Host "  Update manifest: (not set — Settings updates disabled until configured)" -ForegroundColor Yellow
}

# Keep Electron package version in sync (app.getVersion + portable filename)
$DesktopPkg = Join-Path $Desktop "package.json"
if (Test-Path $DesktopPkg) {
    node -e "const fs=require('fs');const p=process.argv[1];const v=process.argv[2];const j=JSON.parse(fs.readFileSync(p,'utf8'));j.version=v;fs.writeFileSync(p,JSON.stringify(j,null,2)+'\n');" $DesktopPkg $AppVersion
}

# --- Preconditions ---
if (-not (Test-Path $VenvPython)) {
    Write-Step "Creating backend venv + installing deps"
    Push-Location $Backend
    python -m venv .venv
    & $VenvPython -m pip install --upgrade pip
    & $VenvPython -m pip install -r requirements.txt
    Pop-Location
}

if (-not (Test-Path $VenvPyInstaller)) {
    Write-Step "Installing PyInstaller into backend venv"
    & $VenvPython -m pip install "pyinstaller>=6.0"
}

if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
    Write-Step "Installing frontend npm deps"
    Push-Location $Frontend
    npm install
    Pop-Location
}

# --- API ---
if (-not $SkipApi) {
    Write-Step "Building API sidecar (PyInstaller)"
    $Spec = Join-Path $Backend "packaging\ledgerflow-api.spec"
    $DistDir = Join-Path $Backend "packaging\dist"
    $WorkDir = Join-Path $Backend "packaging\build"
    New-Item -ItemType Directory -Force -Path $DistDir, $WorkDir | Out-Null

    & $VenvPyInstaller --noconfirm --clean `
        --distpath $DistDir `
        --workpath $WorkDir `
        $Spec

    $BuiltApiDir = Join-Path $DistDir "ledgerflow-api"
    if (-not (Test-Path (Join-Path $BuiltApiDir "ledgerflow-api.exe"))) {
        throw "PyInstaller finished but ledgerflow-api.exe was not found in $BuiltApiDir"
    }

    if (Test-Path $ApiOut) { Remove-Item -Recurse -Force $ApiOut }
    New-Item -ItemType Directory -Force -Path $ApiOut | Out-Null
    Copy-Item -Recurse -Force $BuiltApiDir (Join-Path $ApiOut "ledgerflow-api")
    Write-Host "API copied to $ApiOut\ledgerflow-api" -ForegroundColor Green
} else {
    Write-Host "Skipping API build (-SkipApi)" -ForegroundColor Yellow
}

# --- UI ---
if (-not $SkipUi) {
    Write-Step "Building static UI (Next.js export) v$AppVersion"
    Push-Location $Frontend
    $env:LEDGERFLOW_DESKTOP = "1"
    $env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000/api"
    $env:NEXT_PUBLIC_APP_VERSION = $AppVersion
    if ($UpdateManifestUrl) {
        $env:NEXT_PUBLIC_UPDATE_MANIFEST_URL = $UpdateManifestUrl
    } else {
        Remove-Item Env:NEXT_PUBLIC_UPDATE_MANIFEST_URL -ErrorAction SilentlyContinue
    }
    npm run build
    Remove-Item Env:LEDGERFLOW_DESKTOP -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_APP_VERSION -ErrorAction SilentlyContinue
    Remove-Item Env:NEXT_PUBLIC_UPDATE_MANIFEST_URL -ErrorAction SilentlyContinue
    Pop-Location

    $OutDir = Join-Path $Frontend "out"
    if (-not (Test-Path $OutDir)) {
        throw "Next export did not produce frontend/out. Check LEDGERFLOW_DESKTOP=1 build logs."
    }

    if (Test-Path $UiOut) { Remove-Item -Recurse -Force $UiOut }
    New-Item -ItemType Directory -Force -Path (Split-Path $UiOut) -ErrorAction SilentlyContinue | Out-Null
    Copy-Item -Recurse -Force $OutDir $UiOut
    Write-Host "UI copied to $UiOut" -ForegroundColor Green
} else {
    Write-Host "Skipping UI build (-SkipUi)" -ForegroundColor Yellow
}

# --- Electron ---
if (-not $SkipElectron) {
    if (-not (Test-Path (Join-Path $ApiOut "ledgerflow-api\ledgerflow-api.exe"))) {
        throw "Missing API resources. Run without -SkipApi first."
    }
    if (-not (Test-Path (Join-Path $UiOut "index.html"))) {
        throw "Missing UI resources. Run without -SkipUi first."
    }

    Write-Step "Installing desktop npm deps"
    Push-Location $Desktop
    npm install

    Write-Step "Packaging portable .exe (electron-builder)"
    npm run dist
    Pop-Location

    $Dist = Join-Path $Desktop "dist"
    Write-Host ""
    Write-Host "Build complete." -ForegroundColor Green
    Write-Host "Look for the portable app under:" -ForegroundColor Green
    Write-Host "  $Dist"
    Get-ChildItem $Dist -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-Host ("  -> " + $_.FullName + "  (" + [math]::Round($_.Length / 1MB, 1) + " MB)") -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Send the *Portable*.exe to your tester. Data is stored in their Documents\LedgerFlow\Data."
} else {
    Write-Host "Skipping Electron packaging (-SkipElectron)" -ForegroundColor Yellow
}
