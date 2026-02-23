/**
 * /api/conditions
 *
 * Public endpoint — returns the latest scraped mountain conditions as JSON.
 * Called by njskihaus.com on every page load.
 *
 * Response shape:
 * {
 *   ok: true,
 *   scrapedAt: "2026-02-23T12:00:00Z",   // when the scrape ran
 *   mountains: [
 *     {
 *       name: "KILLINGTON",
 *       base: 58,
 *       summit: 72,
 *       newSnow24: 8,
 *       newSnow48: 12,
 *       trailsOpen: 116,
 *       trailsTotal: 142,
 *       liftsOpen: 18,
 *       liftsTotal: 22,
 *       surface: "Packed Powder",
 *       season: 198,
 *       status: "Open",
 *       updatedAt: "2026-02-23T12:03:14Z",
 *       source: "https://..."
 *     },
 *     ...
 *   ]
 * }
 */

const { getData } = require('../lib/storage');

module.exports = async function handler(req, res) {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const data = await getData();

    if (!data) {
      return res.status(503).json({
        ok: false,
        error: 'No conditions data available yet. Scrape has not run — trigger /api/scrape or wait for the daily cron.',
        hint: 'GET /api/scrape to run now',
      });
    }

    // Cache: tell browsers/CDN to cache for 1 hour, serve stale for up to 2hr while revalidating
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=7200');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    return res.status(200).json({
      ok:           true,
      scrapedAt:    data.scrapedAt,
      storedAt:     data.storedAt,
      successCount: data.successCount,
      totalCount:   data.totalCount,
      mountains:    data.mountains || [],
    });
  } catch (err) {
    console.error('[conditions] Error reading storage:', err);
    return res.status(500).json({ ok: false, error: 'Storage error', detail: err.message });
  }
};
