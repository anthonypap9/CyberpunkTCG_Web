const V = 'nctcg-v2';
const FILES = ['./', 'index.html', 'css/style.css', 'js/app.js', 'js/engine.js', 'js/cards.js', 'js/carddata.js', 'js/builder.js', 'js/effects.js', 'js/ai.js', 'js/sound.js', 'js/music.js', 'js/profile.js', 'js/playlist.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== V).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ch) => ch.put(e.request, c)); return r; }).catch(() => caches.match(e.request))));
