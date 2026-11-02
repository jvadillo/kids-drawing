#!/usr/bin/env node
/*
 * Prepara la app para TV LG (webOS) y, si está instalado el CLI de webOS, genera el .ipk.
 *
 *   node tools/build-webos.js
 *
 * Resultado:
 *   dist/webos/app/                   carpeta de la app webOS (lista para ares-package)
 *   dist/com.adibujar.app_1.0.0_all.ipk   (solo si "ares-package" está disponible)
 *
 * CLI de webOS:  npm install -g @webos-tools/cli
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'webos', 'app');

const APP_FILES = ['index.html', 'manifest.webmanifest', 'css', 'js', 'img'];
const WEBOS_FILES = ['appinfo.json', 'icon.png', 'largeIcon.png', 'splash.png'];

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    fs.readdirSync(src).forEach((f) => copy(path.join(src, f), path.join(dst, f)));
  } else {
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(path.join(DIST, 'webos'), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
APP_FILES.forEach((f) => copy(path.join(ROOT, f), path.join(OUT, f)));
WEBOS_FILES.forEach((f) => {
  const src = path.join(ROOT, 'webos', f);
  if (!fs.existsSync(src)) throw new Error('Falta webos/' + f + ' (ejecuta: node tools/make-icons.js)');
  copy(src, path.join(OUT, f));
});

const info = JSON.parse(fs.readFileSync(path.join(OUT, 'appinfo.json'), 'utf8'));
console.log('✓ App webOS preparada en ' + path.relative(ROOT, OUT));

let hasAres = true;
try { execSync('ares-package --version', { stdio: 'ignore' }); } catch (e) { hasAres = false; }

if (hasAres) {
  execSync('ares-package "' + OUT + '" -o "' + DIST + '"', { stdio: 'inherit' });
  console.log('✓ Paquete: dist/' + info.id + '_' + info.version + '_all.ipk');
  console.log('\nPara instalarlo en la TV (modo desarrollador activado y TV registrada con ares-setup-device):');
  console.log('  ares-install --device tv dist/' + info.id + '_' + info.version + '_all.ipk');
  console.log('  ares-launch  --device tv ' + info.id);
} else {
  console.log('\nNo se ha encontrado el CLI de webOS. Para generar el .ipk:');
  console.log('  npm install -g @webos-tools/cli');
  console.log('  node tools/build-webos.js');
  console.log('\n(Más detalles en README.md, sección "TV LG (webOS)")');
}
