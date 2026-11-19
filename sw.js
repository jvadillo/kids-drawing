/* Service worker: guarda la app en caché para que funcione sin conexión.
   Cambia CACHE al publicar una versión nueva para forzar la actualización. */
var CACHE = 'a-dibujar-v4';
var FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/art.css',
  'css/styles.css',
  'js/i18n.js',
  'js/drawings.js',
  'js/art.js',
  'js/app.js',
  'fonts/nunito-800.woff2',
  'fonts/nunito-900.woff2',
  'img/icon.svg',
  'img/icon-192.png',
  'img/icon-512.png',
  'img/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
    return hit || fetch(e.request);
  }));
});
