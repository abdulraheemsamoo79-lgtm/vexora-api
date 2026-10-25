// VEXORA API - TikTok search
// GET /api/ttsearch?q=<search text>
// Returns: { status, result: [ { title, author, duration, download_url, cover } ] }
// Backend: tikwm feed search (swappable)

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

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const q = searchParams.get('q') || searchParams.get('query');
    if (!q) {
      return sendJson(res, 200, { status: false, message: 'Missing ?q= parameter', result: [] });
    }

    const api = `https://tikwm.com/api/feed/search?keywords=${encodeURIComponent(q)}&count=4&cursor=0&HD=1`;
    const r = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(20000)
    });
    const data = await r.json();

    const videos = (data && data.data && data.data.videos) || [];
    const result = videos.slice(0, 4).map(v => ({
      title: v.title || 'TikTok Video',
      author: v.author ? (v.author.nickname || v.author.unique_id || 'Unknown') : 'Unknown',
      duration: fmtDuration(v.duration),
      download_url: v.play || null,
      cover: v.cover || null
    })).filter(v => v.download_url);

    return sendJson(res, 200, { status: true, creator: 'VEXORA API', result });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message, result: [] });
  }
};
