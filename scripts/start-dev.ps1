# Start LedgerFlow (backend + frontend) for local development.
# Usage (from project root):
#   .\scripts\start-dev.ps1
#   npm run dev
#
# Opens each service in its own PowerShell window so logs stay separate.
# Pass -NoBrowser to skip opening the UI. Pass -Install to force reinstall deps.

param(
    [switch]$NoBrowser,
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
$StartBackend = Join-Path $PSScriptRoot "start-backend.ps1"
$StartFrontend = Join-Path $PSScriptRoot "start-frontend.ps1"
$ApiUrl = "http://127.0.0.1:8000"
$UiUrl = "http://localhost:3000"
$HealthUrl = "$ApiUrl/api/health"

function Test-Url([string]$Url, [int]$TimeoutSec = 2) {
    try {
        $res = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return $res.StatusCode -ge 200 -and $res.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Wait-Url([string]$Url, [string]$Label, [int]$Attempts = 40, [int]$DelayMs = 500) {
    Write-Host "Waiting for $Label ..." -NoNewline
    for ($i = 0; $i -lt $Attempts; $i++) {
        if (Test-Url $Url) {
            Write-Host " ready."
            return $true
        }
        Start-Sleep -Milliseconds $DelayMs
        Write-Host "." -NoNewline
    }
    Write-Host " timed out."
    return $false
}

Write-Host ""
Write-Host "LedgerFlow - starting local stack" -ForegroundColor Cyan
Write-Host "  Root: $Root"
Write-Host ""

# --- Backend setup ---
if (-not (Test-Path $Backend)) {
    throw "Backend folder not found: $Backend"
}

Push-Location $Backend
try {
    $createdVenv = $false
    if (-not (Test-Path $VenvPython)) {
        Write-Host "Creating Python virtual environment..."
        python -m venv .venv
        if (-not (Test-Path $VenvPython)) {
            throw "Failed to create venv at $VenvPython. Is Python on PATH?"
        }
        $createdVenv = $true
    }

    if ($Install -or $createdVenv) {
        Write-Host "Installing Python dependencies..."
        & $VenvPython -m pip install --upgrade pip | Out-Null
        & $VenvPython -m pip install -r requirements.txt
    }
} finally {
    Pop-Location
}

# --- Frontend setup ---
if (-not (Test-Path $Frontend)) {
    throw "Frontend folder not found: $Frontend"
}

Push-Location $Frontend
try {
    if ($Install -or -not (Test-Path "node_modules")) {
        Write-Host "Installing npm dependencies..."
        npm install
    }
} finally {
    Pop-Location
}

# --- Launch services (skip if already healthy) ---
$apiAlreadyUp = Test-Url $HealthUrl
$uiAlreadyUp = Test-Url $UiUrl

if ($apiAlreadyUp) {
    Write-Host "Backend already running at $ApiUrl" -ForegroundColor Yellow
} else {
    Write-Host "Starting backend  -> $ApiUrl" -ForegroundColor Green
    $backendArgs = @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $StartBackend)
    if ($Install) { $backendArgs += "-Install" }
    Start-Process -FilePath "powershell.exe" -ArgumentList $backendArgs | Out-Null
}

if ($uiAlreadyUp) {
    Write-Host "Frontend already running at $UiUrl" -ForegroundColor Yellow
} else {
    Write-Host "Starting frontend -> $UiUrl" -ForegroundColor Green
    $frontendArgs = @("-NoExit", "-ExecutionPolicy", "Bypass", "-File", $StartFrontend)
    if ($Install) { $frontendArgs += "-Install" }
    Start-Process -FilePath "powershell.exe" -ArgumentList $frontendArgs | Out-Null
}

# --- Health wait ---
if ($apiAlreadyUp) {
    $apiOk = $true
} else {
    $apiOk = Wait-Url $HealthUrl "API ($HealthUrl)"
}

if ($uiAlreadyUp) {
    $uiOk = $true
} else {
    $uiOk = Wait-Url $UiUrl "UI ($UiUrl)" 60
}

Write-Host ""
if ($apiOk -and $uiOk) {
    Write-Host "Both services are up." -ForegroundColor Green
} elseif ($apiOk) {
    Write-Host "API is up, but the UI did not respond yet. Check the 'LedgerFlow UI' window." -ForegroundColor Yellow
} elseif ($uiOk) {
    Write-Host "UI is up, but the API did not respond. Check the 'LedgerFlow API' window." -ForegroundColor Yellow
} else {
    Write-Host "Services did not become ready in time. Check the two new PowerShell windows for errors." -ForegroundColor Red
}

Write-Host ""
Write-Host "  UI:       $UiUrl"
Write-Host "  API:      $ApiUrl"
Write-Host "  API docs: $ApiUrl/docs"
Write-Host ""
Write-Host "Close the 'LedgerFlow API' / 'LedgerFlow UI' windows (or Ctrl+C in each) to stop."
Write-Host ""

if (-not $NoBrowser -and $uiOk) {
    Start-Process $UiUrl
}
