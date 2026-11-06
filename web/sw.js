// OldChatter web app: keeps the app files so it opens fast and starts offline (chat itself needs the network).
const V = 'oc-web-1';
const CORE = ['./', 'index.html', 'style.css', 'app.js', 'i18n.js', 'emoji.js', 'games.js', 'config.js', 'countries.js', 'pwa.js', 'logo.png', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return; // the server link (wss) and telegram.org are not ours to cache
  const shell = r.mode === 'navigate' || /\.(js|css|html|webmanifest)$/.test(u.pathname);
  // app files: network first so a new version arrives at once, the cache covers offline. Smileys, fonts, pictures: cache first.
  e.respondWith(shell
    ? fetch(r).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); return res; }).catch(() => caches.match(r).then((m) => m || caches.match('index.html')))
    : caches.match(r).then((m) => m || fetch(r).then((res) => { const cp = res.clone(); caches.open(V).then((c) => c.put(r, cp)); return res; })));
});
