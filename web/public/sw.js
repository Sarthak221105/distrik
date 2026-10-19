/* Distrik rep PWA service worker.
 *
 * Hand written on purpose: the PRD names Serwist, but Serwist's Next.js
 * integration is a webpack plugin and this app builds with Turbopack, so a
 * small worker we fully control is simpler and has no build step.
 *
 * What it does (PRD 13):
 *  - Precaches the public app shell: /offline, the manifest and icons.
 *  - _next/static assets: cache first (they are content hashed, so immutable).
 *  - Page navigations: network first; /rep pages that loaded fine are kept so
 *    the app starts offline; anything else falls back to /offline.
 *  - Never caches Supabase traffic (a different origin) or RSC/data
 *    requests. Buyer data lives only in the client's IndexedDB (last viewed
 *    lead and thread), which the app clears on sign out.
 *  - Web push: shows the notification and opens its deep link on tap.
 */

const VERSION = "v1";
const SHELL_CACHE = `distrik-shell-${VERSION}`;
const STATIC_CACHE = `distrik-static-${VERSION}`;
const PAGES_CACHE = `distrik-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

const SHELL_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/maskable.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const CACHEABLE_PAGE = /^\/rep(\/|$)/;
const MAX_PAGES = 30;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Add one by one so a missing optional file does not abort install.
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload", credentials: "same-origin" });
            if (res.ok && !res.redirected) await cache.put(url, res);
          } catch {
            /* offline during install: try again on the next install */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE, PAGES_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("distrik-") && !keep.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch {
          /* not supported */
        }
      }
      await self.clients.claim();
    })(),
  );
});

function isRscRequest(request, url) {
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc") || request.headers.get("Next-Router-Prefetch");
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cachePage(url, response) {
  if (!response || !response.ok || response.redirected || response.type !== "basic") return;
  const path = new URL(url).pathname;
  if (!CACHEABLE_PAGE.test(path)) return;
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(path, response);
  await trimCache(PAGES_CACHE, MAX_PAGES);
}

async function handleNavigation(event) {
  const url = new URL(event.request.url);
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    const response = preload || (await fetch(event.request));
    event.waitUntil(cachePage(event.request.url, response.clone()));
    return response;
  } catch {
    const pages = await caches.open(PAGES_CACHE);
    const cached = await pages.match(url.pathname);
    if (cached) return cached;
    const shell = await caches.open(SHELL_CACHE);
    const offline = await shell.match(OFFLINE_URL);
    return (
      offline ||
      new Response("<h1>You are offline</h1><p>Reconnect and try again.</p>", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Supabase (REST, Realtime, Storage, Functions) and every other origin go
  // straight to the network and are never cached.
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (isRscRequest(request, url)) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(fetch(request).catch(() => caches.match("/manifest.webmanifest")));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "CACHE_PAGES" && Array.isArray(data.urls)) {
    event.waitUntil(
      Promise.all(
        data.urls.map(async (u) => {
          try {
            const url = new URL(u, self.location.origin);
            if (url.origin !== self.location.origin || !CACHEABLE_PAGE.test(url.pathname)) return;
            const res = await fetch(url.pathname, { credentials: "same-origin", headers: { Accept: "text/html" } });
            await cachePage(url.href, res);
          } catch {
            /* offline: skip */
          }
        }),
      ),
    );
  } else if (data.type === "CLEAR_PAGES") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  } else if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Distrik", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Distrik";
  const link = data.link || (data.data && data.data.link) || "/rep/notifications";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || data.dedupe_key || undefined,
      data: { link },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/rep/notifications";
  const target = new URL(link, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
              return;
            } catch {
              /* uncontrolled client: fall through */
            }
          }
          client.postMessage({ type: "NAVIGATE", url: target });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
