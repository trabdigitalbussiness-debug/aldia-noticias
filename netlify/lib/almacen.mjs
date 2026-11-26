// Recoge las noticias y las guarda en Netlify Blobs: las actuales y el recopilatorio del mes.
import { getStore } from "@netlify/blobs";
import fuentes from "../../fuentes.json";
import { recolectar, actualizarMes, claveMes } from "./recolector.mjs";

export const almacen = () => getStore("noticias");

export async function recogerYGuardar() {
  const datos = await recolectar({ config: fuentes });
  const store = almacen();
  await store.setJSON("actual", datos);
  try {
    const mes = claveMes();
    const anterior = await store.get(`mes/${mes}`, { type: "json" });
    await store.setJSON(`mes/${mes}`, actualizarMes(anterior, datos, mes));
  } catch (e) {
    console.log("AVISO no se pudo actualizar el recopilatorio del mes:", e.message || e);
  }
  return datos;
}
