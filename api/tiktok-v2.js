// VEXORA API - TikTok downloader (v2 format, with stats)
// GET /api/tiktok-v2?url=<tiktok url>
// Returns: { status, result: { title, video_download, author:{nickname}, duration, stats:{views, likes, comment, share, save, download} } }
// Backend: tikwm (swappable)

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function fmtDuration(sec) {
  if (sec == null || isNaN(sec)) return 'N/A';
  const s = Math.round(Number(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `0:${String(r).padStart(2, '0')}`;
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
    const video = d.hdplay || d.play || null;
    if (!video) {
      return sendJson(res, 200, { status: false, message: 'No video found (photo posts are not supported by v2)' });
    }

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        title: d.title || 'TikTok Video',
        video_download: video,
        video_wm: d.wmplay || null,
        audio: d.music || null,
        cover: d.cover || null,
        duration: fmtDuration(d.duration),
        author: {
          nickname: d.author ? (d.author.nickname || 'Unknown') : 'Unknown',
          username: d.author ? (d.author.unique_id || '') : ''
        },
        stats: {
          views: String(d.play_count ?? '0'),
          likes: String(d.digg_count ?? '0'),
          comment: String(d.comment_count ?? '0'),
          share: String(d.share_count ?? '0'),
          save: String(d.collect_count ?? '0'),
          download: String(d.download_count ?? '0')
        }
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
