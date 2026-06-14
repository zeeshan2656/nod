const db = require('../config/db');
const cache = require('../config/cache');
const path = require('path');
const fs = require('fs');

/**
 * Fetch all settings (Admin view)
 */
exports.getSettings = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM settings');
    const settingsObj = {};
    rows.forEach(row => {
      settingsObj[row.key] = row.value;
    });
    res.json(settingsObj);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Database error fetching settings.' });
  }
};

/**
 * Update global settings
 */
exports.updateSettings = async (req, res) => {
  const settings = req.body; // Key-value map, e.g. { site_name: 'Fast Video', analytics_code: '...' }

  try {
    const queries = Object.entries(settings).map(([key, value]) => {
      return db.query(
        'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, value]
      );
    });

    await Promise.all(queries);

    // Invalidate settings caches
    await cache.del('global_settings');

    res.json({ message: 'Settings updated successfully.' });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Database error updating settings.' });
  }
};

/**
 * Get public site settings (site_name, analytics_code)
 */
exports.getPublicSettings = async (req, res) => {
  const cacheKey = 'global_settings';

  try {
    const cachedSettings = await cache.get(cacheKey);
    if (cachedSettings) {
      return res.json(cachedSettings);
    }

    const [rows] = await db.query('SELECT `key`, `value` FROM settings WHERE `key` IN ("site_name", "analytics_code")');
    const publicSettings = {};
    
    rows.forEach(row => {
      publicSettings[row.key] = row.value;
    });

    await cache.set(cacheKey, publicSettings, 300); // Cache public settings for 5 minutes

    res.json(publicSettings);
  } catch (err) {
    console.error('Get public settings error:', err);
    res.status(500).json({ error: 'Database error fetching public settings.' });
  }
};

/**
 * Fetch basic statistics dashboard for Admin
 */
exports.getStats = async (req, res) => {
  const cacheKey = 'admin_stats';

  try {
    const cachedStats = await cache.get(cacheKey);
    if (cachedStats) {
      return res.json(cachedStats);
    }

    const [[videosCountRow]] = await db.query('SELECT COUNT(*) AS total FROM videos');
    const [[reelsCountRow]] = await db.query('SELECT COUNT(*) AS total FROM reels');
    const [[commentsCountRow]] = await db.query('SELECT COUNT(*) AS total FROM comments');
    
    const [[totalViewsRow]] = await db.query(`
      SELECT COALESCE(SUM(views), 0) AS total FROM (
        SELECT SUM(views_count) AS views FROM videos
        UNION ALL
        SELECT SUM(views_count) AS views FROM reels
      ) AS t
    `);

    const stats = {
      videos: videosCountRow.total,
      reels: reelsCountRow.total,
      comments: commentsCountRow.total,
      totalViews: parseInt(totalViewsRow.total || 0, 10)
    };

    await cache.set(cacheKey, stats, 15); // Cache admin statistics for 15 seconds

    res.json(stats);
  } catch (err) {
    console.error('Get stats error:', err);
    res.status(500).json({ error: 'Database error fetching statistics.' });
  }
};

/**
 * Perform database and physical file system consistency diagnostics
 */
exports.getDiagnostics = async (req, res) => {
  try {
    const reportObj = {
      timestamp: new Date(),
      database: 'connected',
      environment: {
        platform: process.platform,
        nodeVersion: process.version,
        ffmpegPath: require('../utils/ffmpegHelper').ffmpegPath,
        ffprobePath: require('../utils/ffmpegHelper').ffprobePath,
        envFile: {
          NODE_ENV: process.env.NODE_ENV,
          DB_HOST: process.env.DB_HOST,
          PORT: process.env.PORT,
          CLIENT_URL: process.env.CLIENT_URL,
          API_BASE_URL: process.env.API_BASE_URL
        }
      },
      inconsistencies: {
        videos: [],
        reels: []
      },
      fileStats: {
        totalTempFiles: 0,
        tempFilesSize: 0,
        tempFolderExists: false,
        processedFolderExists: false
      }
    };

    // 1. Check database connection
    await db.query('SELECT 1');

    const UPLOAD_ROOT = process.env.STORAGE_PATH 
      ? path.resolve(process.env.STORAGE_PATH) 
      : path.join(__dirname, '..', '..', 'storage');

    // Helper to resolve paths like in videoController
    const resolveDiskPath = (filePath) => {
      if (!filePath) return '';
      if (filePath.startsWith('/uploads/') || filePath.startsWith('uploads/')) {
        let relPath = filePath.replace(/^\/?uploads\//, '');
        return path.resolve(UPLOAD_ROOT, relPath);
      }
      return filePath;
    };

    // 2. Scan videos table
    const [videos] = await db.query('SELECT id, title, file_path, status FROM videos');
    for (const video of videos) {
      const diskPath = resolveDiskPath(video.file_path);
      const exists = diskPath ? fs.existsSync(diskPath) : false;
      
      if (video.status === 'ready' && !exists) {
        reportObj.inconsistencies.videos.push({
          id: video.id,
          title: video.title,
          status: video.status,
          file_path: video.file_path,
          resolved_disk_path: diskPath,
          issue: 'Database status is ready, but transcoded master.m3u8 is missing on disk.'
        });
      } else if (video.status === 'processing' && !exists) {
        reportObj.inconsistencies.videos.push({
          id: video.id,
          title: video.title,
          status: video.status,
          file_path: video.file_path,
          resolved_disk_path: diskPath,
          issue: 'Video is in processing queue, but temporary upload file is missing on disk.'
        });
      }
    }

    // 3. Scan reels table
    const [reels] = await db.query('SELECT id, title, file_path, status FROM reels');
    for (const reel of reels) {
      const diskPath = resolveDiskPath(reel.file_path);
      const exists = diskPath ? fs.existsSync(diskPath) : false;
      
      if (reel.status === 'ready' && !exists) {
        reportObj.inconsistencies.reels.push({
          id: reel.id,
          title: reel.title,
          status: reel.status,
          file_path: reel.file_path,
          resolved_disk_path: diskPath,
          issue: 'Database status is ready, but transcoded master.m3u8 is missing on disk.'
        });
      } else if (reel.status === 'processing' && !exists) {
        reportObj.inconsistencies.reels.push({
          id: reel.id,
          title: reel.title,
          status: reel.status,
          file_path: reel.file_path,
          resolved_disk_path: diskPath,
          issue: 'Reel is in processing queue, but temporary upload file is missing on disk.'
        });
      }
    }

    // 4. File uploads temp folder diagnostics
    const tempDir = path.join(UPLOAD_ROOT, 'temp');
    if (fs.existsSync(tempDir)) {
      reportObj.fileStats.tempFolderExists = true;
      const files = fs.readdirSync(tempDir);
      reportObj.fileStats.totalTempFiles = files.length;
      for (const file of files) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            reportObj.fileStats.tempFilesSize += stats.size;
          }
        } catch (_) {}
      }
    }

    const processedDir = path.join(UPLOAD_ROOT, 'processed');
    if (fs.existsSync(processedDir)) {
      reportObj.fileStats.processedFolderExists = true;
    }

    res.json(reportObj);
  } catch (err) {
    console.error('Diagnostics execution error:', err);
    res.status(500).json({ error: 'Diagnostics failed to run.', details: err.message });
  }
};
