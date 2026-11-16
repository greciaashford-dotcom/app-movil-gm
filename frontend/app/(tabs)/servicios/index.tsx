import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SERVICES } from "@/src/lib/constants";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Card, PillButton } from "@/src/ui/kit";
import { ServiceArt } from "@/src/ui/ServiceArt";

export default function ServiciosScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <View style={styles.screen} testID="services-screen">
      <BrandHeader variant="compact" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}>
        <Text style={styles.title}>Servicios</Text>
        <Text style={styles.sub}>Profesionales de GM Reforma Express para tu vivienda, negocio o comunidad en Madrid.</Text>
        {SERVICES.map((s, i) => (
          <Animated.View key={s.slug} entering={FadeInDown.delay(i * 70).duration(350)}>
            <Pressable
              testID={`services-item-${s.slug}`}
              onPress={() => router.push(`/servicios/${s.slug}` as never)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <View style={styles.icon}>
                <ServiceArt slug={s.slug} fallback={s.icon} size={46} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{s.nombre}</Text>
                <Text style={styles.itemDesc}>{s.desc}</Text>
              </View>
              <Icon name="chevron-right" size={22} color={colors.brand} />
            </Pressable>
          </Animated.View>
        ))}
        <Card tone="yellow" style={styles.gap}>
          <View style={styles.row}>
            <Icon name="store" size={22} color={colors.brandDeep} />
            <Text style={styles.cardTitle}>Ferreterías recomendadas</Text>
          </View>
          <Text style={styles.cardText}>Proveedores de confianza con promociones para clientes de GM Conecta.</Text>
          <PillButton label="Ver ferreterías" icon="map" variant="navy" small onPress={() => router.push("/ferreterias")} testID="services-stores-button" />
        </Card>
        <PillButton label="Solicitar presupuesto gratis" icon="file-text" iconRight="chevron-right" onPress={() => router.push("/solicitar-presupuesto")} testID="services-request-button" />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  title: { fontFamily: fonts.black, fontSize: 26, color: c.brandDeep },
  sub: { fontFamily: fonts.body, fontSize: 14, color: c.muted, lineHeight: 20, marginBottom: 4 },
  item: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.surface, borderRadius: radius.lg, padding: 16 },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.94 },
  icon: { width: 54, height: 54, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1 },
  itemTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep },
  itemDesc: { fontFamily: fonts.body, fontSize: 13, color: c.muted, marginTop: 2 },
  gap: { gap: 10, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  cardText: { fontFamily: fonts.body, fontSize: 14, color: c.textDark, lineHeight: 20 },
}));
