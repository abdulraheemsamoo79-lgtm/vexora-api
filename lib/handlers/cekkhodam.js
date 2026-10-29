// VEXORA API - Cek Khodam (fun: random guardian spirit for a name)
// GET /api/cekkhodam?nama=<name>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Data list: ./cekkhodamarray (bina kisi backend ke, local array).

const khodamList = require('./cekkhodamarray');

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const nama = searchParams.get('nama');
  if (!nama) {
    return sendJson(res, 400, { status: 400, message: 'Please provide the name parameter.' });
  }

  const random = khodamList[Math.floor(Math.random() * khodamList.length)];
  const hasil = `Khodam for ${nama} is ${random}`;

  return sendJson(res, 200, { status: 200, result: hasil });
};
