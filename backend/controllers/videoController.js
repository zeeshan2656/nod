const db = require('../config/db');
const cache = require('../config/cache');
const path = require('path');
const fs = require('fs');
const { getVideoMetadata, extractFrameToBuffer } = require('../utils/ffmpegHelper');
const transcodeQueue = require('../utils/transcodeQueue');

// Helpers for folder directories
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');
const TEMP_THUMB_DIR = path.join(TEMP_DIR, 'thumbnails');
const PROCESSED_DIR = path.join(UPLOAD_ROOT, 'processed', 'videos');

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(TEMP_THUMB_DIR)) fs.mkdirSync(TEMP_THUMB_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

/**
 * Helper to delete a folder recursively (for cleanups)
 */
function deleteFolderRecursive(directoryPath) {
  if (fs.existsSync(directoryPath)) {
    fs.readdirSync(directoryPath).forEach((file) => {
      const curPath = path.join(directoryPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(directoryPath);
  }
}

/**
 * Handle uploading multiple videos
 */
exports.uploadVideos = async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No video files uploaded.' });
  }

  const uploadedRecords = [];

  try {
    for (const file of req.files) {
      const tempFilePath = file.path;
      
      // 1. Extract metadata via ffprobe
      const metadata = await getVideoMetadata(tempFilePath);

      // 2. Save video record in DB with 'processing' status
      const title = path.parse(file.originalname).name;
      const [result] = await db.query(
        `INSERT INTO videos 
         (title, description, duration, width, height, aspect_ratio, file_size, file_path, thumbnail_position, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'processing')`,
        [title, '', metadata.duration, metadata.width, metadata.height, metadata.aspect_ratio, metadata.file_size, tempFilePath]
      );

      const videoId = result.insertId;
      const videoOutputDir = path.join(PROCESSED_DIR, videoId.toString());

      // 3. Add to background transcode queue
      transcodeQueue.addJob({
        id: videoId,
        type: 'video',
        inputPath: tempFilePath,
        outputPath: videoOutputDir,
        height: metadata.height
      });

      uploadedRecords.push({
        id: videoId,
        title,
        duration: metadata.duration,
        status: 'processing'
      });
    }

    // Invalidate list caches
    await cache.del('feed_videos_*');

    res.status(202).json({
      message: 'Videos uploaded successfully and queued for HLS transcoding.',
      videos: uploadedRecords
    });

  } catch (err) {
    console.error('Video upload processing failed:', err);
    // Cleanup any uploaded temp files if error occurred before queuing
    if (req.files) {
      req.files.forEach(f => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    res.status(500).json({ error: `Video upload failed: ${err.message}` });
  }
};

/**
 * List videos with cursor pagination (Optimized for MySQL indexes)
 */
exports.listVideos = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 12, 50);
  const cursorTime = req.query.cursor_time; // ISO Timestamp or mysql format
  const cursorId = parseInt(req.query.cursor_id);
  const isAdmin = req.user && req.user.role === 'admin';

  // Generate cache key based on query parameters
  const cacheKey = `feed_videos_${cursorTime || 'start'}_${cursorId || 'start'}_${limit}_${isAdmin}`;
  
  try {
    // Attempt to retrieve from cache
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    let query = 'SELECT id, title, duration, thumbnail_position, views_count, likes_count, status, created_at FROM videos WHERE 1=1';
    const params = [];

    // Normal users only see completed transcoded videos
    if (!isAdmin) {
      query += " AND status = 'ready'";
    }

    // Cursor pagination logic (avoids OFFSET performance degradation)
    if (cursorTime && cursorId) {
      query += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
      params.push(cursorTime, cursorTime, cursorId);
    }

    query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
    params.push(limit + 1); // Get 1 extra to determine if there is a next page

    const [rows] = await db.query(query, params);
    
    let nextCursor = null;
    const hasMore = rows.length > limit;
    
    if (hasMore) {
      // Remove the extra row
      const nextItem = rows.pop();
      nextCursor = {
        cursor_time: nextItem.created_at,
        cursor_id: nextItem.id
      };
    }

    const responseData = {
      videos: rows,
      nextCursor,
      hasMore
    };

    // Cache feed data for 10 seconds (keeps page load instant but updates fast)
    await cache.set(cacheKey, responseData, 10);

    res.json(responseData);
  } catch (err) {
    console.error('List videos error:', err);
    res.status(500).json({ error: 'Database error while fetching videos.' });
  }
};

/**
 * Get single video details (increments views count)
 */
exports.getVideo = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  try {
    // Increment view count directly (unbuffered update for accuracy, but fast execution)
    await db.query('UPDATE videos SET views_count = views_count + 1 WHERE id = ?', [id]);

    const [rows] = await db.query('SELECT * FROM videos WHERE id = ?', [id]);
    const video = rows[0];

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    res.json(video);
  } catch (err) {
    console.error('Get video details error:', err);
    res.status(500).json({ error: 'Database error fetching video.' });
  }
};

/**
 * Dynamic on-demand frame extraction (no disk files saved)
 */
exports.streamThumbnail = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  const cacheKey = `video_thumb_${id}`;

  try {
    // 1. Try serving from cache
    const cachedBuffer = await cache.get(cacheKey);
    if (cachedBuffer) {
      res.setHeader('Content-Type', 'image/jpeg');
      // Set CDN and browser caching (1 year)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(Buffer.from(cachedBuffer, 'base64'));
    }

    // 2. Fetch video details
    const [rows] = await db.query('SELECT file_path, duration, thumbnail_position, status FROM videos WHERE id = ?', [id]);
    const video = rows[0];

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Determine target file path
    let sourcePath = video.file_path;
    // If relative path, make it absolute
    if (!path.isAbsolute(sourcePath)) {
      sourcePath = path.join(__dirname, '..', sourcePath);
    }

    // Verify file exists
    if (!fs.existsSync(sourcePath) && video.status !== 'ready') {
      return res.status(404).json({ error: 'Video source file is not available yet.' });
    }

    // Calculate timestamp for the selected thumbnail position
    // Range: 1 to 10
    const pos = Math.min(Math.max(video.thumbnail_position || 1, 1), 10);
    const timestamp = (video.duration / 11) * pos;

    // 3. Extract the frame using FFmpeg stream
    const imgBuffer = await extractFrameToBuffer(sourcePath, timestamp);

    // 4. Cache binary buffer (as base64 string)
    await cache.set(cacheKey, imgBuffer.toString('base64'), 86400 * 30); // 30 days cache

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(imgBuffer);

  } catch (err) {
    console.error('Frame extraction streaming failed:', err);
    res.status(500).json({ error: 'Could not extract video thumbnail.' });
  }
};

/**
 * Generate 10 temporary thumbnails for selection in upload/edit pages
 */
exports.getTemporaryThumbnails = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  try {
    const [rows] = await db.query('SELECT file_path, duration FROM videos WHERE id = ?', [id]);
    const video = rows[0];

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    let sourcePath = video.file_path;
    if (!path.isAbsolute(sourcePath)) {
      sourcePath = path.join(__dirname, '..', sourcePath);
    }

    // Create unique temp folder for this video's thumbnails
    const videoTempDir = path.join(TEMP_THUMB_DIR, id.toString());
    if (!fs.existsSync(videoTempDir)) {
      fs.mkdirSync(videoTempDir, { recursive: true });
    }

    const thumbUrls = [];

    // Extract 10 frames sequentially
    for (let i = 1; i <= 10; i++) {
      const timestamp = (video.duration / 11) * i;
      const outFileName = `${i}.jpg`;
      const outFilePath = path.join(videoTempDir, outFileName);

      const ffmpegArgs = [
        '-ss', timestamp.toFixed(3),
        '-i', sourcePath,
        '-vframes', '1',
        '-vf', 'scale=320:-1', // Lower resolution for quick admin previews
        '-f', 'image2',
        '-y', outFilePath
      ];

      // Spawn FFmpeg to extract frame on disk (briefly)
      const { spawnSync } = require('child_process');
      spawnSync('ffmpeg', ffmpegArgs);

      // Verify file was written
      if (fs.existsSync(outFilePath)) {
        thumbUrls.push({
          position: i,
          url: `/uploads/temp/thumbnails/${id}/${outFileName}`
        });
      }
    }

    res.json({
      videoId: id,
      thumbnails: thumbUrls
    });

  } catch (err) {
    console.error('Temporary thumbnail generation failed:', err);
    res.status(500).json({ error: 'Failed to generate temporary preview thumbnails.' });
  }
};

/**
 * Edit video metadata and selected thumbnail position
 */
exports.updateVideo = async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, description, thumbnail_position } = req.body;

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  try {
    const [rows] = await db.query('SELECT thumbnail_position FROM videos WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const currentPos = rows[0].thumbnail_position;
    
    // Update DB
    await db.query(
      `UPDATE videos SET title = ?, description = ?, thumbnail_position = ? WHERE id = ?`,
      [title, description, parseInt(thumbnail_position) || 1, id]
    );

    // If thumbnail position changed, delete cached thumbnail buffer
    if (parseInt(thumbnail_position) !== currentPos) {
      await cache.del(`video_thumb_${id}`);
    }

    // Clean up temporary files on disk
    const videoTempDir = path.join(TEMP_THUMB_DIR, id.toString());
    if (fs.existsSync(videoTempDir)) {
      deleteFolderRecursive(videoTempDir);
      console.log(`[Admin] Cleaned up temporary thumbnails folder for video ${id}`);
    }

    // Invalidate list cache
    await cache.del('feed_videos_*');
    await cache.del(`video_${id}`);

    res.json({ message: 'Video metadata updated and temporary assets cleaned up.' });
  } catch (err) {
    console.error('Update video error:', err);
    res.status(500).json({ error: 'Database error during video update.' });
  }
};

/**
 * Delete video (removes database record and all HLS files on disk)
 */
exports.deleteVideo = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  try {
    const [rows] = await db.query('SELECT file_path, status FROM videos WHERE id = ?', [id]);
    const video = rows[0];

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // 1. Delete database record (foreign keys cascade comments/likes)
    await db.query('DELETE FROM videos WHERE id = ?', [id]);

    // 2. Remove files on disk
    // If still processing, clean up original upload path
    if (video.status === 'processing') {
      const origPath = path.isAbsolute(video.file_path) ? video.file_path : path.join(__dirname, '..', video.file_path);
      if (fs.existsSync(origPath)) fs.unlinkSync(origPath);
    }
    
    // Clean up transcoded HLS directory
    const hlsDir = path.join(PROCESSED_DIR, id.toString());
    if (fs.existsSync(hlsDir)) {
      deleteFolderRecursive(hlsDir);
    }

    // Clean up temporary preview thumbnails
    const videoTempDir = path.join(TEMP_THUMB_DIR, id.toString());
    if (fs.existsSync(videoTempDir)) {
      deleteFolderRecursive(videoTempDir);
    }

    // 3. Clear cache keys
    await cache.del(`video_thumb_${id}`);
    await cache.del(`video_${id}`);
    await cache.del('feed_videos_*');

    res.json({ message: 'Video and all related files deleted successfully.' });
  } catch (err) {
    console.error('Delete video error:', err);
    res.status(500).json({ error: 'Database error during video deletion.' });
  }
};

/**
 * Like / unlike a video
 */
exports.likeVideo = async (req, res) => {
  const videoId = parseInt(req.params.id);
  const userId = req.user.id;

  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' });

  try {
    // Check if already liked
    const [likes] = await db.query(
      'SELECT id FROM likes WHERE user_id = ? AND item_type = "video" AND item_id = ?',
      [userId, videoId]
    );

    let liked = false;

    if (likes.length > 0) {
      // Unlike
      await db.query('DELETE FROM likes WHERE id = ?', [likes[0].id]);
      await db.query('UPDATE videos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [videoId]);
    } else {
      // Like
      await db.query(
        'INSERT INTO likes (user_id, item_type, item_id) VALUES (?, "video", ?)',
        [userId, videoId]
      );
      await db.query('UPDATE videos SET likes_count = likes_count + 1 WHERE id = ?', [videoId]);
      liked = true;
    }

    // Invalidate caches
    await cache.del(`video_${videoId}`);
    await cache.del('feed_videos_*');

    res.json({ liked });
  } catch (err) {
    console.error('Like video error:', err);
    res.status(500).json({ error: 'Database error occurred.' });
  }
};
