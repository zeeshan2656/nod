const db = require('../config/db');

async function addIndex() {
  try {
    // Check if index already exists
    const [rows] = await db.query("SHOW INDEX FROM videos WHERE Key_name = 'idx_videos_title'");
    if (rows.length > 0) {
      console.log("Database index 'idx_videos_title' already exists.");
      process.exit(0);
    }

    // Add index
    console.log("Adding index 'idx_videos_title' to 'videos' table...");
    await db.query("ALTER TABLE videos ADD INDEX idx_videos_title (title)");
    console.log("Index 'idx_videos_title' added successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to add index:", err.message);
    process.exit(1);
  }
}

addIndex();
