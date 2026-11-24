// A small static server for game/ (Node 22, standard library only), so an entry can be
// played locally without a build step: `node serve.ts` serves game/ on http://localhost:8080.
// It answers the MIME types a browser game needs, refuses any path outside game/, answers
// HEAD requests with headers and no body, and otherwise does nothing clever: this is a
// development convenience, not a web server for the internet. `--port N` and `--host H`
// pick where it listens (127.0.0.1 by default, so it stays on your own machine unless you
// ask otherwise).
// Two exceptions to "nothing clever": GET /__version answers a small JSON health check
// naming the game, so a script can tell this server from any other on the machine — and
// it also lists the ?shot= scene names the game stages, so a screenshot script can ask
// the server what it can photograph before it starts a browser. Every file gets a weak
// ETag from its size and mtime, so a browser reload during development can revalidate
// cheaply: an If-None-Match that matches gets a 304. The cache-control is no-cache
// (revalidate every time), not no-store — no-store would forbid the browser from keeping
// the file at all and make the ETag pointless. Responses also carry two small hardening
// headers — nosniff, so a browser never second-guesses the declared content type, and a
// no-referrer policy, so a click out of a locally served page leaks nothing about it —
// cheap insurance even for a development server.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;
const hostIndex = args.indexOf('--host');
const host = hostIndex === -1 ? '127.0.0.1' : String(args[hostIndex + 1] || '127.0.0.1');

// The scene names game/src/shots.js stages behind ?shot=, for the /__version health check.
const SHOTS = ['start', 'drive', 'chase', 'mission', 'showdown', 'skyline', 'rain', 'port', 'heli', 'beach', 'train', 'storm', 'airport', 'market', 'spikes'];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.flac': 'audio/flac',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', // the repo's notes read as plain text, never as markup
};

createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET, HEAD' }).end('method not allowed');
    return;
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  if (pathname === '/__version') {
    // A one-line health check for scripts and curious players: which game this server
    // serves, which version of it, and which screenshot scenes it can stage, without downloading any of it.
    const body = JSON.stringify({ game: 'Solmar Heat', version: 'v9', files: 'game/', shots: SHOTS, ok: true });
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    response.end(request.method === 'HEAD' ? undefined : body);
    return;
  }
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  let etag: string;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
    etag = `W/"${stats.size}-${Math.floor(stats.mtimeMs)}"`;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304, { etag }).end();
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    etag,
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`game/ is on http://${host}:${port}`);
});
