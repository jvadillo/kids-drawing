#!/usr/bin/env node
/*
 * Servidor estático mínimo para probar la app en el ordenador o desde un móvil/tablet
 * conectado a la misma red Wi-Fi. Sin dependencias.
 *
 *   node tools/serve.js            -> http://localhost:8080
 *   PORT=3000 node tools/serve.js
 */
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = +process.env.PORT || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.avif': 'image/avif'
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('¡A dibujar! en:');
  console.log('  http://localhost:' + PORT);
  Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log('  http://' + i.address + ':' + PORT + '   (desde el móvil/tablet en la misma red)'));
});
