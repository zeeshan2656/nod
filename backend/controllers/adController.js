const db = require('../config/db');
const cache = require('../config/cache');

/**
 * Fetch all ad placements (Admin view)
 */
exports.getAllAds = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ads ORDER BY placement ASC');
    res.json(rows);
  } catch (err) {
    console.error('Fetch ads error:', err);
    res.status(500).json({ error: 'Database error fetching ad placements.' });
  }
};

/**
 * Fetch active ad placements (Cached for speed)
 */
exports.getActiveAds = async (req, res) => {
  const cacheKey = 'active_ads';
  
  try {
    const cachedAds = await cache.get(cacheKey);
    if (cachedAds) {
      return res.json(cachedAds);
    }

    const [rows] = await db.query('SELECT placement, code FROM ads WHERE is_active = 1');
    
    // Structure into a keyed object for instant frontend lookup (e.g. ads.header = "...")
    const adsObject = {};
    rows.forEach(ad => {
      adsObject[ad.placement] = ad.code;
    });

    await cache.set(cacheKey, adsObject, 60); // Cache active ads for 1 minute

    res.json(adsObject);
  } catch (err) {
    console.error('Fetch active ads error:', err);
    res.status(500).json({ error: 'Database error fetching active ads.' });
  }
};

/**
 * Update an ad placement
 */
exports.updateAd = async (req, res) => {
  const { placement } = req.params;
  const { name, code, is_active } = req.body;

  if (!placement) {
    return res.status(400).json({ error: 'Placement identifier is required.' });
  }

  try {
    const [rows] = await db.query('SELECT id FROM ads WHERE placement = ?', [placement]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Ad placement not found.' });
    }

    await db.query(
      'UPDATE ads SET name = ?, code = ?, is_active = ? WHERE placement = ?',
      [name, code, is_active ? 1 : 0, placement]
    );

    // Invalidate ads cache
    await cache.del('active_ads');

    res.json({ message: `Ad placement ${placement} updated successfully.` });
  } catch (err) {
    console.error('Update ad error:', err);
    res.status(500).json({ error: 'Database error updating ad placement.' });
  }
};
