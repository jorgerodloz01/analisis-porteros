// Sin conexión: precache de todos los archivos; se sirve desde caché y se actualiza en segundo plano.
const CACHE = 'porteros-v1';
const FILES = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'js/app.js', 'js/backup.js', 'js/catalog.js', 'js/db.js', 'js/logic.js',
  'js/ui/dom.js', 'js/ui/matches.js', 'js/ui/pitch.js', 'js/ui/register.js', 'js/ui/report.js', 'js/ui/season.js', 'js/ui/setup.js'];

self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const key = url.pathname.endsWith('/') ? './' : e.request;
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
