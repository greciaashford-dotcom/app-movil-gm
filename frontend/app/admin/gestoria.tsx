import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL, api, errorMessage, fileUrl } from "@/src/lib/api";
import { eur, fecha } from "@/src/lib/format";
import type { Movimiento } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Card, Chip, ChipRow, ErrorView, LoadingView, MoneyRow, PillButton, SectionTitle, Segmented } from "@/src/ui/kit";
import { useToast } from "@/src/ui/toast";

type Gestoria = {
  periodo: { anio: number; trimestre: number; desde: string; hasta: string };
  resumen: { base_emitidas: number; iva_repercutido: number; total_emitidas: number; base_recibidas: number; iva_soportado: number; total_recibidas: number; resultado_iva: number; num_emitidas: number; num_recibidas: number };
  iva_por_tipo: { iva: number; base_emitidas: number; cuota_repercutida: number; base_recibidas: number; cuota_soportada: number }[];
  emitidas: Movimiento[];
  recibidas: Movimiento[];
};

export default function AdminGestoria() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const year = new Date().getFullYear();
  const [anio, setAnio] = useState(year);
  const [tri, setTri] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [tab, setTab] = useState<"emitidas" | "recibidas">("emitidas");
  const q = useQuery({ queryKey: ["gestoria", anio, tri], queryFn: () => api.get<Gestoria>(`/admin/gestoria?anio=${anio}&trimestre=${tri}`) });

  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const exportar = async () => {
    setExporting(true);
    try {
      const { token } = await api.post<{ token: string }>("/admin/gestoria/export-token");
      const url = `${API_URL}/admin/gestoria/export.csv?anio=${anio}&trimestre=${tri}&dl=${encodeURIComponent(token)}`;
      if (Platform.OS === "web") window.open(url, "_blank");
      else await Linking.openURL(url);
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setExporting(false);
    }
  };

  const list = q.data ? q.data[tab] : [];
  return (
    <View style={styles.screen} testID="admin-gestoria-screen">
      <AppBar title="Gestoría" subtitle="Facturas, tickets e IVA" />
      <ChipRow>
        {[year - 1, year].map((y) => (
          <Chip key={y} label={String(y)} selected={anio === y} onPress={() => setAnio(y)} testID={`gestoria-year-${y}`} />
        ))}
        {[1, 2, 3, 4, 0].map((t) => (
          <Chip key={t} label={t ? `T${t}` : "Año completo"} selected={tri === t} onPress={() => setTri(t)} testID={`gestoria-quarter-${t}`} />
        ))}
      </ChipRow>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError || !q.data ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.result} testID="gestoria-summary-card">
            <Text style={styles.resultLabel}>
              Resultado IVA {tri ? `T${tri}` : "anual"} {anio} ({fecha(q.data.periodo.desde)} – {fecha(q.data.periodo.hasta)})
            </Text>
            <Text style={styles.resultValue} testID="gestoria-iva-result">{eur(q.data.resumen.resultado_iva)}</Text>
            <Text style={styles.resultSub}>{q.data.resumen.resultado_iva >= 0 ? "A ingresar (modelo 303)" : "A compensar / devolver"}</Text>
          </View>
          <Card style={styles.gap}>
            <MoneyRow label={`Facturas emitidas (${q.data.resumen.num_emitidas}) · base`} value={eur(q.data.resumen.base_emitidas)} />
            <MoneyRow label="IVA repercutido" value={eur(q.data.resumen.iva_repercutido)} tone="result" />
            <View style={styles.divider} />
            <MoneyRow label={`Tickets recibidos (${q.data.resumen.num_recibidas}) · base`} value={eur(q.data.resumen.base_recibidas)} />
            <MoneyRow label="IVA soportado" value={eur(q.data.resumen.iva_soportado)} tone="minus" />
          </Card>
          <SectionTitle title="Desglose por tipo de IVA" />
          <Card style={styles.gap}>
            {q.data.iva_por_tipo.map((t) => (
              <View key={t.iva} style={styles.ivaRow}>
                <Text style={styles.ivaType}>{t.iva}%</Text>
                <View style={styles.flex}>
                  <Text style={styles.hint}>Repercutido {eur(t.cuota_repercutida)} (base {eur(t.base_emitidas, 0)})</Text>
                  <Text style={styles.hint}>Soportado {eur(t.cuota_soportada)} (base {eur(t.base_recibidas, 0)})</Text>
                </View>
              </View>
            ))}
          </Card>
          <PillButton label="Exportar datos a CSV" icon="download" onPress={exportar} loading={exporting} testID="gestoria-export-csv-button" />
          <Text style={styles.hint}>Descarga un CSV (separado por ;) listo para enviar a tu asesor fiscal.</Text>

          <Segmented
            options={[
              { value: "emitidas", label: `Emitidas (${q.data.emitidas.length})` },
              { value: "recibidas", label: `Recibidas (${q.data.recibidas.length})` },
            ]}
            value={tab}
            onChange={(v) => setTab(v as "emitidas" | "recibidas")}
            testIDPrefix="gestoria-tab"
          />
          {list.slice(0, 80).map((m) => (
            <Card key={m.id} style={styles.mov}>
              {m.foto_ticket_factura ? <Image source={{ uri: fileUrl(m.foto_ticket_factura) }} style={styles.ticket} contentFit="cover" /> : null}
              <View style={styles.flex}>
                <Text style={styles.movTitle} numberOfLines={1}>{m.numero_factura ? `${m.numero_factura} · ` : ""}{m.concepto}</Text>
                <Text style={styles.hint} numberOfLines={1}>{fecha(m.fecha)} · {m.contraparte || m.categoria}</Text>
                <Text style={styles.hint}>Base {eur(m.importe)} · IVA {m.iva}% {eur(m.iva_importe)}</Text>
              </View>
              <Text style={[styles.total, { color: tab === "emitidas" ? colors.info : colors.urgent }]}>{eur(m.total)}</Text>
            </Card>
          ))}
          {list.length > 80 ? <Text style={styles.hint}>Mostrando 80 de {list.length}. El CSV incluye todos.</Text> : null}
        </ScrollView>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  gap: { gap: 6 },
  flex: { flex: 1 },
  result: { backgroundColor: c.brand, borderRadius: radius.xxl, padding: 20, gap: 4 },
  resultLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.pillBorder },
  resultValue: { fontFamily: fonts.black, fontSize: 32, color: c.brandPrimary },
  resultSub: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.onBrand },
  divider: { height: 1, backgroundColor: c.infoDivider, marginVertical: 4 },
  ivaRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  ivaType: { fontFamily: fonts.black, fontSize: 18, color: c.brand, width: 48 },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  mov: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  ticket: { width: 44, height: 44, borderRadius: 10 },
  movTitle: { fontFamily: fonts.bodySemi, fontSize: 13.5, color: c.brandDeep },
  total: { fontFamily: fonts.bodyBold, fontSize: 14 },
}));
