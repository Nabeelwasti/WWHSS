// Minimal service worker: caches ONLY public static app-shell assets.
// It never caches /api, authenticated/private HTML, documents, uploads, or
// arbitrary cross-origin responses. Private school data must always be fetched
// from the network and must never become a browser cache artifact.
const VERSION = "v3";
const SHELL_CACHE = `wwhs-shell-${VERSION}`;
const SHELL_FILES = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("wwhs-shell-") && key !== SHELL_CACHE).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache API/private school data, including future nested API paths.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/documents/") || url.pathname.startsWith("/uploads/")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  // Navigation is network-first. Offline fallback is the public shell only.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => caches.match("/")));
    return;
  }

  // Only serve known shell assets from cache. Everything else remains network-only.
  if (SHELL_FILES.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request, { cache: "no-store" })));
    return;
  }

  event.respondWith(fetch(request, { cache: "no-store" }));
});
