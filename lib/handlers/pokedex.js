// VEXORA API - Pokedex
// GET /api/pokedex?pokemon=<pokemon name>   (purana ?name= bhi chalega)
// Backend: RedxAPI (proxied via lib/redx.js, key from REDX_API_KEY env)
const { callRedx } = require('../redx');

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  // 2026-11-26 compat: upstream ne param ka naam name -> pokemon kar
  // diya hai. Purane callers na tootein — purana naam map ho jata hai.
  if (!searchParams.get('pokemon') && searchParams.get('name')) {
    searchParams.set('pokemon', searchParams.get('name'));
    searchParams.delete('name');
  }
  return callRedx(res, 'pokedex', searchParams);
};
