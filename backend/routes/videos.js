const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const videoController = require('../controllers/videoController');
const { requireAdmin, requireAuth, authenticateToken } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

// Configure Multer Disk Storage for Video Uploads
const tempUploadPath = path.join(__dirname, '..', 'uploads', 'temp');
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

// 1. Upload multiple videos (Admin-only, protected by rate limiting)
router.post(
  '/',
  requireAdmin,
  authLimiter,
  upload.array('videos', 10), // Limit to 10 simultaneous uploads
  videoController.uploadVideos
);

// 2. Fetch cursor-paginated video grid
router.get('/', authenticateToken, videoController.listVideos);

// 3. Fetch specific video details
router.get('/:id', videoController.getVideo);

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
