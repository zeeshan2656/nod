const db = require('../config/db');
const cache = require('../config/cache');
const path = require('path');
const fs = require('fs');
const transcodeQueue = require('../utils/transcodeQueue');

const UPLOAD_ROOT = process.env.STORAGE_PATH 
  ? path.resolve(process.env.STORAGE_PATH) 
  : path.join(__dirname, '..', '..', '..', 'storage');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');
const PROCESSED_DIR = path.join(UPLOAD_ROOT, 'processed', 'videos');
const PROCESSED_REELS_DIR = path.join(UPLOAD_ROOT, 'processed', 'reels');

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });
if (!fs.existsSync(PROCESSED_REELS_DIR)) fs.mkdirSync(PROCESSED_REELS_DIR, { recursive: true });

/**
 * 1. Initiate Upload Session
 */
exports.initiateUpload = async (req, res) => {
  const { 
    uploadId, 
    title, 
    description, 
    fileName, 
    fileSize, 
    duration, 
    width, 
    height, 
    uploadType 
  } = req.body;

  if (!uploadId || !fileName || !fileSize) {
    return res.status(400).json({ error: 'Missing required initialization fields.' });
  }

  try {
    // Check if session already exists
    const [existing] = await db.query('SELECT upload_id FROM upload_queue WHERE upload_id = ?', [uploadId]);
    if (existing.length > 0) {
      return res.json({ message: 'Upload session already initiated.', uploadId });
    }

    // Insert new upload session
    await db.query(
      `INSERT INTO upload_queue 
       (upload_id, title, description, file_name, file_size, uploaded_bytes, status, duration, width, height, upload_type) 
       VALUES (?, ?, ?, ?, ?, 0, 'queued', ?, ?, ?, ?)`,
      [
        uploadId, 
        title || path.parse(fileName).name, 
        description || '', 
        fileName, 
        fileSize, 
        duration || 0, 
        width || 0, 
        height || 0, 
        uploadType || 'video'
      ]
    );

    res.status(201).json({ message: 'Upload session initiated successfully.', uploadId });
  } catch (err) {
    console.error('Initiate upload error:', err);
    res.status(500).json({ error: `Could not initiate upload: ${err.message}` });
  }
};

/**
 * 2. Upload Chunk
 */
exports.uploadChunk = async (req, res) => {
  const { uploadId, chunkIndex, totalChunks, offset } = req.body;

  if (!uploadId || chunkIndex === undefined || totalChunks === undefined || offset === undefined) {
    return res.status(400).json({ error: 'Missing chunk metadata fields.' });
  }

  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ error: 'Missing binary file chunk data.' });
  }

  const chunkBuffer = req.file.buffer;
  const chunkLength = chunkBuffer.length;
  const targetOffset = parseInt(offset);
  const targetChunkIndex = parseInt(chunkIndex);
  const targetTotalChunks = parseInt(totalChunks);

  const tempFilePath = path.join(TEMP_DIR, `${uploadId}.tmp`);

  try {
    // 1. Verify session exists in DB and is not cancelled
    const [rows] = await db.query('SELECT * FROM upload_queue WHERE upload_id = ?', [uploadId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Upload session not found.' });
    }
    const uploadSession = rows[0];

    if (uploadSession.status === 'cancelled') {
      // Clean up local temp files if any
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      return res.status(400).json({ error: 'Upload has been cancelled.', status: 'cancelled' });
    }

    // 2. Check current physical file size on disk for self-healing
    let currentPhysicalSize = 0;
    if (fs.existsSync(tempFilePath)) {
      currentPhysicalSize = fs.statSync(tempFilePath).size;
    }

    // 3. Offset validation
    if (targetOffset > currentPhysicalSize) {
      return res.status(400).json({ 
        error: 'Missing preceding bytes. Upload offset is out of sync.', 
        expectedOffset: currentPhysicalSize 
      });
    }

    // 4. Append chunk data if it has not been written yet
    if (targetOffset + chunkLength <= currentPhysicalSize) {
      // Chunk was already fully written (retry packet case)
      return res.json({ 
        status: 'uploading', 
        uploadedBytes: currentPhysicalSize 
      });
    }

    // Write buffer starting at currentPhysicalSize
    if (targetOffset < currentPhysicalSize) {
      // The client sent a chunk overlapping with written data (partial write retry)
      const overlap = currentPhysicalSize - targetOffset;
      if (overlap < chunkLength) {
        const sliceToWrite = chunkBuffer.slice(overlap);
        fs.appendFileSync(tempFilePath, sliceToWrite);
      }
    } else {
      // Normal write
      fs.appendFileSync(tempFilePath, chunkBuffer);
    }

    const newPhysicalSize = fs.statSync(tempFilePath).size;

    // 5. Update progress in DB
    await db.query(
      'UPDATE upload_queue SET uploaded_bytes = ?, status = "uploading" WHERE upload_id = ?',
      [newPhysicalSize, uploadId]
    );

    // 6. Handle final chunk completion
    if (targetChunkIndex === targetTotalChunks - 1) {
      // Mark as processing in DB immediately
      await db.query(
        'UPDATE upload_queue SET status = "processing" WHERE upload_id = ?',
        [uploadId]
      );

      // Create permanent record in either 'videos' or 'reels' table
      const title = uploadSession.title || path.parse(uploadSession.file_name).name;
      const fileExt = path.extname(uploadSession.file_name);
      
      // We rename the temp file to a unique original path
      const finalOriginalName = `upload-${uploadId}-${Date.now()}${fileExt}`;
      const finalOriginalPath = path.join(TEMP_DIR, finalOriginalName);
      
      fs.renameSync(tempFilePath, finalOriginalPath);

      let videoId;
      if (uploadSession.upload_type === 'reel') {
        const [result] = await db.query(
          `INSERT INTO reels 
           (title, description, duration, width, height, file_path, status) 
           VALUES (?, ?, ?, ?, ?, ?, 'processing')`,
          [
            title, 
            uploadSession.description || '', 
            uploadSession.duration || 0, 
            uploadSession.width || 0, 
            uploadSession.height || 0, 
            finalOriginalPath
          ]
        );
        videoId = result.insertId;

        const outputDir = path.join(PROCESSED_REELS_DIR, videoId.toString());
        transcodeQueue.addJob({
          id: videoId,
          type: 'reel',
          inputPath: finalOriginalPath,
          outputPath: outputDir,
          height: uploadSession.height || 720
        });
      } else {
        const [result] = await db.query(
          `INSERT INTO videos 
           (title, description, duration, width, height, aspect_ratio, file_size, file_path, thumbnail_position, status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'processing')`,
          [
            title, 
            uploadSession.description || '', 
            uploadSession.duration || 0, 
            uploadSession.width || 0, 
            uploadSession.height || 0, 
            (uploadSession.width && uploadSession.height) ? `${uploadSession.width}:${uploadSession.height}` : '16:9',
            uploadSession.file_size,
            finalOriginalPath
          ]
        );
        videoId = result.insertId;

        const outputDir = path.join(PROCESSED_DIR, videoId.toString());
        transcodeQueue.addJob({
          id: videoId,
          type: 'video',
          inputPath: finalOriginalPath,
          outputPath: outputDir,
          height: uploadSession.height || 720
        });
      }

      // Associate video_id to upload queue record
      await db.query(
        'UPDATE upload_queue SET video_id = ? WHERE upload_id = ?',
        [videoId, uploadId]
      );

      // Invalidate caches
      await cache.del('feed_videos_*');
      await cache.del('feed_reels_*');

      return res.json({ 
        status: 'processing', 
        uploadedBytes: newPhysicalSize,
        videoId 
      });
    }

    res.json({ 
      status: 'uploading', 
      uploadedBytes: newPhysicalSize 
    });

  } catch (err) {
    console.error('Upload chunk error:', err);
    res.status(500).json({ error: `Failed to upload chunk: ${err.message}` });
  }
};

/**
 * 3. Retrieve Upload Session Status / Physical Offset
 */
exports.getUploadStatus = async (req, res) => {
  const { uploadId } = req.params;

  try {
    const [rows] = await db.query('SELECT * FROM upload_queue WHERE upload_id = ?', [uploadId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Upload session not found.' });
    }

    const session = rows[0];
    const tempFilePath = path.join(TEMP_DIR, `${uploadId}.tmp`);

    // Fetch physical file size on disk if available
    let physicalSize = 0;
    if (fs.existsSync(tempFilePath)) {
      physicalSize = fs.statSync(tempFilePath).size;
    }

    // Sync database offset if it is out of sync with physical bytes written
    if (physicalSize !== session.uploaded_bytes && (session.status === 'uploading' || session.status === 'queued')) {
      await db.query('UPDATE upload_queue SET uploaded_bytes = ? WHERE upload_id = ?', [physicalSize, uploadId]);
      session.uploaded_bytes = physicalSize;
    }

    res.json({
      uploadId: session.upload_id,
      title: session.title,
      description: session.description,
      fileName: session.file_name,
      fileSize: session.file_size,
      uploadedBytes: session.uploaded_bytes,
      status: session.status,
      uploadType: session.upload_type,
      videoId: session.video_id
    });
  } catch (err) {
    console.error('Get upload status error:', err);
    res.status(500).json({ error: 'Database diagnostics query failed.' });
  }
};

/**
 * 4. Update Upload Metadata (Live sync)
 */
exports.updateUploadMetadata = async (req, res) => {
  const { uploadId, title, description } = req.body;

  if (!uploadId) {
    return res.status(400).json({ error: 'Missing uploadId parameter.' });
  }

  try {
    // 1. Update session in queue
    const [result] = await db.query(
      'UPDATE upload_queue SET title = ?, description = ? WHERE upload_id = ?',
      [title, description, uploadId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Upload session not found.' });
    }

    // 2. Sync to active video/reel record if already generated
    const [sessions] = await db.query('SELECT video_id, upload_type FROM upload_queue WHERE upload_id = ?', [uploadId]);
    const session = sessions[0];
    
    if (session && session.video_id) {
      const table = session.upload_type === 'reel' ? 'reels' : 'videos';
      await db.query(
        `UPDATE ${table} SET title = ?, description = ? WHERE id = ?`,
        [title, description, session.video_id]
      );
      // Invalidate specific cache keys
      await cache.del(`${session.upload_type}_${session.video_id}`);
      await cache.del(`feed_${session.upload_type}s_*`);
    }

    res.json({ message: 'Upload metadata updated successfully.' });
  } catch (err) {
    console.error('Update upload metadata error:', err);
    res.status(500).json({ error: 'Database update failed.' });
  }
};

/**
 * 5. Cancel Upload
 */
exports.cancelUpload = async (req, res) => {
  const { uploadId } = req.params;

  try {
    // Get session first
    const [rows] = await db.query('SELECT video_id, upload_type FROM upload_queue WHERE upload_id = ?', [uploadId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Upload session not found.' });
    }

    const session = rows[0];

    // Mark as cancelled in DB
    await db.query('UPDATE upload_queue SET status = "cancelled" WHERE upload_id = ?', [uploadId]);

    // Clean temp original file
    const tempFilePath = path.join(TEMP_DIR, `${uploadId}.tmp`);
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // If already inserted into videos/reels, clean it up or mark failed
    if (session.video_id) {
      const table = session.upload_type === 'reel' ? 'reels' : 'videos';
      
      // Let's delete it so it's fully cleaned up
      await db.query(`DELETE FROM ${table} WHERE id = ?`, [session.video_id]);
      
      // Clean up any processed folders if created
      const hlsDir = path.join(
        UPLOAD_ROOT, 
        'processed', 
        `${session.upload_type}s`, 
        session.video_id.toString()
      );
      if (fs.existsSync(hlsDir)) {
        fs.rmSync(hlsDir, { recursive: true, force: true });
      }

      await cache.del('feed_videos_*');
      await cache.del('feed_reels_*');
    }

    res.json({ message: 'Upload session cancelled and temporary resources cleaned up.' });
  } catch (err) {
    console.error('Cancel upload error:', err);
    res.status(500).json({ error: 'Database cancellation routine failed.' });
  }
};
