// VEXORA API - YouTube downloader (mp3/mp4 switch)
// GET /api/ytdl?url=<youtube link>&type=mp3|mp4 (default mp4)
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Sirf ek delegate hai: type ke hisaab se apne hi ytmp3 / ytmp4
// handler ko wahi req/res de deta hai.

const ytmp3 = require('./ytmp3');
const ytmp4 = require('./ytmp4');

module.exports = (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const type = String(searchParams.get('type') || 'mp4').toLowerCase();
  return (type === 'mp3' ? ytmp3 : ytmp4)(req, res);
};
