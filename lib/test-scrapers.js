/**
 * test-scrapers.js — run individual or all scrapers locally for debugging
 *
 * Usage:
 *   node lib/test-scrapers.js              — test all scrapers
 *   node lib/test-scrapers.js killington   — test one mountain
 *   node lib/test-scrapers.js vt           — test all Vermont mountains
 */

const { runAllScrapers, ALL_SCRAPERS } = require('./scrapers');

const arg = process.argv[2]?.toLowerCase();

const REGION_MAP = {
  nj: ['mountain creek'],
  vt: ['killington','stowe','stratton','sugarbush','pico','okemo','mount snow','jay peak','burke','bolton valley','magic'],
  ny: ['hunter','whiteface','gore','belleayre','catamount','greek peak','west mtn'],
  pa: ['camelback','blue mtn','shawnee'],
  ne: ['sunday river','sugarloaf','saddleback','loon','attitash','wildcat','cannon','waterville'],
  ca: ['tremblant','le massif','mont-ste-anne'],
};

async function main() {
  if (!arg) {
    // Run all
    console.log('Running all scrapers...\n');
    const results = await runAllScrapers();
    console.log('\n─── RESULTS SUMMARY ───');
    results.mountains.forEach(m => {
      const status = m.base != null ? '✓' : '✗';
      console.log(`${status} ${m.name.padEnd(20)} base: ${String(m.base ?? '—').padEnd(5)}" | new24: ${String(m.newSnow24 ?? '—').padEnd(5)}" | trails: ${m.trailsOpen ?? '—'}/${m.trailsTotal ?? '—'} | surface: ${m.surface ?? '—'}`);
    });
    console.log(`\n${results.successCount}/${results.totalCount} scrapers returned base depth`);
    return;
  }

  // Filter by region or name
  const regionNames = REGION_MAP[arg];
  const matchingScrapers = ALL_SCRAPERS.filter(fn => {
    const name = fn.name.toLowerCase().replace(/([A-Z])/g, ' $1').toLowerCase();
    if (regionNames) return regionNames.some(r => name.includes(r));
    return name.includes(arg);
  });

  if (!matchingScrapers.length) {
    console.error(`No scrapers found matching "${arg}"`);
    console.log('Valid regions: nj, vt, ny, pa, ne, ca');
    console.log('Or use a mountain name fragment: killington, stowe, etc.');
    process.exit(1);
  }

  console.log(`Running ${matchingScrapers.length} scraper(s) matching "${arg}"...\n`);
  for (const fn of matchingScrapers) {
    try {
      const result = await fn();
      console.log(`\n${result.name}:`);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(`${fn.name} threw:`, e.message);
    }
  }
}

main().catch(console.error);
