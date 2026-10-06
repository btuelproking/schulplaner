/* Service Worker: holt bei Internet immer die neueste Version, offline die gespeicherte. */
const CACHE = 'schulplaner-v5';
const DATEIEN = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon-64.png', './apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(DATEIEN); })
    .then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (namen) {
    return Promise.all(namen.map(function (n) { return n === CACHE ? null : caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  const anfrage = ev.request;
  if (anfrage.method !== 'GET') return;                     // Sync laeuft ueber POST
  if (new URL(anfrage.url).origin !== self.location.origin) return;
  ev.respondWith(
    fetch(anfrage).then(function (antwort) {                // zuerst das Netz = immer aktuell
      if (antwort && antwort.status === 200) {
        const kopie = antwort.clone();
        caches.open(CACHE).then(function (c) { c.put(anfrage, kopie); });
      }
      return antwort;
    }).catch(function () {                                   // offline: gespeicherte Fassung
      return caches.match(anfrage).then(function (t) { return t || caches.match('./index.html'); });
    })
  );
});
