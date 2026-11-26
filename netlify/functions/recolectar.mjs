// Se ejecuta sola cada hora: recoge las noticias y las guarda en Netlify Blobs
// (las actuales y el recopilatorio del mes).
import { recogerYGuardar } from "../lib/almacen.mjs";

export default async () => {
  const datos = await recogerYGuardar();
  const ok = datos.estado_fuentes.filter((e) => e.ok).length;
  console.log(`Guardadas ${datos.noticias.length} noticias · fuentes OK ${ok}/${datos.estado_fuentes.length}`);
  for (const e of datos.estado_fuentes.filter((e) => !e.ok)) console.log(`AVISO ${e.periodico}: ${e.rss} -> ${e.error}`);
};

export const config = { schedule: "@hourly" };
