// Permite abrir la app sin conexión con las últimas noticias descargadas
// y guarda las fotos ya vistas para que la próxima vez salgan al instante.
const CACHE = "aldia-v5";
const CACHE_FOTOS = "aldia-fotos-v1";
const MAX_FOTOS = 300;
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
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE && k !== CACHE_FOTOS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function recortarFotos() {
  const c = await caches.open(CACHE_FOTOS);
  const claves = await c.keys();
  for (const k of claves.slice(0, Math.max(0, claves.length - MAX_FOTOS))) await c.delete(k);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // Noticias y recopilatorio: primero la red (siempre lo más nuevo); si no hay conexión, la última copia.
  if (url.pathname.endsWith("noticias.json") || url.pathname.endsWith("mes.json")) {
    e.respondWith(
      fetch(e.request)
        .then((r) => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Fotos optimizadas: si ya se vio, sale de la memoria del móvil.
  if (url.pathname.startsWith("/.netlify/images")) {
    e.respondWith(
      caches.open(CACHE_FOTOS).then((c) => c.match(e.request).then((guardada) => guardada || fetch(e.request).then((r) => {
        if (r.ok) { c.put(e.request, r.clone()); recortarFotos(); }
        return r;
      })))
    );
    return;
  }

  // Resto de la app: sale al instante de la memoria y se actualiza por detrás para la próxima vez.
  e.respondWith(
    caches.match(e.request).then((guardada) => {
      const red = fetch(e.request).then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
        return r;
      });
      if (guardada) { e.waitUntil(red.catch(() => {})); return guardada; }
      return red;
    })
  );
});
