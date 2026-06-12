const db = require('../config/db');
const cache = require('../config/cache');

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
