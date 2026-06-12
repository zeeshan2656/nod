const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// Robust production environment loader (cPanel compatible)
const envPath = fs.existsSync(path.join(__dirname, '.env'))
  ? path.join(__dirname, '.env')
  : (fs.existsSync(path.join(__dirname, '..', '.env'))
      ? path.join(__dirname, '..', '.env')
      : (fs.existsSync(path.join(__dirname, '..', '..', '.env'))
          ? path.join(__dirname, '..', '..', '.env')
          : path.join(process.cwd(), '.env')));
require('dotenv').config({ path: envPath });

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'ultra_fast_video',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 50, // High concurrency connection limit
  maxIdle: 10, // Max idle connections
  idleTimeout: 60000, // Idle connections timeout
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

module.exports = pool;
