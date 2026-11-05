import { storage } from "@/src/utils/storage";

const REQ_KEY = "gm_mis_solicitudes";
const PERFIL_KEY = "gm_perfil";

export type StoredReq = { numero: string; key?: string; telefono?: string };
export type Perfil = { nombre: string; telefono: string; correo: string; direccion: string };

export const EMPTY_PERFIL: Perfil = { nombre: "", telefono: "", correo: "", direccion: "" };

export async function getStoredRequests(): Promise<StoredReq[]> {
  const raw = await storage.getItem(REQ_KEY, "");
  if (!raw) return [];
  try {
    return JSON.parse(String(raw)) as StoredReq[];
  } catch {
    return [];
  }
}

export async function addStoredRequest(item: StoredReq): Promise<void> {
  const list = await getStoredRequests();
  if (!list.some((i) => i.numero === item.numero)) list.unshift(item);
  await storage.setItem(REQ_KEY, JSON.stringify(list.slice(0, 100)));
}

export async function getPerfil(): Promise<Perfil> {
  const raw = await storage.getItem(PERFIL_KEY, "");
  if (!raw) return EMPTY_PERFIL;
  try {
    return { ...EMPTY_PERFIL, ...(JSON.parse(String(raw)) as Perfil) };
  } catch {
    return EMPTY_PERFIL;
  }
}

export async function savePerfil(p: Perfil): Promise<void> {
  await storage.setItem(PERFIL_KEY, JSON.stringify(p));
}
