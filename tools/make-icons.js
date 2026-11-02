#!/usr/bin/env node
/*
 * Genera los iconos PNG de la PWA y de la app webOS a partir de un SVG,
 * usando Chrome/Edge en modo headless (no necesita dependencias de npm).
 *
 *   node tools/make-icons.js
 *
 * Si Chrome no está en la ruta habitual: CHROME="ruta/a/chrome" node tools/make-icons.js
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#ffc93c"/>
  <g transform="rotate(-6 256 262)">
    <rect x="104" y="112" width="304" height="304" rx="52" fill="#2b2738"/>
    <rect x="104" y="96" width="304" height="304" rx="52" fill="#fff" stroke="#2b2738" stroke-width="16"/>
    <g transform="translate(86 85) scale(0.85)" fill="none" stroke="#2b2738" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
      <path d="M100 172 L112 72 L176 132 M300 172 L288 72 L224 132"/>
      <ellipse cx="200" cy="218" rx="122" ry="95" fill="#fff"/>
      <ellipse cx="160" cy="196" rx="18" ry="22"/><ellipse cx="240" cy="196" rx="18" ry="22"/>
      <ellipse cx="162" cy="198" rx="6" ry="12" fill="#2b2738"/><ellipse cx="238" cy="198" rx="6" ry="12" fill="#2b2738"/>
      <path d="M188 230 L212 230 L200 244Z M200 244 V254 M178 252 Q189 266 200 254 Q211 266 222 252"/>
      <path stroke="#ff3d81" d="M150 238 L82 224 M150 252 L80 258 M250 238 L318 224 M250 252 L320 258"/>
    </g>
  </g>
</svg>`;

const SIZES = [
  { file: 'img/icon-192.png', w: 192, h: 192 },
  { file: 'img/icon-512.png', w: 512, h: 512 },
  { file: 'img/apple-touch-icon.png', w: 180, h: 180 },
  { file: 'webos/icon.png', w: 80, h: 80 },
  { file: 'webos/largeIcon.png', w: 130, h: 130 },
  { file: 'webos/splash.png', w: 1920, h: 1080, splash: true }
];

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ];
  const found = c.find((p) => fs.existsSync(p));
  if (!found) throw new Error('No se encuentra Chrome/Edge. Define la variable CHROME.');
  return found;
}

const page = `<!DOCTYPE html><html><body><pre id="out"></pre><script>
const svg = ${JSON.stringify(ICON_SVG)};
const sizes = ${JSON.stringify(SIZES)};
const img = new Image();
img.onload = () => {
  const out = {};
  sizes.forEach((s) => {
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    const g = c.getContext('2d');
    if (s.splash) {
      g.fillStyle = '#fff4df'; g.fillRect(0, 0, s.w, s.h);
      g.fillStyle = '#f2d6a2';
      for (let y = 15; y < s.h; y += 30) for (let x = 15; x < s.w; x += 30) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
      g.drawImage(img, s.w / 2 - 210, 190, 420, 420);
      g.fillStyle = '#2b2738'; g.textAlign = 'center';
      g.font = '900 110px "Segoe UI", Roboto, sans-serif';
      g.fillText('¡A dibujar!', s.w / 2, 800);
    } else {
      g.drawImage(img, 0, 0, s.w, s.h);
    }
    out[s.file] = c.toDataURL('image/png');
  });
  document.getElementById('out').textContent = JSON.stringify(out);
};
img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
</script></body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'icons-'));
const html = path.join(tmp, 'icons.html');
fs.writeFileSync(html, page);
const dom = execFileSync(findChrome(), [
  '--headless=new', '--disable-gpu', '--user-data-dir=' + path.join(tmp, 'prof'),
  '--virtual-time-budget=5000', '--dump-dom', 'file:///' + html.replace(/\\/g, '/')
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
if (!m || !m[1]) throw new Error('No se pudieron generar los iconos');
const data = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));

fs.mkdirSync(path.join(ROOT, 'img'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'webos'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'img/icon.svg'), ICON_SVG);
Object.keys(data).forEach((file) => {
  fs.writeFileSync(path.join(ROOT, file), Buffer.from(data[file].split(',')[1], 'base64'));
  console.log('✓', file);
});
console.log('✓ img/icon.svg');
fs.rmSync(tmp, { recursive: true, force: true });
