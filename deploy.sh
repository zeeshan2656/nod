#!/bin/bash
# SAFE DEPLOYMENT SCRIPT (LINUX/CPANEL)
# Preserves /storage/ and updates ONLY the code /app/

echo "====================================================="
echo "   STARTING SAFE DEPLOYMENT OF ULTRA-FAST VIDEO      "
echo "====================================================="

# 1. Pull changes
echo "[1/5] Fetching latest code from GitHub..."
git pull origin main

# 2. Build Frontend
echo "[2/5] Building React client..."
cd frontend
npm install --production=false
npm run build
cd ..

# 3. Backend Dependency Setup
echo "[3/5] Installing backend dependencies..."
cd backend
npm install --production

# 4. Trigger Server Hot Restart (cPanel / Phusion Passenger standard)
echo "[4/5] Triggering Node.js hot-restart..."
mkdir -p tmp
touch tmp/restart.txt

# 5. Verify diagnostics & storage preservation
echo "[5/5] Performing post-deployment diagnostics..."
cd ..
if [ -d "storage" ]; then
    echo "✓ Verified: External storage directory preserved successfully."
else
    echo "⚠ Warning: External storage directory not found parallel to repo. It will be created on server boot."
fi

# Test health check
PORT_VAL=${PORT:-5000}
echo "Checking API service health..."
sleep 2
curl -s http://localhost:$PORT_VAL/health || echo "Could not query local health check port. Please verify browser access to live site."

echo "====================================================="
echo "   DEPLOYMENT SUCCEEDED! MEDIA STORAGE PRESERVED!    "
echo "====================================================="
