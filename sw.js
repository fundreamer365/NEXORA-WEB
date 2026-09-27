/* ============================================================
   NEXORA Service Worker
   Стратегия:
   - Навигация и код (HTML/JS/CSS) — network-first (свежесть важнее).
   - Статика (иконки, manifest, шрифты) — cache-first.
   - Supabase API — не перехватываем вообще.
   ============================================================ */

const CACHE = "nexora-v2";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./i18n.js",
  "./themes.js",
  "./manifest.json",
];

const CACHE_FIRST_EXT = /\.(png|jpg|jpeg|webp|gif|svg|ico|woff2?|ttf|otf|eot)$/i;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Supabase API — не перехватываем
  if (url.hostname.endsWith("supabase.co")) return;

  // Внешние домены (CDN, шрифты и т.д.) — не перехватываем
  if (url.origin !== self.location.origin) return;

  // Навигация — network-first
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // Код (HTML/JS/CSS) — network-first
  if (/\.(?:html|js|css)(?:\?|$)/i.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Статика (иконки, шрифты, manifest) — cache-first
  if (CACHE_FIRST_EXT.test(url.pathname) || url.pathname.endsWith("manifest.json")) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        });
      })
    );
    return;
  }

  // Всё остальное — network с fallback на кэш
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});

/* --------- Push-уведомления (как было) --------- */
self.addEventListener("push", (e) => {
  let data = { title: "NEXORA", body: "Новое сообщение" };
  try {
    data = e.data.json();
  } catch (_) {}
  e.waitUntil(
    self.registration.showNotification(data.title || "NEXORA", {
      body: data.body || "",
      icon: "assets/icon-192.png",
      badge: "assets/icon-192.png",
      data: data.url ? { url: data.url } : undefined,
      vibrate: [100, 50, 100],
      tag: data.tag || "nexora",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.focus();
          c.navigate(target);
          return;
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
