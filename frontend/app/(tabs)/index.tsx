import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
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

/** Width-driven sizes so the home keeps the same composition on every phone (390pt = reference). */
function useHomeSizes() {
  const { width } = useWindowDimensions();
  return useMemo(() => {
    const k = Math.min(1.15, Math.max(0.8, width / 390));
    const showCtaChevron = width >= 330;
    // Room left for the CTA label: hero padding 32, button padding 36, icons 20 each, gaps 8 each.
    const ctaRoom = width - 32 - 36 - (showCtaChevron ? 56 : 28);
    const urgentRow = width >= 340;
    // Each urgency button: card margins/border/padding 54, button gap 8, own padding 16, icon 17 + gap 6.
    const urgentRoom = (width - 62) / 2 - 39;
    return {
      showCtaChevron,
      urgentRow,
      singleColumn: width < 350,
      art: Math.round(34 * k),
      siren: Math.round(50 * k),
      title: { fontSize: Math.max(17, 20 * k), lineHeight: Math.max(21, 24 * k) },
      desc: { fontSize: Math.max(11, 12.5 * k), lineHeight: Math.max(15.5, 17 * k) },
      cta: { fontSize: Math.min(16 * Math.min(k, 1.06), Math.max(11, ctaRoom / 15.3)) },
      cardTitle: { fontSize: 14.5 * k },
      cardDesc: { fontSize: Math.max(10, 11 * k), lineHeight: Math.max(13, 14 * k) },
      urgentTitle: { fontSize: 21 * k },
      urgentDesc: { fontSize: 13 * k },
      urgentBtn: { fontSize: urgentRow ? Math.min(14, urgentRoom / 8.5) : 14 },
    };
  }, [width]);
}

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const sz = useHomeSizes();

  return (
    <View style={styles.screen} testID="home-screen">
      <BrandHeader variant="home" />
      <ScrollView contentContainerStyle={{ paddingBottom: bottomChrome + 24 }} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(420)} style={styles.hero} testID="home-hero">
          <View style={styles.heroImgWrap} pointerEvents="none">
            <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
            <LinearGradient colors={[colors.surface, colors.heroFade]} start={{ x: 0, y: 0.5 }} end={{ x: 0.45, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={[colors.surface, colors.heroFade, colors.heroFade, colors.surface]} locations={[0, 0.12, 0.9, 1]} style={StyleSheet.absoluteFill} />
          </View>
          <Svg style={styles.curve} width="100%" height={CURVE_DEPTH} viewBox="0 0 100 26" preserveAspectRatio="none" pointerEvents="none">
            <Path d="M0 0 H100 V3 Q50 49 0 3 Z" fill={colors.brand} />
          </Svg>
          <View style={styles.heroText}>
            <Text style={[styles.heroTitle, sz.title]} testID="home-hero-title">
              ¿Qué necesitas reparar o reformar?
            </Text>
            <View style={styles.heroLine} />
            <Text style={[styles.heroDesc, sz.desc]} testID="home-hero-desc">
              Encuentra soluciones para tu vivienda, negocio o comunidad de propietarios. Cuéntanos qué necesitas y prepararemos un presupuesto personalizado.
            </Text>
          </View>
          <PillButton
            label="Solicitar presupuesto gratis"
            icon="file-text"
            iconRight={sz.showCtaChevron ? "chevron-right" : undefined}
            onPress={() => router.push("/solicitar-presupuesto")}
            testID="home-request-quote-button"
            style={styles.heroCta}
            textStyle={sz.cta}
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
                style={({ pressed }) => [styles.card, sz.singleColumn && styles.cardFull, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`${s.nombre}. ${s.desc}`}
              >
                <ServiceArt slug={s.slug} fallback={s.icon} size={sz.art} />
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, sz.cardTitle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    {s.nombre}
                  </Text>
                  <Text style={[styles.cardDesc, sz.cardDesc]} numberOfLines={4}>
                    {s.desc}
                  </Text>
                </View>
                <Icon name="chevron-right" size={16} color={colors.brandDeep} />
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(420)} style={styles.urgent} testID="home-urgent-block">
          <View style={styles.urgentHead}>
            <SirenArt size={sz.siren} />
            <View style={styles.flex}>
              <Text style={[styles.urgentTitle, sz.urgentTitle]}>Urgencias 24 horas</Text>
              <Text style={[styles.urgentDesc, sz.urgentDesc]}>Cerrajería, fontanería y electricidad urgentes.</Text>
            </View>
          </View>
          <View style={[styles.urgentButtons, !sz.urgentRow && styles.urgentButtonsStacked]}>
            <PillButton label="Llamar ahora" icon="phone" variant="call" small style={[sz.urgentRow && styles.flex, styles.urgentBtn]} textStyle={sz.urgentBtn} onPress={() => Linking.openURL(telLink(COMPANY_PHONE))} testID="home-urgent-call-button" />
            <PillButton label="Enviar solicitud" icon="send" variant="dangerOutline" small style={[sz.urgentRow && styles.flex, styles.urgentBtn]} textStyle={sz.urgentBtn} onPress={() => router.push("/solicitud-urgente")} testID="home-urgent-request-button" />
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
    gap: 14,
    overflow: "hidden",
  },
  heroImgWrap: { position: "absolute", right: 0, bottom: 40, width: "68%", aspectRatio: HERO_RATIO },
  curve: { position: "absolute", top: 0, left: 0, right: 0 },
  heroText: { width: "66%", gap: 8 },
  heroTitle: { fontFamily: fonts.black, color: c.brandDeep },
  heroLine: { width: 52, height: 4, borderRadius: 2, backgroundColor: c.brandPrimary },
  heroDesc: { fontFamily: fonts.body, color: c.textDark, width: "96%" },
  heroCta: { paddingHorizontal: 18, gap: 8, shadowColor: c.brandDeep, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
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
  cardFull: { flexBasis: "100%", minHeight: 64 },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontFamily: fonts.extraBold, color: c.brandDeep },
  cardDesc: { fontFamily: fonts.body, color: c.textDark },
  urgent: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: c.urgentBg,
    borderWidth: 3,
    borderColor: c.urgentBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 12,
  },
  urgentHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4 },
  urgentTitle: { fontFamily: fonts.black, color: c.urgentTitle },
  urgentDesc: { fontFamily: fonts.body, color: c.textDark, marginTop: 2 },
  urgentButtons: { flexDirection: "row", gap: 8 },
  urgentButtonsStacked: { flexDirection: "column" },
  urgentBtn: { borderRadius: radius.sm + 4, paddingHorizontal: 8, gap: 6 },
}));
