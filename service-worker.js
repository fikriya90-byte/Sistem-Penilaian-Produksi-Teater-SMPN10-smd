/**
 * SP-PPT — Service Worker (PWA Offline Cache)
 */

const CACHE_NAME = "sp-ppt-v1.0.0";
const ASSETS = [
  "/",
  "/index.html",
  "/dashboard.html",
  "/nilai.html",
  "/jadwal.html",
  "/absensi.html",
  "/checklist.html",
  "/struktur.html",
  "/arsip.html",
  "/aduan.html",
  "/rapor.html",
  "/assets/css/style.css",
  "/assets/js/firebase-init.js",
  "/assets/js/auth.js",
  "/assets/js/router.js",
  "/assets/js/utils.js",
  "/assets/js/dashboard.js",
  "/manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Skip Firebase / CDN
  if (url.origin.includes("firebase") || url.origin.includes("gstatic") || url.origin.includes("googleapis")) return;

  e.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request)
          .then((res) => {
            if (res.ok && url.origin === self.location.origin) {
              const clone = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(request, clone));
            }
            return res;
          })
          .catch(() => caches.match("/index.html"))
      );
    })
  );
});
