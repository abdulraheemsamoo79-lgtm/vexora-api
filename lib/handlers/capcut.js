// VEXORA API - CapCut template downloader
// GET /api/capcut?url=<capcut template url>
// Returns: { status, result: { video_download, title, author, duration, usage, likes, cover } }
// Backend: our own extractor - reads the public CapCut template page
// (og:video + embedded template JSON). No third-party API.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function unesc(s) {
  if (!s) return s;
  // Decode every JSON-style escape that CapCut embeds in its page JSON:
  // \u002F -> /, \u0026 -> &, \u003D -> =, \/ -> /, &amp; -> &
  // (The old version missed \u002F, so video URLs came back unusable.)
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function pick(html, patterns) {
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return unesc(m[1]);
  }
  return null;
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url || !url.includes('capcut.com')) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid CapCut ?url=' });
    }

    const page = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const rawHtml = await page.text();
    const html = rawHtml.replace(/\\"/g, '"');

    const video = pick(html, [
      /<meta property="og:video(?::url)?" content="([^"]+)"/,
      /"video_url":"(https:[^"]+?)"/,
      /"videoUrl":"(https:[^"]+?)"/,
      /"play_url":"(https:[^"]+?\.mp4[^"]*)"/
    ]);

    if (!video) {
      return sendJson(res, 200, { status: false, message: 'Template video not found on this page' });
    }

    const title = pick(html, [
      /<meta property="og:title" content="([^"]*)"/,
      /"template_name":"([^"]+)"/,
      /"title":"([^"]{3,120})"/
    ]);
    const author = pick(html, [
      /"author":\{[^}]*"name":"([^"]+)"/,
      /"nickname":"([^"]+)"/,
      /"author_name":"([^"]+)"/
    ]);
    const usageM = html.match(/"usage_amount":(\d+)/) || html.match(/"template_usage":(\d+)/);
    const likesM = html.match(/"like_amount":(\d+)/) || html.match(/"favorite_amount":(\d+)/);
    const cover = pick(html, [/<meta property="og:image" content="([^"]+)"/]);

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        video_download: video,
        title: title || 'CapCut Video',
        author: author || 'Unknown',
        duration: 'N/A',
        usage: usageM ? Number(usageM[1]) : null,
        likes: likesM ? Number(likesM[1]) : null,
        cover: cover || null
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
