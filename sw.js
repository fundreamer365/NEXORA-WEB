/* NEXORA Service Worker — кэш + push-уведомления */

const CACHE = "nexora-v1";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./manifest.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Не кэшируем Supabase API
  if (url.hostname.endsWith("supabase.co")) return;

  e.respondWith(
    caches.match(req).then(hit => {
      const fetchPromise = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || fetchPromise;
    })
  );
});

/* --------- Push-уведомления --------- */
self.addEventListener("push", (e) => {
  let data = { title: "NEXORA", body: "Новое сообщение" };
  try { data = e.data.json(); } catch (_) {}
  e.waitUntil(self.registration.showNotification(data.title || "NEXORA", {
    body: data.body || "",
    icon: "assets/icon-192.png",
    badge: "assets/icon-192.png",
    data: data.url ? { url: data.url } : undefined,
    vibrate: [100, 50, 100],
    tag: data.tag || "nexora",
    renotify: true,
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if ("focus" in c) { c.focus(); c.navigate(target); return; }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});