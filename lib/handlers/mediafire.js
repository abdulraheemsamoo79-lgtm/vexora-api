// VEXORA API - MediaFire direct link extractor
// GET /api/mediafire?url=<mediafire file url>
// Returns: { status, result: { filename, mimetype, filesize, download_url, + aliases } }
// Backend: MediaFire's own file pages (no third-party API in between).
//
// How it works (fixed 2026-10-25): MediaFire no longer puts the direct
// link on the first page a bare fetch sees. The file URL first answers
// with a redirect to the ?action=check page AND sets session cookies -
// only a follow-up request that carries those cookies gets the page
// variant whose Download anchor holds the real download*.mediafire.com
// link. So this handler walks the redirects manually with a small
// cookie jar (fetch's own redirect following cannot carry the cookies
// it collects along the way) and chains Referer like a browser.
// NOTE: the walk itself is proven correct, but MediaFire's Cloudflare
// serves Vercel's IP range the "Just a moment" wall (verified
// 2026-10-25 from production: hop 1 = 302 + cookies, hop 2 = 403
// challenge page, with plain AND full browser header sets). So from
// Vercel this endpoint currently cannot see the link; the bot's
// .mediafire command therefore extracts directly inside the bot
// (plugins/dl-mediafire.js) from Railway's network instead. This
// handler stays correct for any unblocked network.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const MIME = {
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  apk: 'application/vnd.android.package-archive',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  txt: 'text/plain',
  json: 'application/json',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  exe: 'application/x-msdownload',
  iso: 'application/x-iso9660-image'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function setCookiesOf(resp) {
  try {
    if (typeof resp.headers.getSetCookie === 'function') return resp.headers.getSetCookie();
  } catch {}
  const single = resp.headers.get('set-cookie');
  return single ? [single] : [];
}

// Follow redirects manually, keeping cookies. Returns the final HTML.
async function fetchMediaFirePage(startUrl, dbg, extraHeaders) {
  const jar = new Map();
  let current = startUrl;
  let referer = null;
  for (let hop = 0; hop < 6; hop++) {
    const headers = {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(extraHeaders || {})
    };
    if (jar.size) headers['Cookie'] = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    if (referer) headers['Referer'] = referer;

    const resp = await fetch(current, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(25000)
    });
    const scs = setCookiesOf(resp);
    if (dbg) dbg.hops.push({ status: resp.status, loc: resp.headers.get('location'), cookies: scs.length });
    for (const sc of scs) {
      const pair = sc.split(';')[0];
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc) break;
      referer = current;
      current = new URL(loc, current).toString();
      try { await resp.text(); } catch {}
      continue;
    }
    return await resp.text();
  }
  return '';
}

function extractFromHtml(html) {
  if (!html) return null;
  const m = html.match(/<a[^>]+aria-label="Download file"[^>]*href="(https:\/\/download[^"]+)"/i)
         || html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/i)
         || html.match(/id="downloadButton"[^>]*href="(https:\/\/download[^"]+)"/i);
  if (!m) return null;
  const downloadUrl = m[1].replace(/&amp;/g, '&');

  let filename = 'mediafire_file';
  try {
    const parts = new URL(downloadUrl).pathname.split('/').filter(Boolean);
    const last = decodeURIComponent(parts[parts.length - 1]);
    if (last && last.includes('.')) filename = last;
  } catch {}
  if (filename === 'mediafire_file') {
    const fm = html.match(/<div[^>]*class="[^"]*filename[^"]*"[^>]*>([^<]+)</i)
            || html.match(/property="og:title" content="([^"]+)"/i)
            || html.match(/<title>Download ([^<]+?) from/i);
    if (fm) filename = fm[1].trim();
  }

  const sizeMatch = html.match(/File size:\s*<span>([\d.]+\s*[KMGT]B)/i)
                 || html.match(/Download file\s*\(([\d.]+\s*[KMGT]B)\)/i)
                 || html.match(/\(?([\d.]+\s*[KMGT]B)\)?\s*<\/a>/i);

  const ext = (filename.split('.').pop() || '').toLowerCase();
  return {
    filename,
    mime: MIME[ext] || 'application/octet-stream',
    fsize: sizeMatch ? sizeMatch[1].replace(/\s+/g, ' ').toUpperCase() : null,
    downloadUrl
  };
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url || !url.includes('mediafire.com')) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid MediaFire ?url=' });
    }

    // One full cookie-walk, plus a single fresh retry (MediaFire
    // occasionally serves a "preparing" page on the first pass).
    let found = null;
    for (let attempt = 0; attempt < 2 && !found; attempt++) {
      const html = await fetchMediaFirePage(url);
      found = extractFromHtml(html);
    }
    if (!found) {
      return sendJson(res, 200, { status: false, message: 'Direct link not found (file may be removed or password-protected)' });
    }

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        filename: found.filename,
        fileName: found.filename,
        mimetype: found.mime,
        fileType: found.mime,
        filesize: found.fsize,
        size: found.fsize,
        download_url: found.downloadUrl,
        dl_link: found.downloadUrl
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
