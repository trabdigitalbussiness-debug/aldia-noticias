"use strict";

const estado = { datos: null, error: false, nuevos: null, mes: {}, busqueda: "", ultimaComprobacion: 0 };
const vista = document.getElementById("vista");
const POR_PAGINA = 20;
const CADA_CUANTO_COMPROBAR = 5 * 60 * 1000;

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
function icono(ruta, extra = "") {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ruta + extra;
  return s;
}
const ICONOS = {
  compartir: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  guardar: '<path d="M6 3h12v18l-6-4-6 4z"/>',
};
const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
function haceCuanto(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!isFinite(min)) return "";
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const nombreTema = (id) => (estado.datos?.temas.find((t) => t.id === id) || {}).nombre || id;
const nombreMes = (clave) => new Date(clave + "-15T12:00:00Z").toLocaleDateString("es-ES", { month: "long" });

let temporizadorAviso;
function aviso(texto) {
  let t = document.querySelector(".aviso");
  if (!t) { t = el("div", { class: "aviso", role: "status" }); document.body.append(t); }
  t.textContent = texto;
  t.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => t.classList.remove("visible"), 2500);
}

// ---------- Preferencias (en este móvil) ----------
const guardadas = () => leer("guardadas", {});
const periodicosOcultos = () => new Set(leer("ocultos", []));
const canariasEnHoy = () => leer("canariasEnHoy", false);
const filtroPeriodico = () => leer("filtroPeriodico", "");

const regionales = () => new Set((estado.datos.periodicos || []).filter((p) => p.region).map((p) => p.nombre));

// Noticias quitando los periódicos que la persona ha ocultado, de más nueva a más vieja.
function noticiasBase() {
  const ocultos = periodicosOcultos();
  return estado.datos.noticias
    .map((n) => (ocultos.size ? { ...n, fuentes: n.fuentes.filter((f) => !ocultos.has(f.periodico)) } : n))
    .filter((n) => n.fuentes.length)
    .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
}
// Para Hoy y Temas: las noticias locales de Canarias que solo publican los periódicos
// canarios se quedan en «Canarias» (salvo que se active en Perfil).
function noticiasGenerales() {
  const ns = noticiasBase();
  if (canariasEnHoy()) return ns;
  const reg = regionales();
  return ns.filter((n) => n.region !== "canarias" || n.fuentes.some((f) => !reg.has(f.periodico)));
}
const noticiasCanarias = () => noticiasBase().filter((n) => n.region === "canarias");

function aplicarFiltro(ns) {
  const f = filtroPeriodico();
  return f ? ns.filter((n) => n.fuentes.some((x) => x.periodico === f)) : ns;
}

// ---------- Fotos ----------
// En Netlify las fotos pasan por su servicio de imágenes: las recorta al tamaño justo
// y las convierte a WebP/AVIF, así pesan una fracción y cargan mucho antes.
const usarCdnImagenes = !/^(localhost|127\.|\[::1\])/.test(location.hostname) && location.protocol === "https:";
function urlImagen(src, ancho, alto) {
  if (!usarCdnImagenes) return src;
  return `/.netlify/images?url=${encodeURIComponent(src)}&w=${ancho}&h=${alto}&fit=cover&q=70`;
}
function foto(n, clase, grande = false) {
  if (!n.imagen) return null;
  const [w, h] = grande ? [800, 450] : [192, 192];
  const img = el("img", {
    class: clase, src: urlImagen(n.imagen, w, h), alt: "", width: grande ? 800 : 96, height: grande ? 450 : 96,
    loading: grande ? "eager" : "lazy", fetchpriority: grande ? "high" : "low", decoding: "async", referrerpolicy: "no-referrer",
  });
  img.addEventListener("load", () => img.classList.add("cargada"));
  img.addEventListener("error", () => {
    // Si falla la versión optimizada, se prueba la original; si tampoco, la tarjeta queda solo con texto.
    if (img.src.includes("/.netlify/images") && !img.dataset.original) { img.dataset.original = "1"; img.src = n.imagen; return; }
    const c = img.closest(".con-foto"); img.remove(); if (c) c.classList.remove("con-foto");
  });
  return img;
}

// ---------- Piezas ----------
function botonGuardar(n) {
  const marcada = !!guardadas()[n.id];
  const b = el("button", {
    class: "icono-boton guardar", type: "button", "aria-pressed": String(marcada),
    "aria-label": marcada ? "Quitar de guardadas" : "Guardar noticia",
    onclick: () => {
      const g = guardadas();
      if (g[n.id]) delete g[n.id]; else g[n.id] = { ...n, guardada: new Date().toISOString() };
      escribir("guardadas", g);
      const ahora = !!g[n.id];
      b.setAttribute("aria-pressed", String(ahora));
      b.setAttribute("aria-label", ahora ? "Quitar de guardadas" : "Guardar noticia");
      aviso(ahora ? "Guardada" : "Quitada de guardadas");
      if (location.hash === "#guardadas" && !ahora) pintar();
    },
  }, icono(ICONOS.guardar));
  return b;
}

function botonCompartir(n) {
  return el("button", { class: "icono-boton", type: "button", "aria-label": "Compartir noticia", onclick: () => compartir(n) }, icono(ICONOS.compartir));
}

async function compartir(n) {
  const url = n.fuentes[0].enlace;
  const datos = { title: n.titulo, text: `${n.titulo} (${n.fuentes[0].periodico})`, url };
  if (navigator.share) {
    try { await navigator.share(datos); } catch (e) { /* cancelado */ }
    return;
  }
  hojaCompartir(n, url);
}

function hojaCompartir(n, url) {
  document.querySelector(".hoja")?.remove();
  const texto = `${n.titulo} ${url}`;
  const cerrar = () => hoja.remove();
  const hoja = el("div", { class: "hoja", role: "dialog", "aria-modal": "true", "aria-label": "Compartir", onclick: (e) => { if (e.target === hoja) cerrar(); } },
    el("div", { class: "hoja-caja" },
      el("p", { class: "etiqueta" }, "Compartir"),
      el("p", { class: "hoja-titulo" }, n.titulo),
      el("a", { class: "boton", href: `https://wa.me/?text=${encodeURIComponent(texto)}`, target: "_blank", rel: "noopener noreferrer", onclick: cerrar }, "WhatsApp"),
      el("a", { class: "boton secundario", href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(n.titulo)}`, target: "_blank", rel: "noopener noreferrer", onclick: cerrar }, "Telegram"),
      el("a", { class: "boton secundario", href: `mailto:?subject=${encodeURIComponent(n.titulo)}&body=${encodeURIComponent(url)}`, onclick: cerrar }, "Correo"),
      el("button", { class: "boton secundario", type: "button", onclick: async () => {
        try { await navigator.clipboard.writeText(url); aviso("Enlace copiado"); } catch (e) { prompt("Copia el enlace:", url); }
        cerrar();
      } }, "Copiar enlace"),
      el("button", { class: "boton texto", type: "button", onclick: cerrar }, "Cancelar")
    )
  );
  document.addEventListener("keydown", function esc(e) { if (e.key === "Escape") { cerrar(); document.removeEventListener("keydown", esc); } });
  document.body.append(hoja);
  hoja.querySelector("a, button").focus();
}

function acciones(n, max) {
  const enlaces = n.fuentes.slice(0, max).map((f) =>
    el("a", { class: "fuente", href: f.enlace, target: "_blank", rel: "noopener noreferrer", title: f.titulo }, `${f.periodico} ↗`)
  );
  const resto = n.fuentes.length - max;
  if (resto > 0) {
    const mas = el("button", { class: "fuente", type: "button", "aria-label": `Ver ${resto} periódicos más`, onclick: () => {
      mas.replaceWith(...n.fuentes.slice(max).map((f) =>
        el("a", { class: "fuente", href: f.enlace, target: "_blank", rel: "noopener noreferrer", title: f.titulo }, `${f.periodico} ↗`)));
    } }, `+${resto}`);
    enlaces.push(mas);
  }
  return el("div", { class: "acciones" }, el("div", { class: "fuentes" }, enlaces), botonCompartir(n), botonGuardar(n));
}

function meta(n, conTema) {
  const partes = [];
  if (conTema) partes.push(nombreTema(n.tema));
  if (n.region === "canarias" && conTema) partes.push("Canarias");
  partes.push(haceCuanto(n.fecha));
  if (n.fuentes.length > 1) partes.push(`${n.fuentes.length} periódicos`);
  return el("span", { class: "etiqueta" }, partes.join(" · "));
}

function tarjeta(n, conTema = true, puesto = null) {
  return el("article", { class: "noticia" + (n.imagen ? " con-foto" : "") + (puesto ? " con-puesto" : "") },
    el("div", { class: "cuerpo" },
      puesto ? el("span", { class: "puesto", "aria-label": `Número ${puesto}` }, String(puesto)) : null,
      meta(n, conTema),
      el("h2", { class: "titular" }, n.titulo),
      n.resumen ? el("p", {}, n.resumen) : null
    ),
    foto(n, "miniatura"),
    acciones(n, 3)
  );
}

function principal(n, etiquetaTexto) {
  return el("article", { class: "principal" },
    foto(n, "foto-grande", true),
    el("span", { class: "etiqueta" }, `${etiquetaTexto} · ${plural(n.fuentes.length, "periódico", "periódicos")}`),
    el("h2", { class: "titular" }, n.titulo),
    n.resumen ? el("p", {}, n.resumen) : null,
    acciones(n, 3)
  );
}

// Lista que enseña 20 noticias y un botón para ver más (la página carga mucho más rápido).
function lista(noticias, conTema, { numerada = false, vacio = "No hay noticias aquí todavía." } = {}) {
  if (!noticias.length) return el("p", { class: "vacio" }, vacio);
  const caja = el("div", { class: "lista" });
  let mostradas = 0;
  const boton = el("button", { class: "boton secundario ver-mas", type: "button", onclick: () => mas() });
  function mas() {
    const trozo = noticias.slice(mostradas, mostradas + POR_PAGINA);
    caja.append(...trozo.map((n, i) => tarjeta(n, conTema, numerada ? mostradas + i + 1 : null)));
    mostradas += trozo.length;
    const quedan = noticias.length - mostradas;
    if (quedan > 0) { boton.textContent = `Ver más noticias (${quedan})`; caja.append(boton); } else boton.remove();
  }
  mas();
  return caja;
}

// Fila de botones para ver solo un periódico.
function barraPeriodicos(ns) {
  const actual = filtroPeriodico();
  const cuenta = new Map();
  for (const n of ns) for (const f of n.fuentes) cuenta.set(f.periodico, (cuenta.get(f.periodico) || 0) + 1);
  const nombres = [...cuenta.keys()].sort((a, b) => cuenta.get(b) - cuenta.get(a));
  if (actual && !cuenta.has(actual)) nombres.unshift(actual);
  if (nombres.length < 2 && !actual) return null;
  const chip = (valor, texto) => el("button", {
    class: "chip", type: "button", "aria-pressed": String(actual === valor),
    onclick: () => { escribir("filtroPeriodico", valor); pintar(); },
  }, texto);
  return el("div", { class: "chips", role: "group", "aria-label": "Ver solo un periódico" },
    chip("", "Todos"),
    nombres.map((p) => chip(p, cuenta.has(p) ? `${p} · ${cuenta.get(p)}` : p))
  );
}

function bannerNuevas() {
  if (!estado.nuevos) return null;
  return el("button", { class: "banner-nuevas", type: "button", onclick: aplicarNuevas },
    `${plural(estado.nuevos.cuantas, "noticia nueva", "noticias nuevas")} · Ver`);
}

function tarjetaMes() {
  const mes = new Date().toISOString().slice(0, 7);
  return el("a", { class: "tarjeta-mes", href: "#mes" },
    el("span", { class: "etiqueta" }, "Recopilatorio"),
    el("strong", {}, `Lo más importante de ${nombreMes(mes)}`),
    el("span", {}, "Las noticias que más periódicos han contado este mes →")
  );
}

// ---------- Vistas ----------
function vistaHoy() {
  const todas = noticiasGenerales();
  const ns = aplicarFiltro(todas);
  const piezas = [bannerNuevas(), barraPeriodicos(todas)];
  if (!ns.length) return [...piezas, el("p", { class: "vacio" }, "No hay noticias ahora mismo.")];
  // La principal: la que más periódicos publican (si empatan, la más reciente).
  const top = ns.reduce((m, n) => (n.fuentes.length > m.fuentes.length ? n : m), ns[0]);
  return [...piezas, principal(top, "Lo más importante"), tarjetaMes(), lista(ns.filter((n) => n !== top), true)];
}

function vistaTemas() {
  const ns = noticiasGenerales();
  const cuenta = {};
  for (const n of ns) cuenta[n.tema] = (cuenta[n.tema] || 0) + 1;
  const temas = estado.datos.temas.filter((t) => cuenta[t.id]);
  const max = Math.max(0, ...temas.map((t) => cuenta[t.id]));
  const min = Math.min(...temas.map((t) => cuenta[t.id]));
  const destacado = max > min ? (temas.find((t) => cuenta[t.id] === max) || {}).id : null;
  const canarias = noticiasCanarias().length;
  return [
    el("h1", {}, "Temas"),
    el("p", { class: "sub" }, "Elige qué quieres leer"),
    el("div", { class: "cuadricula" },
      temas.map((t) =>
        el("a", { class: "tema" + (t.id === destacado ? " destacado" : ""), href: `#tema/${t.id}` },
          el("strong", {}, t.nombre),
          el("span", {}, plural(cuenta[t.id], "noticia", "noticias"))
        )),
      el("a", { class: "tema", href: "#canarias" }, el("strong", {}, "Canarias"), el("span", {}, plural(canarias, "noticia", "noticias"))),
      el("a", { class: "tema ancho", href: "#mes" }, el("strong", {}, `Lo más importante de ${nombreMes(new Date().toISOString().slice(0, 7))}`), el("span", {}, "Recopilatorio del mes"))
    ),
  ];
}

function vistaTema(id) {
  const todas = noticiasGenerales().filter((n) => n.tema === id);
  const ns = aplicarFiltro(todas);
  return [
    el("a", { class: "volver", href: "#temas" }, "← Temas"),
    el("h1", {}, nombreTema(id)),
    el("p", { class: "sub" }, plural(ns.length, "noticia", "noticias")),
    barraPeriodicos(todas),
    lista(ns, false),
  ];
}

function vistaCanarias() {
  const todas = noticiasCanarias();
  const ns = aplicarFiltro(todas);
  const piezas = [
    el("h1", {}, "Canarias"),
    el("p", { class: "sub" }, "Lo que pasa en las islas, de los periódicos canarios y nacionales"),
    barraPeriodicos(todas),
  ];
  if (!ns.length) return [...piezas, el("p", { class: "vacio" }, "No hay noticias de Canarias ahora mismo.")];
  const top = ns.reduce((m, n) => (n.fuentes.length > m.fuentes.length ? n : m), ns[0]);
  return [...piezas, principal(top, "Lo más importante en Canarias"), lista(ns.filter((n) => n !== top), true)];
}

async function cargarMes(clave) {
  const k = clave || "actual";
  if (estado.mes[k]) return;
  estado.mes[k] = { cargando: true };
  try {
    const r = await fetch("mes.json" + (clave ? `?m=${clave}` : ""), { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    estado.mes[k] = await r.json();
  } catch (e) {
    estado.mes[k] = { error: true };
  }
  if (location.hash.startsWith("#mes")) pintar();
}

function vistaMes(clave) {
  const k = clave || "actual";
  const datos = estado.mes[k];
  if (!datos) { cargarMes(clave); return [el("p", { class: "vacio" }, "Cargando el recopilatorio…")]; }
  if (datos.cargando) return [el("p", { class: "vacio" }, "Cargando el recopilatorio…")];
  const mes = datos.mes || new Date().toISOString().slice(0, 7);
  const ocultos = periodicosOcultos();
  let ns = (datos.noticias || []).map((n) => ({ ...n, fuentes: n.fuentes.filter((f) => !ocultos.has(f.periodico)) })).filter((n) => n.fuentes.length);
  let nota = "Ordenadas por el número de periódicos que las han publicado.";
  if (!ns.length && !clave) {
    // El recopilatorio aún se está formando: de momento, lo más contado de los últimos días.
    ns = noticiasBase().filter((n) => n.fuentes.length >= 2).sort((a, b) => b.fuentes.length - a.fuentes.length).slice(0, 30);
    nota = "El recopilatorio se va completando cada hora. Mientras tanto, estas son las más contadas de los últimos días.";
  }
  ns.sort((a, b) => b.fuentes.length - a.fuentes.length || (b.fecha || "").localeCompare(a.fecha || ""));
  const meses = (datos.meses || []).filter((m) => m !== mes);
  return [
    el("a", { class: "volver", href: "#hoy" }, "← Hoy"),
    el("h1", {}, `Lo más importante de ${nombreMes(mes)}`),
    el("p", { class: "sub" }, nota),
    meses.length ? el("div", { class: "chips" }, el("span", { class: "chip", "aria-pressed": "true" }, nombreMes(mes)),
      meses.map((m) => el("a", { class: "chip", href: `#mes/${m}` }, `${nombreMes(m)} ${m.slice(0, 4)}`))) : null,
    lista(ns.slice(0, 50), true, { numerada: true, vacio: datos.error ? "No se ha podido cargar el recopilatorio. Revisa la conexión." : "Todavía no hay noticias en este recopilatorio." }),
  ];
}

function vistaBuscar() {
  const resultados = el("div", { class: "resultados", "aria-live": "polite" });
  const campo = el("input", {
    class: "buscador", type: "search", placeholder: "Busca por palabra: Alcaraz, vivienda, Tenerife…",
    "aria-label": "Buscar noticias", enterkeyhint: "search", value: estado.busqueda,
  });
  let espera;
  const buscar = () => {
    estado.busqueda = campo.value;
    const palabras = sinAcentos(campo.value).split(/\s+/).filter((w) => w.length > 1);
    if (!palabras.length) { resultados.replaceChildren(el("p", { class: "vacio" }, "Escribe una o varias palabras.")); return; }
    const ns = noticiasBase().filter((n) => {
      const texto = sinAcentos(`${n.titulo} ${n.resumen} ${n.fuentes.map((f) => f.periodico + " " + f.titulo).join(" ")}`);
      return palabras.every((w) => texto.includes(w));
    });
    resultados.replaceChildren(
      el("p", { class: "sub" }, plural(ns.length, "noticia encontrada", "noticias encontradas")),
      lista(ns, true, { vacio: "No hay noticias con esas palabras." })
    );
  };
  campo.addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(buscar, 200); });
  campo.addEventListener("keydown", (e) => { if (e.key === "Enter") campo.blur(); });
  buscar();
  setTimeout(() => campo.focus(), 50);
  return [el("h1", {}, "Buscar"), campo, resultados];
}

function vistaGuardadas() {
  const ns = Object.values(guardadas()).sort((a, b) => (b.guardada || "").localeCompare(a.guardada || ""));
  return [
    el("h1", {}, "Guardadas"),
    el("p", { class: "sub" }, "Se quedan en este móvil aunque la noticia ya no salga en portada."),
    lista(ns, true, { vacio: "Pulsa el marcador de una noticia para guardarla aquí." }),
  ];
}

function interruptor(texto, id, marcado, alCambiar) {
  return el("label", { class: "opcion", for: id }, texto,
    el("input", { type: "checkbox", id, checked: marcado, onchange: (e) => alCambiar(e.target.checked) }));
}

function vistaPerfil() {
  const ocultos = periodicosOcultos();
  const reg = regionales();
  const nombres = [...new Set([...(estado.datos.periodicos || []).map((p) => p.nombre),
    ...estado.datos.noticias.flatMap((n) => n.fuentes.map((f) => f.periodico))])]
    .sort((a, b) => a.localeCompare(b, "es"));
  const fallan = new Set((estado.datos.estado_fuentes || []).filter((e) => !e.ok).map((e) => e.periodico));
  const opcion = (p) => interruptor(fallan.has(p) ? `${p} (sin noticias ahora)` : p, "p-" + p.replace(/\W+/g, ""), !ocultos.has(p), (si) => {
    const s = periodicosOcultos();
    if (si) s.delete(p); else s.add(p);
    escribir("ocultos", [...s]);
  });
  const apariencia = leer("apariencia", "auto");
  const botonTema = (valor, texto) => el("button", {
    class: "chip", type: "button", "aria-pressed": String(apariencia === valor),
    onclick: () => { escribir("apariencia", valor); aplicarApariencia(); pintar(); },
  }, texto);

  const piezas = [
    el("h1", {}, "Perfil"),
    el("p", { class: "sub" }, "Tus preferencias se guardan solo en este móvil."),
    el("h2", { class: "etiqueta seccion" }, "Apariencia"),
    el("div", { class: "chips" }, botonTema("auto", "Automático"), botonTema("claro", "Claro"), botonTema("oscuro", "Oscuro")),
    el("h2", { class: "etiqueta seccion" }, "Canarias"),
    el("div", { class: "ajustes" },
      interruptor("Mostrar también en «Hoy» las noticias locales de Canarias", "canarias-hoy", canariasEnHoy(), (si) => escribir("canariasEnHoy", si))),
    el("h2", { class: "etiqueta seccion" }, "Periódicos nacionales"),
    el("div", { class: "ajustes" }, nombres.filter((p) => !reg.has(p)).map(opcion)),
    el("h2", { class: "etiqueta seccion" }, "Periódicos canarios"),
    el("div", { class: "ajustes" }, nombres.filter((p) => reg.has(p)).map(opcion)),
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
const MENU = { tema: "temas", mes: "hoy", buscar: "" };
function pintar() {
  const hash = location.hash.replace(/^#/, "") || "hoy";
  const [seccion, param] = hash.split("/");
  const activa = seccion in MENU ? MENU[seccion] : seccion;
  document.querySelectorAll(".menu a").forEach((a) => {
    if (a.dataset.vista === activa) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  document.querySelector(".boton-buscar")?.setAttribute("aria-pressed", String(seccion === "buscar"));
  if (estado.error && !estado.datos) { vista.replaceChildren(el("p", { class: "vacio" }, "No se han podido cargar las noticias. Revisa la conexión y desliza hacia abajo para reintentar.")); return; }
  if (!estado.datos) { vista.replaceChildren(el("p", { class: "vacio" }, "Cargando noticias…")); return; }
  const piezas =
    seccion === "temas" ? vistaTemas() :
    seccion === "tema" ? vistaTema(param) :
    seccion === "canarias" ? vistaCanarias() :
    seccion === "mes" ? vistaMes(param) :
    seccion === "buscar" ? vistaBuscar() :
    seccion === "guardadas" ? vistaGuardadas() :
    seccion === "perfil" ? vistaPerfil() : vistaHoy();
  vista.replaceChildren(...piezas.filter(Boolean));
}
window.addEventListener("hashchange", () => { pintar(); window.scrollTo({ top: 0 }); });

document.getElementById("fecha").textContent =
  new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });

// ---------- Apariencia (claro / oscuro) ----------
function aplicarApariencia() {
  const a = leer("apariencia", "auto");
  if (a === "claro" || a === "oscuro") document.documentElement.dataset.tema = a;
  else delete document.documentElement.dataset.tema;
}

// ---------- Cargar y actualizar ----------
async function pedirNoticias() {
  const r = await fetch("noticias.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

async function cargar() {
  pintar();
  try {
    estado.datos = await pedirNoticias();
    estado.error = false;
  } catch (e) {
    estado.error = true;
  }
  estado.ultimaComprobacion = Date.now();
  pintar();
}

const botonActualizar = document.getElementById("actualizar");
async function actualizar(manual) {
  if (botonActualizar.classList.contains("girando")) return;
  if (manual) botonActualizar.classList.add("girando");
  try {
    const nuevos = await pedirNoticias();
    estado.ultimaComprobacion = Date.now();
    estado.error = false;
    if (!estado.datos || manual) {
      const hayCambios = !estado.datos || nuevos.actualizado !== estado.datos.actualizado;
      estado.datos = nuevos; estado.nuevos = null; estado.mes = {};
      pintar();
      if (manual) aviso(hayCambios ? "Noticias actualizadas" : "Ya tienes las últimas noticias");
    } else if (nuevos.actualizado !== estado.datos.actualizado) {
      const conocidas = new Set(estado.datos.noticias.flatMap((n) => n.fuentes.map((f) => f.enlace)));
      const cuantas = nuevos.noticias.filter((n) => !n.fuentes.some((f) => conocidas.has(f.enlace))).length;
      if (cuantas) { estado.nuevos = { datos: nuevos, cuantas }; if (!location.hash || location.hash === "#hoy") pintar(); }
      else estado.datos = nuevos;
    }
  } catch (e) {
    if (manual) aviso("Sin conexión: no se han podido actualizar");
  } finally {
    botonActualizar.classList.remove("girando");
  }
}
function aplicarNuevas() {
  if (!estado.nuevos) return;
  estado.datos = estado.nuevos.datos; estado.nuevos = null;
  pintar();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
botonActualizar.addEventListener("click", () => actualizar(true));
setInterval(() => { if (document.visibilityState === "visible") actualizar(false); }, CADA_CUANTO_COMPROBAR);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - estado.ultimaComprobacion > CADA_CUANTO_COMPROBAR) actualizar(false);
});

// Deslizar hacia abajo desde arriba del todo para actualizar.
(() => {
  const indicador = document.getElementById("tirar");
  let inicio = null, distancia = 0;
  window.addEventListener("touchstart", (e) => {
    inicio = window.scrollY <= 0 && !document.querySelector(".hoja") ? e.touches[0].clientY : null;
    distancia = 0;
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (inicio == null) return;
    distancia = Math.max(0, Math.min(110, e.touches[0].clientY - inicio));
    indicador.style.height = `${distancia * 0.6}px`;
    indicador.classList.toggle("listo", distancia > 75);
  }, { passive: true });
  window.addEventListener("touchend", () => {
    if (inicio != null && distancia > 75) actualizar(true);
    inicio = null; distancia = 0;
    indicador.style.height = "0px"; indicador.classList.remove("listo");
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

aplicarApariencia();
cargar();
