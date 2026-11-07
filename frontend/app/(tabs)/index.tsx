import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { COMPANY_PHONE, HERO_IMAGE, SERVICES } from "@/src/lib/constants";
import { telLink } from "@/src/lib/format";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { PillButton } from "@/src/ui/kit";
import { ServiceArt, SirenArt } from "@/src/ui/ServiceArt";

/** Depth of the navy arc that flows from the header into the white hero card. */
const CURVE_DEPTH = 26;
/** Width / height of the hero photo, so it is never zoomed or cropped. */
const HERO_RATIO = 766 / 732;

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  return (
    <View style={styles.screen} testID="home-screen">
      <BrandHeader variant="home" />
      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(420)} style={styles.hero} testID="home-hero">
          <View style={styles.heroImgWrap} pointerEvents="none">
            <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
            <LinearGradient colors={[colors.surface, colors.heroFade]} start={{ x: 0, y: 0.5 }} end={{ x: 0.4, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={[colors.surface, colors.heroFade, colors.heroFade, colors.surface]} locations={[0, 0.12, 0.9, 1]} style={StyleSheet.absoluteFill} />
          </View>
          <Svg style={styles.curve} width="100%" height={CURVE_DEPTH} viewBox="0 0 100 26" preserveAspectRatio="none" pointerEvents="none">
            <Path d="M0 0 H100 V3 Q50 49 0 3 Z" fill={colors.brand} />
          </Svg>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle} testID="home-hero-title">
              ¿Qué necesitas reparar o reformar?
            </Text>
            <View style={styles.heroLine} />
            <Text style={styles.heroDesc}>
              Encuentra soluciones para tu vivienda, negocio o comunidad de propietarios. Cuéntanos qué necesitas y prepararemos un presupuesto personalizado.
            </Text>
          </View>
          <PillButton
            label="Solicitar presupuesto gratis"
            icon="file-text"
            iconRight="chevron-right"
            onPress={() => router.push("/solicitar-presupuesto")}
            testID="home-request-quote-button"
            style={styles.heroCta}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(420)} style={styles.services}>
          <View style={styles.servicesTitleRow}>
            <View style={styles.yLine} />
            <Text style={styles.servicesTitle}>Nuestros servicios</Text>
            <View style={styles.yLine} />
          </View>
          <View style={styles.grid}>
            {SERVICES.map((s) => (
              <Pressable
                key={s.slug}
                testID={`home-service-${s.slug}`}
                onPress={() => router.push(`/servicios/${s.slug}` as never)}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${s.nombre}. ${s.desc}`}
              >
                <ServiceArt slug={s.slug} fallback={s.icon} size={34} />
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {s.nombre}
                  </Text>
                  <Text style={styles.cardDesc} numberOfLines={4}>
                    {s.desc}
                  </Text>
                </View>
                <Icon name="chevron-right" size={18} color={colors.brandDeep} />
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(420)} style={styles.urgent} testID="home-urgent-block">
          <View style={styles.urgentHead}>
            <SirenArt size={50} />
            <View style={styles.flex}>
              <Text style={styles.urgentTitle}>Urgencias 24 horas</Text>
              <Text style={styles.urgentDesc}>Cerrajería, fontanería y electricidad urgentes.</Text>
            </View>
          </View>
          <View style={styles.urgentButtons}>
            <PillButton label="Llamar ahora" icon="phone" variant="call" small style={[styles.flex, styles.urgentBtn]} onPress={() => Linking.openURL(telLink(COMPANY_PHONE))} testID="home-urgent-call-button" />
            <PillButton label="Enviar solicitud" icon="send" variant="dangerOutline" small style={[styles.flex, styles.urgentBtn]} onPress={() => router.push("/solicitud-urgente")} testID="home-urgent-request-button" />
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.brand },
  flex: { flex: 1 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.94 },
  hero: {
    backgroundColor: c.surface,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    paddingTop: CURVE_DEPTH + 10,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 16,
    overflow: "hidden",
  },
  heroImgWrap: { position: "absolute", right: 0, bottom: 40, width: "72%", aspectRatio: HERO_RATIO },
  curve: { position: "absolute", top: 0, left: 0, right: 0 },
  heroText: { width: "60%", gap: 10 },
  heroTitle: { fontFamily: fonts.black, fontSize: 25, lineHeight: 29, color: c.brandDeep },
  heroLine: { width: 56, height: 5, borderRadius: 3, backgroundColor: c.brandPrimary },
  heroDesc: { fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: c.textDark, width: "92%" },
  heroCta: { shadowColor: c.brandDeep, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  services: { paddingHorizontal: 12, paddingTop: 18, gap: 12 },
  servicesTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" },
  yLine: { flex: 1, maxWidth: 64, height: 3, borderRadius: 2, backgroundColor: c.brandPrimary },
  servicesTitle: { fontFamily: fonts.extraBold, fontSize: 21, color: c.onBrand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    flexBasis: "46%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingLeft: 8,
    paddingRight: 4,
    minHeight: 78,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: fonts.extraBold, fontSize: 14.5, color: c.brandDeep },
  cardDesc: { fontFamily: fonts.body, fontSize: 11, lineHeight: 14, color: c.textDark },
  urgent: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: c.urgentBg,
    borderWidth: 3,
    borderColor: c.urgentBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  urgentHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4 },
  urgentTitle: { fontFamily: fonts.black, fontSize: 21, color: c.urgentTitle },
  urgentDesc: { fontFamily: fonts.body, fontSize: 13, color: c.textDark, marginTop: 2 },
  urgentButtons: { flexDirection: "row", gap: 10 },
  urgentBtn: { borderRadius: radius.sm + 4, paddingHorizontal: 10 },
}));
