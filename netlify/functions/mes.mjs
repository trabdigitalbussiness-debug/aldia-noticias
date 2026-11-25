// Sirve el recopilatorio del mes en /mes.json (o /mes.json?m=2026-11 para otro mes).
import { getStore } from "@netlify/blobs";
import { puntos } from "../lib/mes.mjs";

const MOSTRAR = 40;

export default async (req) => {
  const almacen = getStore("noticias");
  const { blobs } = await almacen.list({ prefix: "mes-" });
  const meses = blobs.map((b) => b.key.slice(4)).sort().reverse();
  const pedido = new URL(req.url).searchParams.get("m");
  const mes = meses.includes(pedido) ? pedido : meses[0];
  const archivo = mes ? await almacen.get(`mes-${mes}`, { type: "json" }) : null;
  const noticias = (archivo?.noticias || []).sort((a, b) => puntos(b) - puntos(a)).slice(0, MOSTRAR);
  return new Response(JSON.stringify({ mes: mes || null, meses, actualizado: archivo?.actualizado || null, noticias }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600" },
  });
};

export const config = { path: "/mes.json" };
