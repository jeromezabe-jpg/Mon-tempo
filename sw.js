// Service worker de « Mon Tempo » : vérifie la couleur de demain en arrière-plan et prévient.
const API = "https://www.api-couleur-tempo.fr/api/jourTempo/tomorrow";
const NAMES = { 1: ["BLEU", "💧"], 2: ["BLANC", "❄️"], 3: ["ROUGE", "🔥"] };

const CACHE = "mon-tempo-v3";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
// Appli disponible hors ligne : on sert le réseau en priorité, sinon la copie en cache
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match("./index.html"))));
});
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

async function lastNotified() {
  const c = await caches.open("tempo-state");
  const r = await c.match("/notified");
  return r ? r.text() : "";
}
async function setNotified(d) {
  const c = await caches.open("tempo-state");
  await c.put("/notified", new Response(d));
}

async function check() {
  try {
    let j = null;
    // 1) Kelwatt via le relais, si configuré
    try {
      const c = await caches.open("tempo-state"), rr = await c.match("/relay"), url = rr ? await rr.text() : "";
      if (url) { const k = await (await fetch(url, { cache: "no-store" })).json(); if (k && k.status === "ok" && k.tomorrow && k.tomorrow.codeJour) j = k.tomorrow; }
    } catch (e) {}
    if (!j) try { const r = await fetch(API, { cache: "no-store" }); j = await r.json(); } catch (e) {}
    if (!j || !j.codeJour) {
      // Secours : calendrier-tempo.fr
      try {
        const b = await (await fetch("https://www.calendrier-tempo.fr/api/tomorrow", { cache: "no-store" })).json();
        if (b && b.status === "ok") j = { dateJour: b.date, codeJour: +b.code };
      } catch (e) {}
    }
    if (!j || !j.codeJour || !NAMES[j.codeJour]) return;
    const sig = j.dateJour + ":" + j.codeJour, prev = await lastNotified();
    if (prev === sig) return;
    const changed = prev.startsWith(j.dateJour + ":");
    // Si une fenêtre de l'appli est ouverte, elle gère elle-même l'alerte
    const wins = await self.clients.matchAll({ type: "window" });
    if (wins.some(w => w.visibilityState === "visible")) return;
    await setNotified(sig);
    const [n, e] = NAMES[j.codeJour];
    const extra = j.codeJour === 3 ? " Décale tes gros appareils en heures creuses." : "";
    await self.registration.showNotification((changed ? "⚠️ Changement · " : "") + `Tempo : demain jour ${n} ${e}`, {
      body: new Date(j.dateJour + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + "." + extra,
      tag: "tempo",
      renotify: true
    });
  } catch (e) {}
}

self.addEventListener("periodicsync", e => { if (e.tag === "tempo-check") e.waitUntil(check()); });
self.addEventListener("message", e => {
  if (e.data === "check") e.waitUntil(check());
  else if (e.data && e.data.type === "relay") e.waitUntil(caches.open("tempo-state").then(c => c.put("/relay", new Response(e.data.url || ""))));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.length) return wins[0].focus();
    return self.clients.openWindow("./");
  })());
});
