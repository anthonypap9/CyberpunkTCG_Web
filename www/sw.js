const V = 'nctcg-v1';
const FILES = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/engine.js', 'js/cards.js', 'js/effects.js', 'js/ai.js', 'js/sound.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ch) => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request))));
