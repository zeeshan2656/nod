const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const reelController = require('../controllers/reelController');
const { requireAdmin, requireAuth, authenticateToken } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/rateLimiter');

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
    cb(null, 'reel-' + uniqueSuffix + path.extname(file.originalname));
  }
});

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
    fileSize: 200 * 1024 * 1024 // 200 MB limit for vertical reels
  }
});

// 1. Upload reels (single or multiple) (Admin-only)
router.post(
  '/',
  requireAdmin,
  authLimiter,
  upload.array('reels', 10),
  reelController.uploadReels
);

// 2. Fetch cursor-paginated reels feed (TikTok scroll)
router.get('/', authenticateToken, reelController.listReels);

// 3. Increment views on a reel (Public/Client triggered)
router.post('/:id/view', reelController.incrementReelView);

// 4. Delete a reel and its HLS segments (Admin-only)
router.delete('/:id', requireAdmin, reelController.deleteReel);

// 5. Like/Unlike a reel (Authenticated users)
router.post('/:id/like', requireAuth, reelController.likeReel);

module.exports = router;
