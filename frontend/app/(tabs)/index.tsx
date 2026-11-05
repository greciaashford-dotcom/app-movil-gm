import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { COMPANY_PHONE, HERO_IMAGE, SERVICES } from "@/src/lib/constants";
import { telLink } from "@/src/lib/format";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { PillButton } from "@/src/ui/kit";

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
          <View style={styles.heroTop}>
            <Image source={{ uri: HERO_IMAGE }} style={styles.heroImg} contentFit="cover" transition={250} />
            <LinearGradient
              colors={[colors.surface, colors.surface, colors.heroFade]}
              locations={[0, 0.42, 0.8]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient colors={[colors.heroFade, colors.surface]} start={{ x: 0.5, y: 0.6 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.heroTitleWrap}>
              <Text style={styles.heroTitle} testID="home-hero-title">
                ¿Qué necesitas reparar o reformar?
              </Text>
              <View style={styles.heroLine} />
            </View>
          </View>
          <Text style={styles.heroDesc}>
            Encuentra soluciones para tu vivienda, negocio o comunidad de propietarios. Cuéntanos qué necesitas y prepararemos un presupuesto personalizado.
          </Text>
          <PillButton
            label="Solicitar presupuesto gratis"
            icon="file-text"
            iconRight="chevron-right"
            onPress={() => router.push("/solicitar-presupuesto")}
            testID="home-request-quote-button"
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
              >
                <View style={styles.cardTop}>
                  <View style={[styles.iconCircle, { backgroundColor: colors[s.iconBg] }]}>
                    <Icon name={s.icon} size={22} color={colors[s.color]} />
                  </View>
                  <Icon name="chevron-right" size={20} color={colors.brand} />
                </View>
                <Text style={styles.cardTitle}>{s.nombre}</Text>
                <Text style={styles.cardDesc} numberOfLines={3}>
                  {s.desc}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(220).duration(420)} style={styles.urgent} testID="home-urgent-block">
          <View style={styles.urgentHead}>
            <View style={styles.sirenCircle}>
              <Icon name="siren" size={24} color={colors.urgent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.urgentTitle}>Urgencias 24 horas</Text>
              <Text style={styles.urgentDesc}>Cerrajería, fontanería y electricidad urgentes.</Text>
            </View>
          </View>
          <View style={styles.urgentButtons}>
            <PillButton label="Llamar ahora" icon="phone" variant="call" small style={styles.flex} onPress={() => Linking.openURL(telLink(COMPANY_PHONE))} testID="home-urgent-call-button" />
            <PillButton label="Enviar solicitud" icon="send" variant="dangerOutline" small style={styles.flex} onPress={() => router.push("/solicitud-urgente")} testID="home-urgent-request-button" />
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
    paddingBottom: 22,
    paddingHorizontal: 18,
    gap: 16,
    overflow: "hidden",
  },
  heroTop: { height: 200, marginHorizontal: -18, justifyContent: "center" },
  heroImg: { position: "absolute", right: 0, top: 0, bottom: 0, width: "64%" },
  heroTitleWrap: { paddingLeft: 18, width: "62%", gap: 10 },
  heroTitle: { fontFamily: fonts.black, fontSize: 27, lineHeight: 32, color: c.brandDeep },
  heroLine: { width: 64, height: 5, borderRadius: 3, backgroundColor: c.brandPrimary },
  heroDesc: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.textDark, marginTop: -6 },
  services: { paddingHorizontal: 16, paddingTop: 26, gap: 16 },
  servicesTitleRow: { flexDirection: "row", alignItems: "center", gap: 12, justifyContent: "center" },
  yLine: { flex: 1, maxWidth: 56, height: 3, borderRadius: 2, backgroundColor: c.brandPrimary },
  servicesTitle: { fontFamily: fonts.extraBold, fontSize: 21, color: c.onBrand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  card: { flexBasis: "46%", flexGrow: 1, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, gap: 6, minHeight: 150 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  iconCircle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  cardDesc: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 17, color: c.muted },
  urgent: {
    margin: 16,
    marginTop: 22,
    backgroundColor: c.urgentBg,
    borderWidth: 4,
    borderColor: c.urgentBorder,
    borderRadius: radius.xxl,
    padding: 16,
    gap: 14,
  },
  urgentHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  sirenCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.errorSoft, alignItems: "center", justifyContent: "center" },
  urgentTitle: { fontFamily: fonts.black, fontSize: 19, color: c.urgentTitle },
  urgentDesc: { fontFamily: fonts.body, fontSize: 13.5, color: c.textDark, marginTop: 2 },
  urgentButtons: { flexDirection: "row", gap: 10 },
}));
