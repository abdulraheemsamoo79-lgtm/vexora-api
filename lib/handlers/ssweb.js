// VEXORA API - Website screenshot
// GET /api/ssweb?url=<website url>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Backend: pikwy screenshot service — JPEG binary seedha pipe
// hota hai, JSON nahi.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const url = searchParams.get('url');

  if (!url) {
    return sendJson(res, 400, {
      status: 400,
      error: 'Please enter the URL you want to screenshot!'
    });
  }

  try {
    const encodedUrl = encodeURIComponent(url);
    const screenshotUrl = `https://api.pikwy.com/?tkn=125&d=3000&u=${encodedUrl}&fs=0&w=841&h=1200&s=100&f=jpg&trj=web`;

    const response = await fetch(screenshotUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 200) {
      const buf = Buffer.from(await response.arrayBuffer());
      res.writeHead(200, { 'Content-Type': 'image/jpeg' });
      return res.end(buf);
    }
    return sendJson(res, 500, {
      status: 500,
      error: 'Failed to capture screenshot.'
    });
  } catch (err) {
    return sendJson(res, 500, {
      status: 500,
      error: 'An error occurred, please try again later!'
    });
  }
};
