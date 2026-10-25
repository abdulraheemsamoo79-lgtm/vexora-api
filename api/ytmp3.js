// VEXORA API - YouTube MP3 (for the bot's .play/.song command)
// GET /api/ytmp3?url=<youtube link OR song name>
// Returns: { status, result: { audio_download, title, author, duration, thumbnail } }
//
// NOTE (honest design): YouTube cannot be extracted by our own code from a
// server - YouTube blocks server IPs and serves audio/video separately.
// So this endpoint's current backend is the KnightBot API (tested working
// 2026-10-22) behind OUR stable address. If a better backend appears, only
// this file changes - the bot and this address never change.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const KB_BASE = 'https://knightbotapi.stream';
const KB_KEY = 'knight'; // their public free/demo key

async function knight(path, params) {
  const qs = new URLSearchParams({ ...params, apikey: KB_KEY });
  const r = await fetch(`${KB_BASE}${path}?${qs}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(50000)
  });
  return r.json();
}

function absolutize(u) {
  if (!u) return null;
  return u.startsWith('http') ? u : KB_BASE + (u.startsWith('/') ? u : '/' + u);
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const input = (searchParams.get('url') || searchParams.get('query') || '').trim();
    if (!input) {
      return sendJson(res, 200, { status: false, message: 'Missing ?url= (link or song name)' });
    }

    const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(input);
    const data = await knight('/api/ytmp3', isUrl ? { url: input } : { query: input });

    if (!data || data.success !== true || !data.result || !data.result.download) {
      return sendJson(res, 200, { status: false, message: (data && (data.message || data.error)) || 'YouTube audio not found (free limit or long video?)' });
    }

    const r = data.result;
    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        audio_download: absolutize(r.download),
        title: r.title || 'YouTube Song',
        author: r.author || r.channel || 'YouTube',
        duration: r.duration != null ? String(r.duration) : 'N/A',
        thumbnail: r.thumbnail || r.thumb || ''
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
