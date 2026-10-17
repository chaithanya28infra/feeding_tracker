const CACHE = "nestlittlebaby-v7";
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll([
          "/",
          "/brand/nest-mark.png",
          "/brand/icon-192.png",
          "/brand/icon-512.png",
          "/favicon.ico",
          "/brand/favicon.ico",
          "/manifest.webmanifest",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("nestlittlebaby-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin ||
    new URL(event.request.url).pathname.startsWith("/api/")
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(event.request)
          .then(
            (r) =>
              r ||
              (event.request.mode === "navigate"
                ? caches.match("/")
                : Response.error()),
          ),
      ),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_ASSETS") {
    const urls = event.data.urls.filter(
      (url) =>
        new URL(url, self.location.origin).origin === self.location.origin,
    );
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(urls)));
  }
});
