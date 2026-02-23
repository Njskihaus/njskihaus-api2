/**
 * /api/scrape
 *
 * Triggered automatically at 7:00 AM ET daily by the Vercel cron (see vercel.json).
 * Can also be called manually to force a refresh:
 *   curl https://your-api.vercel.app/api/scrape
 *
 * Protected by CRON_SECRET env var — Vercel sets this automatically for cron calls.
 * For manual calls, pass ?secret=YOUR_MANUAL_SECRET in the URL.
 */

const { runAllScrapers } = require('../lib/scrapers');
const { setData }        = require('../lib/storage');

module.exports = async function handler(req, res) {
  // ── Auth check ──
  // Vercel cron requests include the Authorization header automatically
  // For manual calls, accept a ?secret= query param matching CRON_SECRET
  const cronSecret   = process.env.CRON_SECRET;
  const authHeader   = req.headers['authorization'];
  const querySecret  = req.query?.secret;

  const validCron   = cronSecret && authHeader === `Bearer ${cronSecret}`;
  const validManual = cronSecret && querySecret === cronSecret;
  const noSecret    = !cronSecret; // dev mode: no secret set, allow all

  if (!noSecret && !validCron && !validManual) {
    return res.status(401).json({
      ok:    false,
      error: 'Unauthorized',
      hint:  'Pass ?secret=YOUR_CRON_SECRET or set CRON_SECRET env var to skip auth in dev',
    });
  }

  console.log(`[scrape] Triggered at ${new Date().toISOString()} — method: ${validCron ? 'cron' : validManual ? 'manual' : 'dev'}`);

  try {
    // ── Run all scrapers ──
    const results = await runAllScrapers();

    // ── Persist to KV ──
    const saved = await setData(results);

    if (!saved) {
      console.warn('[scrape] Storage write failed — results not persisted');
    }

    return res.status(200).json({
      ok:           true,
      scrapedAt:    results.scrapedAt,
      successCount: results.successCount,
      totalCount:   results.totalCount,
      saved,
      mountains:    results.mountains.map(m => ({
        name:  m.name,
        base:  m.base,
        new24: m.newSnow24,
        ok:    m.base != null,
      })),
    });
  } catch (err) {
    console.error('[scrape] Fatal error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
