import * as Linking from "expo-linking";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";

import { api, ApiError, setAccountToken, setToken, setUnauthorizedHandler } from "@/src/lib/api";
import { clearWebSessionId, extractSessionId, openGoogleSignIn, readWebSessionId } from "@/src/lib/googleAuth";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

export type Role = "cliente" | "admin" | "trabajador" | "ferreteria";
export type StaffRole = Exclude<Role, "cliente">;

export type Session = {
  token: string;
  role: StaffRole;
  code: string;
  display_name: string;
  entity_id?: string | null;
};

export type Cuenta = {
  account_id: string;
  email: string;
  nombre: string;
  foto: string;
  proveedores: string[];
  tiene_password: boolean;
};
type AccountAuth = { token: string; cuenta: Cuenta };

const SESSION_KEY = "gm_session";
const ACCOUNT_KEY = "gm_account";
/** One-time Google session_ids already sent to the backend (a deep link can surface twice). */
const sentSessionIds = new Set<string>();
/** Read before the router mounts, so a redirect to /login cannot drop it from the address bar. */
const initialWebSessionId = readWebSessionId();

type AuthCtx = {
  hydrated: boolean;
  /** Signed-in app account. Null = show the login screen. */
  account: Cuenta | null;
  /** Staff mode unlocked with the PIN (null = Cliente). */
  session: Session | null;
  role: Role;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (nombre: string, email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  /** Error from a Google redirect handled while the app was loading. */
  authError: string | null;
  signOut: () => Promise<void>;
  login: (role: StaffRole, code: string, pin: string) => Promise<Session>;
  /** Leave the staff mode and go back to Cliente (the account stays signed in). */
  logout: () => Promise<void>;
  changePin: (pinActual: string, pinNuevo: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export const ROLE_LABELS: Record<Role, string> = {
  cliente: "Cliente",
  admin: "Admin GM Conecta",
  trabajador: "Trabajador",
  ferreteria: "Ferretería",
};

export function roleHome(role: Role): "/" | "/admin" | "/trabajador" | "/ferreteria-panel" {
  if (role === "admin") return "/admin";
  if (role === "trabajador") return "/trabajador";
  if (role === "ferreteria") return "/ferreteria-panel";
  return "/";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Cuenta | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const logout = useCallback(async () => {
    setToken(null);
    setSession(null);
    queryClient.clear();
    await storage.secureRemove(SESSION_KEY);
  }, []);

  const clearAccount = useCallback(async () => {
    await logout();
    setAccountToken(null);
    setAccount(null);
    await storage.secureRemove(ACCOUNT_KEY);
  }, [logout]);

  const applyAccount = useCallback(
    async (r: AccountAuth) => {
      await logout();
      setAccountToken(r.token);
      setAccount(r.cuenta);
      await storage.secureSet(ACCOUNT_KEY, JSON.stringify(r));
    },
    [logout],
  );

  const exchangeGoogle = useCallback(
    async (sessionId: string) => {
      if (sentSessionIds.has(sessionId)) return;
      sentSessionIds.add(sessionId);
      const r = await api.post<AccountAuth>("/auth/session", { session_id: sessionId });
      await applyAccount(r);
    },
    [applyAccount],
  );

  useEffect(() => {
    setUnauthorizedHandler((kind) => {
      void (kind === "staff" ? logout() : clearAccount());
    });
    (async () => {
      // 1. A Google redirect is processed before any stored session.
      const pending = initialWebSessionId ?? (Platform.OS !== "web" ? extractSessionId(await Linking.getInitialURL()) : null);
      if (pending && !sentSessionIds.has(pending)) {
        try {
          await exchangeGoogle(pending);
          clearWebSessionId();
          setHydrated(true);
          return;
        } catch (e) {
          setAuthError(e instanceof Error ? e.message : "No se pudo completar el acceso con Google");
        }
      }
      // 2. Account saved on this phone: stays signed in until the user signs out.
      const raw = await storage.secureGet(ACCOUNT_KEY, "");
      if (raw) {
        try {
          const saved = JSON.parse(String(raw)) as AccountAuth;
          setAccountToken(saved.token);
          setAccount(saved.cuenta);
          let valid = true;
          try {
            const fresh = await api.get<Cuenta>("/cuenta/me");
            setAccount(fresh);
            await storage.secureSet(ACCOUNT_KEY, JSON.stringify({ token: saved.token, cuenta: fresh }));
          } catch (e) {
            // Offline: keep the saved account. Expired: the 401 handler already signed out.
            if (e instanceof ApiError && e.status === 401) valid = false;
          }
          const rawStaff = valid ? await storage.secureGet(SESSION_KEY, "") : "";
          if (rawStaff) {
            const s = JSON.parse(String(rawStaff)) as Session;
            setToken(s.token);
            setSession(s);
          }
        } catch {
          await clearAccount();
        }
      }
      setHydrated(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [logout, clearAccount, exchangeGoogle]);

  // Native: the Google deep link can also arrive while the app is open.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const id = extractSessionId(url);
      if (id) exchangeGoogle(id).catch((e) => setAuthError(e instanceof Error ? e.message : "No se pudo completar el acceso con Google"));
    });
    return () => sub.remove();
  }, [exchangeGoogle]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setAuthError(null);
      await applyAccount(await api.post<AccountAuth>("/cuenta/login", { email, password }));
    },
    [applyAccount],
  );

  const signUp = useCallback(
    async (nombre: string, email: string, password: string) => {
      setAuthError(null);
      await applyAccount(await api.post<AccountAuth>("/cuenta/registro", { nombre, email, password }));
    },
    [applyAccount],
  );

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const id = await openGoogleSignIn();
    if (id) await exchangeGoogle(id);
  }, [exchangeGoogle]);

  const signOut = useCallback(async () => {
    try {
      await api.post("/cuenta/logout");
    } catch {
      // Signing out locally is enough when offline.
    }
    await clearAccount();
  }, [clearAccount]);

  const changePin = useCallback(async (pinActual: string, pinNuevo: string) => {
    await api.post("/auth/cambiar-pin", { pin_actual: pinActual, pin_nuevo: pinNuevo });
  }, []);

  const login = useCallback(async (role: StaffRole, code: string, pin: string) => {
    const r = await api.post<any>("/auth/login", { role, code, pin });
    const s: Session = {
      token: r.access_token,
      role: r.role,
      code: r.code,
      display_name: r.display_name,
      entity_id: r.entity_id,
    };
    queryClient.clear();
    setToken(s.token);
    setSession(s);
    await storage.secureSet(SESSION_KEY, JSON.stringify(s));
    return s;
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      hydrated,
      account,
      session,
      role: session?.role ?? "cliente",
      signIn,
      signUp,
      signInWithGoogle,
      authError,
      signOut,
      login,
      logout,
      changePin,
    }),
    [hydrated, account, session, signIn, signUp, signInWithGoogle, authError, signOut, login, logout, changePin],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
