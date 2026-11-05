import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_PRESUPUESTO } from "@/src/lib/constants";
import { eur, fecha } from "@/src/lib/format";
import type { Presupuesto } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ChipRow, EmptyState, ErrorView, Fab, LoadingView } from "@/src/ui/kit";

const FILTROS = [
  { key: "", label: "Todos" },
  { key: "pendiente", label: "Pendientes" },
  { key: "aceptado", label: "Aceptados" },
  { key: "rechazado", label: "Rechazados" },
];

export default function AdminPresupuestos() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ estado?: string }>();
  const [filtro, setFiltro] = useState(params.estado ?? "");
  const q = useQuery({
    queryKey: ["admin-presupuestos", filtro],
    queryFn: () => api.get<Presupuesto[]>(`/admin/presupuestos${filtro ? `?estado=${filtro}` : ""}`),
  });

  return (
    <View style={styles.screen} testID="admin-quotes-screen">
      <AppBar title="Presupuestos" subtitle="Materiales, mano de obra e IVA" />
      <ChipRow testID="admin-quotes-filters" style={styles.chips}>
        {FILTROS.map((f) => (
          <Chip key={f.key || "todos"} label={f.label} selected={filtro === f.key} onPress={() => setFiltro(f.key)} testID={`quotes-filter-${f.key || "todos"}`} />
        ))}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon="file-text" title="No hay presupuestos" testID="admin-quotes-empty" />}
          renderItem={({ item: p }) => (
            <Card onPress={() => router.push(`/admin/presupuesto/${p.id}` as never)} testID={`admin-quote-${p.numero_presupuesto}`} style={styles.card}>
              <View style={styles.head}>
                <Text style={styles.num}>{p.numero_presupuesto}</Text>
                <Badge label={ESTADOS_PRESUPUESTO[p.estado].label} tone={ESTADOS_PRESUPUESTO[p.estado].tone} />
              </View>
              <Text style={styles.title} numberOfLines={2}>{p.titulo}</Text>
              <Text style={styles.meta}>{p.cliente_nombre} · {fecha(p.fecha_creacion)}</Text>
              <View style={styles.head}>
                <Text style={styles.total}>{eur(p.total)}</Text>
                {p.obra_id ? (
                  <View style={styles.row}>
                    <Icon name="hard-hat" size={14} color={colors.renovation} />
                    <Text style={styles.obra}>Convertido en obra</Text>
                  </View>
                ) : null}
              </View>
            </Card>
          )}
        />
      )}
      <Fab label="Nuevo" icon="plus" onPress={() => router.push({ pathname: "/admin/presupuesto/[id]", params: { id: "nuevo" } })} testID="admin-quotes-new-button" bottom={insets.bottom + 16} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  chips: { marginTop: 4 },
  list: { paddingHorizontal: 16, gap: 10 },
  card: { gap: 6 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  num: { fontFamily: fonts.black, fontSize: 16, color: c.brandDeep },
  title: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: c.textDark },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  total: { fontFamily: fonts.black, fontSize: 18, color: c.brand },
  obra: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.renovation },
}));
