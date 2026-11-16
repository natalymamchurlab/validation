/**
 * Minimal static server for this repo.
 *
 * Why: opening via file:// often breaks fetch() to JSON. This script serves the
 * current directory over http://localhost:<port>/ so the site works locally.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.argv[2] || 8000);
const rootDir = process.cwd();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const clean = decoded.replaceAll('\\', '/');
  const rel = clean.startsWith('/') ? clean.slice(1) : clean;
  const full = path.resolve(rootDir, rel);
  if (!full.startsWith(path.resolve(rootDir) + path.sep) && full !== path.resolve(rootDir)) {
    return null;
  }
  return full;
}

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (!req.url) return send(res, 400, 'Bad Request');

  let filePath = safeResolve(req.url);
  if (!filePath) return send(res, 403, 'Forbidden');

  // Default document
  if (req.url === '/' || req.url.startsWith('/?')) {
    filePath = path.join(rootDir, 'index.html');
  }

  // If directory, try index.html
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
  } catch {
    // continue to readFile -> 404
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    send(res, 200, data, { 'Content-Type': contentType });
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Serving "${rootDir}" at http://localhost:${port}/`);
});

