// VEXORA API - Tahukah Kamu (fun: random "did you know" fact)
// GET /api/tahukahkamu
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Data list: ./tahukahkamuarray (bina kisi backend ke, local array).

const facts = require('./tahukahkamuarray');

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  try {
    const randomFact = facts[Math.floor(Math.random() * facts.length)];
    return sendJson(res, 200, { status: 200, result: randomFact });
  } catch (err) {
    return sendJson(res, 500, { status: 500, message: 'An error occurred.' });
  }
};
