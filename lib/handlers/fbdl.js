// VEXORA API - Facebook video downloader
// GET /api/fbdl?url=<facebook video url>
// Returns: { status, hd_link, sd_link, download_url, title }
//
// Backends, in order:
// 1. Siputzx /api/d/facebook - FREE and fast (~5s), returns ready
//    download links (720p HD + 360p SD). Found inside the Arslan-Tech
//    bot the user shared (2026-10-26) and verified live the same day
//    with a real public reel (links -> HTTP 206 video/mp4).
// 2. Apify actor unseenuser/fb-reels (pay-per-result from the same
//    APIFY_TOKEN credit pool as Instagram; ~$0.0045/reel, ~22s).
//    Verified live 2026-10-25 (video_url -> HTTP 206 mp4).
// 3. Own page scraper (below) - mostly blocked by Facebook now,
//    kept for the day it works again.

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

async function viaSiputzx(url) {
  const resp = await fetch('https://api.siputzx.my.id/api/d/facebook?url=' + encodeURIComponent(url), {
    signal: AbortSignal.timeout(30000)
  });
  if (!resp.ok) return null;
  const j = await resp.json();
  const dls = j && j.data && Array.isArray(j.data.downloads) ? j.data.downloads : null;
  if (!j.status || !dls || !dls.length) return null;
  const hd = dls.find(d => /720|HD/i.test(d.quality || '')) || dls[0];
  const sd = dls.find(d => /360|SD/i.test(d.quality || '')) || null;
  if (!hd || !hd.url) return null;
  const title = (j.data.title || '').trim();
  return { hd: hd.url, sd: sd ? sd.url : null, title: title === 'Facebook Video' ? '' : title };
}

async function viaApify(url, token) {
  const resp = await fetch('https://api.apify.com/v2/acts/unseenuser~fb-reels/run-sync-get-dataset-items?timeout=50', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ startUrls: [url] }),
    signal: AbortSignal.timeout(58000)
  });
  if (!resp.ok) return null;
  const items = await resp.json();
  if (!Array.isArray(items) || !items.length) return null;
  const reel = items[0].reel || items[0];
  if (!reel || !reel.video_url) return null;
  const desc = (reel.description || '').trim();
  const title = desc ? desc.split('\n')[0].slice(0, 120) : '';
  return { video: reel.video_url, title };
}

async function viaScraper(url) {
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
  if (!hd && !sd) return null;
  const titleMatch = html.match(/<meta property="og:title" content="([^"]*)"/) || html.match(/<title>([^<]*)<\/title>/);
  return { hd, sd, title: titleMatch ? titleMatch[1].replace(/&amp;/g, '&') : '' };
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url || (!url.includes('facebook.com') && !url.includes('fb.watch') && !url.includes('fb.gg'))) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid Facebook ?url=' });
    }

    try {
      const hit = await viaSiputzx(url);
      if (hit) {
        return sendJson(res, 200, {
          status: true,
          creator: 'VEXORA API',
          hd_link: hit.hd || null,
          sd_link: hit.sd || null,
          download_url: hit.hd || hit.sd,
          title: hit.title
        });
      }
    } catch {}

    const token = process.env.APIFY_TOKEN;
    if (token) {
      try {
        const hit = await viaApify(url, token);
        if (hit) {
          return sendJson(res, 200, {
            status: true,
            creator: 'VEXORA API',
            hd_link: null,
            sd_link: hit.video,
            download_url: hit.video,
            title: hit.title
          });
        }
      } catch {}
    }

    try {
      const hit = await viaScraper(url);
      if (hit) {
        return sendJson(res, 200, {
          status: true,
          creator: 'VEXORA API',
          hd_link: hit.hd || null,
          sd_link: hit.sd || null,
          download_url: hit.hd || hit.sd,
          title: hit.title
        });
      }
    } catch {}

    return sendJson(res, 200, { status: false, message: 'Video not found (private video or login required)' });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
