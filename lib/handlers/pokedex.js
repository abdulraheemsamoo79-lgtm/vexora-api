// VEXORA API - Pokedex
// GET /api/pokedex?pokemon=<pokemon name>
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  return callRedx(res, 'pokedex', searchParams);
};
