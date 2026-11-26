// VEXORA API - Quran Surah
// GET /api/quran-surah?number=<surah 1-114>   (purana ?surah= bhi chalega)
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  // 2026-11-26 compat: upstream ne param ka naam surah -> number kar
  // diya hai. Purane callers na tootein — purana naam map ho jata hai.
  if (!searchParams.get('number') && searchParams.get('surah')) {
    searchParams.set('number', searchParams.get('surah'));
    searchParams.delete('surah');
  }
  return callRedx(res, 'quran-surah', searchParams);
};
