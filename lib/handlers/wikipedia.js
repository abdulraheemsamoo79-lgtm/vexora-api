// VEXORA API - Wikipedia
// GET /api/wikipedia?title=<article title>   (purana ?q= bhi chalega)
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  // 2026-11-26 compat: upstream ne param ka naam q -> title kar diya
  // hai. Purane callers na tootein — purana naam map ho jata hai.
  if (!searchParams.get('title') && searchParams.get('q')) {
    searchParams.set('title', searchParams.get('q'));
    searchParams.delete('q');
  }
  return callRedx(res, 'wikipedia', searchParams);
};
