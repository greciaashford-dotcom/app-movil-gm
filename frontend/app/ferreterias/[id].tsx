import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage, fileUrl } from "@/src/lib/api";
import { fecha, formatPhone, mapsLink, telLink } from "@/src/lib/format";
import type { Ferreteria } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Card, ErrorView, LoadingView, PillButton } from "@/src/ui/kit";

export default function FerreteriaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["ferreteria-public", id], queryFn: () => api.get<Ferreteria>(`/ferreterias/${id}`) });
  const f = q.data;

  return (
    <View style={styles.screen} testID="store-detail-screen">
      <BrandHeader variant="compact" showBack />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError || !f ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          {f.imagen ? <Image source={{ uri: fileUrl(f.imagen) }} style={styles.img} contentFit="cover" /> : null}
          <Text style={styles.title} testID="store-detail-name">
            {f.nombre}
          </Text>
          <Text style={styles.desc}>{f.descripcion}</Text>
          <Card style={styles.gap}>
            <View style={styles.row}>
              <Icon name="map-pin" size={18} color={colors.brand} />
              <Text style={styles.line}>
                {f.direccion} · {f.barrio}
              </Text>
            </View>
            <View style={styles.row}>
              <Icon name="clock" size={18} color={colors.brand} />
              <Text style={styles.line}>{f.horario}</Text>
            </View>
            <View style={styles.row}>
              <Icon name="phone" size={18} color={colors.brand} />
              <Text style={styles.line}>{formatPhone(f.telefono)}</Text>
            </View>
            <View style={styles.btnRow}>
              <PillButton label="Llamar" icon="phone" variant="call" small style={styles.flex} onPress={() => Linking.openURL(telLink(f.telefono))} testID="store-detail-call-button" />
              <PillButton label="Cómo llegar" icon="navigation" variant="navy" small style={styles.flex} onPress={() => Linking.openURL(mapsLink(f.direccion))} testID="store-detail-map-button" />
            </View>
          </Card>
          <Text style={styles.section}>Productos destacados</Text>
          <View style={styles.tags}>
            {f.productos_destacados.map((p) => (
              <View key={p} style={styles.tag}>
                <Icon name="package" size={14} color={colors.brandSecondary} />
                <Text style={styles.tagText}>{p}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.section}>Promociones activas</Text>
          {f.anuncios.length === 0 ? <Text style={styles.desc}>Sin promociones en este momento.</Text> : null}
          {f.anuncios.map((a) => (
            <View key={a.id} style={styles.promo} testID={`store-promo-${a.id}`}>
              {a.imagen ? <Image source={{ uri: fileUrl(a.imagen) }} style={styles.promoImg} contentFit="cover" /> : null}
              <View style={styles.promoHead}>
                {a.descuento ? (
                  <View style={styles.discount}>
                    <Text style={styles.discountText}>{a.descuento}</Text>
                  </View>
                ) : null}
                <Text style={styles.promoTitle}>{a.titulo}</Text>
              </View>
              {a.descripcion ? <Text style={styles.promoDesc}>{a.descripcion}</Text> : null}
              {a.fecha_fin ? <Text style={styles.promoDate}>Válida hasta el {fecha(a.fecha_fin)}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  img: { width: "100%", height: 180, borderRadius: radius.xl },
  title: { fontFamily: fonts.black, fontSize: 26, color: c.brandDeep },
  desc: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.textDark },
  gap: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  line: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: c.textDark },
  btnRow: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  section: { fontFamily: fonts.extraBold, fontSize: 18, color: c.brandDeep, marginTop: 6 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tagText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.brandDeep },
  promo: { backgroundColor: c.noteCard, borderRadius: radius.xl, padding: 14, gap: 6, overflow: "hidden" },
  promoImg: { width: "100%", height: 120, borderRadius: 16 },
  promoHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  discount: { backgroundColor: c.urgent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  discountText: { fontFamily: fonts.black, fontSize: 13, color: c.onError },
  promoTitle: { flex: 1, fontFamily: fonts.extraBold, fontSize: 16, color: c.textDark },
  promoDesc: { fontFamily: fonts.body, fontSize: 14, color: c.textDark },
  promoDate: { fontFamily: fonts.bodyMedium, fontSize: 12, color: c.muted },
}));
