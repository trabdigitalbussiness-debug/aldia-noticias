"use strict";

const estado = { datos: null, error: false };
const vista = document.getElementById("vista");

// ---------- Utilidades ----------
function leer(clave, porDefecto) {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) : porDefecto; } catch (e) { return porDefecto; }
}
function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
}
function el(etiqueta, props, ...hijos) {
  const n = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const h of hijos.flat()) if (h != null) n.append(h);
  return n;
}
function haceCuanto(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(min)) return "";
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}
const nombreTema = (id) => (estado.datos?.temas.find((t) => t.id === id) || {}).nombre || id;

// ---------- Preferencias (en este móvil) ----------
const guardadas = () => leer("guardadas", {});
const periodicosOcultos = () => new Set(leer("ocultos", []));

function noticiasVisibles() {
  const ocultos = periodicosOcultos();
  return estado.datos.noticias
    .map((n) => ({ ...n, fuentes: n.fuentes.filter((f) => !ocultos.has(f.periodico)) }))
    .filter((n) => n.fuentes.length)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}

// ---------- Piezas ----------
function botonGuardar(n) {
  const marcada = !!guardadas()[n.id];
  const b = el("button", {
    class: "guardar", type: "button", "aria-pressed": String(marcada),
    "aria-label": marcada ? "Quitar de guardadas" : "Guardar noticia",
    onclick: () => {
      const g = guardadas();
      if (g[n.id]) delete g[n.id]; else g[n.id] = { ...n, guardada: new Date().toISOString() };
      escribir("guardadas", g);
      const ahora = !!g[n.id];
      b.setAttribute("aria-pressed", String(ahora));
      b.setAttribute("aria-label", ahora ? "Quitar de guardadas" : "Guardar noticia");
      if (location.hash === "#guardadas" && !ahora) pintar();
    },
  });
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>';
  return b;
}

function acciones(n, max) {
  const enlaces = n.fuentes.slice(0, max).map((f) =>
    el("a", { class: "fuente", href: f.enlace, target: "_blank", rel: "noopener noreferrer", title: f.titulo }, `${f.periodico} ↗`)
  );
  const resto = n.fuentes.length - max;
  if (resto > 0) enlaces.push(el("span", { class: "fuente", "aria-label": `y ${resto} periódicos más` }, `+${resto}`));
  return el("div", { class: "acciones" }, enlaces, botonGuardar(n));
}

function meta(n, conTema) {
  const partes = [];
  if (conTema) partes.push(nombreTema(n.tema));
  partes.push(haceCuanto(n.fecha));
  if (n.fuentes.length > 1) partes.push(`${n.fuentes.length} periódicos`);
  return el("span", { class: "etiqueta" }, partes.join(" · "));
}

function foto(n, clase) {
  if (!n.imagen) return null;
  const img = el("img", { class: clase, src: n.imagen, alt: "", loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  // Si la foto no carga, se quita y la tarjeta queda solo con texto.
  img.addEventListener("error", () => { const c = img.closest(".con-foto"); img.remove(); if (c) c.classList.remove("con-foto"); });
  return img;
}

function tarjeta(n, conTema = true) {
  return el("article", { class: "noticia" + (n.imagen ? " con-foto" : "") },
    el("div", { class: "cuerpo" },
      meta(n, conTema),
      el("h2", { class: "titular" }, n.titulo),
      n.resumen ? el("p", {}, n.resumen) : null
    ),
    foto(n, "miniatura"),
    acciones(n, 3)
  );
}

function lista(noticias, conTema) {
  if (!noticias.length) return el("p", { class: "vacio" }, "No hay noticias aquí todavía.");
  return el("div", {}, noticias.map((n) => tarjeta(n, conTema)));
}

// ---------- Vistas ----------
function vistaHoy() {
  const ns = noticiasVisibles();
  if (!ns.length) return [el("p", { class: "vacio" }, "No hay noticias ahora mismo.")];
  // La principal: la que más periódicos publican (si empatan, la más reciente).
  const principal = ns.reduce((m, n) => (n.fuentes.length > m.fuentes.length ? n : m), ns[0]);
  const resto = ns.filter((n) => n !== principal);
  return [
    el("article", { class: "principal" },
      foto(principal, "foto-grande"),
      el("span", { class: "etiqueta" }, `Lo más importante · ${principal.fuentes.length} ${principal.fuentes.length === 1 ? "periódico" : "periódicos"}`),
      el("h2", { class: "titular" }, principal.titulo),
      principal.resumen ? el("p", {}, principal.resumen) : null,
      acciones(principal, 3)
    ),
    lista(resto, true),
  ];
}

function vistaTemas() {
  const ns = noticiasVisibles();
  const cuenta = {};
  for (const n of ns) cuenta[n.tema] = (cuenta[n.tema] || 0) + 1;
  const temas = estado.datos.temas.filter((t) => cuenta[t.id]);
  const max = Math.max(0, ...temas.map((t) => cuenta[t.id]));
  const min = Math.min(...temas.map((t) => cuenta[t.id]));
  const destacado = max > min ? (temas.find((t) => cuenta[t.id] === max) || {}).id : null;
  return [
    el("h1", {}, "Temas"),
    el("p", { class: "sub" }, "Elige qué quieres leer"),
    temas.length
      ? el("div", { class: "cuadricula" }, temas.map((t) =>
          el("a", { class: "tema" + (t.id === destacado ? " destacado" : ""), href: `#tema/${t.id}` },
            el("strong", {}, t.nombre),
            el("span", {}, `${cuenta[t.id]} ${cuenta[t.id] === 1 ? "noticia" : "noticias"}`)
          )))
      : el("p", { class: "vacio" }, "No hay noticias ahora mismo."),
  ];
}

function vistaTema(id) {
  const ns = noticiasVisibles().filter((n) => n.tema === id);
  return [
    el("a", { class: "volver", href: "#temas" }, "← Temas"),
    el("h1", {}, nombreTema(id)),
    el("p", { class: "sub" }, `${ns.length} ${ns.length === 1 ? "noticia" : "noticias"}`),
    lista(ns, false),
  ];
}

function vistaGuardadas() {
  const ns = Object.values(guardadas()).sort((a, b) => (b.guardada || "").localeCompare(a.guardada || ""));
  return [
    el("h1", {}, "Guardadas"),
    el("p", { class: "sub" }, "Se quedan en este móvil aunque la noticia ya no salga en portada."),
    ns.length ? lista(ns, true) : el("p", { class: "vacio" }, "Pulsa el marcador de una noticia para guardarla aquí."),
  ];
}

function vistaPerfil() {
  const ocultos = periodicosOcultos();
  const nombres = [...new Set(estado.datos.noticias.flatMap((n) => n.fuentes.map((f) => f.periodico)))]
    .concat((estado.datos.estado_fuentes || []).map((e) => e.periodico))
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => a.localeCompare(b, "es"));
  const opciones = nombres.map((p) => {
    const id = "p-" + p.replace(/\W+/g, "");
    return el("label", { class: "opcion", for: id },
      p,
      el("input", {
        type: "checkbox", id, checked: !ocultos.has(p),
        onchange: (e) => {
          const s = periodicosOcultos();
          if (e.target.checked) s.delete(p); else s.add(p);
          escribir("ocultos", [...s]);
        },
      })
    );
  });
  const piezas = [
    el("h1", {}, "Perfil"),
    el("p", { class: "sub" }, "Tus preferencias se guardan solo en este móvil."),
    el("h2", { class: "etiqueta" }, "Periódicos que quieres ver"),
    el("div", { class: "ajustes" }, opciones),
  ];
  if (avisoInstalar) {
    piezas.push(el("p", { class: "nota" }, "Instala al día para abrirla desde la pantalla de inicio:"),
      el("button", { class: "boton", type: "button", onclick: instalar }, "Instalar app"));
  } else if (esIOS && !instalada) {
    piezas.push(el("p", { class: "nota" }, "Para instalarla en iPhone: pulsa Compartir y luego «Añadir a pantalla de inicio»."));
  }
  const act = new Date(estado.datos.actualizado);
  piezas.push(el("p", { class: "nota" },
    `Noticias actualizadas el ${act.toLocaleString("es-ES", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}. ` +
    "Los resúmenes salen de los RSS públicos de cada periódico; pulsa un enlace para leer la noticia completa en su web."));
  return piezas;
}

// ---------- Navegación ----------
function pintar() {
  const hash = location.hash.replace(/^#/, "") || "hoy";
  const [seccion, param] = hash.split("/");
  const activa = seccion === "tema" ? "temas" : seccion;
  document.querySelectorAll(".menu a").forEach((a) => {
    if (a.dataset.vista === activa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  if (estado.error) { vista.replaceChildren(el("p", { class: "vacio" }, "No se han podido cargar las noticias. Revisa la conexión.")); return; }
  if (!estado.datos) { vista.replaceChildren(el("p", { class: "vacio" }, "Cargando noticias…")); return; }
  const piezas =
    seccion === "temas" ? vistaTemas() :
    seccion === "tema" ? vistaTema(param) :
    seccion === "guardadas" ? vistaGuardadas() :
    seccion === "perfil" ? vistaPerfil() : vistaHoy();
  vista.replaceChildren(...piezas);
}
window.addEventListener("hashchange", () => { pintar(); window.scrollTo({ top: 0 }); });

document.getElementById("fecha").textContent =
  new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });

async function cargar() {
  pintar();
  try {
    const r = await fetch("noticias.json", { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    estado.datos = await r.json();
  } catch (e) {
    estado.error = true;
  }
  pintar();
}

// ---------- Instalación ----------
let avisoInstalar = null;
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  avisoInstalar = e;
  if (location.hash === "#perfil") pintar();
});
async function instalar() {
  if (!avisoInstalar) return;
  avisoInstalar.prompt();
  await avisoInstalar.userChoice;
  avisoInstalar = null;
  pintar();
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}

cargar();
