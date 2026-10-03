// Minimal service worker: caches ONLY the static app shell so the app opens
// on a weak connection. It deliberately never caches anything under /api —
// student records, grades and fee data must not be stored on a device that
// a whole family (or a shared phone) may use, and stale data shown as
// current would be worse than an honest "you're offline" message.
//
// IMPORTANT: bump this version string on every real deploy. It's what makes
// the browser notice a new version exists at all — without a change here,
// a browser may keep using its cached copy of this very file indefinitely.
const VERSION = "v2";
const SHELL_CACHE = `wwhs-shell-${VERSION}`;
const SHELL_FILES = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)));
  // Does NOT call skipWaiting() here on purpose: a new version installs in
  // the background and waits until the person confirms the on-screen
  // "Refresh" prompt (see UpdateToast.tsx), so nobody loses in-progress
  // work (like a half-finished attendance sheet) to a surprise reload.
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls or anything that isn't a plain GET.
  if (request.method !== "GET" || url.pathname.startsWith("/api")) return;

  // Page navigations: try the network first (so updates show up), fall
  // back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  // Static assets: cached copy first for speed on slow connections.
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
