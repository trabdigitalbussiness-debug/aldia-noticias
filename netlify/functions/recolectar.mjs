// Se ejecuta sola cada 30 minutos: recoge las noticias y las guarda en Netlify Blobs.
import { recogerYGuardar } from "../lib/guardar.mjs";

export default async () => {
  const datos = await recogerYGuardar();
  const ok = datos.estado_fuentes.filter((e) => e.ok).length;
  console.log(`Guardadas ${datos.noticias.length} noticias · fuentes OK ${ok}/${datos.estado_fuentes.length}`);
  for (const e of datos.estado_fuentes.filter((e) => !e.ok)) console.log(`AVISO ${e.periodico}: ${e.rss} -> ${e.error}`);
};

export const config = { schedule: "*/30 * * * *" };
