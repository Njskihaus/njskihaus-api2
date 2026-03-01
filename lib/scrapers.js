/**
 * scrapers.js — NJ Ski Haus mountain conditions
 *
 * PRIMARY: SnoCountry API — base depth, trails, lifts, surface, new snow
 * SECONDARY: OnTheSnow — season snowfall totals (SnoCountry doesn't provide this)
 *
 * Both run in parallel, then results are merged.
 */

const fetch = require('node-fetch');

const SNOCOUNTRY_KEY = process.env.SNOCOUNTRY_API_KEY || 'SnoCountry.example';
const BASE = 'http://feeds.snocountry.net';

// ── MANUAL SEASON TOTALS ──────────────────────────────────────────────────────
// Update these weekly for mountains that don't auto-report season totals.
// SnoCountry values (when available) will override these automatically.
// Last updated: 2026-03-01
const MANUAL_SEASON_TOTALS = {
  'MOUNTAIN CREEK':  42,   // NJ avg season ~37", above avg year
  'KILLINGTON':      173,  // verified 3/1/26
  'STOWE':           254,  // verified 3/1/26
  'STRATTON':        120,  // 111" as of 2/9, ~9" since
  'SUGARBUSH':       194,  // verified 3/1/26
  'PICO MTN':        130,  // tracks with Killington area, slightly less
  'OKEMO':           95,   // 86" as of 2/9, ~9" since
  'MOUNT SNOW':      99,   // 90" as of 2/9, ~9" since
  'JAY PEAK':        358,  // verified 3/1/26 (~352-360" range)
  'BURKE MTN':       210,  // tracks with northern VT, slightly less than Bolton
  'BOLTON VALLEY':   254,  // verified 3/1/26
  'MAGIC MTN':       84,   // 75" as of 2/9, ~9" since
  'HUNTER MTN':      76,   // 67" as of 2/9, ~9" since
  'WHITEFACE':       170,  // 160" as of 2/9, ~10" since
  'GORE MTN':        78,   // 69" as of 2/9, ~9" since
  'BELLEAYRE':       89,   // 80" as of 2/9, ~9" since
  'CATAMOUNT':       70,   // NY Berkshires area estimate
  'GREEK PEAK':      75,   // central NY estimate
  'WEST MTN':        72,   // tracks with Gore area
  'CAMELBACK':       55,   // Poconos avg ~40-50" season, above avg year
  'BLUE MTN PA':     52,   // similar to Camelback
  'SHAWNEE MTN':     48,   // similar to Poconos area
  'SUNDAY RIVER':    95,   // 82" as of 2/9, ~13" since (storms hit ME well)
  'SUGARLOAF':       107,  // verified 3/1/26
  'SADDLEBACK':      140,  // 129" as of 2/9, ~11" since
  'LOON MTN':        110,  // NH mid-season estimate, good year
  'ATTITASH':        70,   // 58" as of 2/9, ~12" since
  'WILDCAT':         93,   // 80" as of 2/9, ~13" since (northern NH)
  'CANNON MTN':      155,  // 144" as of 2/9, ~11" since
  'WATERVILLE VLY':  95,   // NH central, solid year
  'MONT-TREMBLANT':  145,  // Quebec Laurentians good season
  'LE MASSIF':       215,  // Charlevoix avg ~550cm/yr, above avg year ~215"
  'MONT-STE-ANNE':   170,  // avg ~500cm/yr, above avg year ~170"
};
// ─────────────────────────────────────────────────────────────────────────────

// SnoCountry name (lowercase) → our display name
const NAME_MAP = {
  'mountain creek resort':       'MOUNTAIN CREEK',
  'mountain creek':              'MOUNTAIN CREEK',
  'killington resort':           'KILLINGTON',
  'killington':                  'KILLINGTON',
  'stowe mountain resort':       'STOWE',
  'stowe':                       'STOWE',
  'stratton mountain resort':    'STRATTON',
  'stratton mountain':           'STRATTON',
  'stratton':                    'STRATTON',
  'sugarbush resort':            'SUGARBUSH',
  'sugarbush':                   'SUGARBUSH',
  'pico mountain':               'PICO MTN',
  'pico':                        'PICO MTN',
  'okemo mountain resort':       'OKEMO',
  'okemo':                       'OKEMO',
  'mount snow resort':           'MOUNT SNOW',
  'mount snow':                  'MOUNT SNOW',
  'jay peak resort':             'JAY PEAK',
  'jay peak':                    'JAY PEAK',
  'burke mountain resort':       'BURKE MTN',
  'burke mountain':              'BURKE MTN',
  'burke':                       'BURKE MTN',
  'bolton valley resort':        'BOLTON VALLEY',
  'bolton valley':               'BOLTON VALLEY',
  'magic mountain ski area':     'MAGIC MTN',
  'magic mountain':              'MAGIC MTN',
  'magic':                       'MAGIC MTN',
  'hunter mountain':             'HUNTER MTN',
  'hunter':                      'HUNTER MTN',
  'whiteface mountain':          'WHITEFACE',
  'whiteface':                   'WHITEFACE',
  'gore mountain':               'GORE MTN',
  'gore':                        'GORE MTN',
  'belleayre mountain':          'BELLEAYRE',
  'belleayre':                   'BELLEAYRE',
  'catamount':                   'CATAMOUNT',
  'greek peak mountain resort':  'GREEK PEAK',
  'greek peak':                  'GREEK PEAK',
  'west mountain':               'WEST MTN',
  'camelback mountain':          'CAMELBACK',
  'camelback mountain resort':   'CAMELBACK',
  'camelback':                   'CAMELBACK',
  'blue mountain resort':        'BLUE MTN PA',
  'blue mountain':               'BLUE MTN PA',
  'shawnee mountain ski area':   'SHAWNEE MTN',
  'shawnee mountain':            'SHAWNEE MTN',
  'sunday river':                'SUNDAY RIVER',
  'sugarloaf':                   'SUGARLOAF',
  'saddleback mountain resort':  'SADDLEBACK',
  'saddleback mountain':         'SADDLEBACK',
  'saddleback maine':            'SADDLEBACK',
  'saddleback':                  'SADDLEBACK',
  'loon mountain resort':        'LOON MTN',
  'loon mountain':               'LOON MTN',
  'attitash mountain resort':    'ATTITASH',
  'attitash':                    'ATTITASH',
  'wildcat mountain':            'WILDCAT',
  'wildcat':                     'WILDCAT',
  'cannon mountain':             'CANNON MTN',
  'waterville valley resort':    'WATERVILLE VLY',
  'waterville valley':           'WATERVILLE VLY',
  'tremblant':                   'MONT-TREMBLANT',
  'mont-tremblant':              'MONT-TREMBLANT',
  'le massif de charlevoix':     'LE MASSIF',
  'le massif':                   'LE MASSIF',
  'mont sainte anne':            'MONT-STE-ANNE',
  'mont-sainte-anne':            'MONT-STE-ANNE',
};

// OnTheSnow URL slugs — verified against live OTS URLs
// Format: https://www.onthesnow.com/[slug]/skireport
const OTS_SLUGS = {
  'MOUNTAIN CREEK':  'new-jersey/mountain-creek-resort',
  'KILLINGTON':      'vermont/killington-resort',
  'STOWE':           'vermont/stowe-mountain-resort',
  'STRATTON':        'vermont/stratton-mountain-resort',
  'SUGARBUSH':       'vermont/sugarbush',             // NOT sugarbush-resort
  'PICO MTN':        'vermont/pico-mountain',
  'OKEMO':           'vermont/okemo-mountain-resort',
  'MOUNT SNOW':      'vermont/mount-snow',
  'JAY PEAK':        'vermont/jay-peak-resort',
  'BURKE MTN':       'vermont/burke-mountain',
  'BOLTON VALLEY':   'vermont/bolton-valley-resort',
  'MAGIC MTN':       'vermont/magic-mountain',        // NOT magic-mountain-ski-area
  'HUNTER MTN':      'new-york/hunter-mountain',
  'WHITEFACE':       'new-york/whiteface-mountain',
  'GORE MTN':        'new-york/gore-mountain',
  'BELLEAYRE':       'new-york/belleayre-mountain',
  'CATAMOUNT':       'new-york/catamount-ski-area',
  'GREEK PEAK':      'new-york/greek-peak-mountain-resort',
  'WEST MTN':        'new-york/west-mountain',
  'CAMELBACK':       'pennsylvania/camelback-mountain-resort',
  'BLUE MTN PA':     'pennsylvania/blue-mountain-resort',
  'SHAWNEE MTN':     'pennsylvania/shawnee-mountain-ski-area',
  'SUNDAY RIVER':    'maine/sunday-river',
  'SUGARLOAF':       'maine/sugarloaf',
  'SADDLEBACK':      'maine/saddleback-mountain',
  'LOON MTN':        'new-hampshire/loon-mountain-resort',
  'ATTITASH':        'new-hampshire/attitash-mountain-resort',
  'WILDCAT':         'new-hampshire/wildcat-mountain',
  'CANNON MTN':      'new-hampshire/cannon-mountain',
  'WATERVILLE VLY':  'new-hampshire/waterville-valley-resort',
  'MONT-TREMBLANT':  'quebec/mont-tremblant',
  'LE MASSIF':       'quebec/le-massif-de-charlevoix',
  'MONT-STE-ANNE':   'quebec/mont-sainte-anne',
};

// ── HTTP helper ──
async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchJSON(url, timeoutMs = 12000) {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text);
}

// ── SnoCountry: get resort list for a state ──
async function getResortList(state) {
  const url = `${BASE}/getResortList.php?apiKey=${SNOCOUNTRY_KEY}&states=${state}&output=json`;
  try {
    const data = await fetchJSON(url);
    const items = data.items || data.resorts || (Array.isArray(data) ? data : []);
    return items.map(r => ({ id: r.id || r.resortId, name: r.resortName || r.name }));
  } catch (e) {
    console.warn(`[snocountry] getResortList(${state}) failed:`, e.message);
    return [];
  }
}

// ── SnoCountry: fetch conditions for one resort ──
async function getConditions(id, ourName) {
  const url = `${BASE}/getSnowReport.php?apiKey=${SNOCOUNTRY_KEY}&ids=${id}&output=json`;
  try {
    const data = await fetchJSON(url);
    const items = data.items || data.resorts || (Array.isArray(data) ? data : []);
    if (!items.length) return { name: ourName, updatedAt: new Date().toISOString() };
    const r = items[0];
    return {
      name:        ourName,
      base:        parseFloat(r.avgBaseDepthMin)     || null,
      newSnow24:   parseFloat(r.newSnowMin)          || null,
      newSnow48:   parseFloat(r.snowLast48Hours)     || null,
      trailsOpen:  parseInt(r.openDownHillTrails)    || null,
      trailsTotal: parseInt(r.maxOpenDownHillTrails) || null,
      liftsOpen:   parseInt(r.openDownHillLifts)     || null,
      surface:     r.primarySurfaceCondition         || null,
      season:      null, // filled in by OnTheSnow
      status:      parseInt(r.resortStatus) <= 3 ? 'Open' : 'Closed',
      updatedAt:   r.reportDateTime || new Date().toISOString(),
      source:      'SnoCountry',
    };
  } catch (e) {
    console.warn(`  [✗] ${ourName} SnoCountry failed:`, e.message);
    return { name: ourName, updatedAt: new Date().toISOString() };
  }
}

// ── OnTheSnow: scrape season total for one resort ──
// OTS renders a Next.js page with __NEXT_DATA__ JSON in the HTML — parse that
async function getSeasonTotal(ourName) {
  const slug = OTS_SLUGS[ourName];
  if (!slug) return null;
  const url = `https://www.onthesnow.com/${slug}/skireport`;
  try {
    const html = await fetchText(url, 15000);
    // Extract __NEXT_DATA__ JSON blob
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) {
      // Fallback: look for season total in plain text patterns
      const stMatch = html.match(/season(?:\s+total)?[:\s]+(\d+)["'\s]*(?:in|"|inches)/i) ||
                      html.match(/(\d+)["'\s]*(?:in|inches)[^\w]*season/i);
      if (stMatch) return parseFloat(stMatch[1]);
      console.warn(`  [~] ${ourName} OTS: no __NEXT_DATA__ found`);
      return null;
    }
    const nextData = JSON.parse(match[1]);
    // Drill into the page props to find season snowfall
    const props = nextData?.props?.pageProps;
    // Try various paths OTS uses
    const report = props?.snowReport || props?.report || props?.resort?.snowReport || {};
    const season = report?.seasonSnowfall ?? report?.seasonTotal ?? report?.season_total ?? null;
    if (season != null) {
      // OTS returns cm — convert to inches
      const inches = Math.round(parseFloat(season) / 2.54);
      if (inches > 0 && inches < 1000) return inches;
    }
    // Try searching raw JSON for seasonSnowfall
    const rawMatch = match[1].match(/"seasonSnowfall"\s*:\s*(\d+\.?\d*)/);
    if (rawMatch) {
      const inches = Math.round(parseFloat(rawMatch[1]) / 2.54);
      if (inches > 0 && inches < 1000) return inches;
    }
    const rawMatch2 = match[1].match(/"seasonTotal"\s*:\s*(\d+\.?\d*)/);
    if (rawMatch2) {
      const val = parseFloat(rawMatch2[1]);
      // Could be inches or cm — if > 200 assume cm
      const inches = val > 200 ? Math.round(val / 2.54) : Math.round(val);
      if (inches > 0 && inches < 1000) return inches;
    }
    return null;
  } catch (e) {
    console.warn(`  [~] ${ourName} OTS failed:`, e.message);
    return null;
  }
}

// ── Main orchestrator ──
async function runAllScrapers() {
  console.log('[scraper] Starting SnoCountry + OnTheSnow fetch...');
  const start = Date.now();

  // ── Phase 1: SnoCountry conditions ──
  const states = ['NJ', 'VT', 'NY', 'PA', 'NH', 'ME', 'QC'];
  const listResults = await Promise.allSettled(states.map(s => getResortList(s)));

  const allResorts = [];
  listResults.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`[snocountry] ${states[i]}: ${r.value.length} resorts`);
      allResorts.push(...r.value);
    }
  });

  // Match resorts to our mountains
  const matched = [];
  const seenOurNames = new Set();
  allResorts.forEach(r => {
    const key = (r.name || '').toLowerCase().trim();
    const ourName = NAME_MAP[key];
    if (ourName && !seenOurNames.has(ourName)) {
      matched.push({ id: r.id, ourName });
      seenOurNames.add(ourName);
    }
  });

  console.log(`[snocountry] Matched ${matched.length} mountains`);

  // Fetch conditions for all matched mountains
  const conditionsResults = await Promise.all(
    matched.map(m => getConditions(m.id, m.ourName))
  );

  // ── Phase 2: OnTheSnow season totals (in parallel with small delay batches) ──
  console.log('[ots] Fetching season totals from OnTheSnow...');
  const allOurNames = Object.keys(OTS_SLUGS);

  // Batch in groups of 8 to avoid overwhelming OTS
  const seasonTotals = {};
  const batchSize = 8;
  for (let i = 0; i < allOurNames.length; i += batchSize) {
    const batch = allOurNames.slice(i, i + batchSize);
    const results = await Promise.allSettled(batch.map(name => getSeasonTotal(name)));
    results.forEach((r, j) => {
      const name = batch[j];
      seasonTotals[name] = r.status === 'fulfilled' ? r.value : null;
      if (seasonTotals[name]) {
        console.log(`  [✓] ${name.padEnd(20)} season: ${seasonTotals[name]}"`);
      } else {
        console.log(`  [~] ${name.padEnd(20)} season: —`);
      }
    });
    // Small delay between batches
    if (i + batchSize < allOurNames.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  // ── Merge season totals: SnoCountry → OTS → Manual override ──
  const finalResults = conditionsResults.map(m => ({
    ...m,
    // Priority: SnoCountry field (most accurate) → OTS scrape → manual fallback
    season: m.season ?? seasonTotals[m.name] ?? MANUAL_SEASON_TOTALS[m.name] ?? null,
  }));

  finalResults.forEach(m => {
    console.log(`  [${m.base != null ? '✓' : '~'}] ${m.name.padEnd(20)} base: ${m.base ?? '—'}" | season: ${m.season ?? '—'}" | trails: ${m.trailsOpen ?? '—'}/${m.trailsTotal ?? '—'}`);
  });

  const successCount = finalResults.filter(m => m.base != null).length;
  const seasonCount = finalResults.filter(m => m.season != null).length;
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[scraper] Done in ${elapsed}s — ${successCount}/${finalResults.length} with base depth, ${seasonCount}/${finalResults.length} with season total`);

  return {
    mountains:    finalResults,
    scrapedAt:    new Date().toISOString(),
    successCount,
    totalCount:   finalResults.length,
  };
}

module.exports = { runAllScrapers };
