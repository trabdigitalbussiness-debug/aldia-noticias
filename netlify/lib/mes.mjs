// Recopilatorio del mes: cada vez que se recogen noticias, las que cuentan
// varios periódicos se apuntan en el archivo del mes. Cuantos más periódicos
// la publican y más tiempo sigue en portada, más importante es.
import { palabras, parecidas } from "./recolector.mjs";

const MIN_PERIODICOS = 2;
const MAX_GUARDADAS = 200;

export const claveMes = (iso) => `mes-${String(iso).slice(0, 7)}`;
export const puntos = (n) => n.max * 100 + n.visto;

export function actualizarMes(archivo, datos) {
  const mes = String(datos.actualizado).slice(0, 7);
  const a = archivo && archivo.mes === mes ? archivo : { mes, noticias: [] };
  const claves = a.noticias.map((n) => palabras(n.titulo));
  for (const g of datos.noticias) {
    if (g.fuentes.length < MIN_PERIODICOS) continue;
    const p = palabras(g.titulo);
    let i = a.noticias.findIndex((n) => n.id === g.id);
    if (i < 0) i = claves.findIndex((q) => parecidas(p, q));
    if (i < 0) {
      a.noticias.push({ ...g, max: g.fuentes.length, visto: 1, primera: g.fecha });
      claves.push(p);
      continue;
    }
    const n = a.noticias[i];
    n.visto += 1;
    if (g.fuentes.length > n.max) {
      Object.assign(n, { id: g.id, titulo: g.titulo, resumen: g.resumen, tema: g.tema, fuentes: g.fuentes, max: g.fuentes.length });
      claves[i] = p;
    }
    if (!n.imagen && g.imagen) n.imagen = g.imagen;
    if (!n.resumen && g.resumen) n.resumen = g.resumen;
    if (g.canarias) n.canarias = true;
  }
  a.noticias.sort((x, y) => puntos(y) - puntos(x));
  a.noticias = a.noticias.slice(0, MAX_GUARDADAS);
  a.actualizado = datos.actualizado;
  return a;
}
