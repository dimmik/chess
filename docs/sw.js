// Service worker: игра открывается и без интернета.
// Пока есть сеть, файлы всегда берутся свежие (с проверкой у сервера), кэш нужен только офлайн.
importScripts('version.js');
const CACHE = 'kids-chess-' + self.APP_VERSION;
const FILES = [
  './', 'index.html', 'style.css', 'version.js', 'pieces.js', 'engine.js', 'ai.js', 'app.js', 'pwa.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const old = (await caches.keys()).filter((k) => k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    // Это обновление: открытые страницы показывают старую версию — перезагружаем их.
    if (old.length) {
      for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    }
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

  if (url.origin === self.location.origin) {
    // Сначала сеть (no-cache — браузер переспрашивает сервер, а не берёт старую копию), без сети — кэш.
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
  } else if (font) {
    // Шрифты не меняются — сначала кэш.
    e.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});
