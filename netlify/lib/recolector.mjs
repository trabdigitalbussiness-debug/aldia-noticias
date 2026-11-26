// Recolector de noticias para Netlify.
// Lee los RSS de fuentes.json, resume gratis con la entradilla, asigna tema y región,
// junta la misma noticia de varios periódicos y devuelve el JSON de la app.
// No usa nada exclusivo de Node, así que también se puede probar en un navegador.

const DIAS_GUARDADOS = 3;
const MAX_CARACTERES_RESUMEN = 320;
const AGENTE = "AppNoticiasResumen/1.0 (lector RSS)";
const AGENTE_NAVEGADOR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";
const MAX_NOTICIAS_MES = 150;

const SECCIONES = {
  nacional: ["espana", "politica", "nacional", "madrid", "cataluna", "andalucia", "comunidad-valenciana", "galicia", "pais-vasco", "canarias", "local"],
  internacional: ["internacional", "mundo", "international", "america", "europa", "eeuu"],
  economia: ["economia", "mercados", "empresas", "finanzas", "dinero", "vivienda", "mis-finanzas", "economy", "negocios"],
  deportes: ["deportes", "futbol", "baloncesto", "tenis", "motor", "formula-1", "ciclismo", "sports", "deporte", "deportes-canarias"],
  tecnologia: ["tecnologia", "ciencia", "technology", "tecnologia-ciencia", "innovacion", "salud-ciencia", "ciencia-y-salud", "motor-tecnologia"],
  cultura: ["cultura", "cine", "musica", "libros", "television", "series", "teatro", "arte", "babelia", "gente", "ocio"],
  sociedad: ["sociedad", "sucesos", "salud", "educacion", "clima", "medio-ambiente", "eltiempo", "tiempo", "igualdad", "consumo"],
};

const PALABRAS_VACIAS = new Set(`a al algo ante antes como con contra cual cuando de del desde donde durante e el
ella ellas ellos en entre era es esa ese eso esta este esto estos fue ha han hasta hay la las le les lo los mas me mi
muy no nos o otra otro para pero por porque que quien se sea ser si sin sobre son su sus tambien te tiene todo tras tu
un una uno unos y ya va van dice segun asi hace sido directo ultima hora video videos fotos asi este esta estos estas
nuevo nueva hoy ayer manana tras despues sera`.split(/\s+/));

const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  hellip: "…", mdash: "—", ndash: "–", iexcl: "¡", iquest: "¿", euro: "€", deg: "°", ordm: "º", ordf: "ª", middot: "·", bull: "•",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", ccedil: "ç", Ccedil: "Ç", agrave: "à", egrave: "è", ograve: "ò", Agrave: "À", Egrave: "È", Ograve: "Ò",
};

function desentidadesUnaVez(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    if (e in ENTIDADES) return ENTIDADES[e];
    const k = e.toLowerCase();
    return k in ENTIDADES ? ENTIDADES[k] : m;
  });
}
// Algunos periódicos escapan dos veces (&amp;iacute;), así que se repite si hace falta.
export function desentidades(t) {
  let s = String(t || "");
  for (let i = 0; i < 2 && /&(#x[0-9a-f]+|#\d+|[a-z]+);/i.test(s); i++) s = desentidadesUnaVez(s);
  return s;
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
  t = t.replace(/\s*(Seguir leyendo|Leer m[aá]s|Sigue leyendo|Ver m[aá]s|Leer)\.?\s*$/i, "");
  t = t.replace(/\s*La entrada .{0,200} se public[oó] primero en .{0,80}$/i, "");
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
const regexPalabra = (p) => new RegExp(`(^|[^a-z0-9ñ])${escapar(sinAcentos(p))}($|[^a-z0-9ñ])`);

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
    const puntos = t.pistas.filter((p) => regexPalabra(p).test(texto)).length;
    if (puntos > puntosMejor) { mejor = t.id; puntosMejor = puntos; }
  }
  return puntosMejor ? mejor : "sociedad";
}

// Región (por ahora, Canarias): por la sección del enlace o por lugares que salen en el texto.
// Los nombres propios («El Hierro», «La Palma») solo cuentan con mayúscula en el texto,
// para no confundirlos con «el hierro» de las lentejas; en la dirección web valen siempre.
const conservaMayusculas = (t) => String(t || "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
function preparaRegiones(regiones) {
  return (regiones || []).map((r) => ({
    id: r.id,
    pistas: r.pistas.map((p) => {
      const propio = /^[A-ZÁÉÍÓÚÑ]/.test(p);
      const base = escapar(propio ? conservaMayusculas(p) : sinAcentos(p));
      return {
        propio,
        texto: new RegExp(`(^|[^A-Za-z0-9ñÑ])${base}($|[^A-Za-z0-9ñÑ])`, propio ? "" : "i"),
        ruta: regexPalabra(p),
      };
    }),
  }));
}
export function asignarRegion(enlace, titulo, resumen, categorias, regiones) {
  const ruta = sinAcentos(String(enlace || "").replace(/^https?:\/\/[^/]+/, "")).replace(/[-_/.]+/g, " ");
  const texto = conservaMayusculas(`${titulo} ${resumen} ${categorias.join(" ")}`);
  const textoMin = sinAcentos(texto);
  for (const r of regiones) {
    if (r.pistas.some((p) => p.ruta.test(ruta) || (p.propio ? p.texto.test(texto) : p.texto.test(textoMin)))) return r.id;
  }
  return null;
}

function fechaIso(t) {
  if (!t) return null;
  const d = new Date(t.trim());
  return isNaN(d) ? null : d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

// Identificador corto y estable a partir del enlace (sin depender de node:crypto).
export function huella(texto) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return ((h2 >>> 0).toString(16).padStart(8, "0") + (h1 >>> 0).toString(16).padStart(8, "0")).slice(0, 12);
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
  if (candidatas.length) {
    // La más pequeña que mida al menos 600 px: carga antes y sigue viéndose bien.
    const buenas = candidatas.filter((c) => c[0] >= 600).sort((a, b) => a[0] - b[0]);
    return (buenas[0] || candidatas.reduce((m, c) => (c[0] > m[0] ? c : m)))[1];
  }
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
    if (imagen && !/^https?:\/\//i.test(imagen)) imagen = "";
    if (titulo && enlace) noticias.push({ titulo, enlace: desentidades(enlace.trim()), texto: cuerpo, fecha, categorias, imagen });
  }
  return noticias;
}

// ---------- Agrupar la misma noticia ----------
const raiz = (w) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
export const palabras = (t) => new Set((sinAcentos(t).match(/[a-z0-9ñ]+/g) || []).filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w)).map(raiz));

// Parecido entre dos titulares: mezcla de «cuántas palabras comparten del total» y
// «cuántas del titular más corto aparecen en el otro». Hace falta compartir al menos 3.
export function similitud(a, b) {
  if (!a.size || !b.size) return 0;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes++;
  if (comunes < 2) return 0;
  const jaccard = comunes / (a.size + b.size - comunes);
  const solape = comunes >= 3 ? (comunes / Math.min(a.size, b.size)) * 0.8 : 0;
  return Math.max(jaccard, solape);
}
const UMBRAL_MISMA_NOTICIA = 0.45;

// Igual que similitud(), pero las palabras que salen en muchísimos titulares
// («Gobierno», «Sánchez», «España»…) cuentan menos que las raras («Parot», «Chiclana»…).
// Ajustado con ~1.000 titulares reales de 15 periódicos (noviembre 2026).
export const AJUSTES_AGRUPAR = { umbral: 0.35, solape: 0.75 };
function similitudPonderada(a, b, peso) {
  let comunes = 0, wc = 0, wa = 0, wb = 0;
  for (const w of a) { const x = peso(w); wa += x; if (b.has(w)) { comunes++; wc += x; } }
  for (const w of b) wb += peso(w);
  if (comunes < 2 || !wa || !wb) return 0;
  const jaccard = wc / (wa + wb - wc);
  const solape = comunes >= 3 ? (wc / Math.min(wa, wb)) * AJUSTES_AGRUPAR.solape : 0;
  return Math.max(jaccard, solape);
}

function agrupar(noticias) {
  const grupos = [];
  const conjuntos = new Map(noticias.map((n) => [n, palabras(n.titulo)]));
  const df = new Map();
  for (const p of conjuntos.values()) for (const w of p) df.set(w, (df.get(w) || 0) + 1);
  const total = Math.max(2, noticias.length);
  const peso = (w) => Math.log(total / (df.get(w) || 1));
  for (const n of [...noticias].sort((x, y) => (y.fecha || "").localeCompare(x.fecha || ""))) {
    const p = conjuntos.get(n);
    let destino = null, mejor = 0;
    for (const g of grupos) {
      if (g.fuentes.some((f) => f.periodico === n.periodico)) continue;
      const s = similitudPonderada(p, g._p, peso);
      if (s >= AJUSTES_AGRUPAR.umbral && s > mejor) { destino = g; mejor = s; }
    }
    const fuente = { periodico: n.periodico, titulo: n.titulo, enlace: n.enlace };
    if (destino) {
      destino.fuentes.push(fuente);
      if (!destino.resumen && n.resumen) destino.resumen = n.resumen;
      if (!destino.imagen && n.imagen) destino.imagen = n.imagen;
      if (n.region) { destino._region = n.region; destino._conRegion++; }
      // Si la abrió un diario deportivo pero la cuenta también un periódico general, manda el tema de este.
      if (destino._forzado && !n.temaForzado) { destino.tema = n.tema; destino._forzado = false; }
    } else {
      const g = {
        id: huella(n.enlace),
        titulo: n.titulo, resumen: n.resumen, tema: n.tema, imagen: n.imagen,
        fecha: n.fecha, fuentes: [fuente], _p: new Set(p), _forzado: !!n.temaForzado,
        _region: n.region || null, _conRegion: n.region ? 1 : 0,
      };
      grupos.push(g);
    }
  }
  for (const g of grupos) {
    // Es de Canarias si lo es al menos la mitad de los periódicos que la cuentan.
    if (g._region && g._conRegion * 2 >= g.fuentes.length) g.region = g._region;
    delete g._p; delete g._forzado; delete g._region; delete g._conRegion;
  }
  return grupos;
}

async function descargar(url, navegador) {
  const r = await fetch(url, {
    headers: { "User-Agent": navegador ? AGENTE_NAVEGADOR : AGENTE, Accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5" },
    signal: AbortSignal.timeout(10000), redirect: "follow",
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

const dominio = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };
const seccion = (u) => { try { return new URL(u).pathname.split("/")[1] || ""; } catch (e) { return ""; } };

// config = contenido de fuentes.json. leerFuente(periodico, url) permite pruebas con ficheros guardados.
export async function recolectar({ config, leerFuente } = {}) {
  if (!config) throw new Error("Falta la configuración (fuentes.json)");
  const ahora = new Date();
  const limite = new Date(ahora - DIAS_GUARDADOS * 864e5).toISOString();
  const regiones = preparaRegiones(config.regiones);
  const tareas = config.periodicos.flatMap((p) => p.rss.map((r) => (typeof r === "string" ? { p, url: r } : { p, url: r.url, todaRegion: r.toda_la_region })));
  const resultados = await Promise.all(tareas.map(async (t) => {
    try {
      const xml = leerFuente ? await leerFuente(t.p, t.url) : await descargar(t.url, t.p.agente === "navegador");
      if (xml == null) return { ...t, items: null };
      return { ...t, items: leerRss(xml) };
    } catch (error) {
      return { ...t, error: String(error.message || error).slice(0, 200) };
    }
  }));

  const todas = [], estado = [], repetidas = new Set();
  for (const { p, url, items, error, todaRegion } of resultados) {
    if (items === null) continue;
    if (error) { estado.push({ periodico: p.nombre, rss: url, ok: false, error }); continue; }
    const deGoogle = p.via === "googlenews";
    const suWeb = dominio(p.web);
    let validas = 0;
    for (const it of items) {
      if (it.fecha && it.fecha < limite) continue;
      if (p.solo_su_web && !dominio(it.enlace).endsWith(suWeb)) continue; // fuera publicidad de otras webs
      if (p.excluir_secciones && p.excluir_secciones.includes(seccion(it.enlace))) continue; // p. ej. ofertas o videojuegos en AS
      let titulo = it.titulo;
      if (deGoogle) {
        titulo = titulo.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, ""); // quita « - El Economista»
        if (titulo.split(/\s+/).length < 4) continue; // páginas de autor, no noticias
      }
      const clave = p.nombre + "|" + sinAcentos(titulo);
      if (repetidas.has(clave)) continue; // el mismo titular dos veces en el mismo periódico
      repetidas.add(clave);
      const resumen = deGoogle ? "" : resumir(it.texto, titulo);
      const n = {
        titulo, enlace: it.enlace, fecha: it.fecha || ahora.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
        resumen, periodico: p.nombre, imagen: deGoogle ? "" : it.imagen,
        // Los periódicos deportivos (Marca, AS) van siempre a Deportes.
        tema: p.tema || asignarTema(it.enlace, it.categorias, titulo, resumen, config.temas),
      };
      const region = todaRegion ? p.region : asignarRegion(deGoogle ? "" : it.enlace, titulo, resumen, it.categorias, regiones);
      if (region) n.region = region;
      if (p.tema) n.temaForzado = true;
      todas.push(n);
      validas++;
    }
    estado.push({ periodico: p.nombre, rss: url, ok: true, noticias: validas });
  }
  const vistas = new Set();
  const unicas = todas.filter((n) => (vistas.has(n.enlace) ? false : (vistas.add(n.enlace), true)));
  return {
    actualizado: ahora.toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    temas: config.temas.map((t) => ({ id: t.id, nombre: t.nombre })),
    regiones: (config.regiones || []).map((r) => ({ id: r.id, nombre: r.nombre })),
    periodicos: config.periodicos.map((p) => ({ nombre: p.nombre, web: p.web, ...(p.region ? { region: p.region } : {}) })),
    noticias: agrupar(unicas),
    estado_fuentes: estado,
  };
}

// ---------- Recopilatorio del mes ----------
// Guarda las noticias que más periódicos han publicado durante el mes.
// Cada hora se mezclan las nuevas con las ya guardadas.
export const claveMes = (fecha = new Date()) => new Date(fecha).toISOString().slice(0, 7); // "2026-11"

export function actualizarMes(anterior, datos, mes = claveMes()) {
  const res = anterior && anterior.mes === mes ? anterior : { mes, noticias: [] };
  const lista = res.noticias.map((e) => ({ ...e, _p: palabras(e.titulo), _e: new Set(e.fuentes.map((f) => f.enlace)) }));
  const candidatas = datos.noticias.filter((n) => (n.fecha || "").slice(0, 7) === mes && n.fuentes.length >= 2);
  for (const n of candidatas) {
    const p = palabras(n.titulo);
    const igual = lista.find((e) => n.fuentes.some((f) => e._e.has(f.enlace)) || similitud(p, e._p) >= UMBRAL_MISMA_NOTICIA);
    if (igual) {
      for (const f of n.fuentes) {
        if (!igual.fuentes.some((x) => x.periodico === f.periodico)) igual.fuentes.push(f);
        igual._e.add(f.enlace);
      }
      if (!igual.imagen && n.imagen) igual.imagen = n.imagen;
      if (!igual.resumen && n.resumen) igual.resumen = n.resumen;
      if (!igual.region && n.region) igual.region = n.region;
      igual.puntos = igual.fuentes.length;
    } else {
      lista.push({ ...n, fuentes: [...n.fuentes], puntos: n.fuentes.length, _p: p, _e: new Set(n.fuentes.map((f) => f.enlace)) });
    }
  }
  lista.sort((a, b) => b.puntos - a.puntos || (b.fecha || "").localeCompare(a.fecha || ""));
  res.noticias = lista.slice(0, MAX_NOTICIAS_MES).map(({ _p, _e, ...resto }) => resto);
  res.actualizado = datos.actualizado;
  return res;
}
