// VEXORA API - Quran Ayah
// GET /api/quran-ayah?ayah=<2:255>
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  return callRedx(res, 'quran-ayah', searchParams);
};
