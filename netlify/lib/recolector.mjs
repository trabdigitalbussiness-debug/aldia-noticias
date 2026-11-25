// Recolector de noticias para Netlify (misma lógica que recolector.py).
// Lee los RSS de fuentes.json, resume gratis con la entradilla, asigna tema,
// junta la misma noticia de varios periódicos y devuelve el JSON de la app.
import { createHash } from "node:crypto";
import fuentes from "../../fuentes.json";

const DIAS_GUARDADOS = 2;
const MAX_CARACTERES_RESUMEN = 260;
const MIN_CARACTERES_RESUMEN = 40;
const SIMILITUD_MISMA_NOTICIA = 0.4; // y además al menos 3 palabras en común
const SIMILITUD_SEGURA = 0.6;        // títulos cortos casi iguales
const AGENTE = "AppNoticiasResumen/1.0 (lector RSS)";

const SECCIONES = {
  nacional: ["espana", "politica", "nacional", "madrid", "cataluna", "andalucia", "comunidad-valenciana", "galicia", "pais-vasco", "canarias", "local"],
  internacional: ["internacional", "mundo", "international", "america", "europa", "eeuu"],
  economia: ["economia", "mercados", "empresas", "finanzas", "dinero", "vivienda", "mis-finanzas", "economy", "negocios"],
  deportes: ["deportes", "futbol", "baloncesto", "tenis", "motor", "formula-1", "ciclismo", "sports", "deporte"],
  tecnologia: ["tecnologia", "ciencia", "technology", "tecnologia-ciencia", "innovacion", "salud-ciencia", "ciencia-y-salud", "motor-tecnologia"],
  cultura: ["cultura", "cine", "musica", "libros", "television", "series", "teatro", "arte", "babelia", "gente", "ocio"],
  sociedad: ["sociedad", "sucesos", "salud", "educacion", "clima", "medio-ambiente", "eltiempo", "tiempo", "igualdad", "consumo"],
};

const PALABRAS_VACIAS = new Set(`a al algo ante antes como con contra cual cuando de del desde donde durante e el
ella ellas ellos en entre era es esa ese eso esta este esto estos fue ha han hasta hay la las le les lo los mas me mi
muy no nos o otra otro para pero por porque que quien se sea ser si sin sobre son su sus tambien te tiene todo tras tu
un una uno unos y ya va van dice segun asi hace sido`.split(/\s+/));

const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", hellip: "…", mdash: "—", ndash: "–", iexcl: "¡", iquest: "¿" };

export function desentidades(t) {
  return String(t || "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    const k = e.toLowerCase();
    return k in ENTIDADES ? ENTIDADES[k] : m;
  });
}

export const sinAcentos = (t) => String(t || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");

export function limpiarHtml(t) {
  let s = String(t || "").replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = desentidades(s).replace(/<[^>]+>/g, " "); // por si el HTML venía escapado (&lt;p&gt;)
  return s.replace(/\s+/g, " ").trim();
}

// Coletillas y restos que los RSS añaden y que no aportan nada al resumen.
const COLETILLAS_FINAL = [
  /\s*(La entrada|The post)\s.+\s(apareci[oó] primero en|se public[oó] primero en|appeared first on)\s.+$/i,
  /\s*(Seguir leyendo|Sigue leyendo|Continuar leyendo|Leer la noticia completa|Leer m[aá]s|Leer|Ver m[aá]s|M[aá]s informaci[oó]n)\s*[.:…»>\]]*\s*$/i,
  /\s*(\[\s*(…|\.\.\.)\s*\]|\(\s*(…|\.\.\.)\s*\)|\[\s*\+\s*\])\s*$/,
];
// "MADRID, 25 (EUROPA PRESS) -", "Las Palmas de Gran Canaria, 25 nov (EFE).-"
const SELLO_AGENCIA = /^[A-ZÁÉÍÓÚÑa-záéíóúñ .'/-]{2,45},?\s+\d{1,2}(\s+[a-zA-Z]{3,10}\.?)?\s*\((EUROPA PRESS|EFE|EP|SERVIMEDIA|AGENCIAS|OTR PRESS)\)\s*[.:]?\s*[-–—]+\s*/i;

export function resumir(texto, titulo) {
  let t = limpiarHtml(texto);
  for (let vuelta = 0; vuelta < 3; vuelta++) for (const re of COLETILLAS_FINAL) t = t.replace(re, "");
  t = t.replace(SELLO_AGENCIA, "").trim();
  // Si la entradilla empieza repitiendo el titular, se quita.
  const tt = sinAcentos(titulo).replace(/[^a-z0-9ñ]+/g, " ").trim();
  if (tt && sinAcentos(t).replace(/[^a-z0-9ñ]+/g, " ").trim().startsWith(tt)) {
    t = t.slice(Math.min(t.length, titulo.length)).replace(/^[\s.:;,–—-]+/, "");
  }
  if (t.length < MIN_CARACTERES_RESUMEN || sinAcentos(t) === sinAcentos(titulo)) return "";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  const frases = t.split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«"“])/);
  let r = "";
  for (const f of frases) {
    if (r && r.length + 1 + f.length > MAX_CARACTERES_RESUMEN) break;
    r = (r + " " + f).trim();
  }
  if (r.length > MAX_CARACTERES_RESUMEN) {
    const corte = r.slice(0, MAX_CARACTERES_RESUMEN);
    r = corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:(«"“–—-]+$/, "").trim() + "…";
  }
  return r;
}

// ---------- Canarias ----------
const PISTAS_CANARIAS = ["canarias", "canario", "canaria", "canarios", "canarias7", "tenerife", "gran canaria", "lanzarote",
  "fuerteventura", "la palma", "la gomera", "el hierro", "la graciosa", "las palmas", "santa cruz de tenerife", "cabildo",
  "clavijo", "teide", "maspalomas", "arrecife", "puerto del rosario", "la laguna", "telde", "arona", "adeje", "binter",
  "ud las palmas", "cd tenerife", "guaguas", "titsa", "puerto de la cruz", "san bartolome de tirajana", "mogan", "agaete",
  "corralejo", "cayuco", "cayucos", "ruta canaria"];
const RE_CANARIAS = new RegExp(`(^|[^a-z0-9ñ])(${PISTAS_CANARIAS.map((p) => escaparRe(p)).join("|")})($|[^a-z0-9ñ])`);
const SECCIONES_CANARIAS = ["canarias", "tenerife", "gran-canaria", "las-palmas-de-gran-canaria", "santa-cruz-de-tenerife", "lanzarote",
  "fuerteventura", "la-palma", "la-gomera", "el-hierro", "canariasahora", "islas", "municipios", "sur", "norte", "local"];
function escaparRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function esDeCanarias({ enlace, titulo, resumen, regional, feedRegional }) {
  if (feedRegional) return true;
  const ruta = sinAcentos(String(enlace || "").replace(/^https?:\/\/[^/]+/, ""));
  const trozos = ruta.split(/[/_.?=&]+/);
  if (trozos.some((t) => SECCIONES_CANARIAS.includes(t) && t !== "local" && t !== "sur" && t !== "norte" && t !== "islas" && t !== "municipios")) return true;
  if (RE_CANARIAS.test(sinAcentos(`${titulo} ${resumen}`))) return true;
  if (regional) {
    // En un periódico canario, lo que no está en una sección general (España, Mundo…) es local.
    if (trozos.some((t) => SECCIONES_CANARIAS.includes(t))) return true;
    const general = Object.values(SECCIONES).flat().filter((s) => s !== "canarias" && s !== "local");
    return !trozos.some((t) => general.includes(t));
  }
  return false;
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function asignarTema(enlace, categorias, titulo, resumen, temas) {
  const ruta = sinAcentos(String(enlace || "").replace(/^https?:\/\/[^/]+/, ""));
  const trozos = new Set(ruta.split(/[/_.?=&]+/));
  const cats = categorias.map(sinAcentos);
  for (const [tema, secciones] of Object.entries(SECCIONES)) {
    for (const s of secciones) {
      if (trozos.has(s) || cats.some((c) => c === s || c.split(/\s+/).includes(s))) return tema;
    }
  }
  const texto = sinAcentos(`${titulo} ${resumen} ${categorias.join(" ")}`);
  let mejor = "nacional", puntosMejor = 0;
  for (const t of temas) {
    const puntos = t.pistas.filter((p) => new RegExp(`(^|[^a-z0-9ñ])${escapar(sinAcentos(p))}($|[^a-z0-9ñ])`).test(texto)).length;
    if (puntos > puntosMejor) { mejor = t.id; puntosMejor = puntos; }
  }
  return puntosMejor ? mejor : "sociedad";
}

function fechaIso(t) {
  if (!t) return null;
  const d = new Date(t.trim());
  return isNaN(d) ? null : d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

// ---------- Lectura de RSS / Atom sin dependencias ----------
function sinCdata(t) {
  return String(t || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}
function etiqueta(bloque, ...nombres) {
  for (const n of nombres) {
    const re = new RegExp(`<(?:[\\w-]+:)?${n}(?:\\s[^>]*)?(?<!/)>([\\s\\S]*?)</(?:[\\w-]+:)?${n}>`, "i");
    const m = bloque.match(re);
    if (m && sinCdata(m[1]).trim()) return sinCdata(m[1]).trim();
  }
  return "";
}
function atributos(tag) {
  const a = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) a[m[1].toLowerCase()] = desentidades(m[3] ?? m[4]);
  return a;
}

function buscarImagen(bloque) {
  const candidatas = [];
  for (const m of bloque.matchAll(/<((?:[\w-]+:)?(?:content|thumbnail|enclosure|link))\b([^>]*)\/?>/gi)) {
    const nombre = m[1].split(":").pop().toLowerCase();
    const a = atributos(m[2]);
    let url = (a.url || "").trim();
    if (nombre === "link") { if (a.rel !== "enclosure") continue; url = (a.href || "").trim(); }
    if (!url) continue;
    const tipo = (a.type || "").toLowerCase();
    const esImagen = tipo.startsWith("image/") || (a.medium || "").toLowerCase() === "image" || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
    if (esImagen) candidatas.push([parseInt(a.width, 10) || 0, url]);
  }
  if (candidatas.length) return candidatas.reduce((m, c) => (c[0] > m[0] ? c : m))[1];
  const texto = sinCdata(bloque);
  const img = texto.match(/<img[^>]+src=["']([^"']+)/i) || desentidades(texto).match(/<img[^>]+src=["']([^"']+)/i);
  return img ? desentidades(img[1]) : "";
}

export function leerRss(xml) {
  const texto = String(xml);
  const bloques = [...texto.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  const noticias = [];
  for (const b of bloques) {
    const titulo = limpiarHtml(etiqueta(b, "title"));
    let enlace = etiqueta(b, "link");
    if (!enlace || enlace.startsWith("<")) {
      enlace = "";
      for (const m of b.matchAll(/<link\b([^>]*)\/?>/gi)) {
        const a = atributos(m[1]);
        if (a.href && (a.rel || "alternate") === "alternate") { enlace = a.href; break; }
      }
    }
    const cuerpo = etiqueta(b, "description", "summary", "encoded");
    const fecha = fechaIso(etiqueta(b, "pubDate", "published", "updated", "date"));
    const categorias = [];
    for (const m of b.matchAll(/<(?:[\w-]+:)?(category|subject)\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?\1>|<category\b([^>]*)\/>/gi)) {
      const valor = limpiarHtml(sinCdata(m[3] || "")) || atributos(m[2] || m[4] || "").term || "";
      if (valor) categorias.push(valor);
    }
    let imagen = buscarImagen(b);
    if (imagen.startsWith("//")) imagen = "https:" + imagen;
    if (titulo && enlace) noticias.push({ titulo, enlace: desentidades(enlace.trim()), texto: cuerpo, fecha, categorias, imagen });
  }
  return noticias;
}

// ---------- Agrupar la misma noticia ----------
// Se comparan las palabras importantes de los titulares, recortadas a su raíz
// (las 6 primeras letras), para que «dispara» y «disparan» cuenten como iguales.
export const palabras = (t) => new Set((sinAcentos(t).match(/[a-z0-9ñ]+/g) || [])
  .filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w)).map((w) => w.slice(0, 6)));
export function parecidas(a, b) {
  if (!a.size || !b.size) return false;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes++;
  const s = comunes / (a.size + b.size - comunes);
  return s >= SIMILITUD_SEGURA || (s >= SIMILITUD_MISMA_NOTICIA && comunes >= 3);
}

function agrupar(noticias) {
  const grupos = [];
  for (const n of [...noticias].sort((x, y) => (y.fecha || "").localeCompare(x.fecha || ""))) {
    const p = palabras(n.titulo);
    const destino = grupos.find((g) => !g.fuentes.some((f) => f.periodico === n.periodico) && g._p.some((q) => parecidas(p, q)));
    const fuente = { periodico: n.periodico, enlace: n.enlace };
    if (destino) {
      destino.fuentes.push(fuente);
      destino._p.push(p);
      if (n.canarias) destino.canarias = true;
      // Se queda con el resumen más completo y con la primera foto que haya.
      if (n.resumen && n.resumen.length > (destino.resumen || "").length) destino.resumen = n.resumen;
      if (!destino.imagen && n.imagen) destino.imagen = n.imagen;
    } else {
      const g = {
        id: createHash("sha1").update(n.enlace).digest("hex").slice(0, 12),
        titulo: n.titulo, resumen: n.resumen, tema: n.tema, imagen: n.imagen,
        fecha: n.fecha, fuentes: [fuente], _p: [p],
      };
      if (n.canarias) g.canarias = true;
      grupos.push(g);
    }
  }
  for (const g of grupos) { delete g._p; if (!g.imagen) delete g.imagen; if (!g.resumen) delete g.resumen; }
  return grupos;
}

async function descargar(url) {
  const r = await fetch(url, { headers: { "User-Agent": AGENTE }, signal: AbortSignal.timeout(10000), redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

// leerFuente(periodico, url) permite pruebas con ficheros locales.
export async function recolectar({ leerFuente } = {}) {
  const config = fuentes;
  const ahora = new Date();
  const limite = new Date(ahora - DIAS_GUARDADOS * 864e5).toISOString();
  const tareas = config.periodicos.flatMap((p) => p.rss.map((f) => (typeof f === "string" ? { p, url: f } : { p, url: f.url, feed: f })));
  const resultados = await Promise.all(tareas.map(async ({ p, url, feed }) => {
    try {
      const xml = leerFuente ? await leerFuente(p, url) : await descargar(url);
      if (xml == null) return { p, url, feed, items: null };
      return { p, url, feed, items: leerRss(xml) };
    } catch (error) {
      return { p, url, feed, error: String(error.message || error).slice(0, 200) };
    }
  }));

  const todas = [], estado = [];
  for (const { p, url, feed, items, error } of resultados) {
    if (items === null) continue;
    if (error) { estado.push({ periodico: p.nombre, rss: url, ok: false, error }); continue; }
    estado.push({ periodico: p.nombre, rss: url, ok: true, noticias: items.length });
    for (const it of items) {
      if (it.fecha && it.fecha < limite) continue;
      const resumen = resumir(it.texto, it.titulo);
      todas.push({
        titulo: it.titulo, enlace: it.enlace, fecha: it.fecha || ahora.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
        resumen, periodico: p.nombre, imagen: it.imagen,
        tema: asignarTema(it.enlace, it.categorias, it.titulo, resumen, config.temas),
        canarias: esDeCanarias({ enlace: it.enlace, titulo: it.titulo, resumen,
          regional: p.region === "canarias", feedRegional: feed?.region === "canarias" }),
      });
    }
  }
  const vistas = new Set();
  const unicas = todas.filter((n) => (vistas.has(n.enlace) ? false : (vistas.add(n.enlace), true)));
  return {
    actualizado: ahora.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    temas: config.temas.map((t) => ({ id: t.id, nombre: t.nombre })),
    periodicos: config.periodicos.map((p) => ({ nombre: p.nombre, ...(p.region ? { region: p.region } : {}) })),
    noticias: agrupar(unicas),
    estado_fuentes: estado,
  };
}
