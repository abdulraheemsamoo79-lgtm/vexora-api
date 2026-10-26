// VEXORA API - Twitter/X video downloader
// GET /api/twitter?url=<tweet url>
// Returns: { status, result: { desc, thumb, video_sd, video_hd } }
// Backend: X's own public syndication feed (the same one websites embed
// tweets with) - no third-party downloader API in between.
// NOTE: the feed returns an EMPTY {} unless the request carries the
// embed token - a hash derived from the tweet id by the same formula
// Twitter's own embed JS uses (found 2026-10-26 while completing the
// test sweep: without it every video tweet read as "No video found").

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    const idMatch = url && url.match(/status\/(\d+)/);
    if (!idMatch) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid tweet ?url=' });
    }

    const token = ((Number(idMatch[1]) / 1e15) * Math.PI).toString(36).replace(/[^a-z0-9]+/gi, '');
    const api = `https://cdn.syndication.twimg.com/tweet-result?id=${idMatch[1]}&lang=en&token=${token}`;
    const r = await fetch(api, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(25000)
    });
    const data = await r.json();

    const media = (data && data.mediaDetails) || [];
    const vid = media.find(m => m.type === 'video' || m.type === 'animated_gif');
    if (!vid || !vid.video_info || !Array.isArray(vid.video_info.variants)) {
      return sendJson(res, 200, { status: false, message: 'No video found in this tweet' });
    }

    const variants = vid.video_info.variants
      .filter(v => v.content_type === 'video/mp4' && v.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    if (!variants.length) {
      return sendJson(res, 200, { status: false, message: 'No downloadable video variant found' });
    }

    const hd = variants[0].url;
    const sd = (variants.length > 1 ? variants[variants.length - 1] : variants[0]).url;
    const desc = (data.text || '').replace(/https:\/\/t\.co\/\S+\s*$/, '').trim();

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        desc: desc || 'No description',
        thumb: vid.media_url_https || (data.user && data.user.profile_image_url_https) || '',
        video_sd: sd,
        video_hd: hd
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
