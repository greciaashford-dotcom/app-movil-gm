import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { useAuth } from "@/src/auth";
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

/** Image bottom offset inside the hero (the CTA covers the rest). */
const HERO_IMG_BOTTOM = 40;
/** Accounts that already got the welcome screen in this app session. */
const welcomeShownFor = new Set<string>();

/** Screen-driven sizes so hero, services and urgencies all fit in the first view on every phone (390pt = reference). */
function useHomeSizes() {
  const { width, height } = useWindowDimensions();
  return useMemo(() => {
    const k = Math.min(1.15, Math.max(0.8, width / 390));
    const compact = height < 720;
    const showCtaChevron = width >= 330;
    const showCardChevron = width >= 350;
    const art = Math.round(34 * k);
    // Room for a service name: two cards per row (screen padding 24 + gap 8), card padding 12, art + gap 6, chevron + gap 22.
    const cardRoom = (width - 32) / 2 - 12 - art - 6 - (showCardChevron ? 22 : 0);
    // Room left for the CTA label: hero padding 32, button padding 36, icons 20 each, gaps 8 each.
    const ctaRoom = width - 32 - 36 - (showCtaChevron ? 56 : 28);
    const urgentRow = width >= 340;
    // Each urgency button: card margins/border/padding 54, button gap 8, own padding 16, icon 17 + gap 6.
    const urgentRoom = (width - 62) / 2 - 39;
    return {
      showCtaChevron,
      urgentRow,
      showCardChevron,
      art,
      siren: Math.round((compact ? 40 : 46) * k),
      hero: { paddingTop: CURVE_DEPTH + (compact ? 4 : 10), maxHeight: Math.max(200, Math.min(300, height * 0.34)) },
      title: { fontSize: Math.max(17, 20 * k), lineHeight: Math.max(21, 24 * k) },
      cta: { fontSize: Math.min(16 * Math.min(k, 1.06), Math.max(11, ctaRoom / 15.3)) },
      services: { paddingTop: compact ? 10 : 16, gap: compact ? 8 : 10 },
      card: { minHeight: compact ? 46 : 54 },
      cardTitle: { fontSize: Math.min(15.5 * k, cardRoom / 6.6) },
      urgent: { paddingVertical: compact ? 8 : 12, gap: compact ? 8 : 10, marginTop: compact ? 8 : 12 },
      urgentTitle: { fontSize: 20 * k },
      urgentDesc: { fontSize: 12.5 * k },
      urgentBtn: { fontSize: urgentRow ? Math.min(14, urgentRoom / 8.5) : 14 },
    };
  }, [width, height]);
}

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const sz = useHomeSizes();
  const { width } = useWindowDimensions();
  const [heroH, setHeroH] = useState(0);
  // Photo fills the hero height without being zoomed or cropped, capped so it never covers the whole width.
  const imgW = Math.max(0, Math.min((heroH - HERO_IMG_BOTTOM) * HERO_RATIO, width * 0.68));
  const onHeroLayout = (e: LayoutChangeEvent) => setHeroH(Math.round(e.nativeEvent.layout.height));
  const { account } = useAuth();
  const welcomeFor = account?.bienvenida_pendiente ? account.account_id : null;

  // New accounts land on the welcome screen once.
  useEffect(() => {
    if (!welcomeFor || welcomeShownFor.has(welcomeFor)) return;
    welcomeShownFor.add(welcomeFor);
    const t = setTimeout(() => router.push("/bienvenida"), 250);
    return () => clearTimeout(t);
  }, [welcomeFor, router]);

  return (
    <View style={styles.screen} testID="home-screen">
      <BrandHeader variant="home" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 12 }]} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(420)} style={[styles.hero, sz.hero]} onLayout={onHeroLayout} testID="home-hero">
          <View style={[styles.heroImgWrap, { width: imgW }]} pointerEvents="none">
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

        <Animated.View entering={FadeInDown.delay(120).duration(420)} style={[styles.services, sz.services]}>
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
                style={({ pressed }) => [styles.card, sz.card, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={s.nombre}
              >
                <ServiceArt slug={s.slug} fallback={s.icon} size={sz.art} />
                <Text style={[styles.cardTitle, sz.cardTitle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {s.nombre}
                </Text>
                {sz.showCardChevron ? <Icon name="chevron-right" size={16} color={colors.brandDeep} /> : null}
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(420)} style={[styles.urgent, sz.urgent]} testID="home-urgent-block">
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
  content: { flexGrow: 1 },
  hero: {
    backgroundColor: c.surface,
    borderBottomLeftRadius: radius.xxl,
    borderBottomRightRadius: radius.xxl,
    flexGrow: 1,
    justifyContent: "space-between",
    paddingBottom: 14,
    paddingHorizontal: 16,
    gap: 12,
    overflow: "hidden",
  },
  heroImgWrap: { position: "absolute", right: 0, bottom: HERO_IMG_BOTTOM, aspectRatio: HERO_RATIO },
  curve: { position: "absolute", top: 0, left: 0, right: 0 },
  heroText: { width: "66%", gap: 8 },
  heroTitle: { fontFamily: fonts.black, color: c.brandDeep },
  heroLine: { width: 52, height: 4, borderRadius: 2, backgroundColor: c.brandPrimary },
  heroCta: { minHeight: 50, paddingHorizontal: 18, gap: 8, shadowColor: c.brandDeep, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  services: { paddingHorizontal: 12 },
  servicesTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" },
  yLine: { flex: 1, maxWidth: 64, height: 3, borderRadius: 2, backgroundColor: c.brandPrimary },
  servicesTitle: { fontFamily: fonts.extraBold, fontSize: 20, color: c.onBrand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    flexBasis: "46%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.surface,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 4,
  },
  cardTitle: { flex: 1, fontFamily: fonts.extraBold, color: c.brandDeep },
  urgent: {
    marginHorizontal: 12,
    backgroundColor: c.urgentBg,
    borderWidth: 3,
    borderColor: c.urgentBorder,
    borderRadius: radius.lg,
    paddingHorizontal: 12,
  },
  urgentHead: { flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4 },
  urgentTitle: { fontFamily: fonts.black, color: c.urgentTitle },
  urgentDesc: { fontFamily: fonts.body, color: c.textDark, marginTop: 2 },
  urgentButtons: { flexDirection: "row", gap: 8 },
  urgentButtonsStacked: { flexDirection: "column" },
  urgentBtn: { borderRadius: radius.sm + 4, paddingHorizontal: 8, gap: 6 },
}));
