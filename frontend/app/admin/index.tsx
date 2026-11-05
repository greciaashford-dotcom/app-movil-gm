import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_SOLICITUD, TIPOS_RECORDATORIO } from "@/src/lib/constants";
import { eur, fecha, fechaHora } from "@/src/lib/format";
import type { Recordatorio, Solicitud } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon, IconName } from "@/src/ui/Icon";
import { Badge, Card, ErrorView, KpiCard, LoadingView, SectionTitle } from "@/src/ui/kit";

type Dashboard = {
  kpis: {
    solicitudes_nuevas: number;
    urgencias_activas: number;
    presupuestos_enviados: number;
    presupuestos_aceptados: number;
    obras_en_curso: number;
    beneficio_mes: number;
    ingresos_mes: number;
    gastos_mes: number;
  };
  recientes: Solicitud[];
  recordatorios: Recordatorio[];
};

const ACCESOS: { label: string; icon: IconName; href: string }[] = [
  { label: "Solicitudes", icon: "clipboard-list", href: "/admin/solicitudes" },
  { label: "Clientes", icon: "users", href: "/admin/clientes" },
  { label: "Presupuestos", icon: "file-text", href: "/admin/presupuestos" },
  { label: "Obras", icon: "hard-hat", href: "/admin/obras" },
  { label: "Trabajadores", icon: "user-round", href: "/admin/trabajadores" },
  { label: "Finanzas", icon: "wallet", href: "/admin/finanzas" },
  { label: "Agenda", icon: "calendar-days", href: "/admin/agenda" },
  { label: "Gestoría", icon: "calculator", href: "/admin/gestoria" },
  { label: "Ferreterías", icon: "store", href: "/admin/ferreterias" },
  { label: "Configuración", icon: "settings", href: "/admin/configuracion" },
];

export default function AdminDashboard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => api.get<Dashboard>("/admin/dashboard") });
  const k = q.data?.kpis;

  return (
    <View style={styles.screen} testID="admin-dashboard-screen">
      <AppBar title="Panel general" subtitle="GM Conecta · Admin" showBack={false} />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError || !k ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
        >
          <Animated.View entering={FadeInDown.duration(350)} style={styles.profit} testID="dashboard-profit-card">
            <Text style={styles.profitLabel}>Beneficio del mes (empresa)</Text>
            <Text style={styles.profitValue} testID="dashboard-profit-value">
              {eur(k.beneficio_mes)}
            </Text>
            <View style={styles.profitRow}>
              <Text style={styles.profitSub}>Ingresos {eur(k.ingresos_mes, 0)}</Text>
              <Text style={styles.profitSub}>Gastos {eur(k.gastos_mes, 0)}</Text>
            </View>
          </Animated.View>

          <View style={styles.kpis}>
            <KpiCard label="Solicitudes nuevas" value={String(k.solicitudes_nuevas)} icon="inbox" tone="yellow" testID="kpi-new-requests" onPress={() => router.push({ pathname: "/admin/solicitudes", params: { estado: "pendiente" } })} />
            <KpiCard label="Urgencias 24h activas" value={String(k.urgencias_activas)} icon="siren" tone="error" testID="kpi-urgent" onPress={() => router.push({ pathname: "/admin/solicitudes", params: { estado: "urgencias" } })} />
            <KpiCard label="Presupuestos enviados" value={String(k.presupuestos_enviados)} icon="send" tone="info" testID="kpi-quotes-sent" onPress={() => router.push({ pathname: "/admin/presupuestos", params: { estado: "pendiente" } })} />
            <KpiCard label="Presupuestos aceptados" value={String(k.presupuestos_aceptados)} icon="circle-check" tone="success" testID="kpi-quotes-accepted" onPress={() => router.push({ pathname: "/admin/presupuestos", params: { estado: "aceptado" } })} />
            <KpiCard label="Obras en curso" value={String(k.obras_en_curso)} icon="hard-hat" tone="warning" testID="kpi-active-works" onPress={() => router.push("/admin/obras")} />
            <KpiCard label="Ver finanzas" value={`${k.ingresos_mes ? Math.round((k.beneficio_mes / k.ingresos_mes) * 100) : 0}%`} hint="Rentabilidad mes" icon="trending-up" tone="navy" testID="kpi-finance" onPress={() => router.push("/admin/finanzas")} />
          </View>

          <SectionTitle title="Accesos rápidos" />
          <View style={styles.grid}>
            {ACCESOS.map((a) => (
              <Pressable key={a.href} testID={`quick-${a.href.split("/").pop()}`} onPress={() => router.push(a.href as never)} style={({ pressed }) => [styles.quick, pressed && styles.pressed]}>
                <View style={styles.quickIcon}>
                  <Icon name={a.icon} size={20} color={colors.brandPrimary} />
                </View>
                <Text style={styles.quickText} numberOfLines={1}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <SectionTitle title="Últimas solicitudes" action="Ver todas" onAction={() => router.push("/admin/solicitudes")} testID="dashboard-see-requests" />
          {q.data?.recientes.map((s) => (
            <Card key={s.id} onPress={() => router.push(`/admin/solicitud/${s.id}` as never)} testID={`dashboard-request-${s.numero_solicitud}`} style={styles.reqCard}>
              <View style={[styles.reqIcon, s.es_urgencia && styles.reqIconUrgent]}>
                <Icon name={s.es_urgencia ? "siren" : "clipboard-list"} size={18} color={s.es_urgencia ? colors.urgent : colors.brand} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.reqTitle} numberOfLines={1}>
                  {s.numero_solicitud} · {s.nombre_cliente}
                </Text>
                <Text style={styles.reqMeta} numberOfLines={1}>
                  {s.servicio} · {fechaHora(s.fecha_creacion)}
                </Text>
              </View>
              <Badge label={ESTADOS_SOLICITUD[s.estado].label} tone={ESTADOS_SOLICITUD[s.estado].tone} />
            </Card>
          ))}

          <SectionTitle title="Próximos recordatorios" action="Agenda" onAction={() => router.push("/admin/agenda")} testID="dashboard-see-agenda" />
          {q.data?.recordatorios.length === 0 ? <Text style={styles.reqMeta}>Sin recordatorios pendientes.</Text> : null}
          {q.data?.recordatorios.map((r) => (
            <Card key={r.id} style={styles.reqCard} tone="yellow">
              <Icon name={TIPOS_RECORDATORIO[r.tipo].icon} size={18} color={colors.brandDeep} />
              <View style={styles.flex}>
                <Text style={styles.reqTitle} numberOfLines={1}>
                  {r.titulo}
                </Text>
                <Text style={styles.reqMeta}>
                  {fecha(r.fecha)}
                  {r.hora ? ` · ${r.hora}` : ""}
                  {r.importe ? ` · ${eur(r.importe)}` : ""}
                </Text>
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  flex: { flex: 1 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  profit: { backgroundColor: c.brand, borderRadius: radius.xxl, padding: 20, gap: 4 },
  profitLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.pillBorder },
  profitValue: { fontFamily: fonts.black, fontSize: 34, color: c.brandPrimary },
  profitRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  profitSub: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onBrand },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  quick: { width: "31%", flexGrow: 1, backgroundColor: c.surface, borderRadius: 18, paddingVertical: 14, alignItems: "center", gap: 8 },
  quickIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  quickText: { fontFamily: fonts.bodySemi, fontSize: 12.5, color: c.brandDeep },
  reqCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  reqIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: c.infoCard, alignItems: "center", justifyContent: "center" },
  reqIconUrgent: { backgroundColor: c.errorSoft },
  reqTitle: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: c.brandDeep },
  reqMeta: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted, marginTop: 2 },
}));
