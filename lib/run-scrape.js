/**
 * run-scrape.js — run the full scrape locally and save to /tmp/njskihaus-cache.json
 * Useful for testing the full pipeline without deploying to Vercel.
 *
 * Usage:
 *   npm run scrape
 *   node lib/run-scrape.js
 */

const { runAllScrapers } = require('./scrapers');
const { setData }        = require('./storage');

async function main() {
  console.log('NJ Ski Haus — Full Scrape Run');
  console.log('='.repeat(50));

  const results = await runAllScrapers();
  const saved   = await setData(results);

  console.log('\n' + '='.repeat(50));
  console.log(`Saved to local cache: ${saved}`);
  console.log(`Success rate: ${results.successCount}/${results.totalCount} mountains`);

  // Print any mountains with no base depth — these need selector fixes
  const failed = results.mountains.filter(m => m.base == null);
  if (failed.length) {
    console.log(`\n⚠ ${failed.length} scrapers need selector tuning:`);
    failed.forEach(m => console.log(`  - ${m.name} → ${m.source}`));
    console.log('\nTo fix: open the resort URL in a browser, inspect the HTML,');
    console.log('and update the CSS selectors in lib/scrapers.js');
  } else {
    console.log('\n✅ All scrapers returned data!');
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
