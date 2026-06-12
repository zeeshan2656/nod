const express = require('express');
const router = express.Router();
const adController = require('../controllers/adController');
const { requireAdmin } = require('../middlewares/auth');

// 1. Fetch active ads dictionary for client pages (Public API)
router.get('/', adController.getActiveAds);

// 2. Fetch all ads with metadata (Admin-only)
router.get('/admin', requireAdmin, adController.getAllAds);

// 3. Update specific ad placement (Admin-only)
router.put('/:placement', requireAdmin, adController.updateAd);

module.exports = router;
