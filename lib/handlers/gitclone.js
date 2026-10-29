// VEXORA API - GitHub repo zip download link
// GET /api/gitclone?url=<github repo url>
// Ported from VEXORA API Ultra (2026-10-29 upgrade of the old API).
// Ultra ki tarah: GitHub API ke zipball endpoint par HEAD request
// se asal filename (content-disposition) nikaal kar JSON mein
// download_url + filename deta hai.

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

module.exports = async (req, res) => {
  const { searchParams } = new URL(req.url, 'http://localhost');
  const url = searchParams.get('url');

  if (!url) {
    return sendJson(res, 400, { error: 'Example repository URL. Example: /gitclone?url=https://github.com/abdulraheemsamoo79-lgtm/vexora-pair' });
  }

  const regex = /(?:https|git)(?::\/\/|@)github\.com[\/:]([^\/:]+)\/(.+)/i;
  if (!regex.test(url)) {
    return sendJson(res, 400, { error: 'Invalid link!' });
  }

  try {
    let [, user, repo] = url.match(regex);
    repo = repo.replace(/.git$/, '');
    const apiUrl = `https://api.github.com/repos/${user}/${repo}/zipball`;

    const response = await fetch(apiUrl, {
      method: 'HEAD',
      headers: { 'User-Agent': 'VEXORA-API' },
      signal: AbortSignal.timeout(20000)
    });
    const contentDisposition = response.headers.get('content-disposition');
    const filename = contentDisposition.match(/attachment; filename=(.*)/)[1];

    return sendJson(res, 200, {
      success: true,
      repository: `${user}/${repo}`,
      download_url: apiUrl,
      filename: filename
    });
  } catch (error) {
    return sendJson(res, 500, { error: 'Repository not found.', details: error.message });
  }
};
