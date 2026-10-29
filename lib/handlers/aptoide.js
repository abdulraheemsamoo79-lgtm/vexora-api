// VEXORA API - Aptoide APK search (top result)
// GET /api/aptoide?q=<app name>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Ultra version 'aptoide-api' package use karta tha; purani API mein
// naye packages allowed nahi, is liye wahi kaam Aptoide ke apne
// public web-service (ws75) ko direct fetch karke kiya gaya hai —
// bot ka .apk command bhi isi service ko isi shape mein use karta hai.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const query = searchParams.get('q');
  if (!query) {
    return sendJson(res, 400, { status: false, message: 'Query not found ?q=' });
  }

  try {
    const r = await fetch(`https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`, {
      signal: AbortSignal.timeout(20000)
    });
    const data = await r.json();
    const list = (data && data.datalist && Array.isArray(data.datalist.list)) ? data.datalist.list : [];
    if (!list.length) {
      return sendJson(res, 404, { status: false, message: 'APK not found' });
    }

    const app = list[0];
    return sendJson(res, 200, {
      status: true,
      name: app.name,
      package: app.package,
      icon: app.icon,
      download_url: (app.file && (app.file.path || app.file.path_alt)) || ''
    });
  } catch (error) {
    return sendJson(res, 500, { status: false, message: error.message || String(error) });
  }
};
