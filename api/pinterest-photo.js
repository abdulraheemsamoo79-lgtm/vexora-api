// VEXORA API - Pinterest photo downloader
// GET /api/pinterest-photo?url=<pin url or pin.it short link>
// Returns: { status, result: "<original image url>" }
// Backend: our own extractor - reads the public pin page (no third-party API).

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

async function fetchPinPage(url) {
  const page = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000)
  });
  return page.text();
}

function unesc(s) {
  return s.replace(/\\\//g, '/').replace(/\\u002F/g, '/').replace(/&amp;/g, '&');
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url || (!url.includes('pin.it') && !url.includes('pinterest.'))) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid Pinterest ?url=' });
    }

    const rawHtml = await fetchPinPage(url);
    // Pin pages escape URLs (\/ and \u002F) - pehle saaf karo, phir dhoondho
    const html = rawHtml.replace(/\\"/g, '"').replace(/\\u002F/g, '/').replace(/\\\//g, '/');

    // Original-quality image: "orig" entry in the pin JSON, else any originals URL
    let m = html.match(/"orig":\{"width":\d+,"height":\d+,"url":"([^"]+)"/)
         || html.match(/"originals":\{"url":"([^"]+)"/)
         || html.match(/(https:\/\/i\.pinimg\.com\/originals\/[^"]+?\.(?:jpg|jpeg|png|webp))/i)
         || html.match(/<meta property="og:image" content="([^"]+)"/);

    if (!m) {
      return sendJson(res, 200, { status: false, message: 'Image not found (pin may be a video or removed)' });
    }

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: unesc(m[1])
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
