// Idea Vault service worker: makes the app open and navigate with no network.
// Notes live in IndexedDB, so caching the app shell is all offline needs.
const VERSION = "v1";
const PAGES = `pages-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const APP_ROUTES = ["/", "/library", "/ask", "/settings", "/note"];
const STATIC = ["/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const pages = await caches.open(PAGES);
      const assets = await caches.open(ASSETS);
      // Best effort: one failed route shouldn't block installing the rest.
      await Promise.allSettled([
        ...APP_ROUTES.map((path) => pages.add(new Request(path, { cache: "reload" }))),
        ...STATIC.map((path) => assets.add(path)),
      ]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== PAGES && key !== ASSETS) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

const isRsc = (req, url) => req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only our own origin; AI providers, Ollama and Supabase go straight to the network.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req, url));
  } else if (isRsc(req, url)) {
    // Soft-navigation payloads: when offline, fail fast so Next.js falls back
    // to a full navigation, which is served from the page cache below.
    return;
  } else if (url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname) || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirstPage(req, url) {
  const cache = await caches.open(PAGES);
  // Pages are client-rendered shells, so /note?id=… shares the /note entry.
  const key = url.pathname;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic") cache.put(key, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(key)) ||
      (await cache.match("/")) ||
      new Response("You're offline and this page isn't cached yet.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
