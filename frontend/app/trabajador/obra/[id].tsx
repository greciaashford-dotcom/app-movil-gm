import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { COMPANY_PHONE, ESTADOS_OBRA, FASES } from "@/src/lib/constants";
import { fecha, formatPhone, mapsLink, telLink, waLink } from "@/src/lib/format";
import type { Fase, WorkerObra } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ErrorView, LoadingView, PillButton, ProgressBar, SectionTitle, Segmented } from "@/src/ui/kit";
import { PhotoGrid } from "@/src/ui/PhotoGrid";
import { useToast } from "@/src/ui/toast";

const PASOS = [0, 10, 25, 50, 75, 90, 100];

export default function TrabajadorObraDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [fase, setFase] = useState<Fase>("durante");
  const q = useQuery({ queryKey: ["trabajador-obra", id], queryFn: () => api.get<WorkerObra>(`/trabajador/obras/${id}`) });

  const onUpdated = (d: WorkerObra, msg?: string) => {
    qc.setQueryData(["trabajador-obra", id], d);
    qc.invalidateQueries({ queryKey: ["trabajador-obras"] });
    if (msg) toast.show(msg);
  };

  const avance = useMutation({
    mutationFn: (v: number) => api.patch<WorkerObra>(`/trabajador/obras/${id}/avance`, { porcentaje_avance: v }),
    onSuccess: (d) => onUpdated(d, `Avance actualizado al ${d.porcentaje_avance}%`),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (q.isLoading || q.isError || !q.data) {
    return (
      <View style={styles.screen}>
        <AppBar title="Obra" />
        {q.isLoading ? <LoadingView /> : <ErrorView message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      </View>
    );
  }
  const o = q.data;
  const st = ESTADOS_OBRA[o.estado];
  const finalizada = o.estado === "finalizada";

  return (
    <View style={styles.screen} testID="worker-job-detail-screen">
      <AppBar title={o.numero_obra} subtitle={o.titulo} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{o.titulo}</Text>
            <Badge label={st.label} tone={st.tone} testID="worker-job-status" />
          </View>
          <View style={styles.row}>
            <Icon name="calendar-days" size={16} color={colors.brand} />
            <Text style={styles.line}>
              {fecha(o.fecha_inicio)} → {fecha(o.fecha_fin_prevista)}
            </Text>
          </View>
          <View style={styles.row}>
            <Icon name="user-round" size={16} color={colors.brand} />
            <Text style={styles.line}>
              {o.cliente_nombre} · {formatPhone(o.cliente_telefono)}
            </Text>
          </View>
        </Card>

        <View style={styles.location} testID="worker-job-location">
          <View style={styles.row}>
            <Icon name="map-pin" size={20} color={colors.brandPrimary} />
            <Text style={styles.locationLabel}>Ubicación de la obra</Text>
          </View>
          <Text style={styles.address} testID="worker-job-address">{o.direccion}</Text>
          <PillButton label="Cómo llegar" icon="navigation" onPress={() => Linking.openURL(mapsLink(o.direccion))} testID="worker-job-directions-button" />
          <View style={styles.btnRow}>
            <PillButton label="Llamar" icon="phone" variant="call" small style={styles.flex} onPress={() => Linking.openURL(telLink(o.cliente_telefono))} testID="worker-job-call-client-button" />
            <PillButton
              label="WhatsApp"
              icon="message-circle"
              variant="call"
              small
              style={styles.flex}
              onPress={() => Linking.openURL(waLink(o.cliente_telefono, `Hola ${o.cliente_nombre}, soy de GM Conecta, en relación con la obra ${o.numero_obra}. `))}
              testID="worker-job-whatsapp-client-button"
            />
          </View>
        </View>

        <SectionTitle title="Avance de la obra" />
        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ProgressBar value={o.porcentaje_avance} testID="worker-job-progress-bar" />
            </View>
            <Text style={styles.pct} testID="worker-job-progress-value">
              {o.porcentaje_avance}%
            </Text>
          </View>
          {finalizada ? (
            <Text style={styles.hint}>Obra finalizada. Si necesitas cambiar algo, avisa a la oficina.</Text>
          ) : (
            <>
              <Text style={styles.hint}>Marca el porcentaje real de avance. La oficina lo ve al momento.</Text>
              <View style={styles.chips}>
                {PASOS.map((v) => (
                  <Chip
                    key={v}
                    label={`${v}%`}
                    selected={o.porcentaje_avance === v}
                    onPress={() => !avance.isPending && o.porcentaje_avance !== v && avance.mutate(v)}
                    testID={`worker-progress-${v}`}
                  />
                ))}
              </View>
            </>
          )}
          <PillButton
            label="Avisar a la oficina"
            icon="send"
            variant="ghost"
            small
            onPress={() => Linking.openURL(waLink(COMPANY_PHONE, `Obra ${o.numero_obra} (${o.titulo}): avance ${o.porcentaje_avance}%. `))}
            testID="worker-job-notify-office-button"
          />
        </Card>

        <SectionTitle title="Fotos de avance" />
        <Segmented options={FASES.map((f) => ({ value: f.key, label: `${f.label} (${o.fotos[f.key].length})` }))} value={fase} onChange={setFase} testIDPrefix="worker-phase" />
        <Card>
          <PhotoGrid
            photos={o.fotos[fase]}
            testIDPrefix={`worker-${fase}`}
            emptyText={`Sin fotos de la fase "${FASES.find((f) => f.key === fase)?.label}". Haz una foto para que la oficina vea el avance.`}
            onAdd={async (path) => onUpdated(await api.post<WorkerObra>(`/trabajador/obras/${id}/fotos`, { fase, path }))}
          />
        </Card>

        <SectionTitle title={`Materiales (${o.materiales.length})`} />
        <Card style={styles.gapSm}>
          {o.materiales.length === 0 ? <Text style={styles.hint}>Sin materiales previstos.</Text> : null}
          {o.materiales.map((m, i) => (
            <View key={`${m.concepto}-${i}`} style={[styles.matRow, i < o.materiales.length - 1 && styles.divider]} testID={`worker-material-${i}`}>
              <Icon name={m.comprado ? "circle-check" : "circle"} size={18} color={m.comprado ? colors.success : colors.muted} />
              <Text style={styles.line} numberOfLines={2}>
                {m.concepto}
              </Text>
              <Text style={styles.qty}>
                {m.cantidad} {m.unidad}
              </Text>
            </View>
          ))}
        </Card>

        {o.companeros.length ? (
          <>
            <SectionTitle title="Equipo asignado" />
            <Card style={styles.team}>
              {o.companeros.map((n) => (
                <View key={n} style={styles.member}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{n.slice(0, 1)}</Text>
                  </View>
                  <Text style={styles.memberName}>{n}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {o.notas ? (
          <Card tone="yellow" style={styles.gapSm}>
            <View style={styles.row}>
              <Icon name="info" size={18} color={colors.textDark} />
              <Text style={styles.noteTitle}>Notas de la oficina</Text>
            </View>
            <Text style={styles.line} testID="worker-job-notes">{o.notas}</Text>
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  gap: { gap: 10 },
  gapSm: { gap: 6 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  btnRow: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  title: { flex: 1, fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep },
  line: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.textDark, lineHeight: 20 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 18 },
  pct: { fontFamily: fonts.black, fontSize: 18, color: c.brandDeep },
  location: { backgroundColor: c.brand, borderRadius: radius.xl, padding: 18, gap: 12 },
  locationLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.brandPrimary, textTransform: "uppercase", letterSpacing: 0.5 },
  address: { fontFamily: fonts.extraBold, fontSize: 19, color: c.onBrand, lineHeight: 26 },
  matRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  qty: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.brandSecondary },
  team: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  member: { flexDirection: "row", alignItems: "center", gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.black, fontSize: 15, color: c.brandPrimary },
  memberName: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  noteTitle: { fontFamily: fonts.extraBold, fontSize: 15, color: c.textDark },
}));
