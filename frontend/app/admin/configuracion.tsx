import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { EMAIL_RE, fechaHora, parseNum } from "@/src/lib/format";
import type { Mensaje } from "@/src/lib/types";
import type { Tone } from "@/src/lib/constants";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon, IconName } from "@/src/ui/Icon";
import { Badge, Card, ErrorView, Field, LoadingView, PillButton, SectionTitle } from "@/src/ui/kit";
import { useToast } from "@/src/ui/toast";

type Settings = {
  razon_social: string;
  cif: string;
  direccion_fiscal: string;
  telefono: string;
  whatsapp: string;
  email_contacto: string;
  admin_email: string;
  iva_defecto: number;
  email_simulacion: boolean;
};
type Integracion = { clave: string; nombre: string; estado: "activo" | "simulacion" | "pendiente"; detalle: string; extra?: string };
type Config = { settings: Settings; integraciones: Integracion[]; mensajes: Record<string, number> };
type Form = Omit<Settings, "iva_defecto" | "email_simulacion"> & { iva_defecto: string };

const ESTADO_INT: Record<Integracion["estado"], { label: string; tone: Tone }> = {
  activo: { label: "Activo", tone: "success" },
  simulacion: { label: "Simulación", tone: "yellow" },
  pendiente: { label: "Pendiente", tone: "warning" },
};
const INT_ICON: Record<string, IconName> = { resend: "mail", whatsapp: "message-circle", fiscal: "landmark" };
const MSG_ESTADO: Record<string, { label: string; tone: Tone }> = {
  enviado: { label: "Enviado", tone: "success" },
  simulado_pendiente_api_key: { label: "Simulado", tone: "yellow" },
  error: { label: "Error", tone: "error" },
};

function toForm(s: Settings): Form {
  return {
    razon_social: s.razon_social,
    cif: s.cif,
    direccion_fiscal: s.direccion_fiscal,
    telefono: s.telefono,
    whatsapp: s.whatsapp,
    email_contacto: s.email_contacto,
    admin_email: s.admin_email,
    iva_defecto: String(s.iva_defecto),
  };
}

export default function AdminConfiguracion() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin-config"], queryFn: () => api.get<Config>("/admin/configuracion") });
  const msgs = useQuery({ queryKey: ["admin-mensajes"], queryFn: () => api.get<Mensaje[]>("/admin/mensajes?limit=15") });

  if (q.data && !form) setForm(toForm(q.data.settings));

  const onSaved = (d: Config, msg: string) => {
    qc.setQueryData(["admin-config"], d);
    setForm(toForm(d.settings));
    toast.show(msg);
  };

  const save = useMutation({
    mutationFn: () => {
      const f = form!;
      if (f.admin_email && !EMAIL_RE.test(f.admin_email.trim())) throw new Error("El correo de alertas no es válido");
      if (f.email_contacto && !EMAIL_RE.test(f.email_contacto.trim())) throw new Error("El correo de contacto no es válido");
      const iva = parseNum(f.iva_defecto);
      if (iva < 0 || iva > 30) throw new Error("El IVA debe estar entre 0 y 30%");
      return api.patch<Config>("/admin/configuracion", {
        razon_social: f.razon_social.trim(),
        cif: f.cif.trim().toUpperCase(),
        direccion_fiscal: f.direccion_fiscal.trim(),
        telefono: f.telefono.trim(),
        whatsapp: f.whatsapp.replace(/\D/g, ""),
        email_contacto: f.email_contacto.trim(),
        admin_email: f.admin_email.trim(),
        iva_defecto: iva,
      });
    },
    onSuccess: (d) => {
      setError(null);
      onSaved(d, "Configuración guardada");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const simulacion = useMutation({
    mutationFn: (v: boolean) => api.patch<Config>("/admin/configuracion", { email_simulacion: v }),
    onSuccess: (d) => onSaved(d, d.settings.email_simulacion ? "Modo simulación activado" : "Correos reales activados"),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const prueba = useMutation({
    mutationFn: () => api.post<Mensaje>("/admin/configuracion/probar-email"),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["admin-mensajes"] });
      qc.invalidateQueries({ queryKey: ["admin-config"] });
      if (m.estado === "enviado") toast.show(`Correo de prueba enviado a ${m.destinatario}`);
      else if (m.estado === "error") toast.show(m.error || "No se pudo enviar el correo", "error");
      else toast.show("Modo simulación: el correo se guardó sin enviarse", "info");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (q.isLoading || q.isError || !q.data || !form) {
    return (
      <View style={styles.screen}>
        <AppBar title="Configuración" />
        {q.isError ? <ErrorView message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : <LoadingView />}
      </View>
    );
  }
  const cfg = q.data;
  const set = (k: keyof Form) => (v: string) => setForm((x) => (x ? { ...x, [k]: v } : x));
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(cfg.settings));

  return (
    <View style={styles.screen} testID="admin-settings-screen">
      <AppBar title="Configuración" subtitle="Integraciones, alertas y datos fiscales" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <SectionTitle title="Estado de las integraciones" />
        {cfg.integraciones.map((i) => (
          <Card key={i.clave} style={styles.intCard} testID={`integration-${i.clave}`}>
            <View style={styles.intIcon}>
              <Icon name={INT_ICON[i.clave] ?? "plug"} size={22} color={colors.brand} />
            </View>
            <View style={styles.flex}>
              <View style={styles.rowBetween}>
                <Text style={styles.intName}>{i.nombre}</Text>
                <Badge label={ESTADO_INT[i.estado].label} tone={ESTADO_INT[i.estado].tone} testID={`integration-status-${i.clave}`} />
              </View>
              <Text style={styles.hint}>{i.detalle}</Text>
              {i.extra ? <Text style={styles.extra}>{i.extra}</Text> : null}
            </View>
          </Card>
        ))}

        <SectionTitle title="Correo electrónico" />
        <Card style={styles.gap}>
          <Field
            label="Correo de alertas (nuevas solicitudes y urgencias)"
            value={form.admin_email}
            onChangeText={set("admin_email")}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="tu-correo@empresa.com"
            testID="settings-admin-email-input"
          />
          <Field
            label="Correo de contacto para clientes"
            value={form.email_contacto}
            onChangeText={set("email_contacto")}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="info@empresa.com"
            hint="Se usa como dirección de respuesta en los correos a clientes."
            testID="settings-contact-email-input"
          />
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.intName}>Modo simulación</Text>
              <Text style={styles.hint}>Guarda los correos en el historial sin enviarlos.</Text>
            </View>
            <Switch
              value={cfg.settings.email_simulacion}
              onValueChange={(v) => simulacion.mutate(v)}
              disabled={simulacion.isPending}
              trackColor={{ false: colors.border, true: colors.brandPrimary }}
              thumbColor={colors.surface}
              testID="settings-simulation-switch"
            />
          </View>
          <PillButton
            label="Enviar correo de prueba"
            icon="send"
            variant="ghost"
            small
            onPress={() => (dirty ? toast.show("Guarda los cambios antes de probar", "info") : prueba.mutate())}
            loading={prueba.isPending}
            disabled={!cfg.settings.admin_email}
            testID="settings-test-email-button"
          />
          <View style={styles.counts}>
            <Count label="Enviados" value={cfg.mensajes.enviado ?? 0} testID="settings-count-sent" />
            <Count label="Simulados" value={cfg.mensajes.simulado_pendiente_api_key ?? 0} testID="settings-count-simulated" />
            <Count label="Errores" value={cfg.mensajes.error ?? 0} testID="settings-count-error" />
          </View>
        </Card>

        <SectionTitle title="Contacto y WhatsApp" />
        <Card style={styles.gap}>
          <Field label="Teléfono de la empresa" value={form.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" testID="settings-phone-input" />
          <Field label="WhatsApp (con prefijo, ej. 34640677948)" value={form.whatsapp} onChangeText={set("whatsapp")} keyboardType="phone-pad" testID="settings-whatsapp-input" />
        </Card>

        <SectionTitle title="Datos fiscales" />
        <Card style={styles.gap}>
          <Field label="Razón social" value={form.razon_social} onChangeText={set("razon_social")} testID="settings-company-input" />
          <Field label="CIF / NIF" value={form.cif} onChangeText={set("cif")} autoCapitalize="characters" placeholder="B12345678" testID="settings-cif-input" />
          <Field label="Dirección fiscal" value={form.direccion_fiscal} onChangeText={set("direccion_fiscal")} testID="settings-address-input" />
          <Field label="IVA por defecto (%)" value={form.iva_defecto} onChangeText={set("iva_defecto")} keyboardType="decimal-pad" testID="settings-iva-input" />
        </Card>

        {error ? <Text style={styles.error} testID="settings-error">{error}</Text> : null}
        <PillButton label="Guardar configuración" icon="check" onPress={() => save.mutate()} loading={save.isPending} disabled={!dirty} testID="settings-save-button" />

        <SectionTitle title="Últimos mensajes" />
        <Card style={styles.gapSm}>
          {msgs.isLoading ? <Text style={styles.hint}>Cargando…</Text> : null}
          {(msgs.data ?? []).length === 0 && !msgs.isLoading ? <Text style={styles.hint}>Sin mensajes todavía.</Text> : null}
          {(msgs.data ?? []).map((m, i, arr) => {
            const st = MSG_ESTADO[m.estado] ?? { label: m.estado, tone: "neutral" as Tone };
            return (
              <View key={m.id} style={[styles.msgRow, i < arr.length - 1 && styles.divider]} testID={`settings-message-${m.id}`}>
                <View style={styles.flex}>
                  <Text style={styles.msgSubject} numberOfLines={1}>{m.asunto}</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {m.destinatario} · {fechaHora(m.fecha)}
                  </Text>
                </View>
                <Badge label={st.label} tone={st.tone} />
              </View>
            );
          })}
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

function Count({ label, value, testID }: { label: string; value: number; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.count}>
      <Text style={styles.countValue} testID={testID}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  gap: { gap: 14 },
  gapSm: { gap: 2 },
  flex: { flex: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  intCard: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  intIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.infoCard, alignItems: "center", justifyContent: "center" },
  intName: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.brandDeep, flexShrink: 1 },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted, lineHeight: 18 },
  extra: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: c.brandSecondary, marginTop: 2 },
  counts: { flexDirection: "row", gap: 8 },
  count: { flex: 1, backgroundColor: c.canvas, borderRadius: 14, paddingVertical: 10, alignItems: "center" },
  countValue: { fontFamily: fonts.black, fontSize: 20, color: c.brandDeep },
  countLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: c.muted },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent, textAlign: "center" },
  msgRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  msgSubject: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
}));
