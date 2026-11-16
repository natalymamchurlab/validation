$ErrorActionPreference = "Stop"

Write-Host "Starting local server at http://localhost:8000/ ..." -ForegroundColor Cyan

try {
    python -m http.server 8000
    exit 0
} catch {
    # fallback below
}

try {
    node .\serve.js 8000
    exit 0
} catch {
    Write-Host ""
    Write-Host "No local server could be started." -ForegroundColor Red
    Write-Host "Try one of these:" -ForegroundColor Yellow
    Write-Host "  - Install Python and run: python -m http.server 8000" -ForegroundColor Yellow
    Write-Host "  - Or ensure Node.js is installed and run: node .\\serve.js 8000" -ForegroundColor Yellow
    exit 1
}

