// Sin conexión. VERSION se cambia en cada publicación: así el navegador detecta un sw.js nuevo,
// precarga TODOS los archivos de la versión nueva de una vez y borra la anterior (nunca mezcla versiones).
const VERSION = '1.2.0';
const CACHE = 'porteros-' + VERSION;
const FILES = ['./', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png',
  'js/app.js', 'js/backup.js', 'js/catalog.js', 'js/db.js', 'js/logic.js',
  'js/ui/dom.js', 'js/ui/matches.js', 'js/ui/pitch.js', 'js/ui/register.js', 'js/ui/report.js', 'js/ui/season.js', 'js/ui/setup.js'];

self.addEventListener('install', e => e.waitUntil(
  caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));

// Cache-first desde la versión precargada; la red solo para lo que no esté (no debería ocurrir).
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c =>
    (await c.match(url.pathname.endsWith('/') ? './' : e.request, { ignoreSearch: true })) || fetch(e.request)));
});
