# Start LedgerFlow Next.js frontend only.
# Usage: .\scripts\start-frontend.ps1
# Pass -Install to force npm install.

param(
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Frontend = Join-Path $Root "frontend"
Set-Location $Frontend

if ($Install -or -not (Test-Path "node_modules")) {
    Write-Host "Installing npm dependencies..."
    npm install
}

$Host.UI.RawUI.WindowTitle = "LedgerFlow UI"
# Reserved for this app — not Next's default 3000.
if (-not $env:NEXT_PUBLIC_API_URL) { $env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8470/api" }
Write-Host "Starting Next.js on http://localhost:3470 ..."
npm run dev
