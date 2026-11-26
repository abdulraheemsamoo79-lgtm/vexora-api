// VEXORA API - Geocode
// GET /api/geocode?city=<city name>   (purana ?q= bhi chalega)
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  // 2026-11-26 compat: upstream ne param ka naam q -> city kar diya
  // hai. Purane callers (bots/partner jo ?q= bhejte hain) na tootein,
  // is liye purana naam khud naye naam par map ho jata hai.
  if (!searchParams.get('city') && searchParams.get('q')) {
    searchParams.set('city', searchParams.get('q'));
    searchParams.delete('q');
  }
  return callRedx(res, 'geocode', searchParams);
};
