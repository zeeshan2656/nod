const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { requireAdmin } = require('../middlewares/auth');

// 1. Fetch public site name and analytics script injections (Public API)
router.get('/', settingController.getPublicSettings);

// 2. Fetch full settings list (Admin-only)
router.get('/admin', requireAdmin, settingController.getSettings);

// 3. Save site settings modifications (Admin-only)
router.put('/', requireAdmin, settingController.updateSettings);

// 4. Fetch admin statistics metrics (Admin-only)
router.get('/stats', requireAdmin, settingController.getStats);

// 5. Run system consistency diagnostics (Admin-only)
router.get('/diagnostics', requireAdmin, settingController.getDiagnostics);

module.exports = router;
