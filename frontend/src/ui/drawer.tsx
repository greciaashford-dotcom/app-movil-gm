import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter } from "expo-router";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { SlideInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { roleHome, ROLE_LABELS, Role, StaffRole, useAuth } from "@/src/auth";
import { api, errorMessage } from "@/src/lib/api";
import { COMPANY_PHONE } from "@/src/lib/constants";
import { formatPhone, telLink } from "@/src/lib/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { BrandLogo } from "@/src/ui/BrandLogo";
import { Icon, IconName } from "@/src/ui/Icon";
import { PillButton } from "@/src/ui/kit";
import { Linking } from "react-native";

type NavItem = { label: string; icon: IconName; href: string };

const NAV: Record<Role, NavItem[]> = {
  cliente: [
    { label: "Inicio", icon: "house", href: "/" },
    { label: "Servicios", icon: "wrench", href: "/servicios" },
    { label: "Solicitar presupuesto", icon: "file-text", href: "/solicitar-presupuesto" },
    { label: "Urgencias 24h", icon: "siren", href: "/solicitud-urgente" },
    { label: "Mis solicitudes", icon: "clipboard-list", href: "/mis-solicitudes" },
    { label: "Ferreterías recomendadas", icon: "store", href: "/ferreterias" },
    { label: "Contacto / Mi cuenta", icon: "user-round", href: "/contacto" },
  ],
  admin: [
    { label: "Panel general", icon: "layout-dashboard", href: "/admin" },
    { label: "Solicitudes", icon: "clipboard-list", href: "/admin/solicitudes" },
    { label: "Clientes", icon: "users", href: "/admin/clientes" },
    { label: "Presupuestos", icon: "file-text", href: "/admin/presupuestos" },
    { label: "Obras", icon: "hard-hat", href: "/admin/obras" },
    { label: "Trabajadores", icon: "user-round", href: "/admin/trabajadores" },
    { label: "Finanzas", icon: "wallet", href: "/admin/finanzas" },
    { label: "Agenda", icon: "calendar-days", href: "/admin/agenda" },
    { label: "Gestoría", icon: "calculator", href: "/admin/gestoria" },
    { label: "Ferreterías y comisiones", icon: "store", href: "/admin/ferreterias" },
    { label: "Accesos y PIN", icon: "key-round", href: "/admin/accesos" },
    { label: "Configuración", icon: "settings", href: "/admin/configuracion" },
  ],
  trabajador: [{ label: "Mis trabajos", icon: "hard-hat", href: "/trabajador" }],
  ferreteria: [
    { label: "Mi panel", icon: "store", href: "/ferreteria-panel" },
    { label: "Directorio de ferreterías", icon: "map", href: "/ferreterias" },
  ],
};

const ROLE_ICONS: Record<Role, IconName> = {
  cliente: "user-round",
  admin: "layout-dashboard",
  trabajador: "hard-hat",
  ferreteria: "store",
};

const DrawerCtx = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useDrawer = () => useContext(DrawerCtx);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  return (
    <DrawerCtx.Provider value={{ open, close }}>
      {children}
      <AppDrawer visible={visible} onClose={close} />
    </DrawerCtx.Provider>
  );
}

function AppDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { role, session, logout, account, signOut } = useAuth();
  const [pinRole, setPinRole] = useState<StaffRole | null>(null);
  const [changingPin, setChangingPin] = useState(false);

  const closeAll = () => {
    setPinRole(null);
    setChangingPin(false);
    onClose();
  };

  const go = (href: string) => {
    closeAll();
    router.navigate(href as never);
  };

  const pickRole = async (r: Role) => {
    if (r === role) {
      go(roleHome(r));
      return;
    }
    if (r === "cliente") {
      await logout();
      closeAll();
      router.dismissTo("/");
      return;
    }
    setPinRole(r);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeAll} statusBarTranslucent navigationBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={closeAll} testID="drawer-backdrop" accessibilityLabel="Cerrar menú" />
        <Animated.View entering={SlideInRight.duration(260)} style={[styles.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]} testID="app-drawer">
          <View style={styles.panelHeader}>
            <BrandLogo compact />
            <Pressable onPress={closeAll} hitSlop={10} style={styles.closeBtn} testID="drawer-close-button" accessibilityLabel="Cerrar menú">
              <Icon name="x" size={22} color={colors.onBrand} />
            </Pressable>
          </View>

          {pinRole ? (
            <PinForm
              role={pinRole}
              onCancel={() => setPinRole(null)}
              onSuccess={(r) => {
                closeAll();
                router.dismissTo(roleHome(r));
              }}
            />
          ) : changingPin ? (
            <ChangePinForm onDone={() => setChangingPin(false)} />
          ) : (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {account ? (
                <View style={styles.accountCard} testID="drawer-account">
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{(account.nombre || account.email).slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.accountName} numberOfLines={1} testID="drawer-account-name">
                      {account.nombre}
                    </Text>
                    <Text style={styles.accountEmail} numberOfLines={1} testID="drawer-account-email">
                      {account.email}
                    </Text>
                  </View>
                </View>
              ) : null}
              <Text style={styles.groupTitle}>Modo / Rol Actual</Text>
              <View style={styles.roleGrid} testID="role-selector">
                {(Object.keys(ROLE_LABELS) as Role[]).map((r) => {
                  const active = r === role;
                  return (
                    <Pressable
                      key={r}
                      testID={`role-option-${r}`}
                      onPress={() => pickRole(r)}
                      style={({ pressed }) => [styles.roleTile, active && styles.roleTileActive, pressed && styles.pressed]}
                      accessibilityState={{ selected: active }}
                    >
                      <Icon name={ROLE_ICONS[r]} size={20} color={active ? colors.onBrandPrimary : colors.brandPrimary} />
                      <Text style={[styles.roleText, active && styles.roleTextActive]} numberOfLines={2}>
                        {ROLE_LABELS[r]}
                      </Text>
                      {r !== "cliente" && !active ? <Icon name="lock" size={12} color={colors.pillBorder} style={styles.lock} /> : null}
                    </Pressable>
                  );
                })}
              </View>
              {session ? (
                <Text style={styles.sessionText} testID="drawer-session-name">
                  Modo activo: {session.display_name}
                </Text>
              ) : null}

              <Text style={styles.groupTitle}>Navegación</Text>
              {NAV[role].map((item) => {
                const active = pathname === item.href;
                return (
                  <Pressable
                    key={item.href}
                    testID={`drawer-nav-${item.href.replace(/\//g, "-").replace(/^-/, "") || "inicio"}`}
                    onPress={() => go(item.href)}
                    style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}
                  >
                    <Icon name={item.icon} size={20} color={active ? colors.brandPrimary : colors.onBrand} />
                    <Text style={[styles.navText, active && styles.navTextActive]}>{item.label}</Text>
                  </Pressable>
                );
              })}

              <View style={styles.footer}>
                <PillButton label={`Llamar ${formatPhone(COMPANY_PHONE)}`} icon="phone" variant="call" small onPress={() => Linking.openURL(telLink(COMPANY_PHONE))} testID="drawer-call-button" />
                {session ? (
                  <>
                    <PillButton label="Cambiar mi PIN" icon="key-round" variant="ghost" small testID="drawer-change-pin-button" onPress={() => setChangingPin(true)} />
                    <PillButton
                      label={`Salir del modo ${ROLE_LABELS[session.role]}`}
                      icon="arrow-left-right"
                      variant="outline"
                      small
                      testID="drawer-logout-button"
                      onPress={async () => {
                        await logout();
                        closeAll();
                        router.dismissTo("/");
                      }}
                    />
                  </>
                ) : null}
                <PillButton
                  label="Cerrar sesión"
                  icon="log-out"
                  variant="dangerOutline"
                  small
                  testID="drawer-signout-button"
                  onPress={async () => {
                    closeAll();
                    // The root gate takes the user to the login screen.
                    await signOut();
                  }}
                />
              </View>
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function PinForm({ role, onCancel, onSuccess }: { role: StaffRole; onCancel: () => void; onSuccess: (r: StaffRole) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { login, account } = useAuth();
  const [code, setCode] = useState<string>(role === "admin" ? "admin" : "");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const needsEntity = role !== "admin";
  type Opt = { codigo: string; nombre: string; mio: boolean };
  const options = useQuery({
    queryKey: ["auth-options", account?.account_id],
    queryFn: () => api.get<{ trabajadores: (Opt & { especialidad: string })[]; ferreterias: Opt[] }>("/auth/options"),
    enabled: needsEntity,
  });
  const entities =
    role === "trabajador"
      ? (options.data?.trabajadores ?? []).map((t) => ({ code: t.codigo, name: t.nombre, sub: t.mio ? `${t.especialidad} · vinculado a tu cuenta` : t.especialidad, mio: t.mio }))
      : (options.data?.ferreterias ?? []).map((f) => ({ code: f.codigo, name: f.nombre, sub: f.mio ? `${f.codigo} · vinculada a tu cuenta` : f.codigo, mio: f.mio }));

  // Preselect the profile already linked to this account.
  const mine = entities.filter((e) => e.mio);
  const mineCode = mine.length === 1 ? mine[0].code : "";
  useEffect(() => {
    if (mineCode) setCode((c) => c || mineCode);
  }, [mineCode]);

  const submit = async () => {
    setError(null);
    if (!code) return setError(role === "trabajador" ? "Elige tu nombre" : "Elige tu ferretería");
    if (pin.length !== 6) return setError("Introduce tu PIN de 6 cifras");
    setLoading(true);
    try {
      const s = await login(role, code, pin);
      onSuccess(s.role);
    } catch (e) {
      setError(errorMessage(e));
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID="pin-form">
      <Pressable onPress={onCancel} style={styles.backRow} testID="pin-back-button" hitSlop={8}>
        <Icon name="chevron-left" size={20} color={colors.brandPrimary} />
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
      <Text style={styles.pinTitle}>Acceso {ROLE_LABELS[role]}</Text>
      <Text style={styles.pinSub}>Protección extra: además de tu cuenta, este modo pide tu PIN personal de 6 cifras.</Text>
      {needsEntity ? (
        <View style={styles.entityList}>
          <Text style={styles.groupTitle}>{role === "trabajador" ? "¿Quién eres?" : "Tu ferretería"}</Text>
          {options.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          {!options.isLoading && entities.length === 0 ? (
            <Text style={styles.pinSub} testID="pin-no-profiles">
              No hay perfiles disponibles para tu cuenta. Pide al administrador que te dé acceso.
            </Text>
          ) : null}
          {entities.map((e) => {
            const active = e.code === code;
            return (
              <Pressable
                key={e.code}
                testID={`pin-entity-${e.code.toLowerCase()}`}
                onPress={() => setCode(e.code)}
                style={[styles.entity, active && styles.entityActive]}
              >
                <Icon name={active ? "circle-check" : "user-round"} size={18} color={active ? colors.onBrandPrimary : colors.onBrand} />
                <View style={styles.flex}>
                  <Text style={[styles.entityName, active && styles.entityNameActive]}>{e.name}</Text>
                  <Text style={[styles.entitySub, active && styles.entityNameActive]}>{e.sub}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <Text style={styles.groupTitle}>PIN (6 cifras)</Text>
      <TextInput
        testID="pin-input"
        value={pin}
        onChangeText={(t) => setPin(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        placeholder="••••••"
        placeholderTextColor={colors.pillBorder}
        style={styles.pinInput}
        onSubmitEditing={submit}
        autoFocus={!needsEntity}
      />
      {error ? (
        <Text style={styles.pinError} testID="pin-error">
          {error}
        </Text>
      ) : null}
      <PillButton label="Entrar" icon="key-round" onPress={submit} loading={loading} testID="pin-submit-button" />
    </ScrollView>
  );
}

function ChangePinForm({ onDone }: { onDone: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { changePin } = useAuth();
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const clean = (t: string) => t.replace(/\D/g, "").slice(0, 6);

  const submit = async () => {
    setError(null);
    if (actual.length !== 6) return setError("Introduce tu PIN actual de 6 cifras");
    if (nuevo.length !== 6) return setError("El nuevo PIN debe tener 6 cifras");
    if (nuevo !== repetir) return setError("Los PIN nuevos no coinciden");
    setLoading(true);
    try {
      await changePin(actual, nuevo);
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const pinField = (label: string, value: string, onChange: (v: string) => void, testID: string) => (
    <>
      <Text style={styles.groupTitle}>{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(t) => onChange(clean(t))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        placeholder="••••••"
        placeholderTextColor={colors.pillBorder}
        style={styles.pinInput}
      />
    </>
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" testID="change-pin-form">
      <Pressable onPress={onDone} style={styles.backRow} testID="change-pin-back-button" hitSlop={8}>
        <Icon name="chevron-left" size={20} color={colors.brandPrimary} />
        <Text style={styles.backText}>Volver</Text>
      </Pressable>
      <Text style={styles.pinTitle}>Cambiar mi PIN</Text>
      {done ? (
        <>
          <View style={styles.doneRow} testID="change-pin-success">
            <Icon name="circle-check" size={22} color={colors.brandPrimary} />
            <Text style={styles.doneText}>Tu PIN se ha actualizado. Úsalo la próxima vez que entres en este modo.</Text>
          </View>
          <PillButton label="Listo" icon="check" onPress={onDone} testID="change-pin-done-button" />
        </>
      ) : (
        <>
          <Text style={styles.pinSub}>6 cifras, sin secuencias (123456) ni repeticiones (111111).</Text>
          {pinField("PIN actual", actual, setActual, "change-pin-current-input")}
          {pinField("Nuevo PIN", nuevo, setNuevo, "change-pin-new-input")}
          {pinField("Repite el nuevo PIN", repetir, setRepetir, "change-pin-confirm-input")}
          {error ? (
            <Text style={styles.pinError} testID="change-pin-error">
              {error}
            </Text>
          ) : null}
          <PillButton label="Guardar nuevo PIN" icon="check" onPress={submit} loading={loading} testID="change-pin-submit-button" />
        </>
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  overlay: { flex: 1, backgroundColor: c.overlay, flexDirection: "row", justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  panel: { width: "86%", maxWidth: 360, backgroundColor: c.brandDeep, borderTopLeftRadius: 28, borderBottomLeftRadius: 28 },
  panelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingBottom: 12 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.brandTertiary },
  scroll: { paddingHorizontal: 18, paddingBottom: 24, gap: 8 },
  groupTitle: { fontFamily: fonts.extraBold, fontSize: 13, color: c.brandPrimary, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 12, marginBottom: 4 },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  roleTile: {
    width: "48%",
    minHeight: 72,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: c.brandSecondary,
    backgroundColor: c.brand,
    padding: 12,
    gap: 6,
  },
  roleTileActive: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  roleText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onBrand },
  roleTextActive: { color: c.onBrandPrimary },
  lock: { position: "absolute", top: 10, right: 10 },
  sessionText: { fontFamily: fonts.body, fontSize: 12, color: c.pillBorder },
  navItem: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, paddingHorizontal: 12, borderRadius: 14 },
  navItemActive: { backgroundColor: c.brand },
  navText: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onBrand },
  navTextActive: { color: c.brandPrimary },
  pressed: { opacity: 0.85 },
  footer: { gap: 10, marginTop: 16 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 40 },
  backText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandPrimary },
  pinTitle: { fontFamily: fonts.extraBoldItalic, fontSize: 22, color: c.onBrand },
  pinSub: { fontFamily: fonts.body, fontSize: 14, color: c.pillBorder, lineHeight: 20 },
  entityList: { gap: 8 },
  entity: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, borderRadius: 14, paddingHorizontal: 12, backgroundColor: c.brand },
  entityActive: { backgroundColor: c.brandPrimary },
  entityName: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onBrand },
  entitySub: { fontFamily: fonts.body, fontSize: 12, color: c.pillBorder },
  entityNameActive: { color: c.onBrandPrimary },
  flex: { flex: 1 },
  pinInput: {
    height: 58,
    borderRadius: 16,
    backgroundColor: c.surface,
    textAlign: "center",
    fontFamily: fonts.black,
    fontSize: 26,
    letterSpacing: 10,
    color: c.brandDeep,
  },
  pinError: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.brandPrimary, textAlign: "center" },
  accountCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.brand, borderRadius: 18, padding: 12, marginTop: 4 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.black, fontSize: 18, color: c.onBrandPrimary },
  accountName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onBrand },
  accountEmail: { fontFamily: fonts.body, fontSize: 12.5, color: c.pillBorder },
  doneRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.brand, borderRadius: 14, padding: 12 },
  doneText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: c.onBrand, lineHeight: 20 },
}));
