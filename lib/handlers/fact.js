// VEXORA API - Random Fact
// GET /api/fact
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  return callRedx(res, 'fact', searchParams);
};
