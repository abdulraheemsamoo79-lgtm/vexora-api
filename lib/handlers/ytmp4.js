// VEXORA API - YouTube MP4 (for the bot's .video/.drama commands)
// GET /api/ytmp4?url=<youtube link>
// Returns: { status, result: { video_download, title, duration, thumbnail } }
//
// NOTE (honest design): same as ytmp3 - YouTube blocks direct server-side
// extraction, so the current backend behind OUR address is the KnightBot
// API (tested working 2026-10-22; free tier: up to 720p, 10-minute videos).
// Swappable in this one file if a better backend appears.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const KB_BASE = 'https://knightbotapi.stream';
const KB_KEY = 'knight'; // their public free/demo key

function absolutize(u) {
  if (!u) return null;
  return u.startsWith('http') ? u : KB_BASE + (u.startsWith('/') ? u : '/' + u);
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const input = (searchParams.get('url') || searchParams.get('query') || '').trim();
    if (!input) {
      return sendJson(res, 200, { status: false, message: 'Missing ?url=' });
    }

    const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(input);
    const qs = new URLSearchParams({ ...(isUrl ? { url: input } : { query: input }), apikey: KB_KEY });
    const r = await fetch(`${KB_BASE}/api/ytmp4?${qs}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(50000)
    });
    const data = await r.json();

    if (!data || data.success !== true || !data.result || !data.result.download) {
      return sendJson(res, 200, { status: false, message: (data && (data.message || data.error)) || 'YouTube video not found (free limit: max 720p / 10 minutes)' });
    }

    const rr = data.result;
    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        video_download: absolutize(rr.download),
        title: rr.title || 'YouTube Video',
        author: rr.author || rr.channel || 'YouTube',
        duration: rr.duration != null ? String(rr.duration) : 'N/A',
        thumbnail: rr.thumbnail || rr.thumb || ''
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
