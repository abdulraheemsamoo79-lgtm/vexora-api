// VEXORA API - Google Drive downloader
// GET /api/gdrive?url=<google drive file url>
// Returns: { status, result: { name, download_url, mimetype } }
// Backend: our own - builds Drive's own direct-download address and reads
// the file name from the public Drive page. Works for "anyone with the
// link" files. No third-party API.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

function extractId(url) {
  let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return null;
}

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    const url = searchParams.get('url');
    const id = url && extractId(url);
    if (!id) {
      return sendJson(res, 200, { status: false, message: 'Missing or invalid Google Drive ?url=' });
    }

    const downloadUrl = `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`;

    // Verify the file is publicly downloadable + grab its real name/type
    let name = 'gdrive_file';
    let mime = null;
    const probe = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Range': 'bytes=0-0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(25000)
    });
    const ctype = probe.headers.get('content-type') || '';
    if (ctype.includes('text/html')) {
      return sendJson(res, 200, { status: false, message: 'File is not public or needs a confirmation this API cannot pass' });
    }
    mime = ctype.split(';')[0] || null;
    const disp = probe.headers.get('content-disposition') || '';
    const dm = disp.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
    if (dm) {
      try { name = decodeURIComponent(dm[1]); } catch { name = dm[1]; }
    }
    try { await probe.body.cancel(); } catch {}

    if (name === 'gdrive_file') {
      try {
        const view = await fetch(`https://drive.google.com/file/d/${id}/view`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15000)
        });
        const html = await view.text();
        const tm = html.match(/<meta property="og:title" content="([^"]+)"/) || html.match(/<title>([^<]+?)(?: - Google Drive)?<\/title>/);
        if (tm) name = tm[1].replace(/&amp;/g, '&').trim();
      } catch {}
    }

    return sendJson(res, 200, {
      status: true,
      creator: 'VEXORA API',
      result: {
        name,
        download_url: downloadUrl,
        mimetype: mime
      }
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Server error: ' + e.message });
  }
};
