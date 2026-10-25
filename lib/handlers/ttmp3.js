// VEXORA API - TikTok MP3 (audio only)
// GET /api/ttmp3?url=<tiktok url>
// Returns: { status, result: { title, audio_download, author, cover, duration } }
// Backend: tikwm (same as /api/ttdl - swappable in one place)

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url) {
      return sendJson(res, 200, { status: false, message: 'Missing ?url= parameter' });
    }

    const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
    const r = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(25000)
    });
    const data = await r.json();

    if (!data || data.code !== 0 || !data.data) {
      return sendJson(res, 200, { status: false, message: (data && data.msg) || 'Could not fetch this TikTok video' });
    }

    const d = data.data;
    if (!d.music) {
      return sendJson(res, 200, { status: false, message: 'No audio track found for this video' });
    }

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        title: (d.music_info && d.music_info.title) || d.title || 'TikTok Audio',
        audio_download: d.music,
        audio: d.music,
        music_author: (d.music_info && d.music_info.author) || null,
        cover: d.cover || (d.music_info && d.music_info.cover) || null,
        duration: d.duration || null,
        author: d.author ? (d.author.nickname || d.author.unique_id || 'Unknown') : 'Unknown'
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
