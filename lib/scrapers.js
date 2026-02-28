/**
 * scrapers.js — NJ Ski Haus mountain conditions
 *
 * SOURCE: SnoCountry API (feeds.snocountry.net)
 *
 * Strategy: fetch the full resort list for each state, find our mountains
 * by name match, then fetch conditions for matched IDs.
 * This avoids hardcoding IDs that might be wrong.
 *
 * Confirmed field names from live API:
 *   resortName, avgBaseDepthMin, newSnowMin, openDownHillTrails,
 *   maxOpenDownHillTrails, openDownHillLifts, primarySurfaceCondition,
 *   snowLast48Hours, resortStatus, reportDateTime
 */

const fetch = require('node-fetch');

const SNOCOUNTRY_KEY = process.env.SNOCOUNTRY_API_KEY || 'SnoCountry.example';
const BASE = 'http://feeds.snocountry.net';

// Our mountain display names → possible SnoCountry names (lowercase for matching)
const NAME_MAP = {
  'mountain creek resort':       'MOUNTAIN CREEK',
  'killington':              'KILLINGTON',
  'killington resort':       'KILLINGTON',
  'stowe':                   'STOWE',
  'stowe mountain resort':   'STOWE',
  'stratton':                'STRATTON',
  'stratton mountain':       'STRATTON',
  'stratton mountain resort':'STRATTON',
  'sugarbush':               'SUGARBUSH',
  'sugarbush resort':        'SUGARBUSH',
  'pico':                    'PICO MTN',
  'pico mountain':           'PICO MTN',
  'okemo':                   'OKEMO',
  'okemo mountain resort':   'OKEMO',
  'mount snow':              'MOUNT SNOW',
  'jay peak':                'JAY PEAK',
  'jay peak resort':         'JAY PEAK',
  'burke mountain':          'BURKE MTN',
  'burke':                   'BURKE MTN',
  'bolton valley':           'BOLTON VALLEY',
  'bolton valley resort':    'BOLTON VALLEY',
  'magic mountain':          'MAGIC MTN',
  'magic':                   'MAGIC MTN',
  'bromley mountain':        'BROMLEY',
  'hunter mountain':         'HUNTER MTN',
  'hunter':                  'HUNTER MTN',
  'whiteface':               'WHITEFACE',
  'whiteface mountain':      'WHITEFACE',
  'gore mountain':           'GORE MTN',
  'gore':                    'GORE MTN',
  'belleayre':               'BELLEAYRE',
  'belleayre mountain':      'BELLEAYRE',
  'catamount':               'CATAMOUNT',
  'greek peak':              'GREEK PEAK',
  'greek peak mountain resort': 'GREEK PEAK',
  'west mountain':           'WEST MTN',
  'camelback':               'CAMELBACK',
  'camelback mountain resort': 'CAMELBACK',
  'blue mountain':           'BLUE MTN PA',
  'blue mountain resort':    'BLUE MTN PA',
  'shawnee mountain':        'SHAWNEE MTN',
  'sunday river':            'SUNDAY RIVER',
  'sugarloaf':               'SUGARLOAF',
  'saddleback':              'SADDLEBACK',
  'saddleback maine':        'SADDLEBACK',
  'saddleback mountain':     'SADDLEBACK',
  'loon mountain':           'LOON MTN',
  'loon mountain resort':    'LOON MTN',
  'attitash':                'ATTITASH',
  'wildcat':                 'WILDCAT',
  'wildcat mountain':        'WILDCAT',
  'cannon mountain':         'CANNON MTN',
  'waterville valley':       'WATERVILLE VLY',
  'mont-tremblant':          'MONT-TREMBLANT',
  'tremblant':               'MONT-TREMBLANT',
  'le massif':               'LE MASSIF',
  'le massif de charlevoix': 'LE MASSIF',
  'mont-sainte-anne':        'MONT-STE-ANNE',
  'mont sainte anne':        'MONT-STE-ANNE',
  'mountain creek resort':       'MOUNTAIN CREEK',
  'stratton mountain resort':    'STRATTON',
  'mount snow resort':           'MOUNT SNOW',
  'burke mountain resort':       'BURKE MTN',
  'magic mountain ski area':     'MAGIC MTN',
  'camelback mountain':          'CAMELBACK',
  'shawnee mountain ski area':   'SHAWNEE MTN',
  'attitash mountain resort':    'ATTITASH',
  'waterville valley resort':    'WATERVILLE VLY',
  'saddleback mountain resort':  'SADDLEBACK',
};

async function get(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'NJSkiHaus/1.0 (njskihaus.com)' },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const data = JSON.parse(text);
    return data;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// Step 1: get resort list for a state, return [{id, name}]
async function getResortList(state) {
  const url = `${BASE}/getResortList.php?apiKey=${SNOCOUNTRY_KEY}&states=${state}&output=json`;
  try {
    const data = await get(url);
    const items = data.items || data.resorts || (Array.isArray(data) ? data : []);
    return items.map(r => ({
      id:   r.id || r.resortId,
      name: r.resortName || r.name,
    }));
  } catch (e) {
    console.warn(`[scraper] getResortList(${state}) failed:`, e.message);
    return [];
  }
}

// Step 2: fetch conditions for a single resort by ID
async function getConditions(id, ourName) {
  const url = `${BASE}/getSnowReport.php?apiKey=${SNOCOUNTRY_KEY}&ids=${id}&output=json`;
  try {
    const data = await get(url);
    const items = data.items || data.resorts || (Array.isArray(data) ? data : []);
    if (!items.length) return { name: ourName, updatedAt: new Date().toISOString() };
    const r = items[0];

    const base   = parseFloat(r.avgBaseDepthMin)     || null;
    const new24  = parseFloat(r.newSnowMin)          || null;
    const new48  = parseFloat(r.snowLast48Hours)     || null;
    const tOpen  = parseInt(r.openDownHillTrails)    || null;
    const tTotal = parseInt(r.maxOpenDownHillTrails) || null;
    const lOpen  = parseInt(r.openDownHillLifts)     || null;
    const season = parseFloat(r.seasonTotal)         || null;

    return {
      name:        ourName,
      base,
      newSnow24:   new24,
      newSnow48:   new48,
      trailsOpen:  tOpen,
      trailsTotal: tTotal,
      liftsOpen:   lOpen,
      surface:     r.primarySurfaceCondition || null,
      season,
      status:      parseInt(r.resortStatus) <= 3 ? 'Open' : 'Closed',
      updatedAt:   r.reportDateTime || new Date().toISOString(),
      source:      'SnoCountry',
    };
  } catch (e) {
    console.warn(`  [✗] ${ourName} — ${e.message}`);
    return { name: ourName, updatedAt: new Date().toISOString() };
  }
}

async function runAllScrapers() {
  console.log('[scraper] Starting SnoCountry fetch...');
  const start = Date.now();

  // Step 1: get all resort lists in parallel
  const states = ['NJ', 'VT', 'NY', 'PA', 'NH', 'ME', 'QC'];
  const listResults = await Promise.allSettled(states.map(s => getResortList(s)));

  const allResorts = [];
  listResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[scraper] ${states[i]}: ${r.value.length} resorts in list`);
      allResorts.push(...r.value);
    }
  });

  // Log ALL names so we can verify mapping
  console.log('[scraper] All resort names from SnoCountry:');
  allResorts.forEach(r => console.log(`  id:${r.id} → "${r.name}"`));

  // Step 2: match to our mountains
  const matched = [];
  const seenOurNames = new Set();

  allResorts.forEach(r => {
    const key = (r.name || '').toLowerCase().trim();
    const ourName = NAME_MAP[key];
    if (ourName && !seenOurNames.has(ourName)) {
      matched.push({ id: r.id, ourName, snoName: r.name });
      seenOurNames.add(ourName);
    }
  });

  console.log(`[scraper] Matched ${matched.length} mountains — fetching conditions...`);

  // Step 3: fetch conditions for all matched mountains in parallel
  const results = await Promise.all(
    matched.map(m => getConditions(m.id, m.ourName))
  );

  results.forEach(m => {
    console.log(`  [${m.base != null ? '✓' : '~'}] ${m.name.padEnd(20)} base: ${m.base ?? '—'}" | new24: ${m.newSnow24 ?? '—'}" | trails: ${m.trailsOpen ?? '—'}/${m.trailsTotal ?? '—'} | surface: ${m.surface ?? '—'}`);
  });

  const successCount = results.filter(m => m.base != null).length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[scraper] Done in ${elapsed}s — ${successCount}/${results.length} mountains with live data`);

  return {
    mountains: results,
    scrapedAt: new Date().toISOString(),
    successCount,
    totalCount: results.length,
  };
}

module.exports = { runAllScrapers };
