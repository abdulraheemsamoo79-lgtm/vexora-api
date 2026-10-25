// VEXORA API - Facebook video downloader
// GET /api/fbdl?url=<facebook video url>
// Returns: { status, hd_link, sd_link, download_url, title }
// Backend: our own extractor - reads the public Facebook watch page and
// pulls the playable stream URLs out of its data (no third-party API).

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function unescapeFb(s) {
  return s
    .replace(/\\u0025/g, '%')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&');
}

function pick(html, patterns) {
  for (const p of patterns) {
    const m = html.match(p);
    if (m && m[1]) return unescapeFb(m[1]);
  }
  return null;
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.gg'))) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid Facebook ?url=' });
    }

    const page = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const rawHtml = await page.text();
    const html = rawHtml.replace(/\\"/g, '"');

    const hd = pick(html, [
      /"hd_src_no_ratelimit":"([^"]+)"/,
      /"playable_url_quality_hd":"([^"]+)"/,
      /"hd_src":"([^"]+)"/
    ]);
    const sd = pick(html, [
      /"sd_src_no_ratelimit":"([^"]+)"/,
      /"playable_url":"([^"]+)"/,
      /"sd_src":"([^"]+)"/
    ]);

    if (!hd && !sd) {
      return sendJson(res, 200, { status: false, message: 'Video not found (private video or login required)' });
    }

    const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/) || html.match(/<title>([^<]*)<\/title>/);

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      hd_link: hd || null,
      sd_link: sd || null,
      download_url: hd || sd,
      title: titleMatch ? titleMatch[1].replace(/&amp;/g, '&') : ''
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
