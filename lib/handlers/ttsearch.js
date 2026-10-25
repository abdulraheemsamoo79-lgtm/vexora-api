// VEXORA API - TikTok search
// GET /api/ttsearch?q=<search text>
// Returns: { status, result: [ { title, author, duration, download_url, cover } ] }
//
// Backend history (why it looks like this):
//  - tikwm's own /api/feed/search sits behind a Cloudflare challenge for
//    server IPs (returns an HTML "Just a moment" page), so it is unusable.
//  - Urlebird search works from home-type IPs but blocks Vercel's range.
//  - PRIMARY now: the apidojo/tiktok-scraper actor on Apify (pay-per-result,
//    $0.0003 per post - a 4-result search costs about a tenth of a cent of
//    the same monthly credit the Instagram endpoints use). One call returns
//    title, channel name, duration and a direct video URL.
//  - FALLBACK: Urlebird IDs + tikwm resolve (kept for when Apify credit is
//    exhausted; costs nothing to try).
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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ---------- Primary: Apify search actor ---------- */
async function searchViaApify(q, token) {
  // Token goes in the Authorization header - the same pattern instagram.js
  // uses. (The ?token= query form worked from a home IP but not from Vercel.)
  const r = await fetch('https://api.apify.com/v2/acts/apidojo~tiktok-scraper/run-sync-get-dataset-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(token).trim() },
    body: JSON.stringify({ keywords: [q], maxItems: 4, location: 'PK' }),
    signal: AbortSignal.timeout(55000)
  });
  if (!r.ok) return [];
  const items = await r.json();
  if (!Array.isArray(items)) return [];
  const found = items.map(it => {
    const v = it.video || {};
    if (!v.url && !it.postPage) return null;
    return {
      title: it.title || 'TikTok Video',
      author: (it.channel && (it.channel.name || it.channel.username)) || 'Unknown',
      duration: fmtDuration(v.duration),
      download_url: v.url || null,
      cover: v.cover || v.thumbnail || null,
      postPage: it.postPage || null
    };
  }).filter(Boolean);

  // Prefer tikwm's play URL (the same kind the bot already downloads for
  // .tiktok); Apify's own CDN URL stays as the per-item fallback.
  const out = await Promise.all(found.map(async it => {
    if (it.postPage) {
      const id = (it.postPage.match(/video\/(\d+)/) || [])[1];
      if (id) {
        const resolved = await resolveVideo(id).catch(() => null);
        if (resolved && resolved.download_url) it.download_url = resolved.download_url;
      }
    }
    delete it.postPage;
    return it.download_url ? it : null;
  }));
  return out.filter(Boolean);
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
    if (searchParams.get('debug') === '1') {
      // TEMPORARY diagnostics - surfaces the raw Apify response for the
      // apidojo call so a silent empty result can be explained.
      try {
        const dr = await fetch('https://api.apify.com/v2/acts/apidojo~tiktok-scraper/run-sync-get-dataset-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + String(token || '').trim() },
          body: JSON.stringify({ keywords: [q], maxItems: 2, location: 'PK' }),
          signal: AbortSignal.timeout(55000)
        });
        const body = await dr.text();
        return sendJson(res, 200, { debug: true, tokenSet: !!token, httpStatus: dr.status, bodyHead: body.slice(0, 400) });
      } catch (e) {
        return sendJson(res, 200, { debug: true, tokenSet: !!token, fetchError: String(e && e.message) });
      }
    }
    if (token) {
      try { result = await searchViaApify(q, token); } catch (e) { result = []; }
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
