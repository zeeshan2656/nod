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

async function verifyConnection() {
  console.log('=== Database Connection Verification ===');
  console.log(`Loading .env from: ${path.resolve(envPath)}`);
  
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASS ? '[SET]' : '[EMPTY]',
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306
  };

  console.log(`Connecting to database with config:`);
  console.log(`- Host: ${config.host}`);
  console.log(`- User: ${config.user || 'not set'}`);
  console.log(`- Password: ${config.password}`);
  console.log(`- Database: ${config.database || 'not set'}`);
  console.log(`- Port: ${config.port}`);

  if (!config.user || !config.database) {
    console.error('ERROR: DB_USER or DB_NAME is not set in environment variables!');
    process.exit(1);
  }

  try {
    const connection = await mysql.createConnection({
      host: config.host,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: config.database,
      port: config.port
    });

    console.log('\n✓ Database connection established successfully!');
    
    // Test query
    const [rows] = await connection.query('SELECT 1 + 1 AS solution');
    console.log(`✓ Query test successful (solution: ${rows[0].solution})`);
    
    // Inspect database tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✓ Database contains ${tables.length} tables:`);
    tables.forEach((row) => {
      console.log(`  - ${Object.values(row)[0]}`);
    });

    await connection.end();
    console.log('\nVerification complete: DATABASE IS READY FOR PRODUCTION.');
  } catch (err) {
    console.error('\n✗ Connection failed!');
    console.error(`Error Code: ${err.code || 'N/A'}`);
    console.error(`Error Message: ${err.message}`);
    process.exit(1);
  }
}

verifyConnection();
