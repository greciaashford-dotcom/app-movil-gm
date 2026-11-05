import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_OBRA, ESTADOS_PRESUPUESTO, ESTADOS_SOLICITUD } from "@/src/lib/constants";
import { eur, fechaHora, formatPhone, telLink, waLink } from "@/src/lib/format";
import type { Solicitud } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, ErrorView, LoadingView, PillButton, SectionTitle } from "@/src/ui/kit";

type Detalle = {
  cliente: { id: string; nombre: string; telefono: string; correo: string; direcciones: string[]; fecha_alta: string };
  solicitudes: Solicitud[];
  presupuestos: { id: string; numero: string; titulo: string; total: number; estado: string }[];
  obras: { id: string; numero: string; titulo: string; estado: string; porcentaje_avance: number }[];
};

export default function AdminClienteDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["admin-cliente", id], queryFn: () => api.get<Detalle>(`/admin/clientes/${id}`) });

  if (q.isLoading || q.isError || !q.data) {
    return (
      <View style={styles.screen}>
        <AppBar title="Cliente" />
        {q.isLoading ? <LoadingView /> : <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      </View>
    );
  }
  const { cliente: c, solicitudes, presupuestos, obras } = q.data;
  return (
    <View style={styles.screen} testID="admin-client-detail-screen">
      <AppBar title={c.nombre} subtitle="Ficha de cliente" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={styles.gap}>
          <Text style={styles.name} testID="admin-client-name">{c.nombre}</Text>
          <View style={styles.row}>
            <Icon name="phone" size={16} color={colors.brand} />
            <Text style={styles.line}>{formatPhone(c.telefono)}</Text>
          </View>
          <View style={styles.row}>
            <Icon name="mail" size={16} color={colors.brand} />
            <Text style={styles.line}>{c.correo || "—"}</Text>
          </View>
          {c.direcciones.map((d) => (
            <View key={d} style={styles.row}>
              <Icon name="map-pin" size={16} color={colors.brand} />
              <Text style={styles.line}>{d}</Text>
            </View>
          ))}
          <View style={styles.btnRow}>
            <PillButton label="Llamar" icon="phone" variant="call" small style={styles.flex} onPress={() => Linking.openURL(telLink(c.telefono))} testID="admin-client-call-button" />
            <PillButton label="WhatsApp" icon="message-circle" variant="success" small style={styles.flex} onPress={() => Linking.openURL(waLink(c.telefono, `Hola ${c.nombre}, te escribimos de GM Conecta. `))} testID="admin-client-whatsapp-button" />
          </View>
        </Card>

        <SectionTitle title={`Solicitudes (${solicitudes.length})`} />
        {solicitudes.map((s) => (
          <Card key={s.id} onPress={() => router.push(`/admin/solicitud/${s.id}` as never)} style={styles.item} testID={`admin-client-request-${s.numero_solicitud}`}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{s.numero_solicitud} · {s.servicio}</Text>
              <Text style={styles.meta}>{fechaHora(s.fecha_creacion)}</Text>
            </View>
            <Badge label={ESTADOS_SOLICITUD[s.estado].label} tone={ESTADOS_SOLICITUD[s.estado].tone} />
          </Card>
        ))}

        <SectionTitle title={`Presupuestos (${presupuestos.length})`} />
        {presupuestos.length === 0 ? <Text style={styles.meta}>Sin presupuestos.</Text> : null}
        {presupuestos.map((p) => (
          <Card key={p.id} onPress={() => router.push(`/admin/presupuesto/${p.id}` as never)} style={styles.item}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{p.numero} · {eur(p.total)}</Text>
              <Text style={styles.meta} numberOfLines={1}>{p.titulo}</Text>
            </View>
            <Badge label={ESTADOS_PRESUPUESTO[p.estado].label} tone={ESTADOS_PRESUPUESTO[p.estado].tone} />
          </Card>
        ))}

        <SectionTitle title={`Obras (${obras.length})`} />
        {obras.length === 0 ? <Text style={styles.meta}>Sin obras.</Text> : null}
        {obras.map((o) => (
          <Card key={o.id} onPress={() => router.push(`/admin/obra/${o.id}` as never)} style={styles.item}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{o.numero} · {o.porcentaje_avance}%</Text>
              <Text style={styles.meta} numberOfLines={1}>{o.titulo}</Text>
            </View>
            <Badge label={ESTADOS_OBRA[o.estado].label} tone={ESTADOS_OBRA[o.estado].tone} />
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 10 },
  gap: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnRow: { flexDirection: "row", gap: 10 },
  name: { fontFamily: fonts.black, fontSize: 20, color: c.brandDeep },
  line: { fontFamily: fonts.body, fontSize: 14, color: c.textDark, flex: 1 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  itemTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  meta: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted, marginTop: 2 },
}));
