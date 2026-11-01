// Keeps the app shell available without a connection. Firestore has its own
// offline cache, so only this site's files are handled here.
const cacheName = "stocksync-v3";

async function cacheShell() {
  const cache = await caches.open(cacheName);
  const page = await fetch("/", { cache: "reload" });
  await cache.put("/", page);
  // Screens load on demand, so all of them are stored for offline use.
  const list = await fetch("/asset-list.json", { cache: "reload" });
  await cache.addAll([
    "/manifest.webmanifest",
    "/favicon.svg",
    ...(await list.json()),
  ]);
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== cacheName)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function latestPage(request) {
  try {
    const page = await fetch(request);
    const cache = await caches.open(cacheName);
    await cache.put("/", page.clone());
    return page;
  } catch {
    return (await caches.match("/")) ?? Response.error();
  }
}

async function storedFile(request) {
  // Module scripts send an Origin header, so a Vary: Origin file would never match.
  const stored = await caches.match(request, { ignoreVary: true });
  if (stored) return stored;
  const file = await fetch(request);
  if (file.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, file.clone());
  }
  return file;
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // /__/ is Firebase's own sign-in handler and must always reach the network.
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/__/")
  )
    return;
  event.respondWith(
    event.request.mode === "navigate"
      ? latestPage(event.request)
      : storedFile(event.request),
  );
});
