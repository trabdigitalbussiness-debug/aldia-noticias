// Se ejecuta sola cada hora: recoge las noticias y las guarda en Netlify Blobs.
import { getStore } from "@netlify/blobs";
import { recolectar } from "../lib/recolector.mjs";

export default async () => {
  const datos = await recolectar();
  await getStore("noticias").setJSON("actual", datos);
  const ok = datos.estado_fuentes.filter((e) => e.ok).length;
  console.log(`Guardadas ${datos.noticias.length} noticias · fuentes OK ${ok}/${datos.estado_fuentes.length}`);
  for (const e of datos.estado_fuentes.filter((e) => !e.ok)) console.log(`AVISO ${e.periodico}: ${e.rss} -> ${e.error}`);
};

export const config = { schedule: "@hourly" };
