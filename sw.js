// Service Worker نسخه ۳ — سازگار با GitHub Pages و ساختار تک‌فایلی index.html
// فقط وقتی مجموعه فایل‌های CORE_ASSETS عوض بشه لازمه VERSION رو بالا ببری.
// خود index.html همیشه اول از شبکه خونده می‌شه، پس تغییرات بدون آپدیت نسخه دیده می‌شن.
const VERSION = 'v3.0.0';
const CORE_CACHE = 'fa-core-' + VERSION;
const RUNTIME_CACHE = 'fa-runtime-' + VERSION;

// نصب تنها وقتی شکست می‌خوره که index.html در دسترس نباشه؛ بقیه فایل‌ها اختیاری‌اند
// (اگر آیکون‌ها هنوز آپلود نشده باشن، نصب خراب نمی‌شه)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// اگر شبکه کند بود، بعد از این مدت از کش نمایش داده می‌شه و آپدیت در پس‌زمینه ذخیره می‌شه
const NAV_TIMEOUT = 3500;

function isCacheable(res) {
  if (!res) return false;
  if (res.type === 'opaque') return true;      // فونت‌های gstatic بدون CORS
  if (res.status === 206) return false;        // پاسخ ناقص range
  return res.ok;
}

function offlineFallback() {
  return new Response(
    '<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>FA</title><body style="font-family:sans-serif;padding:40px;text-align:center;color:#555">' +
    '<h2>آفلاین هستید</h2><p>برای اولین بار باید یک اتصال اینترنت داشته باشید.</p></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

function cachedShell() {
  return caches.match('./index.html', { ignoreSearch: true })
    .then((res) => res || caches.match('./'))
    .then((res) => res || offlineFallback());
}

// صفحه اصلی: اول شبکه (همیشه آخرین نسخه)، بعد کش
function navigationHandler(req) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (res) => {
      if (settled) return;
      settled = true;
      resolve(res);
    };

    const timer = setTimeout(() => {
      cachedShell().then(finish).catch(() => finish(offlineFallback()));
    }, NAV_TIMEOUT);

    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        if (isCacheable(res) && res.status !== 206) {
          const copy = res.clone();
          caches.open(CORE_CACHE)
            .then((cache) => cache.put('./index.html', copy))
            .catch(() => {});
        }
        finish(res);
      })
      .catch(() => {
        clearTimeout(timer);
        cachedShell().then(finish).catch(() => finish(offlineFallback()));
      });
  });
}

// فایل‌های همین دامنه: از کش فوری، هم‌زمان نسخه تازه گرفته می‌شه
function staleWhileRevalidate(req) {
  return caches.open(RUNTIME_CACHE).then((cache) =>
    cache.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (isCacheable(res)) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

// فونت‌ها و منابع CDN: از کش، و در پس‌زمینه تازه‌سازی می‌شه
function cacheFirst(req) {
  return caches.open(RUNTIME_CACHE).then((cache) =>
    cache.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (isCacheable(res)) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CORE_CACHE)
      .then((cache) => Promise.all(
        CORE_ASSETS.map((url) => cache.add(url).catch(() => {}))
      ))
      .then(() => self.skipWaiting())
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

// در صورت نیاز، صفحه می‌تونه با postMessage({type:'SKIP_WAITING'}) آپدیت رو فوری فعال کنه
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // درخواست‌های range (مثلاً پخش ویدیو) کش نشُن
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(req));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
