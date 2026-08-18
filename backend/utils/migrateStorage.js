const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach(element => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

function migrateStorage() {
  const localUploadsPath = path.join(__dirname, '..', 'uploads');
  const targetStoragePath = process.env.STORAGE_PATH 
    ? path.resolve(process.env.STORAGE_PATH) 
    : path.join(__dirname, '..', 'storage');

  // Skip if target and source resolve to the same path to prevent infinite loops
  if (path.resolve(localUploadsPath) === path.resolve(targetStoragePath)) {
    return;
  }

  if (fs.existsSync(localUploadsPath)) {
    console.log(`[Storage Migration] Found existing uploads folder at: ${localUploadsPath}`);
    console.log(`[Storage Migration] Migrating contents to permanent storage at: ${targetStoragePath}`);
    try {
      copyFolderSync(localUploadsPath, targetStoragePath);
      console.log('[Storage Migration] Migration completed successfully.');
      
      // Clean up legacy directory recursively
      fs.rmSync(localUploadsPath, { recursive: true, force: true });
      console.log('[Storage Migration] Cleaned up legacy backend/uploads directory.');
    } catch (err) {
      console.error('[Storage Migration] Migration failed:', err.message);
    }
  }
}

module.exports = migrateStorage;
