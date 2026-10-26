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
    const items = await r.json().catch(() => null);

    const item = (Array.isArray(items) && items[0]) || null;
    let video = item?.videoUrl || null;
    if (!video && Array.isArray(item?.childPosts)) {
      const child = item.childPosts.find(c => c.videoUrl);
      if (child) video = child.videoUrl;
    }

    if (!video && !item?.displayUrl) {
      // Fallback (added 2026-10-26, from the REDX-MINI source):
      // api-aswin-sparky (keyless) — covers Apify outages/credit-out
      // so .igdl does not die with the shared Apify pool.
      try {
        const r2 = await fetch('https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=' + encodeURIComponent(url), {
          signal: AbortSignal.timeout(30000)
        });
        const j2 = await r2.json().catch(() => null);
        const d0 = (j2?.data || [])[0];
        if (j2?.status && d0?.url) {
          const isVideo = d0.type === 'video';
          return sendJson(res, 200, {
            status: 200,
            success: true,
            creator: 'VEXORA API',
            downloadUrl: d0.url,
            result: {
              type: isVideo ? 'Video' : 'Image',
              video: isVideo ? d0.url : null,
              image: isVideo ? (d0.thumbnail || null) : d0.url,
              caption: ''
            }
          });
        }
      } catch {}
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
