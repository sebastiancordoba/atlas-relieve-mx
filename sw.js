// Service worker: shell de la app en cache y cache de teselas para trabajo sin red.
const SHELL = 'atlas-shell-v3';
const TILES = 'atlas-tiles-v1';
const MAX_TILES = 2000;

const ARCHIVOS = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/app.js', './js/ui.js', './js/dem.js', './js/config.js', './js/ramps.js',
  './js/analysis.js', './js/analysis-worker.js', './js/climate.js',
  './js/inspect.js', './js/profile.js', './js/projections.js', './js/reproject.js',
  './icons/icon.svg', './icons/icon-192.png',
];

const HOSTS_TESELA = [
  's3.amazonaws.com', 'server.arcgisonline.com', 'tiles.maps.eox.at',
  'tile.opentopomap.org', 'a.tile.opentopomap.org', 'b.tile.opentopomap.org',
  'tile.openstreetmap.org', 'gibs.earthdata.nasa.gov',
];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(SHELL).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== SHELL && k !== TILES).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function podar(cache){
  const keys = await cache.keys();
  if (keys.length <= MAX_TILES) return;
  for (const k of keys.slice(0, keys.length - MAX_TILES)) await cache.delete(k);
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Teselas: primero la red, con respaldo en cache (y guardado silencioso).
  if (HOSTS_TESELA.includes(url.hostname)){
    ev.respondWith((async () => {
      const cache = await caches.open(TILES);
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')){
          cache.put(req, res.clone()).then(() => podar(cache)).catch(() => {});
        }
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response('', { status:504 });
      }
    })());
    return;
  }

  // Shell propio: red primero (para no servir codigo viejo) con respaldo en cache.
  if (url.origin === location.origin){
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok){
          const copia = res.clone();
          caches.open(SHELL).then(c => c.put(req, copia)).catch(() => {});
        }
        return res;
      } catch {
        return (await caches.match(req)) || (await caches.match('./index.html'))
          || new Response('Sin conexion', { status:503 });
      }
    })());
  }
});

self.addEventListener('message', ev => {
  if (ev.data === 'limpiar-teselas') caches.delete(TILES);
});
