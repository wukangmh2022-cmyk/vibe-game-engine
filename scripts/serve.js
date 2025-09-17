#!/usr/bin/env node
// Minimal static file server to test editor-runtime.html and runtime pages
// Usage: node scripts/serve.js [port]

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = Number(process.argv[2] || process.env.PORT || 8080);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${port}`);
    let pathname = decodeURIComponent(u.pathname);
    // prevent path escape
    if (pathname.includes('..')) { res.statusCode = 400; return res.end('Bad Request'); }
    // default to runtime/editor helper pages
    if (pathname === '/' || pathname === '') {
      res.statusCode = 302;
      res.setHeader('Location', '/level-editor/public/editor-runtime.html');
      return res.end();
    }
    const filePath = path.join(root, pathname.replace(/^\/+/, ''));
    let stat = null;
    try { stat = fs.statSync(filePath); } catch {}
    if (!stat) {
      res.statusCode = 404; return res.end('Not Found');
    }
    if (stat.isDirectory()) {
      // try index.html
      const idx = path.join(filePath, 'index.html');
      if (fs.existsSync(idx)) {
        const buf = fs.readFileSync(idx);
        res.setHeader('Content-Type', mime['.html']);
        return res.end(buf);
      }
      // simple listing
      const entries = fs.readdirSync(filePath);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.write(`<h3>Index of ${pathname}</h3><ul>`);
      for (const e of entries) {
        const p = path.posix.join(pathname, e);
        res.write(`<li><a href="${p}">${e}</a></li>`);
      }
      res.write('</ul>');
      return res.end();
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = mime[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', type);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.statusCode = 500; res.end('Server Error');
  }
});

server.listen(port, () => {
  console.log(`[static] Serving ${root} at http://localhost:${port}`);
  console.log('  -> editor runtime:', `http://localhost:${port}/level-editor/public/editor-runtime.html`);
  console.log('  -> runtime page   :', `http://localhost:${port}/web/runtime.html`);
});

