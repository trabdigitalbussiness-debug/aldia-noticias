// Sirve las últimas noticias a la app en /noticias.json.
// Si no hay ninguna guardada o son de hace más de una hora, las recoge en el momento.
import { getStore } from "@netlify/blobs";
import { recogerYGuardar } from "../lib/guardar.mjs";

const UNA_HORA = 60 * 60 * 1000;
const json = (datos, extra = {}) => new Response(JSON.stringify(datos), {
  ...extra, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120", ...(extra.headers || {}) },
});

export default async () => {
  let datos = await getStore("noticias").get("actual", { type: "json" });
  if (!datos || Date.now() - new Date(datos.actualizado).getTime() > UNA_HORA) {
    try {
      datos = await recogerYGuardar();
    } catch (e) {
      if (!datos) return json({ error: "No se pudieron recoger las noticias" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
  }
  return json(datos);
};

export const config = { path: "/noticias.json" };
