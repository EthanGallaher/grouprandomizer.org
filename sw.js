const CACHE = 'bgr-pwa-v41';
const SHELL = ['./', './index.html', './manifest.webmanifest', './group-randomizer-app-v19-192.png', './group-randomizer-app-v19-512.png', './group-randomizer-icon.png', './favicon.png', './apple-touch-icon.png', './cloud-sync.js', './e2ee-core.js', './firebase-config.js', './pdf.min.js', './pdf.worker.min.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('bgr-pwa-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Keep authentication and encryption code fresh; an older cached module
    // must not keep sign-in disabled or revive obsolete OAuth logic.
    if (['firebase-config.js', 'cloud-sync.js', 'e2ee-core.js'].some(name => url.pathname.endsWith('/' + name))) {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh.ok) await cache.put(request, fresh.clone());
        return fresh;
      } catch (_) {
        const originalUrl = new URL(request.url);
        originalUrl.search = '';
        return (await cache.match(request)) || (await cache.match(originalUrl.href)) || Response.error();
      }
    }
    if (request.mode === 'navigate') {
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put('./index.html', response.clone());
        return response;
      } catch (_) { return (await cache.match('./index.html')) || Response.error(); }
    }
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) { return Response.error(); }
  })());
});

// Activate an already downloaded update only after the teacher confirms.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
