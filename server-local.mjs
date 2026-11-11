import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createApiHandler, createMediaHandler } from './src/api-app.mjs';
import { FileBlobStore } from './src/file-blob-store.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function loadLocalEnv(filePath = path.join(ROOT, '.env')) {
  if (!fs.existsSync(filePath)) return;
  const rows = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('\"') && value.endsWith('\"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadLocalEnv();

const PUBLIC = path.join(ROOT, 'public');
const LOCAL_DATA = path.join(ROOT, '.local-data');
const port = Number(process.env.PORT || 3000);

const dataStore = new FileBlobStore(path.join(LOCAL_DATA, 'data'));
const mediaStore = new FileBlobStore(path.join(LOCAL_DATA, 'media'));
const env = { ...process.env, CONTEXT: 'dev', NETLIFY_DEV: 'true' };
const apiHandler = createApiHandler({ dataStore, mediaStore, env });
const mediaHandler = createMediaHandler({ mediaStore });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const staticHeaders = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://wa.me https://api.whatsapp.com;",
  'Permissions-Policy': 'camera=(self), microphone=()',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
};

function safePublicPath(relative) {
  const candidate = path.resolve(PUBLIC, relative);
  return candidate === PUBLIC || candidate.startsWith(`${PUBLIC}${path.sep}`) ? candidate : null;
}

function staticTarget(pathname) {
  if (pathname === '/super-admin') return 'super-admin.html';
  if (pathname === '/my-events') return 'my-events.html';
  if (/^\/admin\/[^/]+$/.test(pathname)) return 'admin.html';
  if (/^\/join\/[^/]+$/.test(pathname)) return 'participant.html';
  if (/^\/party\/[^/]+$/.test(pathname)) return 'dashboard.html';
  return pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
}

async function webRequest(req) {
  const url = `http://${req.headers.host || `localhost:${port}`}${req.url || '/'}`;
  const options = { method: req.method, headers: req.headers };
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    options.body = Readable.toWeb(req);
    options.duplex = 'half';
  }
  return new Request(url, options);
}

async function sendWebResponse(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname);
    if (pathname === '/health' || pathname.startsWith('/api/')) {
      return sendWebResponse(res, await apiHandler(await webRequest(req)));
    }
    if (pathname.startsWith('/media/')) {
      return sendWebResponse(res, await mediaHandler(await webRequest(req)));
    }
    if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
      res.writeHead(405, staticHeaders);
      return res.end('Metodo non consentito.');
    }
    const filePath = safePublicPath(staticTarget(pathname));
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404, { ...staticHeaders, 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Pagina non trovata.');
    }
    const stats = fs.statSync(filePath);
    res.writeHead(200, {
      ...staticHeaders,
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': filePath.endsWith('.html') ? 'no-store' : 'public, max-age=300',
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Errore interno.');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`\n🎄 Secret Santa Club Netlify è attivo su http://localhost:${port}`);
  console.log('   I dati locali sono in .local-data e non vengono inviati a Netlify.');
  console.log('   Premi Ctrl+C per fermarlo.\n');
});
