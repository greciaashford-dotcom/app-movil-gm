import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, RefreshControl, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { formatPhone } from "@/src/lib/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Card, EmptyState, ErrorView, LoadingView } from "@/src/ui/kit";

type Cliente = { id: string; nombre: string; telefono: string; correo: string; direcciones: string[]; solicitudes: string[]; presupuestos: string[]; obras: string[] };

export default function AdminClientes() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin-clientes", search.trim()],
    queryFn: () => api.get<Cliente[]>(`/admin/clientes${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ""}`),
  });

  return (
    <View style={styles.screen} testID="admin-clients-screen">
      <AppBar title="Clientes" subtitle="Fichas de clientes y su historial" />
      <View style={styles.searchBox}>
        <Icon name="search" size={18} color={colors.muted} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Buscar por nombre, teléfono o correo" placeholderTextColor={colors.muted} style={styles.searchInput} testID="admin-clients-search-input" />
      </View>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon="users" title="Sin clientes" />}
          renderItem={({ item: c }) => (
            <Card onPress={() => router.push(`/admin/cliente/${c.id}` as never)} testID={`admin-client-${c.id}`} style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.nombre.slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.name}>{c.nombre}</Text>
                <Text style={styles.meta}>
                  {formatPhone(c.telefono)} · {c.correo}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {c.direcciones[0] ?? ""}
                </Text>
                <Text style={styles.counts}>
                  {c.solicitudes.length} solicitudes · {c.presupuestos.length} presupuestos · {c.obras.length} obras
                </Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.brand} />
            </Card>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  searchBox: { margin: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.surface, borderRadius: 14, paddingHorizontal: 12, minHeight: 46, borderWidth: 1.5, borderColor: c.border },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 14.5, color: c.onSurface, minHeight: 44 },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  card: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.black, fontSize: 18, color: c.brandPrimary },
  flex: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  counts: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.brandSecondary, marginTop: 2 },
}));
