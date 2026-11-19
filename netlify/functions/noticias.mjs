// Sirve las últimas noticias a la app en /noticias.json.
// Si todavía no hay ninguna guardada (primera visita), las recoge en el momento.
import { getStore } from "@netlify/blobs";
import { recolectar } from "../lib/recolector.mjs";

const UNA_HORA = 60 * 60 * 1000;

export default async () => {
  const almacen = getStore("noticias");
  let datos = await almacen.get("actual", { type: "json" });
  const viejo = !datos || Date.now() - new Date(datos.actualizado).getTime() > 2 * UNA_HORA;
  if (viejo) {
    try {
      datos = await recolectar();
      await almacen.setJSON("actual", datos);
    } catch (e) {
      if (!datos) return new Response(JSON.stringify({ error: "No se pudieron recoger las noticias" }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
    }
  }
  return new Response(JSON.stringify(datos), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300" },
  });
};

export const config = { path: "/noticias.json" };
