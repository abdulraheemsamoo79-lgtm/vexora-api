// VEXORA API - Pairing relay for the website's Link Device page
// GET /api/pair?number=<whatsapp number with country code>
// Returns the bot's own JSON: { code: "XXXX-XXXX" } or an error.
//
// How it works: the pairing page lives on this Vercel site (/pair),
// but a pairing code can only be created by the bot process itself -
// it opens the WhatsApp socket and stores the new session. So this
// handler simply relays the request to the bot's own pairing
// endpoint on Railway (GET /api/code?number=) and passes its answer
// back. Sessions and everything else stay on the bot's side; Vercel
// is only the face. If the bot's Railway domain ever changes, update
// BOT_BASE below - nothing else needs to change.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

const BOT_BASE = 'https://vexora-smd.up.railway.app';

module.exports = async (req, res) => {
  try {
    const { searchParams } = new URL(req.url, 'http://localhost');
    let number = String(searchParams.get('number') || '').replace(/\D/g, '');
    if (number.startsWith('0') && number.length >= 10) {
      number = '92' + number.slice(1);
    }
    if (!number || number.length < 10 || number.length > 15) {
      return sendJson(res, 200, { status: false, message: 'Valid number with country code is required' });
    }

    const botRes = await fetch(BOT_BASE + '/api/code?number=' + encodeURIComponent(number), {
      signal: AbortSignal.timeout(45000)
    });
    const data = await botRes.json().catch(() => null);
    if (!data) {
      return sendJson(res, 200, { status: false, message: 'Bot did not respond - try again in a moment' });
    }
    if (data.code) {
      return sendJson(res, 200, { status: true, code: data.code });
    }
    return sendJson(res, 200, {
      status: false,
      message: data.error || data.message || 'Failed to get pair code'
    });
  } catch (e) {
    return sendJson(res, 200, { status: false, message: 'Pairing service unreachable: ' + e.message });
  }
};
