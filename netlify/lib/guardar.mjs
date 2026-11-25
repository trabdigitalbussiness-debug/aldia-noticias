// Recoge las noticias y las guarda (las de ahora y el archivo del mes).
import { getStore } from "@netlify/blobs";
import { recolectar } from "./recolector.mjs";
import { actualizarMes, claveMes } from "./mes.mjs";

export async function recogerYGuardar() {
  const almacen = getStore("noticias");
  const datos = await recolectar();
  await almacen.setJSON("actual", datos);
  try {
    const clave = claveMes(datos.actualizado);
    const archivo = await almacen.get(clave, { type: "json" });
    await almacen.setJSON(clave, actualizarMes(archivo, datos));
  } catch (e) {
    console.log("AVISO recopilatorio del mes:", e.message);
  }
  return datos;
}
