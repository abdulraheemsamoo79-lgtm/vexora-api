// VEXORA API - MediaFire direct link extractor
// GET /api/mediafire?url=<mediafire file url>
// Returns: { status, result: { filename, mimetype, filesize, download_url } }
// Backend: MediaFire file page scraping (no third-party API in between)

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

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    if (!url || !url.includes('mediafire.com')) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid MediaFire ?url=' });
    }

    const page = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const html = await page.text();

    // The main download button carries the direct link
    let m = html.match(/id="downloadButton"[^>]*href="(https:\/\/download[^"]+)"/i)
         || html.match(/href="(https:\/\/download\d*\.mediafire\.com\/[^"]+)"/i);
    if (!m) {
      return sendJson(res, 200, { status: false, message: 'Direct link not found (file may be removed or password-protected)' });
    }
    const downloadUrl = m[1].replace(/&amp;/g, '&');

    // Filename: last path segment of the direct link, else from the page
    let filename = 'mediafire_file';
    try {
      const parts = new URL(downloadUrl).pathname.split('/').filter(Boolean);
      const last = decodeURIComponent(parts[parts.length - 1]);
      if (last && last.includes('.')) filename = last;
    } catch {}
    if (filename === 'mediafire_file') {
      const fm = html.match(/<div[^>]*class="[^"]*filename[^"]*"[^>]*>([^<]+)</i)
              || html.match(/<title>Download ([^<]+?) from/i);
      if (fm) filename = fm[1].trim();
    }

    const ext = (filename.split('.').pop() || '').toLowerCase();
    const sizeMatch = html.match(/Download file\s*\(([\d.]+\s*[KMGT]B)\)/i)
                   || html.match(/\(?([\d.]+\s*[KMGT]B)\)?\s*<\/a>/i);

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        filename,
        mimetype: MIME[ext] || 'application/octet-stream',
        filesize: sizeMatch ? sizeMatch[1].replace(/\s+/g, ' ') : null,
        download_url: downloadUrl
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
