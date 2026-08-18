const db = require('../config/db');
const cache = require('../config/cache');
const path = require('path');
const fs = require('fs');
const { getVideoMetadata, extractFrameToBuffer, ffmpegPath, ffprobePath } = require('../utils/ffmpegHelper');
const transcodeQueue = require('../utils/transcodeQueue');

const UPLOAD_ROOT = process.env.STORAGE_PATH 
  ? path.resolve(process.env.STORAGE_PATH) 
  : path.join(__dirname, '..', '..', '..', 'storage');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');
const TEMP_THUMB_DIR = path.join(TEMP_DIR, 'thumbnails');
const PROCESSED_DIR = path.join(UPLOAD_ROOT, 'processed', 'videos');
const MEDIA_DIR = path.join(UPLOAD_ROOT, 'media');

// Helper to resolve absolute or relative database file paths to absolute disk paths
function resolveDiskPath(filePath) {
  if (!filePath) return '';
  if (filePath.startsWith('/uploads/') || filePath.startsWith('uploads/')) {
    let relPath = filePath.replace(/^\/?uploads\//, '');
    return path.resolve(UPLOAD_ROOT, relPath);
  }
  return filePath;
}

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(TEMP_THUMB_DIR)) fs.mkdirSync(TEMP_THUMB_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

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

  try {
    // Process all video metadata extraction and database insertions concurrently to speed up uploads
    const uploadedRecords = await Promise.all(req.files.map(async (file) => {
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

      return {
        id: videoId,
        title,
        duration: metadata.duration,
        status: 'processing'
      };
    }));

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
        if (fs.existsSync(f.path)) {
          try {
            fs.unlinkSync(f.path);
          } catch (_) {}
        }
      });
    }
    res.status(500).json({ error: `Video upload failed: ${err.message}` });
  }
};

/**
 * List videos with cursor pagination (Optimized for MySQL indexes)
 */
/**
 * List videos with pagination and search filtering (Optimized for MySQL indexes)
 */
exports.listVideos = async (req, res) => {
  const page = parseInt(req.query.page);
  const limit = Math.min(parseInt(req.query.limit) || (isNaN(page) ? 12 : 20), 50);
  const search = req.query.search || req.query.q || '';
  const cursorTime = req.query.cursor_time; // ISO Timestamp or mysql format
  const cursorId = parseInt(req.query.cursor_id);
  const isAdmin = req.user && req.user.role === 'admin';

  // Generate cache key based on query parameters
  const cacheKey = `feed_videos_${cursorTime || 'start'}_${cursorId || 'start'}_${page || 'start'}_${search || 'none'}_${limit}_${isAdmin}`;
  
  try {
    // Attempt to retrieve from cache
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    let query = 'SELECT id, title, duration, thumbnail_position, views_count, likes_count, status, source_type, source_id, thumbnail_url, created_at FROM videos WHERE 1=1';
    const params = [];

    // Normal users only see completed transcoded videos
    if (!isAdmin) {
      query += " AND status = 'ready'";
    }

    // Search filter
    if (search.trim() !== '') {
      query += ' AND title LIKE ?';
      params.push(`%${search.trim()}%`);
    }

    let totalCount = 0;
    if (!isNaN(page)) {
      // Get total count of matched videos for page calculation
      let countQuery = 'SELECT COUNT(*) as total FROM videos WHERE 1=1';
      const countParams = [];
      if (!isAdmin) {
        countQuery += " AND status = 'ready'";
      }
      if (search.trim() !== '') {
        countQuery += ' AND title LIKE ?';
        countParams.push(`%${search.trim()}%`);
      }
      const [countRows] = await db.query(countQuery, countParams);
      totalCount = countRows[0].total;
    }

    // Pagination selection
    if (!isNaN(page)) {
      // Offset pagination (1-indexed pages)
      const targetPage = Math.max(page, 1);
      const offset = (targetPage - 1) * limit;
      query += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);
    } else {
      // Cursor pagination
      if (cursorTime && cursorId) {
        query += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
        params.push(cursorTime, cursorTime, cursorId);
      }
      query += ' ORDER BY created_at DESC, id DESC LIMIT ?';
      params.push(limit + 1); // Get 1 extra to determine if there is a next page
    }

    const [rows] = await db.query(query, params);
    
    let nextCursor = null;
    let hasMore = false;
    
    if (isNaN(page)) {
      hasMore = rows.length > limit;
      if (hasMore) {
        // Remove the extra row
        const nextItem = rows.pop();
        nextCursor = {
          cursor_time: nextItem.created_at,
          cursor_id: nextItem.id
        };
      }
    } else {
      const targetPage = Math.max(page, 1);
      hasMore = (targetPage * limit) < totalCount;
    }

    const responseData = {
      videos: rows,
      nextCursor,
      hasMore,
      totalCount: !isNaN(page) ? totalCount : rows.length
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
 * Get single video details
 */
exports.getVideo = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  const cacheKey = `video_${id}`;

  try {
    const cached = await cache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const [rows] = await db.query(
      `SELECT v.*, (SELECT COUNT(*) FROM comments WHERE video_id = v.id) as comments_count 
       FROM videos v 
       WHERE v.id = ?`,
      [id]
    );
    const video = rows[0];

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // Cache for 15 seconds for blazing fast instant player loads
    await cache.set(cacheKey, video, 15);

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
    const [rows] = await db.query('SELECT file_path, duration, thumbnail_position, status, source_type, source_id, thumbnail_url FROM videos WHERE id = ?', [id]);
    const video = rows[0];

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    // If a thumbnail_url reference exists in DB, redirect to it
    if (video.thumbnail_url) {
      return res.redirect(video.thumbnail_url);
    }

    // Handle embedded YouTube thumbnails by redirecting directly (HD maxresdefault fallback to hqdefault)
    if (video.source_type === 'youtube') {
      const ytCacheKey = `yt_thumb_quality_${video.source_id}`;
      let thumbUrl = await cache.get(ytCacheKey);
      if (!thumbUrl) {
        try {
          const maxresUrl = `https://img.youtube.com/vi/${video.source_id}/maxresdefault.jpg`;
          const headRes = await globalThis.fetch(maxresUrl, { method: 'HEAD' });
          if (headRes.status === 200) {
            thumbUrl = maxresUrl;
          } else {
            thumbUrl = `https://img.youtube.com/vi/${video.source_id}/hqdefault.jpg`;
          }
        } catch (err) {
          thumbUrl = `https://img.youtube.com/vi/${video.source_id}/hqdefault.jpg`;
        }
        await cache.set(ytCacheKey, thumbUrl, 86400 * 30); // 30 days cache
      }
      return res.redirect(thumbUrl);
    }

    // Handle embedded Google Drive thumbnails with a dynamic play vector card
    if (video.source_type === 'gdrive') {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(`
        <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" fill="none">
          <rect width="640" height="360" fill="#1e1e1e"/>
          <circle cx="320" cy="180" r="40" fill="#ffffff" fill-opacity="0.2"/>
          <polygon points="310,160 340,180 310,200" fill="#ffffff"/>
          <text x="320" y="250" fill="#aaaaaa" font-family="Arial" font-size="16" text-anchor="middle">Google Drive Video</text>
        </svg>
      `);
    }

    // Determine target file path
    const sourcePath = resolveDiskPath(video.file_path);

    // Verify file exists
    if (!fs.existsSync(sourcePath) && video.status !== 'ready') {
      return res.status(404).json({ error: 'Video source file is not available yet.' });
    }

    // Calculate timestamp for the selected thumbnail position
    // Range: 1 to 30
    const pos = Math.min(Math.max(video.thumbnail_position || 1, 1), 30);
    const timestamp = (video.duration / 31) * pos;

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
 * Generate 10 temporary thumbnails for selection in upload/edit pages (with detailed diagnostics)
 */
exports.getTemporaryThumbnails = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid path', detail: 'The provided video ID is not a number.' });
  }

  try {
    const [rows] = await db.query('SELECT file_path, duration FROM videos WHERE id = ?', [id]);
    const video = rows[0];

    if (!video) {
      console.error(`[Edit Diagnostics] Video ID ${id} not found in database.`);
      return res.status(404).json({ error: 'Invalid path', detail: `Video record with ID ${id} not found in database.` });
    }

    // 1. Verify path exists in DB
    if (!video.file_path) {
      console.error(`[Edit Diagnostics] Video ID ${id} has empty file_path in DB.`);
      return res.status(400).json({ error: 'Invalid path', detail: 'The video path is empty in the database.' });
    }

    // Resolve path to disk
    const sourcePath = resolveDiskPath(video.file_path);
    const fileDir = path.dirname(sourcePath);
    let targetFile = sourcePath;

    // If target is master.m3u8, resolve directly to video.mp4 or playlist.m3u8 in same folder
    if (sourcePath.endsWith('master.m3u8')) {
      const mp4Candidate = path.join(fileDir, 'video.mp4');
      const playlistCandidate = path.join(fileDir, 'playlist.m3u8');
      if (fs.existsSync(mp4Candidate)) {
        targetFile = mp4Candidate;
      } else if (fs.existsSync(playlistCandidate)) {
        targetFile = playlistCandidate;
      }
    }

    // 2. Verify file is physically present on disk
    if (!fs.existsSync(targetFile)) {
      console.error(`[Edit Diagnostics] File physically missing at path: ${targetFile}`);
      return res.status(404).json({ error: 'Video file missing', detail: `Video file is physically missing at path: ${targetFile}` });
    }

    // 3. Verify read permissions
    try {
      fs.accessSync(targetFile, fs.constants.R_OK);
    } catch (permErr) {
      console.error(`[Edit Diagnostics] Read permission denied for path: ${targetFile}`);
      return res.status(403).json({ error: 'Permission denied', detail: `No read permissions on file: ${targetFile}. system error: ${permErr.message}` });
    }

    // 4 & 5. Verify FFmpeg access and video metadata extraction (corrupted file check)
    const { execSync, spawnSync } = require('child_process');
    try {
      const probeCmd = `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=codec_name -of json "${targetFile}"`;
      const probeOut = execSync(probeCmd, { cwd: fileDir }).toString();
      const probeData = JSON.parse(probeOut);
      if (!probeData.streams || probeData.streams.length === 0) {
        throw new Error('No valid video stream detected in media file container.');
      }
    } catch (probeErr) {
      console.error(`[Edit Diagnostics] Probe failed for ${targetFile}. Error: ${probeErr.message}`);
      const isExecMissing = probeErr.message.includes('not recognized') || probeErr.message.includes('cannot find') || probeErr.message.includes('ENOENT');
      if (isExecMissing) {
        return res.status(500).json({ error: 'FFmpeg error', detail: 'The ffprobe/ffmpeg binaries could not be executed in the environment.' });
      } else {
        return res.status(400).json({ error: 'Corrupted video', detail: `The video file is corrupted or unreadable: ${probeErr.message}` });
      }
    }

    // Create unique temp folder for this video's thumbnails
    const videoTempDir = path.join(TEMP_THUMB_DIR, id.toString());
    if (!fs.existsSync(videoTempDir)) {
      fs.mkdirSync(videoTempDir, { recursive: true });
    }

    const thumbUrls = [];

    // Extract 30 frames sequentially
    for (let i = 1; i <= 30; i++) {
      const timestamp = (video.duration / 31) * i;
      const outFileName = `${i}.jpg`;
      const outFilePath = path.join(videoTempDir, outFileName);

      const ffmpegArgs = [
        '-ss', timestamp.toFixed(3),
        '-i', targetFile,
        '-threads', '2',
        '-vframes', '1',
        '-vf', 'scale=1280:-1',
        '-q:v', '2',
        '-f', 'image2',
        '-y', outFilePath
      ];

      // Spawn FFmpeg with cwd set to fileDir for proper HLS playlist resolution
      const ffProcess = spawnSync(ffmpegPath, ffmpegArgs, { cwd: fileDir });
      
      if (ffProcess.status !== 0) {
        console.warn(`[Edit Diagnostics] FFmpeg extraction warning for frame ${i}:`, ffProcess.stderr ? ffProcess.stderr.toString() : '');
      }

      // Verify file was written
      if (fs.existsSync(outFilePath)) {
        thumbUrls.push({
          position: i,
          url: `/uploads/temp/thumbnails/${id}/${outFileName}`
        });
      }
    }

    if (thumbUrls.length === 0) {
      return res.status(500).json({
        error: 'FFmpeg error',
        detail: 'Could not extract any preview frames from the video.'
      });
    }

    res.json({
      videoId: id,
      thumbnails: thumbUrls
    });

  } catch (err) {
    console.error('Temporary thumbnail generation failed:', err);
    res.status(500).json({ error: 'FFmpeg error', detail: err.message });
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
      const origPath = resolveDiskPath(video.file_path);
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
  const userId = req.user ? req.user.id : null;
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (isNaN(videoId)) return res.status(400).json({ error: 'Invalid video ID.' });

  try {
    // Check if already liked
    let query = '';
    let params = [];

    if (userId) {
      query = 'SELECT id FROM likes WHERE user_id = ? AND item_type = "video" AND item_id = ?';
      params = [userId, videoId];
    } else {
      query = 'SELECT id FROM likes WHERE user_id IS NULL AND ip_address = ? AND item_type = "video" AND item_id = ?';
      params = [ipAddress, videoId];
    }

    const [likes] = await db.query(query, params);
    let liked = false;

    if (likes.length > 0) {
      // Unlike
      await db.query('DELETE FROM likes WHERE id = ?', [likes[0].id]);
      await db.query('UPDATE videos SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?', [videoId]);
    } else {
      // Like
      await db.query(
        'INSERT INTO likes (user_id, ip_address, item_type, item_id) VALUES (?, ?, "video", ?)',
        [userId, ipAddress, videoId]
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

/**
 * Increment video views count with IP and session cooldown protection
 */
exports.incrementVideoView = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const cooldownSec = parseInt(process.env.VIEW_COOLDOWN_SEC) || 1800; // default 30 minutes
  const cacheKey = `cooldown_view_${ip}_video_${id}`;

  try {
    const isCooldown = await cache.get(cacheKey);
    if (isCooldown) {
      return res.json({ status: 'cooldown_active', views_count: null });
    }

    // Set IP view cooldown in cache
    await cache.set(cacheKey, '1', cooldownSec);

    // Increment view counter in DB
    await db.query('UPDATE videos SET views_count = views_count + 1 WHERE id = ?', [id]);
    
    // Invalidate caches
    await cache.del(`video_${id}`);
    await cache.del('feed_videos_*');

    // Retrieve fresh views count
    const [rows] = await db.query('SELECT views_count FROM videos WHERE id = ?', [id]);
    const newViews = rows[0] ? rows[0].views_count : 0;

    res.json({ status: 'counted', views_count: newViews });
  } catch (err) {
    console.error('Increment video view error:', err);
    res.status(500).json({ error: 'Database error incrementing view count.' });
  }
};

/**
 * Fetch related videos (excluding current video, optimized database fields, cached)
 */
exports.getRelatedVideos = async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid video ID.' });

  const cacheKey = `related_videos_${id}`;

  try {
    const cachedData = await cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Limit returned fields for speed, query completed ready status only, exclude current video id
    const [rows] = await db.query(
      'SELECT id, title, views_count, thumbnail_position FROM videos WHERE id != ? AND status = "ready" ORDER BY created_at DESC LIMIT 10',
      [id]
    );

    // Cache related videos for 60 seconds (since videos catalog updates are rare)
    await cache.set(cacheKey, rows, 60);

    res.json(rows);
  } catch (err) {
    console.error('Fetch related videos error:', err);
    res.status(500).json({ error: 'Database error fetching related videos.' });
  }
};

/**
 * Helper to parse YouTube Video ID from standard and short URLs
 */
function parseYouTubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Helper to parse Google Drive File ID from shared links
 */
function parseGoogleDriveId(url) {
  if (!url) return null;
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) return match1[1];
  const match2 = url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  return null;
}

/**
 * Register embedded video in database (Admin-only)
 */
exports.embedVideo = async (req, res) => {
  const { url, title, description, duration, thumbnail_url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  const ytId = parseYouTubeId(url);
  const gdId = parseGoogleDriveId(url);

  let sourceType = '';
  let sourceId = '';

  if (ytId) {
    sourceType = 'youtube';
    sourceId = ytId;
  } else if (gdId) {
    sourceType = 'gdrive';
    sourceId = gdId;
  } else {
    return res.status(400).json({ error: 'Unsupported URL format. Only YouTube and Google Drive links are supported.' });
  }

  let finalTitle = title || '';
  let finalDuration = parseFloat(duration) || 0;
  let finalThumbUrl = thumbnail_url || '';

  // Auto-fetch title from YouTube oEmbed if oembed title is empty
  if (sourceType === 'youtube' && !finalTitle) {
    try {
      const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${sourceId}&format=json`;
      const response = await fetch(oEmbedUrl);
      if (response.ok) {
        const data = await response.json();
        if (data.title) {
          finalTitle = data.title;
        }
        if (data.thumbnail_url && !finalThumbUrl) {
          finalThumbUrl = data.thumbnail_url;
        }
      }
    } catch (err) {
      console.warn('oEmbed title fetch failed for video:', err.message);
    }
  }

  if (!finalTitle) {
    finalTitle = sourceType === 'youtube' ? `YouTube Video (${sourceId})` : `Google Drive Video (${sourceId})`;
  }

  if (!finalThumbUrl) {
    finalThumbUrl = sourceType === 'youtube'
      ? `https://img.youtube.com/vi/${sourceId}/hqdefault.jpg`
      : `https://drive.google.com/thumbnail?id=${sourceId}&sz=w640`;
  }

  try {
    const [result] = await db.query(
      `INSERT INTO videos 
       (title, description, duration, aspect_ratio, file_path, status, source_type, source_id, source_url, thumbnail_url) 
       VALUES (?, ?, ?, '16:9', NULL, 'ready', ?, ?, ?, ?)`,
      [finalTitle, description || '', finalDuration, sourceType, sourceId, url, finalThumbUrl]
    );

    await cache.del('feed_videos_*');

    res.status(201).json({
      message: 'Embedded video added successfully.',
      videoId: result.insertId,
      title: finalTitle,
      sourceType,
      thumbnail_url: finalThumbUrl
    });
  } catch (err) {
    console.error('Embed video database insertion error:', err);
    res.status(500).json({ error: 'Database error while saving embedded video.' });
  }
};

/**
 * Fetch external video/reel metadata (Admin-only)
 */
exports.fetchExternalMetadata = async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL is required.' });
  }

  const ytId = parseYouTubeId(url);
  const gdId = parseGoogleDriveId(url);

  let sourceType = '';
  let sourceId = '';

  if (ytId) {
    sourceType = 'youtube';
    sourceId = ytId;
  } else if (gdId) {
    sourceType = 'gdrive';
    sourceId = gdId;
  } else {
    return res.status(400).json({ error: 'Unsupported URL format. Only YouTube and Google Drive links are supported.' });
  }

  try {
    let title = '';
    let duration = 0;
    let thumbnailUrl = '';

    if (sourceType === 'youtube') {
      try {
        const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${sourceId}&format=json`;
        const response = await fetch(oEmbedUrl);
        if (response.ok) {
          const data = await response.json();
          title = data.title || '';
          thumbnailUrl = data.thumbnail_url || '';
        }
      } catch (oerr) {
        console.warn('YouTube oEmbed metadata fetch failed:', oerr.message);
      }

      if (!thumbnailUrl) {
        thumbnailUrl = `https://img.youtube.com/vi/${sourceId}/hqdefault.jpg`;
      }

      try {
        const watchUrl = `https://www.youtube.com/watch?v=${sourceId}`;
        const response = await fetch(watchUrl);
        if (response.ok) {
          const html = await response.text();
          const durationMatch = html.match(/"lengthSeconds"\s*:\s*"(\d+)"/);
          if (durationMatch) {
            duration = parseInt(durationMatch[1], 10);
          }
          if (!title) {
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
              title = titleMatch[1].replace(/\s*-\s*YouTube$/i, '');
            }
          }
        }
      } catch (derr) {
        console.warn('YouTube duration scraping failed:', derr.message);
      }

    } else if (sourceType === 'gdrive') {
      thumbnailUrl = `https://drive.google.com/thumbnail?id=${sourceId}&sz=w640`;

      try {
        const viewUrl = `https://drive.google.com/file/d/${sourceId}/view`;
        const response = await fetch(viewUrl);
        if (response.ok) {
          const html = await response.text();
          const ogTitleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
          if (ogTitleMatch) {
            title = ogTitleMatch[1];
          } else {
            const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch) {
              title = titleMatch[1].replace(/\s*-\s*Google Drive$/i, '');
            }
          }
        }
      } catch (gerr) {
        console.warn('Google Drive page scraping failed:', gerr.message);
      }

      try {
        const { spawnSync } = require('child_process');
        const probeUrl = `https://drive.google.com/uc?export=download&id=${sourceId}`;
        const result = spawnSync(ffprobePath, [
          '-v', 'error',
          '-show_entries', 'format=duration',
          '-of', 'default=noprint_wrappers=1:nokey=1',
          probeUrl
        ], { timeout: 8000 });

        if (result.status === 0) {
          duration = parseFloat(result.stdout.toString().trim()) || 0;
        }
      } catch (ferr) {
        console.warn('Google Drive ffprobe duration parsing failed:', ferr.message);
      }
    }

    res.json({
      source_type: sourceType,
      source_id: sourceId,
      title: title || (sourceType === 'youtube' ? 'YouTube Video' : 'Google Drive Video'),
      duration: Math.round(duration),
      thumbnail_url: thumbnailUrl
    });

  } catch (err) {
    console.error('Fetch external metadata failed:', err);
    res.status(500).json({ error: 'Failed to retrieve external video metadata.' });
  }
};

/**
 * Format bytes to human readable size
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * List unposted videos directly uploaded to the server (storage/media/) (Admin-only)
 */
exports.listServerMedia = async (req, res) => {
  try {
    if (!fs.existsSync(MEDIA_DIR)) {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    }

    const allowedExts = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.flv', '.wmv', '.ts']);
    const allFiles = fs.readdirSync(MEDIA_DIR);

    // Get list of existing video file_path entries from the database
    const [existingVideos] = await db.query('SELECT file_path FROM videos WHERE file_path IS NOT NULL');
    const existingFileNames = new Set();
    
    existingVideos.forEach(v => {
      if (v.file_path) {
        existingFileNames.add(path.basename(v.file_path));
      }
    });

    const mediaList = [];

    for (const fileName of allFiles) {
      const ext = path.extname(fileName).toLowerCase();
      if (!allowedExts.has(ext)) continue;

      // Skip files already created as posts
      if (existingFileNames.has(fileName)) continue;

      const fullPath = path.join(MEDIA_DIR, fileName);
      try {
        const stats = fs.statSync(fullPath);
        if (!stats.isFile()) continue;

        let duration = 0;
        let width = 0;
        let height = 0;
        let aspectRatio = '16:9';

        try {
          const meta = await getVideoMetadata(fullPath);
          duration = Math.round(meta.duration || 0);
          width = meta.width || 0;
          height = meta.height || 0;
          aspectRatio = meta.aspect_ratio || '16:9';
        } catch (metaErr) {
          console.warn(`Could not probe metadata for server media ${fileName}:`, metaErr.message);
        }

        mediaList.push({
          fileName,
          filename: fileName,
          filePath: `/uploads/media/${encodeURIComponent(fileName)}`,
          fileSize: formatBytes(stats.size),
          fileSizeBytes: stats.size,
          sizeFormatted: formatBytes(stats.size),
          duration,
          width,
          height,
          aspectRatio,
          modifiedAt: stats.mtime,
          thumbnailUrl: `/api/videos/server-media/thumbnail?file=${encodeURIComponent(fileName)}`
        });
      } catch (fileErr) {
        console.warn(`Error reading server media file stats for ${fileName}:`, fileErr.message);
      }
    }

    // Sort by newest modified date first
    mediaList.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

    res.json({
      mediaDir: 'storage/media',
      count: mediaList.length,
      files: mediaList
    });
  } catch (err) {
    console.error('List server media error:', err);
    res.status(500).json({ error: 'Failed to scan server media directory.' });
  }
};

/**
 * Stream on-demand preview thumbnail for server media files (Admin-only)
 */
exports.streamServerMediaThumbnail = async (req, res) => {
  const fileParam = req.query.file || req.query.filename;
  if (!fileParam) {
    return res.status(400).json({ error: 'Missing file parameter.' });
  }

  const safeFileName = path.basename(fileParam);
  const targetPath = path.join(MEDIA_DIR, safeFileName);

  if (!fs.existsSync(targetPath)) {
    return res.status(404).json({ error: 'Media file not found on server.' });
  }

  try {
    let timestamp = 1.0;
    try {
      const meta = await getVideoMetadata(targetPath);
      if (meta.duration && meta.duration > 0) {
        timestamp = Math.min(1.0, meta.duration * 0.1);
      }
    } catch (_) {}

    const imgBuffer = await extractFrameToBuffer(targetPath, timestamp);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(imgBuffer);
  } catch (err) {
    console.error('Server media thumbnail extraction failed:', err);
    res.status(500).json({ error: 'Could not extract media thumbnail.' });
  }
};

/**
 * Create a new website video post from an already-uploaded server video (Admin-only)
 */
exports.createVideoFromMedia = async (req, res) => {
  const targetFile = req.body.fileName || req.body.filename;
  const { title, description, thumbnail_position } = req.body;

  if (!targetFile) {
    return res.status(400).json({ error: 'File name is required.' });
  }

  const safeFileName = path.basename(targetFile);
  const sourcePath = path.join(MEDIA_DIR, safeFileName);

  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ error: `File "${safeFileName}" not found in server media storage.` });
  }

  try {
    // 1. Extract metadata via ffprobe
    const metadata = await getVideoMetadata(sourcePath);

    // 2. Generate a unique temp file path and move the file into the transcoding queue pipeline
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const tempFileName = `video-${uniqueSuffix}${path.extname(safeFileName)}`;
    const tempFilePath = path.join(TEMP_DIR, tempFileName);

    try {
      fs.renameSync(sourcePath, tempFilePath);
    } catch (moveErr) {
      // If rename fails across partitions, copy and unlink
      fs.copyFileSync(sourcePath, tempFilePath);
      fs.unlinkSync(sourcePath);
    }

    // 3. Clean and prepare title
    const finalTitle = title && title.trim()
      ? title.trim()
      : path.parse(safeFileName).name.replace(/[-_]+/g, ' ');

    // 4. Determine initial status and output path
    const isWebReady = !!metadata.isWebReady;
    const initialStatus = 'processing';

    const [result] = await db.query(
      `INSERT INTO videos 
       (title, description, duration, width, height, aspect_ratio, file_size, file_path, thumbnail_position, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        finalTitle,
        description ? description.trim() : '',
        metadata.duration || 0,
        metadata.width || 0,
        metadata.height || 0,
        metadata.aspect_ratio || '16:9',
        metadata.file_size || 0,
        tempFilePath,
        initialStatus
      ]
    );

    const videoId = result.insertId;
    const videoOutputDir = path.join(PROCESSED_DIR, videoId.toString());

    // 5. Add to fast queue for instant stream-copy / faststart HLS
    transcodeQueue.addJob({
      id: videoId,
      type: 'video',
      inputPath: tempFilePath,
      outputPath: videoOutputDir,
      height: metadata.height || 720,
      isWebReady
    });

    // Invalidate list caches
    await cache.del('feed_videos_*');

    res.status(201).json({
      message: 'Video post created successfully.',
      videoId,
      title: finalTitle,
      duration: metadata.duration,
      status: 'ready'
    });

  } catch (err) {
    console.error('Create video from server media failed:', err);
    res.status(500).json({ error: `Failed to create video post: ${err.message}` });
  }
};

