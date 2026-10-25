// VEXORA API - TikTok downloader (v1 format)
// GET /api/ttdl?url=<tiktok url>
// Returns: { status, result: { title, video, video_wm, audio, cover, images, author } }
// Backend: tikwm (swappable - bot only depends on THIS format)

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

async function tikwm(url) {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const r = await fetch(api, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36' },
    signal: AbortSignal.timeout(25000)
  });
  return r.json();
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url) {
      return sendJson(res, 200, { status: false, message: 'Missing ?url= parameter' });
    }

    const data = await tikwm(url);
    if (!data || data.code !== 0 || !data.data) {
      return sendJson(res, 200, { status: false, message: (data && data.msg) || 'Could not fetch this TikTok video' });
    }

    const d = data.data;
    const video = d.hdplay || d.play || null;
    if (!video && !(d.images && d.images.length)) {
      return sendJson(res, 200, { status: false, message: 'No downloadable media found' });
    }

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        title: d.title || 'TikTok Video',
        video: video,
        video_wm: d.wmplay || null,
        audio: d.music || null,
        cover: d.cover || null,
        images: d.images || null,
        duration: d.duration || null,
        author: d.author ? (d.author.nickname || d.author.unique_id || 'Unknown') : 'Unknown'
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
