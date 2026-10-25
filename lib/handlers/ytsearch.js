// VEXORA API - YouTube search (search + video info only, no downloading)
// GET /api/ytsearch?q=<search text>
// Returns: { status, query, result: [ { title, url, thumbnail, duration, views, ago, author } ] }
// Backend: yt-search package (searches YouTube directly from the server)

const yts = require('yt-search');

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const q = (searchParams.get('q') || searchParams.get('query') || '').trim();
    if (!q) {
      return sendJson(res, 200, { status: false, message: 'Missing ?q= parameter' });
    }

    const r = await yts(q);
    const videos = (r && Array.isArray(r.videos) ? r.videos : []).slice(0, 10).map(v => ({
      title: v.title || '',
      url: v.url || (v.videoId ? 'https://www.youtube.com/watch?v=' + v.videoId : ''),
      videoId: v.videoId || '',
      thumbnail: v.thumbnail || v.image || '',
      duration: (v.duration && v.duration.timestamp) || v.timestamp || '',
      duration_seconds: (v.duration && v.duration.seconds) || v.seconds || 0,
      views: v.views || 0,
      ago: v.ago || '',
      author: (v.author && v.author.name) || ''
    }));

    if (!videos.length) {
      return sendJson(res, 200, { status: false, message: 'No videos found for: ' + q });
    }

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      query: q,
      result: videos
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
