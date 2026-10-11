import { Router } from 'express';

const router = Router();
const ONEMAP_SEARCH = 'https://www.onemap.gov.sg/api/common/elastic/search';
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // query -> { at, results }

// GET /api/geocode?q=252 north bridge road
// Proxies the public OneMap search API (no token needed) and returns a compact shape.
router.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q.length < 3) return res.json({ results: [] });

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json({ results: hit.results });

  let data;
  try {
    const url = `${ONEMAP_SEARCH}?searchVal=${encodeURIComponent(q)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`OneMap responded ${r.status}`);
    data = await r.json();
  } catch (err) {
    console.error('OneMap lookup failed:', err.message);
    return res.status(502).json({ error: 'Address lookup is unavailable right now. Please try again.' });
  }

  const results = (data.results || []).slice(0, 8).map((r) => ({
    address: r.ADDRESS,
    postal: r.POSTAL === 'NIL' ? '' : r.POSTAL,
    lat: Number(r.LATITUDE),
    lng: Number(r.LONGITUDE),
  }));
  if (cache.size > 500) cache.clear();
  cache.set(key, { at: Date.now(), results });
  res.json({ results });
});

export default router;
