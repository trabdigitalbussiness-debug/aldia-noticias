// Permite abrir la app sin conexión con las últimas noticias descargadas.
const CACHE = "aldia-v5";
const BASICOS = ["./", "index.html", "styles.css", "app.js", "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(BASICOS).then(() => c.add("noticias.json").catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE && k !== FOTOS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const FOTOS = "aldia-fotos";
const MAX_FOTOS = 200;

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/.netlify/images")) {
    // Fotos: se guardan en el móvil para que la segunda vez salgan al instante.
    e.respondWith(caches.open(FOTOS).then((c) => c.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      if (resp.ok) {
        c.put(e.request, resp.clone());
        c.keys().then((k) => { if (k.length > MAX_FOTOS) k.slice(0, k.length - MAX_FOTOS).forEach((x) => c.delete(x)); });
      }
      return resp;
    }))));
    return;
  }
  if (url.pathname.endsWith("noticias.json") || url.pathname.endsWith("mes.json")) {
    // Noticias: primero la red (siempre lo más nuevo); si no hay conexión, la última copia.
    e.respondWith(
      fetch(e.request)
        .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
