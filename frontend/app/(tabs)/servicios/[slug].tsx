import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SERVICES } from "@/src/lib/constants";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Card, EmptyState, PillButton } from "@/src/ui/kit";

const PASOS = ["Nos cuentas qué necesitas y adjuntas fotos.", "Revisamos y te llamamos si hace falta.", "Recibes un presupuesto sin compromiso."];

export default function ServicioDetalle() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const s = SERVICES.find((x) => x.slug === slug);

  if (!s) {
    return (
      <View style={styles.screen}>
        <BrandHeader variant="compact" showBack />
        <EmptyState icon="wrench" title="Servicio no encontrado" action="Ver servicios" onAction={() => router.replace("/servicios")} />
      </View>
    );
  }

  return (
    <View style={styles.screen} testID={`service-detail-${s.slug}`}>
      <BrandHeader variant="compact" showBack />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}>
        <View style={styles.hero}>
          <View style={[styles.icon, { backgroundColor: colors[s.iconBg] }]}>
            <Icon name={s.icon} size={34} color={colors[s.color]} />
          </View>
          <Text style={styles.title} testID="service-detail-title">
            {s.nombre}
          </Text>
          <View style={styles.line} />
          <Text style={styles.intro}>{s.intro}</Text>
        </View>
        <Card style={styles.gap}>
          <Text style={styles.cardTitle}>Trabajos habituales</Text>
          {s.trabajos.map((t) => (
            <View key={t} style={styles.row}>
              <Icon name="check" size={18} color={colors.success} />
              <Text style={styles.rowText}>{t}</Text>
            </View>
          ))}
        </Card>
        <Card tone="yellow" style={styles.gap}>
          <View style={styles.row}>
            <Icon name="info" size={20} color={colors.brandPrimary} />
            <Text style={styles.cardTitle}>¿Cómo funciona?</Text>
          </View>
          {PASOS.map((p, i) => (
            <View key={p} style={styles.row}>
              <View style={styles.step}>
                <Text style={styles.stepText}>{i + 1}</Text>
              </View>
              <Text style={styles.rowText}>{p}</Text>
            </View>
          ))}
        </Card>
        <PillButton
          label={`Pedir presupuesto de ${s.nombre.toLowerCase()}`}
          icon="file-text"
          iconRight="chevron-right"
          onPress={() => router.push({ pathname: "/solicitar-presupuesto", params: { servicio: s.servicio } })}
          testID="service-detail-request-button"
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 14 },
  hero: { backgroundColor: c.surface, borderRadius: radius.xxl, padding: 20, gap: 10 },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.black, fontSize: 28, color: c.brandDeep },
  line: { width: 56, height: 5, borderRadius: 3, backgroundColor: c.brandPrimary },
  intro: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.textDark },
  gap: { gap: 10 },
  cardTitle: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.textDark, lineHeight: 20 },
  step: { width: 26, height: 26, borderRadius: 13, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  stepText: { fontFamily: fonts.extraBold, fontSize: 13, color: c.onBrandPrimary },
}));
