const fs = require('fs');
const path = require('path');
const db = require('../config/db');

async function initializeDatabase() {
  try {
    // Check if the 'users' table exists to determine if we need initialization
    const [rows] = await db.query("SHOW TABLES LIKE 'users'");
    if (rows.length > 0) {
      console.log('[Database] Tables already initialized.');
      return;
    }

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
  } catch (err) {
    console.error('[Database] Failed to auto-initialize database:', err.message);
  }
}

module.exports = initializeDatabase;
