import { uploadForm } from "@/src/utils/upload";

export const API_URL = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;

/** Staff token (Admin / Trabajador / Ferretería mode, unlocked with the PIN). */
let token: string | null = null;
/** App account token (email or Google sign-in). Sent on every request. */
let accountToken: string | null = null;
export type AuthFailure = "account" | "staff";
let onUnauthorized: ((kind: AuthFailure) => void) | null = null;

export const setToken = (t: string | null) => {
  token = t;
};
export const getToken = () => token;
export const setAccountToken = (t: string | null) => {
  accountToken = t;
};
export const setUnauthorizedHandler = (fn: ((kind: AuthFailure) => void) | null) => {
  onUnauthorized = fn;
};

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (accountToken) h["X-Account-Token"] = accountToken;
  return h;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function detailToMessage(data: any, status: number): string {
  const d = data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d.length) {
    const f = d[0];
    const field = Array.isArray(f.loc) ? f.loc[f.loc.length - 1] : "";
    return `Revisa el campo «${field}»: ${f.msg}`;
  }
  return status >= 500 ? "Error del servidor. Inténtalo de nuevo." : "No se pudo completar la acción.";
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...authHeaders() };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Sin conexión. Revisa tu internet e inténtalo de nuevo.", 0);
  }
  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    // Only an expired/invalid session (tagged by the server) signs out; a wrong PIN or password never does.
    const kind = res.headers.get("x-auth-error");
    if (res.status === 401 && (kind === "account" || kind === "staff") && onUnauthorized) onUnauthorized(kind);
    throw new ApiError(detailToMessage(data, res.status), res.status);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>("PATCH", p, b),
  del: <T>(p: string) => request<T>("DELETE", p),
};

export function fileUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path) || path.startsWith("file:") || path.startsWith("blob:") || path.startsWith("data:")) return path;
  return `${API_URL}/files/${path}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}

export type PickedAsset = { uri: string; fileName?: string | null; mimeType?: string | null };

export async function uploadImage(asset: PickedAsset): Promise<string> {
  let res: Response;
  try {
    res = (await uploadForm(`${API_URL}/upload`, {
      files: {
        file: {
          uri: asset.uri,
          name: asset.fileName || `foto-${Date.now()}.jpg`,
          mimeType: asset.mimeType || "image/jpeg",
        },
      },
      headers: authHeaders(),
    })) as unknown as Response;
  } catch {
    throw new ApiError("No se pudo subir la foto. Revisa tu conexión.", 0);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(detailToMessage(data, res.status), res.status);
  return data.path as string;
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Algo salió mal. Inténtalo de nuevo.";
}
