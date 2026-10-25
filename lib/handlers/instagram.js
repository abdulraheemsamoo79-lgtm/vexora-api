// VEXORA API - Instagram downloader
// GET /api/instagram?url=<instagram post/reel url>
// Returns: { status, result: { type, video, image, caption } }
// Backend: Apify instagram-post-scraper (same setup as the PRIME VID VAULT app).
// Token comes from the APIFY_TOKEN environment variable (set in Vercel settings,
// never stored in code).

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

    const token = process.env.APIFY_TOKEN;
    if (!token) {
      return sendJson(res, 200, { status: false, message: 'APIFY_TOKEN is not set on the server yet' });
    }

    const r = await fetch('https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username: [url], resultsLimit: 1 }),
      signal: AbortSignal.timeout(55000)
    });
    const items = await r.json();

    if (!Array.isArray(items) || !items.length) {
      return sendJson(res, 200, { status: false, message: 'No result (invalid or private link)' });
    }

    const item = items[0];
    let video = item.videoUrl || null;
    if (!video && Array.isArray(item.childPosts)) {
      const child = item.childPosts.find(c => c.videoUrl);
      if (child) video = child.videoUrl;
    }

    if (!video && !item.displayUrl) {
      return sendJson(res, 200, { status: false, message: 'No downloadable media found' });
    }

    return sendJson(res, 200, {
      status: 200,
      success: true,
      creator: 'VEXORA API',
      downloadUrl: video || item.displayUrl,
      result: {
        type: item.type || (video ? 'Video' : 'Image'),
        video: video,
        image: item.displayUrl || null,
        caption: item.caption || ''
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
