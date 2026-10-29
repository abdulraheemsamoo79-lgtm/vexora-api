// VEXORA API - Detik news headlines (Indonesia)
// GET /api/detiknews
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Ultra cheerio se .list-content__item blocks scrape karta tha;
// yahan wahi extraction position-based regex se hai
// (naye packages allowed nahi).

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

module.exports = async (req, res) => {
  const url = 'https://news.detik.com/';

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(20000)
    });
    const data = await r.text();

    const beritaList = [];
    const positions = [];
    let i = -1;
    while ((i = data.indexOf('list-content__item', i + 1)) !== -1) positions.push(i);
    for (let k = 0; k < positions.length; k++) {
      const seg = data.slice(positions[k], k + 1 < positions.length ? positions[k + 1] : positions[k] + 6000);
      const m = seg.match(/media__title[^>]*>[\s\S]*?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
      if (!m) continue;
      const title = stripTags(m[2]);
      const link = m[1];
      if (title && link) beritaList.push({ title, link });
    }

    return sendJson(res, 200, {
      status: true,
      source: url,
      result: beritaList.slice(10, 20)
    });
  } catch (error) {
    return sendJson(res, 500, { status: false, message: 'Failed to fetch news.' });
  }
};
