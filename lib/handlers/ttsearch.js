// VEXORA API - TikTok search
// GET /api/ttsearch?q=<search text>
// Returns: { status, result: [ { title, author, duration, download_url, cover } ] }
//
// Backend history: tikwm's own /api/feed/search sits behind a Cloudflare
// challenge for server IPs (returns an HTML "Just a moment" page instead of
// JSON), so it cannot be used from a server. Current pipeline (all sources
// answer server requests):
//   1. Urlebird's public search page -> real TikTok video IDs for the query
//   2. Each ID resolved through tikwm's main API (which works) for the
//      title, author, duration and the no-watermark play URL.
// If either source ever changes, only this file needs a swap - the bot
// contract above stays the same.

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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

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

async function searchIds(q) {
  // Urlebird occasionally throttles bursts - one quiet retry rescues most
  // empty responses.
  let ids = await searchIdsOnce(q).catch(() => []);
  if (!ids.length) {
    await new Promise(r => setTimeout(r, 1200));
    ids = await searchIdsOnce(q).catch(() => []);
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

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
    if (!q) {
      return sendJson(res, 200, { status: false, message: 'Missing ?q= parameter', result: [] });
    }

    let ids = [];
    try { ids = await searchIds(q); } catch (e) { ids = []; }
    if (!ids.length) {
      return sendJson(res, 200, { status: false, message: 'No results found for: ' + q, result: [] });
    }

    const settled = await Promise.all(ids.map(id => resolveVideo(id).catch(() => null)));
    const result = settled.filter(Boolean);

    if (!result.length) {
      return sendJson(res, 200, { status: false, message: 'Search results could not be loaded right now. Please try again.', result: [] });
    }

    return sendJson(res, 200, { status: true, creator: 'VEXORA API', result });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Search is unavailable right now. Please try again.', result: [] });
  }
};
