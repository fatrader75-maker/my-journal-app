// نسخه رو با هر تغییر در index.html بالا ببر تا کش قدیمی پاک بشه
const VERSION = 'v3';
const CORE_CACHE = 'app-core-' + VERSION;
const RUNTIME_CACHE = 'app-runtime-' + VERSION;

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE).then((cache) =>
      // هر فایل جدا اضافه می‌شه تا نبودن یکی (مثلاً آیکون) نصب رو خراب نکنه
      Promise.all(CORE_ASSETS.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CORE_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // صفحه اصلی: اول شبکه، اگه آفلاین بود از کش
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CORE_CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // فونت‌ها و فایل‌های خارجی (جیتی‌اس‌دلیور، گوگل فونت): اول کش و هم‌زمان به‌روزرسانی
  // فایل‌های همین دامنه هم همین‌طور
  event.respondWith(
    caches.open(RUNTIME_CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
