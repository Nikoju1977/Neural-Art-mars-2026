/* Neural Art V21 — local application shell cache.
   External 3D/hand libraries require an Internet connection. */
const CACHE = 'neural-art-v21-stage-1';
const LOCAL_ASSETS = ['./', './index.html', './neural-v20.js?v=21.0', './performance-v21.js?v=21.0', './manifest.json', './icon.svg'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll(LOCAL_ASSETS))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') return (await caches.match('./index.html')) || Response.error();
    return Response.error();
  }));
});