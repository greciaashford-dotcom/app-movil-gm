import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { SERVICES } from "@/src/lib/constants";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandLogo } from "@/src/ui/BrandLogo";
import { Icon } from "@/src/ui/Icon";
import { PillButton } from "@/src/ui/kit";
import { ServiceArt } from "@/src/ui/ServiceArt";

/** Shown once after sign-up: welcome + first-quote discount, straight into the first request. */
export default function BienvenidaScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { account, markWelcomeSeen } = useAuth();
  const pct = account?.descuento_bienvenida ?? 0;
  const nombre = (account?.nombre ?? "").trim().split(" ")[0];

  // Seen as soon as it opens, so leaving with the back gesture does not show it again.
  useEffect(() => {
    void markWelcomeSeen();
  }, [markWelcomeSeen]);

  const go = (href?: string) => {
    if (href) router.replace(href as never);
    else if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <View style={styles.screen} testID="welcome-screen">
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(380)} style={styles.head}>
          <BrandLogo />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(380)} style={styles.card}>
          <Text style={styles.title} testID="welcome-title">
            ¡Bienvenido{nombre ? `, ${nombre}` : ""}!
          </Text>
          <View style={styles.line} />
          <Text style={styles.text}>Ya tienes tu cuenta de GM Conecta. Pide presupuestos gratis, sigue el avance de tus obras y recibe avisos por correo.</Text>
          {pct > 0 ? (
            <Animated.View entering={ZoomIn.delay(220).springify().damping(13)} style={styles.gift} testID="welcome-discount-card">
              <View style={styles.giftIcon}>
                <Icon name="gift" size={28} color={colors.brandPrimary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.giftPct} testID="welcome-discount-value">
                  {pct} % de descuento
                </Text>
                <Text style={styles.giftText}>en tu primer presupuesto. Se aplica automáticamente a tu primera solicitud.</Text>
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(160).duration(380)} style={styles.services}>
          <View style={styles.servicesTitleRow}>
            <View style={styles.yLine} />
            <Text style={styles.servicesTitle}>¿Qué necesitas?</Text>
            <View style={styles.yLine} />
          </View>
          <View style={styles.grid}>
            {SERVICES.map((s) => (
              <Pressable
                key={s.slug}
                testID={`welcome-service-${s.slug}`}
                onPress={() => go(`/servicios/${s.slug}`)}
                style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={s.nombre}
              >
                <ServiceArt slug={s.slug} fallback={s.icon} size={34} />
                <Text style={styles.serviceName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {s.nombre}
                </Text>
                <Icon name="chevron-right" size={16} color={colors.brandDeep} />
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(380)} style={styles.actions}>
          <PillButton label="Solicitar presupuesto gratis" icon="file-text" iconRight="chevron-right" onPress={() => go("/solicitar-presupuesto")} testID="welcome-request-button" />
          <PillButton label="Explorar la app" icon="house" variant="outline" onPress={() => go()} testID="welcome-explore-button" />
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.brand },
  content: { flexGrow: 1, paddingHorizontal: 12, gap: 16 },
  head: { alignItems: "center" },
  card: { backgroundColor: c.surface, borderRadius: radius.xxl, padding: 20, gap: 12 },
  title: { fontFamily: fonts.black, fontSize: 26, color: c.brandDeep },
  line: { width: 52, height: 4, borderRadius: 2, backgroundColor: c.brandPrimary },
  text: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.textDark },
  gift: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.brandPrimary, borderRadius: radius.lg, padding: 14 },
  giftIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  giftPct: { fontFamily: fonts.black, fontSize: 22, color: c.onBrandPrimary },
  giftText: { fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 19, color: c.onBrandPrimary },
  flex: { flex: 1 },
  services: { gap: 10 },
  servicesTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" },
  yLine: { flex: 1, maxWidth: 64, height: 3, borderRadius: 2, backgroundColor: c.brandPrimary },
  servicesTitle: { fontFamily: fonts.extraBold, fontSize: 20, color: c.onBrand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  serviceCard: {
    flexBasis: "46%",
    flexGrow: 1,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 4,
  },
  serviceName: { flex: 1, fontFamily: fonts.extraBold, fontSize: 15, color: c.brandDeep },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  actions: { gap: 10, paddingHorizontal: 4 },
}));
