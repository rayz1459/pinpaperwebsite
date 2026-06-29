import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = 3000;

// --- Real installer links. Fill these in (or set the env vars) when you have them. ---
// While empty, a download click is still COUNTED, but the visitor just stays on the page.
const DOWNLOAD_URLS = {
  mac: process.env.PINPAPER_MAC_URL || '',      // e.g. 'https://downloads.pinpaper.app/PinPaper.dmg'
  windows: process.env.PINPAPER_WIN_URL || '',  // e.g. 'https://downloads.pinpaper.app/PinPaper-Setup.exe'
};

// --- Download counter, persisted to download-stats.json so it survives restarts ---
const STATS_FILE = join(ROOT, 'download-stats.json');
let stats = { mac: 0, windows: 0, total: 0, byDay: {}, updated: null };
try { stats = { ...stats, ...JSON.parse(await readFile(STATS_FILE, 'utf8')) }; } catch { /* first run */ }

let saveTimer = null;
function saveStats() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeFile(STATS_FILE, JSON.stringify(stats, null, 2)).catch(e => console.error('stats save failed:', e.message));
  }, 200);
}

// Count a download. De-duped per browser (cookie) so it approximates PEOPLE, not raw clicks.
function countDownload(platform, req) {
  const alreadyCounted = (req.headers.cookie || '').includes(`pp_dl_${platform}=1`);
  if (!alreadyCounted) {
    stats[platform] = (stats[platform] || 0) + 1;
    stats.total += 1;
    const day = new Date().toISOString().slice(0, 10);
    stats.byDay[day] = (stats.byDay[day] || 0) + 1;
    stats.updated = new Date().toISOString();
    saveStats();
    console.log(`⬇  ${platform} download #${stats[platform]}  (total ${stats.total})`);
  }
  return alreadyCounted;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);

  // --- /download/mac  or  /download/windows : count, then hand off to the installer ---
  const dl = urlPath.match(/^\/download\/(mac|windows)$/);
  if (dl) {
    const platform = dl[1];
    const alreadyCounted = countDownload(platform, req);
    const headers = {};
    if (!alreadyCounted) headers['Set-Cookie'] = `pp_dl_${platform}=1; Max-Age=31536000; Path=/; SameSite=Lax`;
    const target = DOWNLOAD_URLS[platform];
    if (target) {
      res.writeHead(302, { ...headers, Location: target });   // real installer -> downloads it
    } else {
      res.writeHead(204, headers);                            // no URL yet -> count, stay on page
    }
    res.end();
    return;
  }

  // --- JSON the page reads to show a live count ---
  if (urlPath === '/api/downloads') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ mac: stats.mac, windows: stats.windows, total: stats.total }));
    return;
  }

  // --- Owner-facing dashboard ---
  if (urlPath === '/stats') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(statsPage());
    return;
  }

  // --- static files ---
  try {
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
});

function statsPage() {
  const days = Object.entries(stats.byDay).sort().slice(-14);
  const rows = days.length
    ? days.map(([d, n]) => `<tr><td>${d}</td><td>${n}</td></tr>`).join('')
    : '<tr><td colspan="2" class="muted">No downloads yet</td></tr>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Pin Paper — Downloads</title>
<style>body{font:15px/1.5 -apple-system,system-ui,Segoe UI,sans-serif;max-width:540px;margin:48px auto;padding:0 20px;color:#0a0a0a}
h1{font-size:1.35rem;letter-spacing:-.02em}.big{display:flex;gap:14px;margin:22px 0}
.card{flex:1;border:1px solid #ece9e4;border-radius:14px;padding:16px}
.card b{display:block;font-size:2rem;line-height:1}.card span{color:#6c6c72;font-size:.82rem}
h2{font-size:.95rem;margin:24px 0 6px}table{width:100%;border-collapse:collapse}
td{padding:7px 0;border-bottom:1px solid #f0ede8}td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:#6c6c72;font-size:.85rem}a{color:#e71c23}</style></head>
<body><h1>Pin Paper · downloads</h1>
<div class="big">
<div class="card"><b>${stats.total}</b><span>Total</span></div>
<div class="card"><b>${stats.mac}</b><span>macOS</span></div>
<div class="card"><b>${stats.windows}</b><span>Windows</span></div>
</div>
<h2>Last 14 days</h2><table>${rows}</table>
<p class="muted">Counts are de-duped per browser. Last update: ${stats.updated || 'never'}.<br>
Raw JSON: <a href="/api/downloads">/api/downloads</a></p>
</body></html>`;
}

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} at http://localhost:${PORT}`);
  console.log(`Download stats:        http://localhost:${PORT}/stats`);
});
