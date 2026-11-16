import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import Svg, { Line } from "react-native-svg";

import { HERO_IMAGE } from "@/src/lib/constants";
import { fechaHora } from "@/src/lib/format";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { StaticTabBar } from "@/src/ui/ClientTabs";
import { Icon } from "@/src/ui/Icon";
import { InfoRow, PillButton } from "@/src/ui/kit";

const PASOS = ["Revisamos tu solicitud.", "Te contactaremos para ampliar detalles (si es necesario).", "Te enviaremos un presupuesto sin compromiso."];

export default function SolicitudConfirmada() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const p = useLocalSearchParams<{ numero?: string; fecha?: string; servicio?: string; direccion?: string; descuento?: string }>();
  const descuento = Number(p.descuento ?? 0);

  return (
    <View style={styles.screen} testID="request-confirmed-screen">
      <BrandHeader variant="compact" showBack onBack={() => router.dismissTo("/")} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.success}>
          <View style={styles.decor}>
            <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" />
            <LinearGradient colors={[colors.surface, colors.heroFade]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={[colors.heroFade, colors.surface]} start={{ x: 0.5, y: 0.3 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
          </View>
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.checkWrap}>
            <Svg width={132} height={132} viewBox="0 0 132 132" style={StyleSheet.absoluteFill}>
              {Array.from({ length: 12 }).map((_, i) => {
                const a = (i * Math.PI * 2) / 12;
                return (
                  <Line
                    key={i}
                    x1={66 + Math.cos(a) * 50}
                    y1={66 + Math.sin(a) * 50}
                    x2={66 + Math.cos(a) * (i % 2 ? 58 : 63)}
                    y2={66 + Math.sin(a) * (i % 2 ? 58 : 63)}
                    stroke={colors.success}
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                );
              })}
            </Svg>
            <View style={styles.checkCircle} testID="request-confirmed-check">
              <Icon name="check" size={46} color={colors.onSuccess} />
            </View>
          </Animated.View>
          <Text style={styles.title} testID="request-confirmed-title">
            ¡Hemos recibido tu solicitud!
          </Text>
          <Text style={styles.message}>
            Gracias por confiar en <Text style={styles.bold}>GM Conecta</Text>. Nuestro equipo revisará la información y se pondrá en contacto contigo en breve para enviarte un presupuesto personalizado.
          </Text>
        </View>

        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.summary} testID="request-summary-card">
          <InfoRow icon="clipboard-list" label="Nº de solicitud:" value={p.numero ?? "—"} testID="request-summary-number" />
          <InfoRow icon="calendar-days" label="Fecha:" value={fechaHora(p.fecha)} testID="request-summary-date" />
          <InfoRow icon="wrench" label="Servicio:" value={p.servicio ?? "—"} testID="request-summary-service" />
          <InfoRow icon="map-pin" label="Dirección:" value={p.direccion ?? "—"} last testID="request-summary-address" />
        </Animated.View>

        {descuento > 0 ? (
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.gift} testID="request-confirmed-discount">
            <Icon name="gift" size={24} color={colors.brandPrimary} />
            <Text style={styles.giftText}>
              Aplicaremos tu <Text style={styles.giftStrong}>{descuento} % de descuento de bienvenida</Text> en este presupuesto.
            </Text>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.delay(250).duration(400)} style={styles.next}>
          <View style={styles.nextHead}>
            <Icon name="info" size={22} color={colors.brandPrimary} />
            <Text style={styles.nextTitle}>¿Qué ocurre ahora?</Text>
          </View>
          {PASOS.map((t) => (
            <View key={t} style={styles.nextRow}>
              <Icon name="check" size={20} color={colors.brandPrimary} />
              <Text style={styles.nextText}>{t}</Text>
            </View>
          ))}
        </Animated.View>

        <PillButton label="Volver al inicio" icon="house" onPress={() => router.dismissTo("/")} testID="request-confirmed-home-button" />
        <PillButton label="Crear otra solicitud" icon="circle-plus" variant="outline" onPress={() => router.replace("/solicitar-presupuesto")} testID="request-confirmed-new-button" />
      </ScrollView>
      <StaticTabBar active="mis-solicitudes" />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.surface },
  content: { padding: 16, gap: 16, paddingBottom: 24 },
  success: { alignItems: "center", gap: 14, paddingTop: 8 },
  decor: { position: "absolute", top: -16, right: -16, width: "62%", height: 190, overflow: "hidden" },
  checkWrap: { width: 132, height: 132, alignItems: "center", justifyContent: "center", marginTop: 8 },
  checkCircle: { width: 88, height: 88, borderRadius: 44, backgroundColor: c.success, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.black, fontSize: 28, lineHeight: 34, color: c.textDark, textAlign: "center", paddingHorizontal: 16 },
  message: { fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23, color: c.textDark, alignSelf: "stretch" },
  bold: { fontFamily: fonts.bodyBold },
  summary: { backgroundColor: c.infoCard, borderRadius: radius.xl, paddingHorizontal: 16, paddingVertical: 4 },
  gift: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.brand, borderRadius: radius.xl, padding: 16 },
  giftText: { flex: 1, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.onBrand },
  giftStrong: { fontFamily: fonts.extraBold, color: c.brandPrimary },
  next: { backgroundColor: c.noteCard, borderRadius: radius.xl, padding: 16, gap: 10 },
  nextHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  nextTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: c.textDark },
  nextRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  nextText: { flex: 1, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 20, color: c.textDark },
}));
