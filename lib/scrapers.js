/**
 * scrapers.js — NJ Ski Haus mountain conditions
 *
 * PRIMARY SOURCE: SnoCountry API (feeds.snocountry.net)
 * - Free, no account needed beyond a key
 * - Data comes directly from resort snow reporters (same source as OnTheSnow)
 * - Returns: base depth, new snow 24/48/72hr, trails open/total, lifts, surface, season total
 * - Covers all US mountains + Quebec Canada
 * - Updated throughout the day as reports come in from resorts
 *
 * API key: SnoCountry.example works for single-state requests (no limit per their docs)
 * For production: email snocountry.net to request a dedicated free key for your site
 */

const fetch = require('node-fetch');

const SNOCOUNTRY_KEY = process.env.SNOCOUNTRY_API_KEY || 'SnoCountry.example';
const SNOCOUNTRY_URL = 'https://feeds.snocountry.net/getSnowReport.php';

// Mountain name mapping: SnoCountry name → our card name
const NAME_MAP = {
  'Mountain Creek':                    'MOUNTAIN CREEK',
  'Killington Resort':                 'KILLINGTON',
  'Killington':                        'KILLINGTON',
  'Stowe Mountain Resort':             'STOWE',
  'Stowe':                             'STOWE',
  'Stratton Mountain':                 'STRATTON',
  'Stratton':                          'STRATTON',
  'Sugarbush Resort':                  'SUGARBUSH',
  'Sugarbush':                         'SUGARBUSH',
  'Pico Mountain':                     'PICO MTN',
  'Pico':                              'PICO MTN',
  'Okemo Mountain Resort':             'OKEMO',
  'Okemo':                             'OKEMO',
  'Mount Snow':                        'MOUNT SNOW',
  'Jay Peak':                          'JAY PEAK',
  'Jay Peak Resort':                   'JAY PEAK',
  'Burke Mountain':                    'BURKE MTN',
  'Bolton Valley':                     'BOLTON VALLEY',
  'Bolton Valley Resort':              'BOLTON VALLEY',
  'Magic Mountain':                    'MAGIC MTN',
  'Hunter Mountain':                   'HUNTER MTN',
  'Whiteface Mountain':                'WHITEFACE',
  'Whiteface':                         'WHITEFACE',
  'Gore Mountain':                     'GORE MTN',
  'Gore':                              'GORE MTN',
  'Belleayre Mountain':                'BELLEAYRE',
  'Belleayre':                         'BELLEAYRE',
  'Catamount':                         'CATAMOUNT',
  'Greek Peak Mountain Resort':        'GREEK PEAK',
  'Greek Peak':                        'GREEK PEAK',
  'West Mountain':                     'WEST MTN',
  'Camelback Mountain Resort':         'CAMELBACK',
  'Camelback':                         'CAMELBACK',
  'Blue Mountain':                     'BLUE MTN PA',
  'Blue Mountain Resort':              'BLUE MTN PA',
  'Shawnee Mountain':                  'SHAWNEE MTN',
  'Sunday River':                      'SUNDAY RIVER',
  'Sunday River Resort':               'SUNDAY RIVER',
  'Sugarloaf':                         'SUGARLOAF',
  'Sugarloaf Mountain':                'SUGARLOAF',
  'Saddleback Maine':                  'SADDLEBACK',
  'Saddleback Mountain':               'SADDLEBACK',
  'Saddleback':                        'SADDLEBACK',
  'Loon Mountain':                     'LOON MTN',
  'Loon Mountain Resort':              'LOON MTN',
  'Attitash':                          'ATTITASH',
  'Attitash Mountain Resort':          'ATTITASH',
  'Wildcat Mountain':                  'WILDCAT',
  'Wildcat':                           'WILDCAT',
  'Cannon Mountain':                   'CANNON MTN',
  'Waterville Valley':                 'WATERVILLE VLY',
  'Waterville Valley Resort':          'WATERVILLE VLY',
  'Mont-Tremblant':                    'MONT-TREMBLANT',
  'Tremblant':                         'MONT-TREMBLANT',
  'Le Massif de Charlevoix':           'LE MASSIF',
  'Le Massif':                         'LE MASSIF',
  'Mont-Sainte-Anne':                  'MONT-STE-ANNE',
  'Mont Sainte Anne':                  'MONT-STE-ANNE',
};

function parseRecord(r) {
  const name = r.resort_name || r.resortName;
  const ourName = NAME_MAP[name] || NAME_MAP[name?.trim()];
  if (!ourName) return null;

  const base   = parseFloat(r.base_depth   || r.baseDepth)   || null;
  const summit = parseFloat(r.summit_depth || r.summitDepth) || null;
  const new24  = parseFloat(r.fresh_snow   || r.freshSnow || r.snow_last_24h || r.snowLast24Hours) || null;
  const new48  = parseFloat(r.snow_last_48h || r.snowLast48Hours) || null;
  const new7d  = parseFloat(r.snow_last_7d  || r.snowLast7Days)   || null;
  const season = parseFloat(r.season_total  || r.seasonTotal)     || null;
  const tOpen  = parseInt(r.open_runs   || r.openRuns  || r.open_trails  || r.openTrails)  || null;
  const tTotal = parseInt(r.total_runs  || r.totalRuns || r.total_trails || r.totalTrails) || null;
  const lOpen  = parseInt(r.open_lifts  || r.openLifts)  || null;
  const lTotal = parseInt(r.total_lifts || r.totalLifts) || null;

  const statusCode = parseInt(r.resort_status || r.resortStatus) || 0;
  const status = statusCode <= 3 ? 'Open' : 'Closed';

  return {
    name,
    base, summit, newSnow24: new24, newSnow48: new48, newSnow7d: new7d,
    trailsOpen: tOpen, trailsTotal: tTotal,
    liftsOpen: lOpen, liftsTotal: lTotal,
    surface: r.primary_surface_condition || r.primarySurfaceCondition || null,
    season, status,
    updatedAt: r.report_date_time || r.reportDateTime || new Date().toISOString(),
    source: 'SnoCountry',
  };
}

async function fetchState(stateCode) {
  const url = `${SNOCOUNTRY_URL}?apiKey=${SNOCOUNTRY_KEY}&states=${stateCode}&output=json`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NJSkiHaus/1.0 (njskihaus.com)' },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status} for state ${stateCode}`);
    const text = await res.text();
    if (stateCode === 'VT') {
      console.log(`[scraper] SnoCountry VT sample: ${text.substring(0, 500)}`);
    }
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : (data.resorts || data.data || []);
  } catch (e) {
    clearTimeout(timeout);
    console.warn(`[scraper] fetchState(${stateCode}) failed:`, e.message);
    return [];
  }
}

async function runAllScrapers() {
  console.log('[scraper] Starting SnoCountry fetch...');
  const start = Date.now();

  const states = ['NJ', 'VT', 'NY', 'PA', 'NH', 'ME', 'QC'];
  const allResults = await Promise.allSettled(states.map(fetchState));

  const allResorts = [];
  allResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`[scraper] ${states[i]}: ${result.value.length} resorts`);
      allResorts.push(...result.value);
    } else {
      console.warn(`[scraper] ${states[i]} failed:`, result.reason?.message);
    }
  });

  console.log(`[scraper] Total resorts from SnoCountry: ${allResorts.length}`);

  const allNames = allResorts.map(r => r.resort_name || r.resortName).filter(Boolean);
  console.log('[scraper] All resort names:', JSON.stringify(allNames));

  const matched = [];
  const matchedNames = new Set();

  allResorts.forEach(r => {
    const parsed = parseRecord(r);
    if (parsed && !matchedNames.has(parsed.name)) {
      matched.push(parsed);
      matchedNames.add(parsed.name);
      console.log(`  [${parsed.base != null ? '✓' : '~'}] ${parsed.name} — base: ${parsed.base ?? '—'}" new24: ${parsed.newSnow24 ?? '—'}"`);
    }
  });

  const successCount = matched.filter(m => m.base != null).length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[scraper] Done in ${elapsed}s — ${successCount}/${matched.length} matched`);

  return {
    mountains: matched,
    scrapedAt: new Date().toISOString(),
    successCount,
    totalCount: matched.length,
  };
}

module.exports = { runAllScrapers };
