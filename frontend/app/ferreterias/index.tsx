import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage, fileUrl } from "@/src/lib/api";
import type { Ferreteria } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { EmptyState, ErrorView, LoadingView } from "@/src/ui/kit";

export default function FerreteriasScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["ferreterias-public"], queryFn: () => api.get<Ferreteria[]>("/ferreterias") });

  return (
    <View style={styles.screen} testID="stores-directory-screen">
      <BrandHeader variant="compact" showBack />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(f) => f.id}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Ferreterías recomendadas</Text>
              <Text style={styles.sub}>Proveedores de confianza de GM Reforma Express, con promociones para clientes de GM Conecta.</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="store" title="Todavía no hay ferreterías" />}
          renderItem={({ item }) => (
            <Pressable testID={`store-card-${item.id}`} onPress={() => router.push(`/ferreterias/${item.id}` as never)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              {item.imagen ? <Image source={{ uri: fileUrl(item.imagen) }} style={styles.img} contentFit="cover" transition={200} /> : null}
              <View style={styles.body}>
                <View style={styles.row}>
                  <Text style={styles.name}>{item.nombre}</Text>
                  <View style={styles.rating}>
                    <Icon name="star" size={13} color={colors.yellowSecondary} />
                    <Text style={styles.ratingText}>{item.valoracion.toFixed(1)}</Text>
                  </View>
                </View>
                <Text style={styles.meta}>
                  {item.barrio} · {item.direccion}
                </Text>
                <View style={styles.tags}>
                  {item.productos_destacados.slice(0, 3).map((p) => (
                    <View key={p} style={styles.tag}>
                      <Text style={styles.tagText}>{p}</Text>
                    </View>
                  ))}
                </View>
                {item.anuncios.length ? (
                  <View style={styles.promo}>
                    <Icon name="megaphone" size={15} color={colors.brandDeep} />
                    <Text style={styles.promoText} numberOfLines={1}>
                      {item.anuncios[0].titulo}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 14 },
  header: { gap: 4, marginBottom: 4 },
  title: { fontFamily: fonts.black, fontSize: 24, color: c.brandDeep },
  sub: { fontFamily: fonts.body, fontSize: 14, color: c.muted, lineHeight: 20 },
  card: { backgroundColor: c.surface, borderRadius: radius.xl, overflow: "hidden" },
  pressed: { opacity: 0.94, transform: [{ scale: 0.985 }] },
  img: { width: "100%", height: 130 },
  body: { padding: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep, flex: 1 },
  rating: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: c.noteCard, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  ratingText: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.textDark },
  meta: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { backgroundColor: c.infoCard, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: c.brandSecondary },
  promo: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.brandPrimary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  promoText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onBrandPrimary, flex: 1 },
}));
