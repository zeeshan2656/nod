const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const videoController = require('../controllers/videoController');
const uploadController = require('../controllers/uploadController');
const { requireAdmin, requireAuth, authenticateToken } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

// Configure Multer Memory Storage for chunked uploads
const memoryUpload = multer({ storage: multer.memoryStorage() });

// Configure Multer Disk Storage for Video Uploads
const UPLOAD_ROOT = process.env.STORAGE_PATH 
  ? path.resolve(process.env.STORAGE_PATH) 
  : path.join(__dirname, '..', '..', '..', 'storage');
const tempUploadPath = path.join(UPLOAD_ROOT, 'temp');
if (!fs.existsSync(tempUploadPath)) {
  fs.mkdirSync(tempUploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'video-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Filter out non-video formats
const fileFilter = (req, file, cb) => {
  const allowedTypes = /mp4|mkv|webm|avi|mov|quicktime/i;
  const isMimeVideo = file.mimetype.startsWith('video/');
  const isExtensionVideo = allowedTypes.test(path.extname(file.originalname).toLowerCase());

  if (isMimeVideo || isExtensionVideo) {
    cb(null, true);
  } else {
    cb(new Error('Only video files (MP4, MKV, WEBM, AVI, MOV) are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500 MB upload limit per file
  }
});

// Chunked upload system endpoints (YouTube-style background upload system)
router.post('/upload/initiate', requireAdmin, uploadController.initiateUpload);
router.post('/upload/chunk', requireAdmin, memoryUpload.single('chunk'), uploadController.uploadChunk);
router.get('/upload/status/:uploadId', requireAdmin, uploadController.getUploadStatus);
router.put('/upload/metadata', requireAdmin, uploadController.updateUploadMetadata);
router.post('/upload/cancel/:uploadId', requireAdmin, uploadController.cancelUpload);

// 1. Upload multiple videos (Admin-only, protected by rate limiting)
router.post(
  '/',
  requireAdmin,
  authLimiter,
  upload.array('videos', 10), // Limit to 10 simultaneous uploads
  videoController.uploadVideos
);

// 1.5. Embed a video (YouTube / Google Drive) (Admin-only)
router.post(
  '/embed',
  requireAdmin,
  authLimiter,
  videoController.embedVideo
);

// 2. Fetch cursor-paginated video grid
router.get('/', authenticateToken, videoController.listVideos);

// 3. Fetch specific video details
router.get('/:id', videoController.getVideo);

// 3.5. Fetch related videos
router.get('/:id/related', videoController.getRelatedVideos);

// 4. Stream dynamically extracted video thumbnail frame
router.get('/:id/thumbnail', videoController.streamThumbnail);

// 5. Generate 10 temporary preview frames (Admin-only)
router.get('/:id/temp-thumbnails', requireAdmin, videoController.getTemporaryThumbnails);

// 6. Update video description/thumbnail position (Admin-only)
router.put('/:id', requireAdmin, videoController.updateVideo);

// 7. Delete video (Admin-only)
router.delete('/:id', requireAdmin, videoController.deleteVideo);

// 8. Like/Unlike video (Authenticated/Anonymous allowed)
router.post('/:id/like', authenticateToken, videoController.likeVideo);

// 9. Increment view count on video playback
router.post('/:id/view', videoController.incrementVideoView);

module.exports = router;
