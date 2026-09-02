# Start LedgerFlow FastAPI backend only.
# Usage: .\scripts\start-backend.ps1
# Pass -Install to force reinstall Python deps.

param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$VenvPython = Join-Path $Backend ".venv\Scripts\python.exe"
Set-Location $Backend

$createdVenv = $false
if (-not (Test-Path $VenvPython)) {
    Write-Host "Creating virtual environment..."
    python -m venv .venv
    if (-not (Test-Path $VenvPython)) {
        throw "Failed to create venv. Is Python on PATH?"
    }
    $createdVenv = $true
}

if ($Install -or $createdVenv) {
    Write-Host "Installing Python dependencies..."
    & $VenvPython -m pip install --upgrade pip | Out-Null
    & $VenvPython -m pip install -r requirements.txt
}

$Host.UI.RawUI.WindowTitle = "LedgerFlow API"
# Reserved for this app — not uvicorn's default 8000.
if (-not $env:LEDGERFLOW_HOST) { $env:LEDGERFLOW_HOST = "127.0.0.1" }
if (-not $env:LEDGERFLOW_PORT) { $env:LEDGERFLOW_PORT = "8470" }
Write-Host "Starting API on http://$($env:LEDGERFLOW_HOST):$($env:LEDGERFLOW_PORT) ..."
& $VenvPython run.py
