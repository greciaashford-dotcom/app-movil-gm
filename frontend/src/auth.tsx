import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, setToken, setUnauthorizedHandler } from "@/src/lib/api";
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

const SESSION_KEY = "gm_session";

type AuthCtx = {
  hydrated: boolean;
  session: Session | null;
  role: Role;
  login: (role: StaffRole, code: string, pin: string) => Promise<Session>;
  logout: () => Promise<void>;
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
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const logout = useCallback(async () => {
    setToken(null);
    setSession(null);
    queryClient.clear();
    await storage.secureRemove(SESSION_KEY);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void logout();
    });
    (async () => {
      const raw = await storage.secureGet(SESSION_KEY, "");
      if (raw) {
        try {
          const s = JSON.parse(String(raw)) as Session;
          setToken(s.token);
          setSession(s);
        } catch {
          await storage.secureRemove(SESSION_KEY);
        }
      }
      setHydrated(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [logout]);

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
    () => ({ hydrated, session, role: session?.role ?? "cliente", login, logout }),
    [hydrated, session, login, logout],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
