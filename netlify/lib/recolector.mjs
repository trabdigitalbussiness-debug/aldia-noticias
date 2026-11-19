// Recolector de noticias para Netlify (misma lógica que recolector.py).
// Lee los RSS de fuentes.json, resume gratis con la entradilla, asigna tema,
// junta la misma noticia de varios periódicos y devuelve el JSON de la app.
import { createHash } from "node:crypto";
import fuentes from "../../fuentes.json";

const DIAS_GUARDADOS = 3;
const MAX_CARACTERES_RESUMEN = 320;
const SIMILITUD_MISMA_NOTICIA = 0.5;
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

export function resumir(texto, titulo) {
  let t = limpiarHtml(texto);
  t = t.replace(/\s*(Seguir leyendo|Leer m[aá]s|Sigue leyendo|Ver m[aá]s)\.?\s*$/i, "");
  if (!t || sinAcentos(t) === sinAcentos(titulo)) return "";
  const frases = t.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡«"])/);
  let r = "";
  for (const f of frases.slice(0, 3)) {
    if (r.length + f.length > MAX_CARACTERES_RESUMEN && r) break;
    r = (r + " " + f).trim();
  }
  if (r.length > MAX_CARACTERES_RESUMEN) {
    const corte = r.slice(0, MAX_CARACTERES_RESUMEN);
    r = corte.slice(0, corte.lastIndexOf(" ")).replace(/[,;:]+$/, "") + "…";
  }
  return r;
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
const palabras = (t) => new Set((sinAcentos(t).match(/[a-z0-9ñ]+/g) || []).filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w)));
function similitud(a, b) {
  if (!a.size || !b.size) return 0;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes++;
  return comunes / (a.size + b.size - comunes);
}

function agrupar(noticias) {
  const grupos = [];
  for (const n of [...noticias].sort((x, y) => (y.fecha || "").localeCompare(x.fecha || ""))) {
    const p = palabras(n.titulo);
    const destino = grupos.find((g) => similitud(p, g._p) >= SIMILITUD_MISMA_NOTICIA && !g.fuentes.some((f) => f.periodico === n.periodico));
    const fuente = { periodico: n.periodico, titulo: n.titulo, enlace: n.enlace };
    if (destino) {
      destino.fuentes.push(fuente);
      if (!destino.resumen && n.resumen) destino.resumen = n.resumen;
      if (!destino.imagen && n.imagen) destino.imagen = n.imagen;
    } else {
      grupos.push({
        id: createHash("sha1").update(n.enlace).digest("hex").slice(0, 12),
        titulo: n.titulo, resumen: n.resumen, tema: n.tema, imagen: n.imagen,
        fecha: n.fecha, fuentes: [fuente], _p: p,
      });
    }
  }
  for (const g of grupos) delete g._p;
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
  const tareas = config.periodicos.flatMap((p) => p.rss.map((url) => ({ p, url })));
  const resultados = await Promise.all(tareas.map(async ({ p, url }) => {
    try {
      const xml = leerFuente ? await leerFuente(p, url) : await descargar(url);
      if (xml == null) return { p, url, items: null };
      return { p, url, items: leerRss(xml) };
    } catch (error) {
      return { p, url, error: String(error.message || error).slice(0, 200) };
    }
  }));

  const todas = [], estado = [];
  for (const { p, url, items, error } of resultados) {
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
      });
    }
  }
  const vistas = new Set();
  const unicas = todas.filter((n) => (vistas.has(n.enlace) ? false : (vistas.add(n.enlace), true)));
  return {
    actualizado: ahora.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    temas: config.temas.map((t) => ({ id: t.id, nombre: t.nombre })),
    noticias: agrupar(unicas),
    estado_fuentes: estado,
  };
}
