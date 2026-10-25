// VEXORA API - Pinterest video downloader
// GET /api/pinterest-video?url=<pin url or pin.it short link>
// Returns: { status, result: "<video mp4 url>", duration, size_mb }
// Backend: our own extractor - reads the public pin page (no third-party API).

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function unesc(s) {
  return s.replace(/\\\//g, '/').replace(/\\u002F/g, '/').replace(/&amp;/g, '&');
}

function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return 'N/A';
  const s = Math.round(Number(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url || (!url.includes('pin.it') && !url.includes('pinterest.'))) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid Pinterest ?url=' });
    }

    const page = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const rawHtml = await page.text();
    // Pin pages escape URLs (\/ and \u002F) - pehle saaf karo, phir dhoondho
    const html = rawHtml.replace(/\\"/g, '"').replace(/\\u002F/g, '/').replace(/\\\//g, '/');

    // All pin video files (v1.pinimg.com/videos/...)
    const urls = [...new Set(html.match(/https:\/\/v\d+\.pinimg\.com\/[^"]+?\.mp4/g) || [])];

    if (!urls.length) {
      return sendJson(res, 200, { status: false, message: 'Video not found (pin may be a photo or removed)' });
    }

    // Prefer the 720p variant when present
    const best = urls.find(u => /720/.test(u)) || urls[urls.length - 1];

    const durM = html.match(/"duration":\s*([\d.]+)/);

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: best,
      duration: durM ? fmtDuration(parseFloat(durM[1])) : 'N/A',
      size_mb: null
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
