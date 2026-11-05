import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_OBRA } from "@/src/lib/constants";
import { fecha } from "@/src/lib/format";
import type { WorkerObra } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, EmptyState, ErrorView, LoadingView, ProgressBar, Segmented } from "@/src/ui/kit";

type Filtro = "activas" | "finalizadas";

export default function TrabajadorHome() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [filtro, setFiltro] = useState<Filtro>("activas");
  const q = useQuery({ queryKey: ["trabajador-obras"], queryFn: () => api.get<WorkerObra[]>("/trabajador/obras") });

  const all = q.data ?? [];
  const activas = all.filter((o) => o.estado !== "finalizada");
  const list = filtro === "activas" ? activas : all.filter((o) => o.estado === "finalizada");
  const nombre = (session?.display_name ?? "").split(" ")[0];

  return (
    <View style={styles.screen} testID="worker-home-screen">
      <AppBar title="Mis trabajos" subtitle={session?.display_name} showBack={false} />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.hello}>
                <Text style={styles.helloTitle}>Hola, {nombre}</Text>
                <Text style={styles.helloText} testID="worker-active-count">
                  {activas.length === 1 ? "Tienes 1 obra activa" : `Tienes ${activas.length} obras activas`}
                </Text>
              </View>
              <Segmented
                options={[
                  { value: "activas", label: `Activas (${activas.length})`, icon: "hard-hat" },
                  { value: "finalizadas", label: `Finalizadas (${all.length - activas.length})`, icon: "circle-check" },
                ]}
                value={filtro}
                onChange={setFiltro}
                testIDPrefix="worker-filter"
              />
            </View>
          }
          ListEmptyComponent={
            <Card>
              <EmptyState
                icon="hard-hat"
                title={filtro === "activas" ? "Sin obras asignadas" : "Aún no hay obras finalizadas"}
                text={filtro === "activas" ? "Cuando la oficina te asigne una obra aparecerá aquí con su dirección y fechas." : undefined}
                testID="worker-jobs-empty"
              />
            </Card>
          }
          renderItem={({ item: o }) => {
            const st = ESTADOS_OBRA[o.estado];
            const numFotos = o.fotos.antes.length + o.fotos.durante.length + o.fotos.despues.length;
            return (
              <Card onPress={() => router.push(`/trabajador/obra/${o.id}` as never)} style={styles.card} testID={`worker-job-${o.numero_obra}`}>
                <View style={styles.rowBetween}>
                  <Text style={styles.num}>{o.numero_obra}</Text>
                  <Badge label={st.label} tone={st.tone} />
                </View>
                <Text style={styles.title}>{o.titulo}</Text>
                <View style={styles.row}>
                  <Icon name="map-pin" size={16} color={colors.brand} />
                  <Text style={styles.line} numberOfLines={2}>{o.direccion}</Text>
                </View>
                <View style={styles.row}>
                  <Icon name="calendar-days" size={16} color={colors.brand} />
                  <Text style={styles.line}>
                    {fecha(o.fecha_inicio)} → {fecha(o.fecha_fin_prevista)}
                  </Text>
                </View>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <ProgressBar value={o.porcentaje_avance} />
                  </View>
                  <Text style={styles.pct}>{o.porcentaje_avance}%</Text>
                </View>
                <View style={styles.footer}>
                  <View style={styles.row}>
                    <Icon name="camera" size={15} color={colors.muted} />
                    <Text style={styles.meta}>{numFotos} fotos</Text>
                  </View>
                  {o.companeros.length > 1 ? (
                    <View style={styles.row}>
                      <Icon name="users" size={15} color={colors.muted} />
                      <Text style={styles.meta}>{o.companeros.length} en el equipo</Text>
                    </View>
                  ) : null}
                  <Icon name="chevron-right" size={20} color={colors.brand} />
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  list: { padding: 16, gap: 12 },
  header: { gap: 14, marginBottom: 2 },
  hello: { backgroundColor: c.brand, borderRadius: radius.xl, padding: 18, gap: 4 },
  helloTitle: { fontFamily: fonts.extraBoldItalic, fontSize: 22, color: c.onBrand },
  helloText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandPrimary },
  card: { gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1 },
  num: { fontFamily: fonts.black, fontSize: 16, color: c.brandSecondary },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep },
  line: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.textDark },
  pct: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.brandDeep },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 2 },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: c.muted },
}));
