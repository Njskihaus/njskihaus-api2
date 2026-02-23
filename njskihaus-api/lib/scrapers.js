/**
 * scrapers.js — NJ Ski Haus mountain conditions scrapers
 *
 * Each scraper returns this shape (all fields optional — null if unavailable):
 * {
 *   name:        string   — mountain name key matching the site
 *   base:        number   — base snow depth in inches
 *   summit:      number   — summit snow depth in inches (if reported)
 *   newSnow24:   number   — new snow last 24 hours in inches
 *   newSnow48:   number   — new snow last 48 hours in inches
 *   newSnow7d:   number   — new snow last 7 days in inches
 *   trailsOpen:  number   — trails currently open
 *   trailsTotal: number   — total trails at resort
 *   liftsOpen:   number   — lifts currently open
 *   liftsTotal:  number   — total lifts at resort
 *   surface:     string   — primary surface condition description
 *   season:      number   — season snowfall total in inches
 *   status:      string   — 'Open' | 'Closed' | 'Opening Soon'
 *   updatedAt:   string   — ISO timestamp of scrape
 *   source:      string   — URL that was scraped
 * }
 *
 * MAINTENANCE NOTES:
 * - If a scraper returns null for a field, the site shows the last known good value
 * - Run `npm run test-scrapers` to check which scrapers are working
 * - Most resort sites update their conditions pages between 6–8am each morning
 * - The cron runs at 7am EST (12:00 UTC) — adjust in vercel.json if needed
 */

const fetch   = require('node-fetch');
const cheerio = require('cheerio');

// ── Shared fetch helper ──
// Mimics a real browser to avoid bot detection
async function fetchPage(url, options = {}) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control':   'no-cache',
        ...options.headers,
      },
      ...options,
    });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function fetchJSON(url, options = {}) {
  const res = await fetchPage(url, {
    headers: { 'Accept': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

async function fetchHTML(url) {
  const res = await fetchPage(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const html = await res.text();
  return cheerio.load(html);
}

// ── Parsing helpers ──
function parseInches(str) {
  if (!str) return null;
  const n = parseFloat(String(str).replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function parseInt2(str) {
  if (!str) return null;
  const n = parseInt(String(str).replace(/[^0-9]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function cmToIn(cm) {
  if (cm == null) return null;
  return Math.round(cm / 2.54);
}

function now() {
  return new Date().toISOString();
}

// ══════════════════════════════════════════════════════════════════
// NEW JERSEY
// ══════════════════════════════════════════════════════════════════

async function mountainCreek() {
  // Mountain Creek publishes conditions at a straightforward HTML page
  const url = 'https://www.mountaincreek.com/mountain/snow-report';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'MOUNTAIN CREEK',
      base:        parseInches($('[class*="base"], [class*="Base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"][class*="trail"], [class*="trails-open"]').first().text()),
      trailsTotal: parseInt2($('[class*="total"][class*="trail"], [class*="trails-total"]').first().text()),
      surface:     $('[class*="surface"], [class*="condition"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('mountainCreek scraper failed:', e.message);
    return { name: 'MOUNTAIN CREEK', updatedAt: now(), source: url };
  }
}

// ══════════════════════════════════════════════════════════════════
// VERMONT
// ══════════════════════════════════════════════════════════════════

async function killington() {
  // Killington exposes a JSON conditions endpoint used by their website widget
  const url = 'https://www.killington.com/api/resort-stats';
  const fallbackUrl = 'https://www.killington.com/the-mountain/snow-report';
  try {
    const data = await fetchJSON(url);
    // Their API shape: data.snowReport.baseDepth, etc.
    const sr = data.snowReport || data.snow_report || data;
    return {
      name:        'KILLINGTON',
      base:        parseInches(sr.baseDepth || sr.base_depth || sr.base),
      summit:      parseInches(sr.summitDepth || sr.summit_depth || sr.summit),
      newSnow24:   parseInches(sr.last24Hours || sr.new_snow_24 || sr.snowfall24),
      newSnow48:   parseInches(sr.last48Hours || sr.new_snow_48 || sr.snowfall48),
      trailsOpen:  parseInt2(sr.openTrails || sr.trails_open),
      trailsTotal: parseInt2(sr.totalTrails || sr.trails_total),
      liftsOpen:   parseInt2(sr.openLifts || sr.lifts_open),
      liftsTotal:  parseInt2(sr.totalLifts || sr.lifts_total),
      surface:     sr.primarySurface || sr.surface_conditions || null,
      season:      parseInches(sr.seasonTotal || sr.season_total),
      status:      sr.status || sr.resortStatus || 'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch {
    // Fallback: scrape HTML conditions page
    try {
      const $ = await fetchHTML(fallbackUrl);
      return {
        name:        'KILLINGTON',
        base:        parseInches($('.snow-report__base, [data-value="base"]').first().text()),
        newSnow24:   parseInches($('[data-period="24h"], .snow-24').first().text()),
        trailsOpen:  parseInt2($('.trails-open, [data-label="Trails Open"]').first().text()),
        surface:     $('.surface-condition, .primary-surface').first().text().trim() || null,
        status:      'Open',
        updatedAt:   now(),
        source:      fallbackUrl,
      };
    } catch (e2) {
      console.warn('killington scraper failed:', e2.message);
      return { name: 'KILLINGTON', updatedAt: now(), source: fallbackUrl };
    }
  }
}

async function stowe() {
  // Stowe (Epic) — their conditions page uses structured data
  const url = 'https://www.stowe.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    // Stowe uses Vail's Mountain Report widget — look for specific data attributes
    return {
      name:        'STOWE',
      base:        parseInches($('[data-field="base-depth"], .conditions__base').first().text()),
      summit:      parseInches($('[data-field="summit-depth"], .conditions__summit').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"], [data-hours="24"]').first().text()),
      newSnow48:   parseInches($('[data-field="48hr-snowfall"], [data-hours="48"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"], .trails__open').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"], .trails__total').first().text()),
      liftsOpen:   parseInt2($('[data-field="open-lifts"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      season:      parseInches($('[data-field="season-total"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('stowe scraper failed:', e.message);
    return { name: 'STOWE', updatedAt: now(), source: url };
  }
}

async function stratton() {
  const url = 'https://www.stratton.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'STRATTON',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"]').first().text()),
      liftsOpen:   parseInt2($('[data-field="open-lifts"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('stratton scraper failed:', e.message);
    return { name: 'STRATTON', updatedAt: now(), source: url };
  }
}

async function sugarbush() {
  // Sugarbush has a dedicated conditions page with good HTML structure
  const url = 'https://www.sugarbush.com/mountain-info/mountain-report/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'SUGARBUSH',
      base:        parseInches($('.base-depth, [class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24hour"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="trails-open"]').first().text()),
      trailsTotal: parseInt2($('[class*="trails-total"]').first().text()),
      liftsOpen:   parseInt2($('[class*="lifts-open"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('sugarbush scraper failed:', e.message);
    return { name: 'SUGARBUSH', updatedAt: now(), source: url };
  }
}

async function pico() {
  // Pico shares Killington's resort system — try their specific page
  const url = 'https://www.picomountain.com/the-mountain/snow-report';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'PICO MTN',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="24"]').first().text()),
      trailsOpen:  parseInt2($('[class*="trails-open"]').first().text()),
      trailsTotal: parseInt2($('[class*="trails-total"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('pico scraper failed:', e.message);
    return { name: 'PICO MTN', updatedAt: now(), source: url };
  }
}

async function okemo() {
  const url = 'https://www.okemo.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'OKEMO',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('okemo scraper failed:', e.message);
    return { name: 'OKEMO', updatedAt: now(), source: url };
  }
}

async function mountSnow() {
  const url = 'https://www.mountsnow.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'MOUNT SNOW',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('mountSnow scraper failed:', e.message);
    return { name: 'MOUNT SNOW', updatedAt: now(), source: url };
  }
}

async function jayPeak() {
  // Jay Peak has one of the best snow report pages — simple structured HTML
  const url = 'https://jaypeakresort.com/mountain-report';
  try {
    const $ = await fetchHTML(url);
    // Jay Peak uses clear class names on their report widget
    const baseText    = $('[class*="snow-depth"], [class*="base-depth"]').first().text();
    const newSnowText = $('[class*="new-snow"], [class*="overnight"]').first().text();
    const seasonText  = $('[class*="season-total"]').first().text();
    // Also try their structured data table
    const tableData   = {};
    $('table tr, .report-row').each((_, el) => {
      const label = $(el).find('td:first-child, .label').text().toLowerCase().trim();
      const val   = $(el).find('td:last-child, .value').text().trim();
      if (label.includes('base'))   tableData.base   = val;
      if (label.includes('24'))     tableData.new24  = val;
      if (label.includes('48'))     tableData.new48  = val;
      if (label.includes('season')) tableData.season = val;
      if (label.includes('open') && label.includes('trail')) tableData.trailsOpen = val;
    });
    return {
      name:        'JAY PEAK',
      base:        parseInches(baseText || tableData.base),
      newSnow24:   parseInches(newSnowText || tableData.new24),
      newSnow48:   parseInches(tableData.new48),
      trailsOpen:  parseInt2($('[class*="trails-open"]').first().text() || tableData.trailsOpen),
      trailsTotal: parseInt2($('[class*="trails-total"]').first().text()),
      season:      parseInches(seasonText || tableData.season),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('jayPeak scraper failed:', e.message);
    return { name: 'JAY PEAK', updatedAt: now(), source: url };
  }
}

async function burke() {
  const url = 'https://skiburke.com/mountain/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'BURKE MTN',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="new-snow"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      surface:     $('[class*="surface"], [class*="condition"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('burke scraper failed:', e.message);
    return { name: 'BURKE MTN', updatedAt: now(), source: url };
  }
}

async function boltonValley() {
  const url = 'https://www.boltonvalley.com/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'BOLTON VALLEY',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      season:      parseInches($('[class*="season"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('boltonValley scraper failed:', e.message);
    return { name: 'BOLTON VALLEY', updatedAt: now(), source: url };
  }
}

async function magic() {
  const url = 'https://www.magicmtn.com/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'MAGIC MTN',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="new"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      season:      parseInches($('[class*="season"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('magic scraper failed:', e.message);
    return { name: 'MAGIC MTN', updatedAt: now(), source: url };
  }
}

// ══════════════════════════════════════════════════════════════════
// NEW YORK
// ══════════════════════════════════════════════════════════════════

async function hunter() {
  const url = 'https://www.huntermtn.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'HUNTER MTN',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('hunter scraper failed:', e.message);
    return { name: 'HUNTER MTN', updatedAt: now(), source: url };
  }
}

async function whiteface() {
  // Whiteface (NY state) — Olympic Regional Development Authority site
  const url = 'https://www.whiteface.com/mountain-report';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'WHITEFACE',
      base:        parseInches($('[class*="base"]').first().text()),
      summit:      parseInches($('[class*="summit"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="trails-open"], [class*="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[class*="trails-total"]').first().text()),
      liftsOpen:   parseInt2($('[class*="lifts-open"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('whiteface scraper failed:', e.message);
    return { name: 'WHITEFACE', updatedAt: now(), source: url };
  }
}

async function gore() {
  // Gore Mountain — also ORDA (same system as Whiteface)
  const url = 'https://www.goremountain.com/mountain-report';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'GORE MTN',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="trails-open"]').first().text()),
      trailsTotal: parseInt2($('[class*="trails-total"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('gore scraper failed:', e.message);
    return { name: 'GORE MTN', updatedAt: now(), source: url };
  }
}

async function belleayre() {
  const url = 'https://www.belleayre.com/mountain-report';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'BELLEAYRE',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('belleayre scraper failed:', e.message);
    return { name: 'BELLEAYRE', updatedAt: now(), source: url };
  }
}

async function catamount() {
  const url = 'https://www.catamountski.com/mountain-report/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'CATAMOUNT',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="new"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('catamount scraper failed:', e.message);
    return { name: 'CATAMOUNT', updatedAt: now(), source: url };
  }
}

async function greekPeak() {
  const url = 'https://www.greekpeak.net/mountain-report/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'GREEK PEAK',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="new"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('greekPeak scraper failed:', e.message);
    return { name: 'GREEK PEAK', updatedAt: now(), source: url };
  }
}

async function westMtn() {
  const url = 'https://www.westmtn.net/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'WEST MTN',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="new"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('westMtn scraper failed:', e.message);
    return { name: 'WEST MTN', updatedAt: now(), source: url };
  }
}

// ══════════════════════════════════════════════════════════════════
// EASTERN PENNSYLVANIA
// ══════════════════════════════════════════════════════════════════

async function camelback() {
  const url = 'https://www.camelbackresort.com/ski-snow/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'CAMELBACK',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="trails-open"], [class*="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[class*="trails-total"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('camelback scraper failed:', e.message);
    return { name: 'CAMELBACK', updatedAt: now(), source: url };
  }
}

async function blueMtnPA() {
  const url = 'https://www.skibluemt.com/mountain/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'BLUE MTN PA',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('blueMtnPA scraper failed:', e.message);
    return { name: 'BLUE MTN PA', updatedAt: now(), source: url };
  }
}

async function shawnee() {
  const url = 'https://www.shawneemt.com/mountain/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'SHAWNEE MTN',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="24"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('shawnee scraper failed:', e.message);
    return { name: 'SHAWNEE MTN', updatedAt: now(), source: url };
  }
}

// ══════════════════════════════════════════════════════════════════
// NEW HAMPSHIRE & MAINE
// ══════════════════════════════════════════════════════════════════

async function sundayRiver() {
  const url = 'https://www.sundayriver.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'SUNDAY RIVER',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      summit:      parseInches($('[data-field="summit-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      newSnow48:   parseInches($('[data-field="48hr-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"]').first().text()),
      liftsOpen:   parseInt2($('[data-field="open-lifts"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('sundayRiver scraper failed:', e.message);
    return { name: 'SUNDAY RIVER', updatedAt: now(), source: url };
  }
}

async function sugarloaf() {
  const url = 'https://www.sugarloaf.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'SUGARLOAF',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      summit:      parseInches($('[data-field="summit-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      season:      parseInches($('[data-field="season-total"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('sugarloaf scraper failed:', e.message);
    return { name: 'SUGARLOAF', updatedAt: now(), source: url };
  }
}

async function saddleback() {
  const url = 'https://www.saddlebackmaine.com/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'SADDLEBACK',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      season:      parseInches($('[class*="season"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('saddleback scraper failed:', e.message);
    return { name: 'SADDLEBACK', updatedAt: now(), source: url };
  }
}

async function loon() {
  const url = 'https://www.loonmtn.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'LOON MTN',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      trailsTotal: parseInt2($('[data-field="total-trails"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('loon scraper failed:', e.message);
    return { name: 'LOON MTN', updatedAt: now(), source: url };
  }
}

async function attitash() {
  const url = 'https://www.attitash.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'ATTITASH',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('attitash scraper failed:', e.message);
    return { name: 'ATTITASH', updatedAt: now(), source: url };
  }
}

async function wildcat() {
  const url = 'https://www.skiwildcat.com/the-mountain/mountain-report.aspx';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'WILDCAT',
      base:        parseInches($('[data-field="base-depth"]').first().text()),
      newSnow24:   parseInches($('[data-field="overnight-snowfall"]').first().text()),
      trailsOpen:  parseInt2($('[data-field="open-trails"]').first().text()),
      surface:     $('[data-field="surface-conditions"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('wildcat scraper failed:', e.message);
    return { name: 'WILDCAT', updatedAt: now(), source: url };
  }
}

async function cannon() {
  // Cannon — New Hampshire state park system
  const url = 'https://www.cannonmt.com/mountain-report/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'CANNON MTN',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="24"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      trailsTotal: parseInt2($('[class*="total"]').first().text()),
      season:      parseInches($('[class*="season"]').first().text()),
      surface:     $('[class*="surface"]').first().text().trim() || null,
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('cannon scraper failed:', e.message);
    return { name: 'CANNON MTN', updatedAt: now(), source: url };
  }
}

async function watervilleValley() {
  const url = 'https://www.waterville.com/mountain-report/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'WATERVILLE VLY',
      base:        parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="overnight"], [class*="24"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('watervilleValley scraper failed:', e.message);
    return { name: 'WATERVILLE VLY', updatedAt: now(), source: url };
  }
}

// ══════════════════════════════════════════════════════════════════
// CANADA
// ══════════════════════════════════════════════════════════════════

async function tremblant() {
  // Mont-Tremblant — they publish conditions as JSON for their widget
  const url = 'https://www.tremblant.ca/api/mountain-conditions';
  const fallbackUrl = 'https://www.tremblant.ca/en/ski/conditions';
  try {
    // Try JSON first
    const data = await fetchJSON(url);
    const d = data.conditions || data;
    return {
      name:        'MONT-TREMBLANT',
      base:        cmToIn(d.baseDepthCm) || parseInches(d.baseDepth),
      summit:      cmToIn(d.summitDepthCm),
      newSnow24:   cmToIn(d.newSnow24hCm) || parseInches(d.newSnow24h),
      trailsOpen:  parseInt2(d.openTrails || d.openRuns),
      trailsTotal: parseInt2(d.totalTrails || d.totalRuns),
      liftsOpen:   parseInt2(d.openLifts),
      surface:     d.surfaceConditions || d.surface || null,
      season:      cmToIn(d.seasonTotalCm) || parseInches(d.seasonTotal),
      status:      d.status || 'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch {
    try {
      const $ = await fetchHTML(fallbackUrl);
      return {
        name:        'MONT-TREMBLANT',
        base:        parseInches($('[class*="base"], [class*="neige"]').first().text()),
        newSnow24:   parseInches($('[class*="24h"], [class*="overnight"]').first().text()),
        trailsOpen:  parseInt2($('[class*="open"], [class*="ouvert"]').first().text()),
        status:      'Open',
        updatedAt:   now(),
        source:      fallbackUrl,
      };
    } catch (e2) {
      console.warn('tremblant scraper failed:', e2.message);
      return { name: 'MONT-TREMBLANT', updatedAt: now(), source: fallbackUrl };
    }
  }
}

async function leMassif() {
  // Le Massif de Charlevoix
  const url = 'https://www.lemassif.com/en/mountain/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'LE MASSIF',
      base:        cmToIn(parseInches($('[class*="base"], [class*="neige"]').first().text()) * 2.54) ||
                   parseInches($('[class*="base"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="chute"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"], [class*="ouvert"]').first().text()),
      season:      parseInches($('[class*="season"], [class*="saison"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('leMassif scraper failed:', e.message);
    return { name: 'LE MASSIF', updatedAt: now(), source: url };
  }
}

async function montSteAnne() {
  const url = 'https://www.mont-sainte-anne.com/en/ski/conditions/';
  try {
    const $ = await fetchHTML(url);
    return {
      name:        'MONT-STE-ANNE',
      base:        parseInches($('[class*="base"], [class*="neige"]').first().text()),
      newSnow24:   parseInches($('[class*="24"], [class*="overnight"]').first().text()),
      trailsOpen:  parseInt2($('[class*="open"], [class*="ouvert"]').first().text()),
      status:      'Open',
      updatedAt:   now(),
      source:      url,
    };
  } catch (e) {
    console.warn('montSteAnne scraper failed:', e.message);
    return { name: 'MONT-STE-ANNE', updatedAt: now(), source: url };
  }
}

// ══════════════════════════════════════════════════════════════════
// MASTER SCRAPER LIST
// Add/remove mountains here — everything else auto-updates
// ══════════════════════════════════════════════════════════════════

const ALL_SCRAPERS = [
  mountainCreek,
  killington,
  stowe,
  stratton,
  sugarbush,
  pico,
  okemo,
  mountSnow,
  jayPeak,
  burke,
  boltonValley,
  magic,
  hunter,
  whiteface,
  gore,
  belleayre,
  catamount,
  greekPeak,
  westMtn,
  camelback,
  blueMtnPA,
  shawnee,
  sundayRiver,
  sugarloaf,
  saddleback,
  loon,
  attitash,
  wildcat,
  cannon,
  watervilleValley,
  tremblant,
  leMassif,
  montSteAnne,
];

/**
 * runAllScrapers — runs all scrapers in parallel with Promise.allSettled
 * Failed scrapers return their name + null data, never crash the whole run.
 * Returns array of results sorted by name.
 */
async function runAllScrapers() {
  console.log(`[scraper] Starting run for ${ALL_SCRAPERS.length} mountains...`);
  const start = Date.now();

  const settled = await Promise.allSettled(
    ALL_SCRAPERS.map(fn => fn())
  );

  const results = [];
  let successCount = 0;

  settled.forEach((result, i) => {
    const fnName = ALL_SCRAPERS[i].name;
    if (result.status === 'fulfilled') {
      const data = result.value;
      // Count as success if we got at least a base depth
      if (data.base != null) successCount++;
      results.push(data);
      console.log(`  [${data.base != null ? '✓' : '~'}] ${data.name} — base: ${data.base ?? 'n/a'}", new: ${data.newSnow24 ?? 'n/a'}"`);
    } else {
      console.warn(`  [✗] ${fnName} — ERROR: ${result.reason?.message}`);
      results.push({ name: fnName.toUpperCase(), updatedAt: now() });
    }
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[scraper] Done in ${elapsed}s — ${successCount}/${ALL_SCRAPERS.length} mountains with live base depth`);

  return {
    mountains: results,
    scrapedAt: now(),
    successCount,
    totalCount: ALL_SCRAPERS.length,
  };
}

module.exports = { runAllScrapers, ALL_SCRAPERS };
