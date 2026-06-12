const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');
const { requireAuth } = require('../middlewares/auth');

// 1. Fetch comments tree for a video/reel (Public API)
router.get('/', commentController.getComments);

// 2. Add a new comment or reply (Authenticated users)
router.post('/', requireAuth, commentController.addComment);

// 3. Delete a comment (Authenticated owner or Admin)
router.delete('/:id', requireAuth, commentController.deleteComment);

// 4. Like a comment (Authenticated users)
router.post('/:id/like', requireAuth, commentController.likeComment);

module.exports = router;
