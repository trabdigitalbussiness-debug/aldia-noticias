// Sirve el recopilatorio de las noticias más importantes del mes en /mes.json.
// /mes.json → mes actual · /mes.json?m=2026-11 → un mes concreto.
// Incluye la lista de meses disponibles para poder ver los anteriores.
import { almacen } from "../lib/almacen.mjs";
import { claveMes } from "../lib/recolector.mjs";

const JSON_UTF8 = "application/json; charset=utf-8";

export default async (req) => {
  const store = almacen();
  const pedido = new URL(req.url).searchParams.get("m");
  const mes = /^\d{4}-\d{2}$/.test(pedido || "") ? pedido : claveMes();
  const [datos, lista] = await Promise.all([
    store.get(`mes/${mes}`, { type: "json" }),
    store.list({ prefix: "mes/" }),
  ]);
  const meses = lista.blobs.map((b) => b.key.slice(4)).sort().reverse();
  const cuerpo = { mes, meses, actualizado: datos?.actualizado || null, noticias: datos?.noticias || [] };
  return new Response(JSON.stringify(cuerpo), {
    headers: { "content-type": JSON_UTF8, "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, max-age=600" },
  });
};

export const config = { path: "/mes.json" };
