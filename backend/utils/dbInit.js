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

    // Always guarantee that landing page row ad slots are seeded
    const landingAds = [
      ['landing_row_1', 'Landing Page Row 1 Ad', '<!-- Landing Page Row 1 Ad Placeholder -->', 0],
      ['landing_row_2', 'Landing Page Row 2 Ad', '<!-- Landing Page Row 2 Ad Placeholder -->', 0],
      ['landing_row_3', 'Landing Page Row 3 Ad', '<!-- Landing Page Row 3 Ad Placeholder -->', 0],
      ['landing_row_4', 'Landing Page Row 4 Ad', '<!-- Landing Page Row 4 Ad Placeholder -->', 0],
      ['landing_row_5', 'Landing Page Row 5 Ad', '<!-- Landing Page Row 5 Ad Placeholder -->', 0]
    ];

    for (const [placement, name, code, is_active] of landingAds) {
      await db.query(
        `INSERT INTO ads (placement, name, code, is_active) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [placement, name, code, is_active]
      );
    }

    // Always clean up the legacy between_cards placement if it exists
    await db.query("DELETE FROM ads WHERE placement = 'between_cards'");
  } catch (err) {
    console.error('[Database] Failed to auto-initialize database:', err.message);
  }
}

module.exports = initializeDatabase;
