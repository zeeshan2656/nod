const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function initializeDatabase() {
  try {
    // Check if the 'users' table exists to determine if we need initialization
    const [rows] = await db.query("SHOW TABLES LIKE 'users'");
    let initialized = false;
    if (rows.length > 0) {
      console.log('[Database] Tables already initialized.');
      initialized = true;
    }

    // Always guarantee upload_queue table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS upload_queue (
          id INT AUTO_INCREMENT PRIMARY KEY,
          upload_id VARCHAR(100) NOT NULL UNIQUE,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          file_name VARCHAR(255) NOT NULL,
          file_size BIGINT NOT NULL,
          uploaded_bytes BIGINT DEFAULT 0,
          status VARCHAR(50) DEFAULT 'queued',
          duration FLOAT DEFAULT 0,
          width INT DEFAULT 0,
          height INT DEFAULT 0,
          upload_type VARCHAR(20) DEFAULT 'video',
          video_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Run migrations for embedded videos and reels
    try {
      await db.query("ALTER TABLE videos MODIFY COLUMN file_path VARCHAR(255) NULL");
      await db.query("ALTER TABLE reels MODIFY COLUMN file_path VARCHAR(255) NULL");
      
      const checkColumnsQuery = (table) => `SHOW COLUMNS FROM ${table}`;
      
      const [videoCols] = await db.query(checkColumnsQuery('videos'));
      const videoColNames = videoCols.map(c => c.Field);
      if (!videoColNames.includes('source_type')) {
        await db.query("ALTER TABLE videos ADD COLUMN source_type VARCHAR(50) DEFAULT 'upload'");
        console.log("[Migration] Added source_type to videos.");
      }
      if (!videoColNames.includes('source_id')) {
        await db.query("ALTER TABLE videos ADD COLUMN source_id VARCHAR(100) DEFAULT NULL");
        console.log("[Migration] Added source_id to videos.");
      }
      if (!videoColNames.includes('source_url')) {
        await db.query("ALTER TABLE videos ADD COLUMN source_url TEXT DEFAULT NULL");
        console.log("[Migration] Added source_url to videos.");
      }

      const [reelCols] = await db.query(checkColumnsQuery('reels'));
      const reelColNames = reelCols.map(c => c.Field);
      if (!reelColNames.includes('source_type')) {
        await db.query("ALTER TABLE reels ADD COLUMN source_type VARCHAR(50) DEFAULT 'upload'");
        console.log("[Migration] Added source_type to reels.");
      }
      if (!reelColNames.includes('source_id')) {
        await db.query("ALTER TABLE reels ADD COLUMN source_id VARCHAR(100) DEFAULT NULL");
        console.log("[Migration] Added source_id to reels.");
      }
      if (!reelColNames.includes('source_url')) {
        await db.query("ALTER TABLE reels ADD COLUMN source_url TEXT DEFAULT NULL");
        console.log("[Migration] Added source_url to reels.");
      }
    } catch (migErr) {
      console.warn('[Database Migration] Warning or error running table migrations:', migErr.message);
    }

    if (!initialized) {
      console.log('[Database] Tables not found. Auto-initializing database from schema.sql...');
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      console.warn('[Database] schema.sql file not found at:', schemaPath);
      return;
    }

    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    // Split statements, filtering out comments and Hostinger-unsupported CREATE DATABASE / USE commands
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => {
        const lower = stmt.toLowerCase();
        return (
          stmt.length > 0 &&
          !lower.startsWith('--') &&
          !lower.startsWith('create database') &&
          !lower.startsWith('use ')
        );
      });

    for (const statement of statements) {
      try {
        await db.query(statement);
      } catch (stmtErr) {
        console.error('[Database] Failed to execute statement:', statement, '\nError:', stmtErr.message);
      }
    }
      console.log('[Database] Database tables initialized successfully!');
    }

    // Always guarantee that landing page row, watch page, footer, and overlay ad slots are seeded
    const adPlacementsToSeed = [
      ['landing_row_1', 'Landing Page Row 1 Ad', '<!-- Landing Page Row 1 Ad Placeholder -->', 0],
      ['landing_row_2', 'Landing Page Row 2 Ad', '<!-- Landing Page Row 2 Ad Placeholder -->', 0],
      ['landing_row_3', 'Landing Page Row 3 Ad', '<!-- Landing Page Row 3 Ad Placeholder -->', 0],
      ['landing_row_4', 'Landing Page Row 4 Ad', '<!-- Landing Page Row 4 Ad Placeholder -->', 0],
      ['landing_row_5', 'Landing Page Row 5 Ad', '<!-- Landing Page Row 5 Ad Placeholder -->', 0],
      ['watch_page_desktop', 'Watch Page Desktop Ad', '<!-- Watch Page Desktop Ad Placeholder -->', 0],
      ['watch_page_mobile', 'Watch Page Mobile Ad', '<!-- Watch Page Mobile Ad Placeholder -->', 0],
      ['footer_desktop', 'Footer Desktop Ad', '<!-- Footer Desktop Ad Placeholder -->', 0],
      ['footer_mobile', 'Footer Mobile Ad', '<!-- Footer Mobile Ad Placeholder -->', 0],
      ['video_overlay', 'Video Overlay Ad', '<!-- Video Overlay Ad Placeholder -->', 0],
      ['reels_top_overlay', 'Reels Top Overlay Ad', '<!-- Reels Top Overlay Ad Placeholder -->', 0]
    ];

    for (const [placement, name, code, is_active] of adPlacementsToSeed) {
      await db.query(
        `INSERT INTO ads (placement, name, code, is_active) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [placement, name, code, is_active]
      );
    }

    // Always clean up the legacy placements if they exist
    const legacyPlacements = [
      'between_cards',
      'watch_page',
      'header',
      'footer',
      'sidebar',
      'video_top',
      'video_bottom',
      'reel_feed'
    ];
    for (const placement of legacyPlacements) {
      await db.query("DELETE FROM ads WHERE placement = ?", [placement]);
    }
  } catch (err) {
    console.error('[Database] Failed to auto-initialize database:', err.message);
  }
}

module.exports = initializeDatabase;
