import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_OBRA } from "@/src/lib/constants";
import { eur, fecha } from "@/src/lib/format";
import type { Obra } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ChipRow, EmptyState, ErrorView, LoadingView, ProgressBar } from "@/src/ui/kit";

const FILTROS = [
  { key: "", label: "Todas" },
  { key: "planificada", label: "Planificadas" },
  { key: "en_curso", label: "En curso" },
  { key: "pausada", label: "Pausadas" },
  { key: "finalizada", label: "Finalizadas" },
];

export default function AdminObras() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [filtro, setFiltro] = useState("");
  const q = useQuery({ queryKey: ["admin-obras", filtro], queryFn: () => api.get<Obra[]>(`/admin/obras${filtro ? `?estado=${filtro}` : ""}`) });

  return (
    <View style={styles.screen} testID="admin-works-screen">
      <AppBar title="Obras y trabajos" subtitle="Rentabilidad real por obra" />
      <ChipRow style={styles.chips}>
        {FILTROS.map((f) => (
          <Chip key={f.key || "todas"} label={f.label} selected={filtro === f.key} onPress={() => setFiltro(f.key)} testID={`works-filter-${f.key || "todas"}`} />
        ))}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon="hard-hat" title="No hay obras" text="Convierte un presupuesto aceptado en obra para empezar." testID="admin-works-empty" />}
          renderItem={({ item: o }) => (
            <Card onPress={() => router.push(`/admin/obra/${o.id}` as never)} testID={`admin-work-${o.numero_obra}`} style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.num}>{o.numero_obra}</Text>
                <Badge label={ESTADOS_OBRA[o.estado].label} tone={ESTADOS_OBRA[o.estado].tone} />
              </View>
              <Text style={styles.title} numberOfLines={2}>{o.titulo}</Text>
              <View style={styles.row}>
                <Icon name="map-pin" size={14} color={colors.muted} />
                <Text style={styles.meta} numberOfLines={1}>{o.direccion}</Text>
              </View>
              <Text style={styles.meta}>{fecha(o.fecha_inicio)} → {fecha(o.fecha_fin_prevista)}</Text>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <ProgressBar value={o.porcentaje_avance} />
                </View>
                <Text style={styles.pct}>{o.porcentaje_avance}%</Text>
              </View>
              <View style={styles.head}>
                <Text style={styles.meta}>Presupuesto {eur(o.ingresos_totales, 0)}</Text>
                <Text style={[styles.profit, o.beneficio_neto < 0 && styles.loss]}>Beneficio {eur(o.beneficio_neto, 0)}</Text>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  chips: { marginTop: 4 },
  list: { paddingHorizontal: 16, gap: 10 },
  card: { gap: 7 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  flex: { flex: 1 },
  num: { fontFamily: fonts.black, fontSize: 16, color: c.brandDeep },
  title: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: c.textDark },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted, flexShrink: 1 },
  pct: { fontFamily: fonts.bodyBold, fontSize: 13, color: c.brandDeep },
  profit: { fontFamily: fonts.extraBold, fontSize: 14, color: c.info },
  loss: { color: c.urgent },
}));
