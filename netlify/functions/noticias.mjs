// Sirve las últimas noticias a la app en /noticias.json.
// Si todavía no hay ninguna guardada (primera visita) o son viejas, las recoge en el momento.
import { almacen, recogerYGuardar } from "../lib/almacen.mjs";

const UNA_HORA = 60 * 60 * 1000;
const JSON_UTF8 = "application/json; charset=utf-8";

export default async () => {
  let datos = await almacen().get("actual", { type: "json" });
  const viejo = !datos || !datos.regiones || Date.now() - new Date(datos.actualizado).getTime() > 2 * UNA_HORA;
  if (viejo) {
    try {
      datos = await recogerYGuardar();
    } catch (e) {
      if (!datos) return new Response(JSON.stringify({ error: "No se pudieron recoger las noticias" }), { status: 503, headers: { "content-type": JSON_UTF8 } });
    }
  }
  return new Response(JSON.stringify(datos), {
    headers: { "content-type": JSON_UTF8, "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, max-age=300, stale-while-revalidate=600" },
  });
};

export const config = { path: "/noticias.json" };
