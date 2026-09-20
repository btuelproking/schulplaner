/* Service Worker: macht die App offline nutzbar und aktualisiert sich im Hintergrund. */
const CACHE = 'schulplaner-v1';
const DATEIEN = [
  './', './index.html', './app.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(DATEIEN); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (namen) {
    return Promise.all(namen.map(function (n) { return n === CACHE ? null : caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (ev) {
  const anfrage = ev.request;
  if (anfrage.method !== 'GET') return;                       // Sync laeuft ueber POST -> nie abfangen
  const url = new URL(anfrage.url);
  if (url.origin !== self.location.origin) return;            // Supabase nie cachen
  ev.respondWith(
    caches.match(anfrage).then(function (treffer) {
      const ausNetz = fetch(anfrage).then(function (antwort) {
        if (antwort && antwort.status === 200) {
          const kopie = antwort.clone();
          caches.open(CACHE).then(function (c) { c.put(anfrage, kopie); });
        }
        return antwort;
      }).catch(function () { return treffer; });
      return treffer || ausNetz;
    })
  );
});
