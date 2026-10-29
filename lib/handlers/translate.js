// VEXORA API - Text translator
// GET /api/translate?text=<text>&to=<lang code, e.g. ur, en, es>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Ultra '@vitalets/google-translate-api' package use karta tha;
// yahan wahi kaam Google Translate ke public endpoint ko direct
// fetch karke kiya gaya hai (naye packages allowed nahi) —
// response shape Ultra wali hi rakhi gayi hai.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const text = searchParams.get('text');
  const to = searchParams.get('to');
  if (!text || !to) {
    return sendJson(res, 400, { status: false, message: 'Please provide parameters text & to' });
  }

  try {
    const apiUrl = 'https://translate.googleapis.com/translate_a/single'
      + `?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(apiUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(20000)
    });
    const data = await r.json();
    const translated = (Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [])
      .map(seg => (seg && seg[0]) || '')
      .join('');
    const iso = (Array.isArray(data) && data[2]) || 'auto';
    if (!translated) throw new Error('Empty translation response');

    return sendJson(res, 200, {
      status: 200,
      original_text: text,
      translated_text: translated,
      lang_from: iso,
      lang_to: to
    });
  } catch (err) {
    return sendJson(res, 500, { status: false, message: 'An error occurred during translation', error: err.message });
  }
};
