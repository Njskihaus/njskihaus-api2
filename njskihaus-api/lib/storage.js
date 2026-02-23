/**
 * storage.js — KV abstraction layer
 * 
 * In production (Vercel): uses @vercel/kv (Redis-backed key-value store)
 * In development (local): falls back to a local JSON file at /tmp/njskihaus-cache.json
 * 
 * To set up Vercel KV:
 *   1. vercel login
 *   2. vercel link  (links your local folder to your Vercel project)
 *   3. vercel env pull .env.local  (pulls KV_URL etc into .env.local)
 */

const fs   = require('fs');
const path = require('path');

const LOCAL_FILE = path.join('/tmp', 'njskihaus-cache.json');
const KV_KEY     = 'conditions_v1';

// ── Vercel KV (production) ──
async function kvGet(key) {
  try {
    const { kv } = require('@vercel/kv');
    return await kv.get(key);
  } catch {
    return null;
  }
}

async function kvSet(key, value) {
  try {
    const { kv } = require('@vercel/kv');
    // TTL: 36 hours — ensures stale data expires if cron misses a day
    await kv.set(key, value, { ex: 60 * 60 * 36 });
    return true;
  } catch {
    return false;
  }
}

// ── Local file fallback (development) ──
function localGet() {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return null;
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function localSet(value) {
  try {
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(value, null, 2));
    return true;
  } catch {
    return false;
  }
}

// ── Public interface ──
const isProduction = !!(process.env.KV_URL || process.env.KV_REST_API_URL);

async function getData() {
  if (isProduction) {
    return await kvGet(KV_KEY);
  }
  return localGet();
}

async function setData(value) {
  const payload = {
    ...value,
    storedAt: new Date().toISOString(),
  };
  if (isProduction) {
    return await kvSet(KV_KEY, payload);
  }
  return localSet(payload);
}

module.exports = { getData, setData, KV_KEY };
