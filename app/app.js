"use strict";

const estado = { datos: null, error: false, mes: null, mesError: false, filtro: null, busqueda: "", nuevas: false, cargando: false };
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
  for (const h of hijos.flat()) if (h != null && h !== false) n.append(h);
  return n;
}
function icono(d) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = d;
  return s;
}
function haceCuanto(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(min)) return "";
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}
const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const nombreTema = (id) => (estado.datos?.temas.find((t) => t.id === id) || {}).nombre || id;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m) => (m ? MESES[parseInt(m.slice(5, 7), 10) - 1] + " de " + m.slice(0, 4) : "");

// ---------- Preferencias (en este móvil) ----------
const guardadas = () => leer("guardadas", {});
const periodicosOcultos = () => new Set(leer("ocultos", []));

function visibles(noticias) {
  const ocultos = periodicosOcultos();
  return noticias
    .map((n) => ({ ...n, fuentes: n.fuentes.filter((f) => !ocultos.has(f.periodico)) }))
    .filter((n) => n.fuentes.length)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}
const noticiasVisibles = () => visibles(estado.datos.noticias);
const conFiltro = (ns) => (estado.filtro ? ns.filter((n) => n.fuentes.some((f) => f.periodico === estado.filtro)) : ns);

// Lo más importante: lo que cuentan más periódicos en las últimas 24 horas.
function importantes(ns, cuantas) {
  const hace24h = new Date(Date.now() - 864e5).toISOString();
  const recientes = ns.filter((n) => (n.fecha || "") >= hace24h);
  const base = recientes.length >= cuantas ? recientes : ns;
  return [...base].sort((a, b) => b.fuentes.length - a.fuentes.length || (b.fecha || "").localeCompare(a.fecha || "")).slice(0, cuantas);
}

// ---------- Fotos ligeras ----------
// En la web publicada, las fotos pasan por el servicio de imágenes de Netlify,
// que las reduce al tamaño de la pantalla y las convierte a un formato ligero.
const conServicioFotos = !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && location.protocol === "https:";
function fotoLigera(url, ancho, alto) {
  if (!conServicioFotos || !/^https:\/\//.test(url)) return url;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const p = new URLSearchParams({ url, w: String(Math.round(ancho * dpr)), q: "70" });
  if (alto) { p.set("h", String(Math.round(alto * dpr))); p.set("fit", "cover"); }
  return "/.netlify/images?" + p.toString();
}
function foto(n, clase, { grande = false, prioridad = false } = {}) {
  if (!n.imagen) return null;
  const ancho = grande ? Math.min(680, window.innerWidth) : 96;
  const alto = grande ? Math.round(ancho * 9 / 16) : 96;
  const img = el("img", {
    class: clase, src: fotoLigera(n.imagen, ancho, alto), alt: "", width: ancho, height: alto,
    loading: prioridad ? "eager" : "lazy", decoding: "async", fetchpriority: prioridad ? "high" : null, referrerpolicy: "no-referrer",
  });
  // Si la versión ligera falla, se prueba la original; si tampoco carga, la tarjeta queda solo con texto.
  let original = false;
  img.addEventListener("error", () => {
    if (!original && img.src !== n.imagen) { original = true; img.src = n.imagen; return; }
    const c = img.closest(".con-foto"); img.remove(); if (c) c.classList.remove("con-foto");
  });
  return img;
}

// ---------- Piezas ----------
function botonGuardar(n) {
  const marcada = !!guardadas()[n.id];
  const b = el("button", {
    class: "accion", type: "button", "aria-pressed": String(marcada),
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
  }, icono('<path d="M6 3h12v18l-6-4-6 4z"/>'));
  return b;
}

async function compartir(n) {
  const url = n.fuentes[0]?.enlace || location.href;
  const texto = `${n.titulo} (${n.fuentes[0]?.periodico || "al día"})`;
  if (navigator.share) {
    try { await navigator.share({ title: n.titulo, text: texto, url }); } catch (e) {}
    return;
  }
  window.open("https://wa.me/?text=" + encodeURIComponent(`${texto} ${url}`), "_blank", "noopener");
}
const botonCompartir = (n) => el("button", { class: "accion", type: "button", "aria-label": "Compartir noticia", onclick: () => compartir(n) },
  icono('<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v8h14v-8"/>'));

function acciones(n, max) {
  const enlaces = n.fuentes.slice(0, max).map((f) =>
    el("a", { class: "fuente", href: f.enlace, target: "_blank", rel: "noopener noreferrer" }, `${f.periodico} ↗`)
  );
  const resto = n.fuentes.length - max;
  if (resto > 0) enlaces.push(el("span", { class: "fuente", "aria-label": `y ${resto} periódicos más` }, `+${resto}`));
  return el("div", { class: "acciones" }, enlaces, el("span", { class: "botones" }, botonCompartir(n), botonGuardar(n)));
}

function meta(n, conTema) {
  const partes = [];
  if (conTema) partes.push(n.canarias && conTema === "canarias" ? "Canarias" : nombreTema(n.tema));
  partes.push(haceCuanto(n.fecha));
  if (n.fuentes.length > 1) partes.push(`${n.fuentes.length} periódicos`);
  return el("span", { class: "etiqueta" }, partes.join(" · "));
}

function tarjeta(n, conTema = true, numero) {
  return el("article", { class: "noticia" + (n.imagen ? " con-foto" : "") },
    el("div", { class: "cuerpo" },
      numero ? el("span", { class: "numero" }, String(numero)) : null,
      meta(n, conTema),
      el("h2", { class: "titular" }, n.titulo),
      n.resumen ? el("p", {}, n.resumen) : null
    ),
    foto(n, "miniatura"),
    acciones(n, 3)
  );
}

function principal(n, etiqueta) {
  return el("article", { class: "principal" + (n.imagen ? "" : " sin-foto") },
    foto(n, "foto-grande", { grande: true, prioridad: true }),
    el("span", { class: "etiqueta" }, etiqueta),
    el("h2", { class: "titular" }, n.titulo),
    n.resumen ? el("p", {}, n.resumen) : null,
    acciones(n, 3)
  );
}

function lista(noticias, conTema, numerada) {
  if (!noticias.length) return el("p", { class: "vacio" }, "No hay noticias aquí todavía.");
  return el("div", {}, noticias.map((n, i) => tarjeta(n, conTema, numerada ? i + 1 : null)));
}

const seccion = (titulo, enlace, textoEnlace) => el("div", { class: "seccion" },
  el("h2", {}, titulo), enlace ? el("a", { href: enlace }, textoEnlace || "Ver todo →") : null);

// Fila de periódicos para filtrar (se puede desplazar de lado).
function filtroPeriodicos(ns) {
  const cuenta = {};
  for (const n of ns) for (const f of n.fuentes) cuenta[f.periodico] = (cuenta[f.periodico] || 0) + 1;
  const nombres = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a]);
  if (nombres.length < 2) return null;
  if (estado.filtro && !cuenta[estado.filtro]) nombres.unshift(estado.filtro);
  const chip = (nombre, valor) => el("button", {
    class: "chip", type: "button", "aria-pressed": String(estado.filtro === valor),
    onclick: () => { estado.filtro = valor; pintar(); },
  }, nombre);
  return el("div", { class: "chips", role: "group", "aria-label": "Filtrar por periódico" },
    chip("Todos", null), nombres.map((p) => chip(p, p)));
}

function lineaActualizado() {
  const b = el("button", { class: "actualizar", type: "button", onclick: () => cargar(true), "aria-label": "Actualizar noticias" },
    icono('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>'), estado.cargando ? "Actualizando…" : "Actualizar");
  return el("div", { class: "estado" },
    el("span", {}, `Actualizado ${haceCuanto(estado.datos.actualizado)}`), b);
}

// ---------- Vistas ----------
function vistaHoy() {
  const ns = noticiasVisibles();
  if (!ns.length) return [el("p", { class: "vacio" }, "No hay noticias ahora mismo.")];
  const top = importantes(ns, 10);
  const vistas = new Set(top.map((n) => n.id));
  const piezas = [
    lineaActualizado(),
    principal(top[0], `Lo más importante · ${plural(top[0].fuentes.length, "periódico", "periódicos")}`),
    lista(top.slice(1), true, false),
    el("a", { class: "tarjeta-mes", href: "#mes" },
      el("span", { class: "etiqueta" }, "Recopilatorio"),
      el("strong", {}, `Lo más importante de ${MESES[new Date().getMonth()]}`),
      el("span", {}, "Las noticias que más han contado los periódicos este mes →")),
  ];
  const canarias = ns.filter((n) => n.canarias && !vistas.has(n.id));
  if (canarias.length) {
    piezas.push(seccion("Canarias", "#canarias", `Ver ${canarias.length} →`), lista(canarias.slice(0, 3), false));
    canarias.slice(0, 3).forEach((n) => vistas.add(n.id));
  }
  for (const t of estado.datos.temas) {
    const delTema = ns.filter((n) => n.tema === t.id && !vistas.has(n.id));
    if (!delTema.length) continue;
    piezas.push(seccion(t.nombre, `#tema/${t.id}`, `Ver ${ns.filter((n) => n.tema === t.id).length} →`), lista(delTema.slice(0, 3), false));
  }
  return piezas;
}

function vistaCanarias() {
  const todas = noticiasVisibles().filter((n) => n.canarias);
  const ns = conFiltro(todas);
  return [
    el("h1", {}, "Canarias"),
    el("p", { class: "sub" }, `${plural(ns.length, "noticia", "noticias")} de las islas`),
    filtroPeriodicos(todas),
    ns.length ? principal(ns[0], `Canarias · ${haceCuanto(ns[0].fecha)}`) : null,
    lista(ns.slice(1), true),
  ];
}

function vistaTemas() {
  const ns = noticiasVisibles();
  const cuenta = {};
  for (const n of ns) cuenta[n.tema] = (cuenta[n.tema] || 0) + 1;
  const canarias = ns.filter((n) => n.canarias).length;
  const temas = estado.datos.temas.filter((t) => cuenta[t.id]);
  return [
    el("h1", {}, "Temas"),
    el("p", { class: "sub" }, "Elige qué quieres leer"),
    el("div", { class: "cuadricula" },
      el("a", { class: "tema destacado", href: "#mes" }, el("strong", {}, "Lo más importante del mes"), el("span", {}, "Recopilatorio")),
      canarias ? el("a", { class: "tema", href: "#canarias" }, el("strong", {}, "Canarias"), el("span", {}, plural(canarias, "noticia", "noticias"))) : null,
      temas.map((t) =>
        el("a", { class: "tema", href: `#tema/${t.id}` },
          el("strong", {}, t.nombre),
          el("span", {}, plural(cuenta[t.id], "noticia", "noticias"))
        ))
    ),
  ];
}

function vistaTema(id) {
  const todas = noticiasVisibles().filter((n) => n.tema === id);
  const ns = conFiltro(todas);
  return [
    el("a", { class: "volver", href: "#temas" }, "← Temas"),
    el("h1", {}, nombreTema(id)),
    el("p", { class: "sub" }, plural(ns.length, "noticia", "noticias")),
    filtroPeriodicos(todas),
    lista(ns, false),
  ];
}

function vistaBuscar() {
  const caja = el("input", {
    class: "buscador", type: "search", placeholder: "Busca una palabra: vivienda, Tenerife, Real Madrid…",
    value: estado.busqueda, "aria-label": "Buscar noticias", enterkeyhint: "search", autocomplete: "off",
  });
  const resultados = el("div", {});
  const pintarResultados = () => {
    const palabras = sinAcentos(estado.busqueda).split(/\s+/).filter(Boolean);
    if (!palabras.length) {
      resultados.replaceChildren(el("p", { class: "vacio" }, "Escribe para buscar entre todas las noticias de hoy y ayer."));
      return;
    }
    const todas = noticiasVisibles().filter((n) => {
      const texto = sinAcentos(`${n.titulo} ${n.resumen || ""} ${n.fuentes.map((f) => f.periodico).join(" ")}`);
      return palabras.every((p) => texto.includes(p));
    });
    const ns = conFiltro(todas);
    resultados.replaceChildren(
      el("p", { class: "sub" }, plural(ns.length, "resultado", "resultados")),
      filtroPeriodicos(todas) || "",
      ns.length ? lista(ns.slice(0, 80), true) : el("p", { class: "vacio" }, "No hay noticias con esas palabras.")
    );
  };
  let espera;
  caja.addEventListener("input", () => {
    estado.busqueda = caja.value;
    clearTimeout(espera);
    espera = setTimeout(pintarResultados, 150);
  });
  pintarResultados();
  setTimeout(() => { if (!estado.busqueda) caja.focus(); }, 50);
  return [el("h1", {}, "Buscar"), caja, resultados];
}

function vistaMes() {
  const piezas = [el("a", { class: "volver", href: "#hoy" }, "← Hoy")];
  if (!estado.mes && !estado.mesError) { cargarMes(); piezas.push(el("p", { class: "vacio" }, "Cargando el recopilatorio…")); return piezas; }
  const datos = estado.mes || {};
  const ns = visibles(datos.noticias || []).sort((a, b) => (b.max || 0) - (a.max || 0) || (b.visto || 0) - (a.visto || 0));
  piezas.push(
    el("h1", {}, `Lo más importante de ${datos.mes ? MESES[parseInt(datos.mes.slice(5, 7), 10) - 1] : MESES[new Date().getMonth()]}`),
    el("p", { class: "sub" }, "Las noticias que más periódicos han contado durante el mes, de más a menos.")
  );
  if (datos.meses && datos.meses.length > 1) {
    piezas.push(el("div", { class: "chips" }, datos.meses.map((m) => el("button", {
      class: "chip", type: "button", "aria-pressed": String(m === datos.mes),
      onclick: () => cargarMes(m),
    }, nombreMes(m)))));
  }
  if (!ns.length) {
    piezas.push(el("p", { class: "vacio" }, estado.mesError
      ? "No se ha podido cargar el recopilatorio. Revisa la conexión."
      : "El recopilatorio se va llenando solo con cada actualización. Vuelve en unas horas."));
    return piezas;
  }
  piezas.push(lista(ns, true, true));
  return piezas;
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
  const nombres = [...new Set([
    ...(estado.datos.periodicos || []).map((p) => p.nombre),
    ...estado.datos.noticias.flatMap((n) => n.fuentes.map((f) => f.periodico)),
  ])].sort((a, b) => a.localeCompare(b, "es"));
  const fallan = new Set();
  const funcionan = new Set();
  for (const e of estado.datos.estado_fuentes || []) (e.ok ? funcionan : fallan).add(e.periodico);
  const opciones = nombres.map((p) => {
    const id = "p-" + p.replace(/\W+/g, "");
    const sinNoticias = fallan.has(p) && !funcionan.has(p);
    return el("label", { class: "opcion", for: id },
      el("span", {}, p, sinNoticias ? el("small", {}, "Ahora no responde") : null),
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
    "Se recogen cada 30 minutos de los RSS públicos de cada periódico; pulsa un enlace para leer la noticia completa en su web."));
  return piezas;
}

// ---------- Navegación ----------
function pintar() {
  const hash = location.hash.replace(/^#/, "") || "hoy";
  const [seccionActual, param] = hash.split("/");
  const activa = seccionActual === "tema" || seccionActual === "mes" ? "temas" : seccionActual;
  document.querySelectorAll(".menu a, .cabecera .buscar").forEach((a) => {
    if (a.dataset.vista === activa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  aviso.hidden = !estado.nuevas;
  if (estado.error && !estado.datos) { vista.replaceChildren(el("p", { class: "vacio" }, "No se han podido cargar las noticias. Revisa la conexión.")); return; }
  if (!estado.datos) { vista.replaceChildren(el("p", { class: "vacio" }, "Cargando noticias…")); return; }
  // Al escribir en el buscador no se repinta la caja (para no perder el teclado).
  const piezas =
    seccionActual === "canarias" ? vistaCanarias() :
    seccionActual === "temas" ? vistaTemas() :
    seccionActual === "tema" ? vistaTema(param) :
    seccionActual === "buscar" ? vistaBuscar() :
    seccionActual === "mes" ? vistaMes() :
    seccionActual === "guardadas" ? vistaGuardadas() :
    seccionActual === "perfil" ? vistaPerfil() : vistaHoy();
  vista.replaceChildren(...piezas.filter(Boolean));
}
window.addEventListener("hashchange", () => { estado.filtro = null; pintar(); window.scrollTo({ top: 0 }); });

document.getElementById("fecha").textContent =
  new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });

// ---------- Datos ----------
async function pedirNoticias() {
  const r = await fetch("noticias.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function cargar(manual) {
  if (estado.cargando) return;
  estado.cargando = true;
  if (manual) pintar();
  try {
    estado.datos = await pedirNoticias();
    estado.error = false;
    estado.nuevas = false;
  } catch (e) {
    estado.error = true;
  }
  estado.cargando = false;
  pintar();
}

async function cargarMes(m) {
  try {
    const r = await fetch("mes.json" + (m ? "?m=" + encodeURIComponent(m) : ""), { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    estado.mes = await r.json();
    estado.mesError = false;
  } catch (e) {
    estado.mesError = true;
  }
  if (location.hash === "#mes") pintar();
}

// Cada 5 minutos (con la app abierta) mira si hay noticias nuevas y avisa.
const aviso = el("button", { class: "aviso-nuevas", type: "button", hidden: true,
  onclick: async () => { estado.nuevas = false; await cargar(true); window.scrollTo({ top: 0, behavior: "smooth" }); } },
  "Hay noticias nuevas · Ver");
document.body.append(aviso);
async function comprobarNuevas() {
  if (document.hidden || !estado.datos || estado.cargando) return;
  try {
    const d = await pedirNoticias();
    if (d.actualizado && d.actualizado !== estado.datos.actualizado) { estado.nuevas = true; aviso.hidden = false; estado.siguientes = d; }
  } catch (e) {}
}
setInterval(comprobarNuevas, 5 * 60 * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !estado.datos) return;
  // Si vuelves a la app tras más de 30 minutos, se actualiza sola.
  if (Date.now() - new Date(estado.datos.actualizado).getTime() > 30 * 60 * 1000) cargar(false); else comprobarNuevas();
});

// Deslizar hacia abajo desde arriba del todo para actualizar.
(() => {
  let inicio = null;
  const marca = el("div", { class: "tirar", "aria-hidden": "true" }, "Suelta para actualizar");
  document.body.append(marca);
  window.addEventListener("touchstart", (e) => { inicio = window.scrollY <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (inicio == null) return;
    const d = e.touches[0].clientY - inicio;
    marca.classList.toggle("visible", d > 80);
  }, { passive: true });
  window.addEventListener("touchend", () => {
    if (marca.classList.contains("visible")) cargar(true);
    marca.classList.remove("visible");
    inicio = null;
  });
})();

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

pintar();
cargar(false);
