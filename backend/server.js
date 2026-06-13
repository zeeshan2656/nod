const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
// Robust production environment loader (cPanel compatible)
const envPath = fs.existsSync(path.join(__dirname, '.env'))
  ? path.join(__dirname, '.env')
  : (fs.existsSync(path.join(__dirname, '..', '.env'))
      ? path.join(__dirname, '..', '.env')
      : path.join(process.cwd(), '.env'));
require('dotenv').config({ path: envPath });

// Initialize Express App
const app = express();
app.set('trust proxy', 1); // Trust first proxy (cPanel / Phusion Passenger)
const PORT = process.env.PORT || 5000;

// Security and Optimization Middlewares
app.use(helmet({
  // Disable Content Security Policy to allow custom injected tracking scripts & ads
  contentSecurityPolicy: false, 
  // Allow cross-origin video streaming requests (HLS segments)
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false
}));

// CORS Configuration
app.use(cors({
  origin: '*', // Allow all origins for API, CDN, and local development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compress all HTTP responses using Gzip (Essential for Google PageSpeed scores)
app.use(compression());

// Parse incoming request payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Uploaded Media Static Assets (with caching & cross-origin headers)
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use('/uploads', (req, res, next) => {
  // Add cross-origin headers for media streaming and CDN requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  
  // Cache HLS TS segments and manifests aggressively
  if (req.path.endsWith('.ts')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.path.endsWith('.m3u8')) {
    res.setHeader('Cache-Control', 'public, max-age=2, must-revalidate'); // Manifests are hot-updated
  } else {
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Default static cache (24 hours)
  }
  next();
}, express.static(uploadsPath));

// Mount REST API Routes
const authRoutes = require('./routes/auth');
const videoRoutes = require('./routes/videos');
const reelRoutes = require('./routes/reels');
const commentRoutes = require('./routes/comments');
const adRoutes = require('./routes/ads');
const settingRoutes = require('./routes/settings');

app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/reels', reelRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/settings', settingRoutes);

// Base health check endpoint (performs db sanity checks for production diagnostics)
const db = require('./config/db');
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ 
      status: 'healthy', 
      database: 'connected', 
      time: new Date() 
    });
  } catch (dbErr) {
    res.status(500).json({ 
      status: 'unhealthy', 
      database: 'disconnected', 
      error: dbErr.message, 
      config: {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT || 3306
      },
      time: new Date() 
    });
  }
});

// Serve static React frontend files from 'public' directory (cPanel single-domain deployment)
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath));

// React SPA fallback routing (must be placed after API routes, before 404 handler)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// 404 Route handler (for API requests and missing static files)
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error occurred.' });
});

// Run Server
const initializeDatabase = require('./utils/dbInit');
initializeDatabase().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(` ULTRA-FAST VIDEO & REELS API RUNNING ON PORT ${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`===================================================`);
  });
});
