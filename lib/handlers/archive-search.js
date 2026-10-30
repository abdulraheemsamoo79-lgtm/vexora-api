// VEXORA API - Archive.org Search
// GET /api/archive-search?q=<archive.org query>
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  return callRedx(res, 'archive-search', searchParams);
};
