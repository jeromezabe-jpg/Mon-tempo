// Service worker de « Mon Tempo » : appli hors ligne + réception des notifications push.
const CACHE = "mon-tempo-v4";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./badge-96.png"];
const DEFAULT_RELAY = "https://mon-tempo.jerome-zabe.workers.dev";
const OPTS = { icon: "icon-192.png", badge: "badge-96.png", vibrate: [200, 100, 200] };

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("mon-tempo-") && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Appli disponible hors ligne : réseau en priorité, sinon copie en cache
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});

async function relay() {
  try {
    const c = await caches.open("tempo-state"), r = await c.match("/relay");
    if (r) return (await r.text()).trim().replace(/\/+$/, "");
  } catch (e) {}
  return DEFAULT_RELAY;
}

// Notification push envoyée par le relais : on lit le message à afficher
self.addEventListener("push", e => e.waitUntil((async () => {
  let msg = { title: "Mon Tempo", body: "La couleur Tempo de demain est disponible.", tag: "tempo" };
  try {
    const sub = await self.registration.pushManager.getSubscription();
    const base = (await relay()) || DEFAULT_RELAY;
    const r = await fetch(base + "/latest?ep=" + encodeURIComponent(sub ? sub.endpoint : ""), { cache: "no-store" });
    const j = await r.json();
    if (j && j.title) msg = j;
  } catch (err) {}
  await self.registration.showNotification(msg.title, { ...OPTS, body: msg.body, tag: "tempo", renotify: true, data: { url: "./" } });
})()));

self.addEventListener("message", e => {
  if (e.data && e.data.type === "relay") e.waitUntil(caches.open("tempo-state").then(c => c.put("/relay", new Response(e.data.url || ""))));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow("./");
  })());
});
