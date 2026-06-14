const db = require('../config/db');
const cache = require('../config/cache');
const path = require('path');
const fs = require('fs');
const { getVideoMetadata, extractFrameToBuffer } = require('../utils/ffmpegHelper');
const transcodeQueue = require('../utils/transcodeQueue');

const UPLOAD_ROOT = process.env.STORAGE_PATH 
  ? path.resolve(process.env.STORAGE_PATH) 
  : path.join(__dirname, '..', '..', '..', 'storage');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');
const PROCESSED_REELS_DIR = path.join(UPLOAD_ROOT, 'processed', 'reels');

// Helper to resolve absolute or relative database file paths to absolute disk paths
function resolveDiskPath(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('/uploads/') || filePath.startsWith('uploads/')) {
    let relPath = filePath.replace(/^\/?uploads\//, '');
    return path.resolve(UPLOAD_ROOT, relPath);
  }
  return filePath;
}

if (!fs.existsSync(PROCESSED_REELS_DIR)) fs.mkdirSync(PROCESSED_REELS_DIR, { recursive: true });

/**
 * Handle uploading multiple reels
 */
exports.uploadReels = async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No reel files uploaded.' });
  }

  const uploadedRecords = [];

  try {
    for (const file of req.files) {
      const tempFilePath = file.path;

      // 1. Validate / Extract metadata
      const metadata = await getVideoMetadata(tempFilePath);

      // 2. Insert into DB with 'processing' status
      const title = path.parse(file.originalname).name;
      const [result] = await db.query(
        `INSERT INTO reels 
         (title, description, duration, width, height, file_path, status) 
         VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
        [title, '', metadata.duration, metadata.width, metadata.height, tempFilePath]
      );

      const reelId = result.insertId;
      const outputDir = path.join(PROCESSED_REELS_DIR, reelId.toString());

      // 3. Queue HLS transcoding
      transcodeQueue.addJob({
        id: reelId,
        type: 'reel',
        inputPath: tempFilePath,
        outputPath: outputDir,
        height: metadata.height
      });

      uploadedRecords.push({
        id: reelId,
        title,
        duration: metadata.duration,
        status: 'processing'
      });
    }

    // Invalidate reels list caches
    await cache.del('feed_reels_*');

    res.status(202).json({
      message: 'Reels uploaded and queued for transcoding.',
      reels: uploadedRecords
    });
  } catch (err) {
    console.error('Reels upload failed:', err);
    if (req.files) {
      req.files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    res.status(500).json({ error: `Reels upload failed: ${err.message}` });
  }
};

/**
 * Fetch reels feed (Cursor pagination for TikTok-like vertical scroll)
 */
exports.listReels = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 5, 20); // Smaller limit for mobile-first heavy reels
  const cursorTime = req.query.cursor_time;
  const cursorId = parseInt(req.query.cursor_id);
  const isAdmin = req.user && req.user.role === 'admin';

  const cacheKey = `feed_reels_${cursorTime || 'start'}_${cursorId || 'start'}_${limit}_${isAdmin}`;

  try {
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    let query = 'SELECT id, title, description, duration, width, height, file_path, views_count, likes_count, status, created_at FROM reels WHERE 1=1';
    const params = [];

    if (!isAdmin) {
      query += " AND status = 'ready'";
    }

    if (cursorTime && cursorId) {
      query += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      params.push(cursorTime, cursorTime, cursorId);
    }

    query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(limit + 1);

    const [rows] = await db.query(query, params);

    let nextCursor = null;
    const hasMore = rows.length > limit;

    if (hasMore) {
      const nextItem = rows.pop();
      nextCursor = {
        cursor_time: nextItem.created_at,
        cursor_id: nextItem.id
      };
    }

    const responseData = {
      reels: rows,
      nextCursor,
      hasMore
    };

    // Cache feed data for 10 seconds
    await cache.set(cacheKey, responseData, 10);

    res.json(responseData);
  } catch (err) {
    console.error('List reels error:', err);
    res.status(500).json({ error: 'Database error fetching reels.' });
  }
};

/**
 * Increment view count for a reel (with IP cooldown duplicate protection)
 */
exports.incrementReelView = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid reel ID.' });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const cooldownSec = parseInt(process.env.VIEW_COOLDOWN_SEC) || 1800; // default 30 mins
  const cacheKey = `cooldown_view_${ip}_reel_${id}`;

  try {
    const isCooldown = await cache.get(cacheKey);
    if (isCooldown) {
      return res.json({ status: 'cooldown_active', views_count: null });
    }

    // Set IP view cooldown in cache
    await cache.set(cacheKey, '1', cooldownSec);

    // Update DB
    await db.query('UPDATE reels SET views_count = views_count + 1 WHERE id = ?', [id]);
    await cache.del(`reel_${id}`);
    await cache.del('feed_reels_*');

    // Retrieve fresh views count
    const [rows] = await db.query('SELECT views_count FROM reels WHERE id = ?', [id]);
    const newViews = rows[0] ? rows[0].views_count : 0;

    res.json({ status: 'counted', views_count: newViews });
  } catch (err) {
    console.error('Reel view increment error:', err);
    res.status(500).json({ error: 'Database error incrementing views.' });
  }
};

/**
 * Delete a reel and its HLS assets
 */
exports.deleteReel = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid reel ID.' });

  try {
    const [rows] = await db.query('SELECT file_path, status FROM reels WHERE id = ?', [id]);
    const reel = rows[0];

    if (!reel) {
      return res.status(404).json({ error: 'Reel not found.' });
    }

    // Delete DB record
    await db.query('DELETE FROM reels WHERE id = ?', [id]);

    // Clean files
    if (reel.status === 'processing') {
      const origPath = resolveDiskPath(reel.file_path);
      if (fs.existsSync(origPath)) fs.unlinkSync(origPath);
    }

    const hlsDir = path.join(PROCESSED_REELS_DIR, id.toString());
    if (fs.existsSync(hlsDir)) {
      // Recursive delete helper (using fs.rmSync or custom if older Node.js, node v24 has rmSync)
      fs.rmSync(hlsDir, { recursive: true, force: true });
    }

    // Invalidate Cache
    await cache.del(`reel_${id}`);
    await cache.del('feed_reels_*');

    res.json({ message: 'Reel and HLS assets deleted successfully.' });
  } catch (err) {
    console.error('Delete reel error:', err);
    res.status(500).json({ error: 'Database error during reel deletion.' });
  }
};

/**
 * Toggle user like on a reel
 */
exports.likeReel = async (req, res) => {
  const reelId = parseInt(req.params.id);
  const userId = req.user ? req.user.id : null;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (isNaN(reelId)) return res.status(400).json({ error: 'Invalid reel ID.' });

  try {
    let query = '';
    let params = [];

    if (userId) {
      query = 'SELECT id FROM likes WHERE user_id = ? AND item_type = "reel" AND item_id = ?';
      params = [userId, reelId];
    } else {
      query = 'SELECT id FROM likes WHERE user_id IS NULL AND ip_address = ? AND item_type = "reel" AND item_id = ?';
      params = [ipAddress, reelId];
    }

    const [likes] = await db.query(query, params);
    let liked = false;

    if (likes.length > 0) {
      await db.query('DELETE FROM likes WHERE id = ?', [likes[0].id]);
      await db.query('UPDATE reels SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [reelId]);
    } else {
      await db.query(
        'INSERT INTO likes (user_id, ip_address, item_type, item_id) VALUES (?, ?, "reel", ?)',
        [userId, ipAddress, reelId]
      );
      await db.query('UPDATE reels SET likes_count = likes_count + 1 WHERE id = ?', [reelId]);
      liked = true;
    }

    await cache.del(`reel_${reelId}`);
    await cache.del('feed_reels_*');

    res.json({ liked });
  } catch (err) {
    console.error('Like reel error:', err);
    res.status(500).json({ error: 'Database error occurred.' });
  }
};

/**
 * Update a reel's details (Admin-only)
 */
exports.updateReel = async (req, res) => {
  const id = parseInt(req.params.id);
  const { title } = req.body;

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid reel ID.' });
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });

  try {
    await db.query('UPDATE reels SET title = ? WHERE id = ?', [title, id]);
    await cache.del(`reel_${id}`);
    await cache.del('feed_reels_*');

    res.json({ message: 'Reel updated successfully.' });
  } catch (err) {
    console.error('Update reel error:', err);
    res.status(500).json({ error: 'Database error updating reel.' });
  }
};

/**
 * Stream dynamically extracted thumbnail for a reel (Admin/Public)
 */
exports.streamThumbnail = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid reel ID.' });

  const cacheKey = `reel_thumb_${id}`;

  try {
    // 1. Serves from cache
    const cachedBuffer = await cache.get(cacheKey);
    if (cachedBuffer) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(Buffer.from(cachedBuffer, 'base64'));
    }

    // 2. Fetch reel details
    const [rows] = await db.query('SELECT file_path, duration, status FROM reels WHERE id = ?', [id]);
    const reel = rows[0];

    if (!reel) {
      return res.status(404).json({ error: 'Reel not found.' });
    }

    const sourcePath = resolveDiskPath(reel.file_path);

    if (!fs.existsSync(sourcePath) && reel.status !== 'ready') {
      return res.status(404).json({ error: 'Reel source file is not available yet.' });
    }

    // Capture frame at 10% of duration (or 1 second if short)
    const timestamp = Math.min(1.0, reel.duration * 0.1);

    const imgBuffer = await extractFrameToBuffer(sourcePath, timestamp);

    // Cache the buffer
    await cache.set(cacheKey, imgBuffer.toString('base64'), 86400 * 30); // 30 days cache

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(imgBuffer);
  } catch (err) {
    console.error('Reel frame extraction failed:', err);
    res.status(500).json({ error: 'Could not extract reel thumbnail.' });
  }
};
