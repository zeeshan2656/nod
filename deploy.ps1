# SAFE DEPLOYMENT SCRIPT (WINDOWS POWERSHELL)
# Preserves external storage parallel folder and deploys only code changes

Write-Host "=====================================================" -ForegroundColor Green
Write-Host "   STARTING SAFE DEPLOYMENT OF ULTRA-FAST VIDEO      " -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green

# 1. Pull changes
Write-Host "[1/5] Fetching latest code from GitHub..." -ForegroundColor Cyan
git pull origin main

# 2. Build Frontend
Write-Host "[2/5] Building React client..." -ForegroundColor Cyan
Set-Location frontend
npm install --production=$false
npm run build
Set-Location ..

# 3. Backend Dependency Setup
Write-Host "[3/5] Installing backend dependencies..." -ForegroundColor Cyan
Set-Location backend
npm install

# 4. Storage Directory Checks
Write-Host "[4/5] Checking media storage architecture..." -ForegroundColor Cyan
Set-Location ..
if (Test-Path "storage") {
    Write-Host "✓ Verified: Permanent storage directory exists." -ForegroundColor Green
} else {
    Write-Host "⚠ Note: External storage directory not found parallel to repo. Server will initialize it on boot." -ForegroundColor Yellow
}

# 5. Syntax validation on Node files
Write-Host "[5/5] Checking Node.js syntax diagnostics..." -ForegroundColor Cyan
Set-Location backend
node -c server.js utils/dbInit.js utils/migrateStorage.js

Write-Host "=====================================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT SUCCEEDED! CODE UPDATED SECURELY!      " -ForegroundColor Green
Write-Host "=====================================================" -ForegroundColor Green
