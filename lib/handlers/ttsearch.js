// VEXORA API - TikTok search
// GET /api/ttsearch?q=<search text>
// Returns: { status, result: [ { title, author, duration, download_url, cover } ] }
//
// Backend history (why it looks like this):
//  - tikwm's own /api/feed/search sits behind a Cloudflare challenge for
//    server IPs (returns an HTML "Just a moment" page), so it is unusable.
//  - Urlebird search works from home-type IPs but blocks Vercel's range
//    (kept below as a zero-cost fallback).
//  - The apidojo search actor on Apify worked during testing, then started
//    returning {"noResults": true} for every query (its TikTok route got
//    blocked) - so it was replaced.
//  - PRIMARY now: the novi/advanced-search-tiktok-api actor on Apify
//    (pay-per-result, $0.0004 per result on the free tier - a search costs
//    about a fifth of a cent of the same monthly credit the Instagram
//    endpoints use). It returns raw TikTok-shaped items; the direct
//    no-watermark URL is lifted out of video.download_no_watermark_addr.
// Only this file changes if the backend ever swaps again.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return 'Unknown';
  const s = Math.round(Number(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

// The actor returns some nested fields as stringified blobs; the first
// https URL inside one is the usable address.
function firstUrl(s) {
  if (!s) return null;
  const m = String(s).match(/https:[^"',\]\s]+/);
  return m ? m[0].replace(/\\\//g, '/') : null;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ---------- Primary: Apify novi search actor ---------- */
async function searchViaNovi(q, token) {
  const r = await fetch('https://api.apify.com/v2/acts/novi~advanced-search-tiktok-api/run-sync-get-dataset-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(token).trim() },
    body: JSON.stringify({ keywords: [q], limit: 5 }),
    signal: AbortSignal.timeout(55000)
  });
  if (!r.ok) return [];
  const items = await r.json();
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    if (!it || it.noResults) continue;
    const v = it.video || {};
    let url = firstUrl(v.download_no_watermark_addr) || firstUrl(v.play_addr) || firstUrl(v.download_addr);
    if (!url && it.aweme_id) {
      const resolved = await resolveVideo(String(it.aweme_id)).catch(() => null);
      if (resolved) url = resolved.download_url;
    }
    if (!url) continue;
    out.push({
      title: it.desc || it.search_desc || 'TikTok Video',
      author: (it.author && it.author.nickname) || 'Unknown',
      duration: fmtDuration(v.duration != null ? Number(v.duration) / 1000 : null),
      download_url: url,
      cover: firstUrl(v.cover) || firstUrl(v.origin_cover) || null
    });
    if (out.length >= 4) break;
  }
  return out;
}

/* ---------- Fallback: Urlebird IDs + tikwm resolve ---------- */
async function searchIdsOnce(q) {
  const r = await fetch('https://urlebird.com/search/?q=' + encodeURIComponent(q), {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(20000)
  });
  if (!r.ok) return [];
  const html = await r.text();
  const ids = [];
  const seen = new Set();
  for (const m of html.matchAll(/urlebird\.com\/video\/(\d{10,})/g)) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
    if (ids.length >= 4) break;
  }
  return ids;
}

async function resolveVideo(id) {
  const pageUrl = 'https://www.tiktok.com/@x/video/' + id;
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(pageUrl)}&hd=1`;
  const r = await fetch(api, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(15000)
  });
  const data = await r.json();
  if (!data || data.code !== 0 || !data.data) return null;
  const d = data.data;
  const play = d.hdplay || d.play || null;
  if (!play) return null;
  return {
    title: d.title || 'TikTok Video',
    author: d.author ? (d.author.nickname || d.author.unique_id || 'Unknown') : 'Unknown',
    duration: fmtDuration(d.duration),
    download_url: play,
    cover: d.cover || null
  };
}

async function searchViaUrlebird(q) {
  let ids = await searchIdsOnce(q).catch(() => []);
  if (!ids.length) {
    await new Promise(r => setTimeout(r, 1200));
    ids = await searchIdsOnce(q).catch(() => []);
  }
  if (!ids.length) return [];
  const settled = await Promise.all(ids.map(id => resolveVideo(id).catch(() => null)));
  return settled.filter(Boolean);
}

/* ---------- Handler ---------- */
module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
    if (!q) {
      return sendJson(res, 200, { status: false, message: 'Missing ?q= parameter', result: [] });
    }

    let result = [];
    const token = process.env.APIFY_TOKEN;
    if (token) {
      try { result = await searchViaNovi(q, token); } catch (e) { result = []; }
    }
    if (!result.length) {
      try { result = await searchViaUrlebird(q); } catch (e) { result = []; }
    }

    if (!result.length) {
      return sendJson(res, 200, { status: false, message: 'No results found for: ' + q, result: [] });
    }

    return sendJson(res, 200, { status: true, creator: 'VEXORA API', result });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Search is unavailable right now. Please try again.', result: [] });
  }
};
