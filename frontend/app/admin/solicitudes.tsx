import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_SOLICITUD } from "@/src/lib/constants";
import { fechaHora } from "@/src/lib/format";
import type { Solicitud } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ChipRow, EmptyState, ErrorView, LoadingView } from "@/src/ui/kit";

const FILTROS = [
  { key: "todas", label: "Todas" },
  { key: "urgencias", label: "Urgencias 24h" },
  { key: "pendiente", label: "Pendientes" },
  { key: "en_revision", label: "En revisión" },
  { key: "presupuestado", label: "Presupuestadas" },
  { key: "en_obra", label: "En obra" },
  { key: "finalizado", label: "Finalizadas" },
];

export default function AdminSolicitudes() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ estado?: string }>();
  const [filtro, setFiltro] = useState(params.estado ?? "todas");
  const [search, setSearch] = useState("");

  const qs = new URLSearchParams();
  if (filtro === "urgencias") qs.set("urgente", "true");
  else if (filtro !== "todas") qs.set("estado", filtro);
  if (search.trim()) qs.set("q", search.trim());
  const q = useQuery({ queryKey: ["admin-solicitudes", filtro, search.trim()], queryFn: () => api.get<Solicitud[]>(`/admin/solicitudes?${qs.toString()}`) });

  return (
    <View style={styles.screen} testID="admin-requests-screen">
      <AppBar title="Solicitudes" subtitle="Solicitudes y urgencias recibidas" />
      <View style={styles.sticky}>
        <View style={styles.searchBox}>
          <Icon name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por cliente, nº o dirección"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            testID="admin-requests-search-input"
          />
        </View>
        <ChipRow testID="admin-requests-filters">
          {FILTROS.map((f) => (
            <Chip key={f.key} label={f.label} selected={filtro === f.key} onPress={() => setFiltro(f.key)} testID={`filter-${f.key}`} />
          ))}
        </ChipRow>
      </View>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(s) => s.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon="inbox" title="No hay solicitudes con este filtro" testID="admin-requests-empty" />}
          renderItem={({ item: s }) => (
            <Card onPress={() => router.push(`/admin/solicitud/${s.id}` as never)} testID={`admin-request-${s.numero_solicitud}`} style={[styles.card, s.es_urgencia && styles.cardUrgent]}>
              <View style={styles.head}>
                <Text style={styles.num}>{s.numero_solicitud}</Text>
                <Badge label={ESTADOS_SOLICITUD[s.estado].label} tone={ESTADOS_SOLICITUD[s.estado].tone} />
              </View>
              <View style={styles.row}>
                <Icon name={s.es_urgencia ? "siren" : "wrench"} size={16} color={s.es_urgencia ? colors.urgent : colors.brand} />
                <Text style={styles.service}>{s.servicio}</Text>
              </View>
              <Text style={styles.client}>{s.nombre_cliente}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {fechaHora(s.fecha_creacion)} · {s.direccion}
              </Text>
              {s.fotografias.length ? (
                <View style={styles.row}>
                  <Icon name="image" size={14} color={colors.muted} />
                  <Text style={styles.meta}>{s.fotografias.length} fotos</Text>
                </View>
              ) : null}
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  sticky: { backgroundColor: c.canvas, paddingTop: 12 },
  searchBox: { marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 12, minHeight: 46, borderWidth: 1.5, borderColor: c.border },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14.5, color: c.onSurface, minHeight: 44 },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  card: { gap: 6 },
  cardUrgent: { borderWidth: 2, borderColor: c.urgentBorder, backgroundColor: c.urgentBg },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  num: { fontFamily: fonts.black, fontSize: 16, color: c.brandDeep },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  service: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.textDark },
  client: { fontFamily: fonts.bodyMedium, fontSize: 14, color: c.brandDeep },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
}));
