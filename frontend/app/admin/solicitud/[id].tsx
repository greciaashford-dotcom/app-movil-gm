import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_PRESUPUESTO, ESTADOS_SOLICITUD } from "@/src/lib/constants";
import { eur, fechaHora, formatPhone, mapsLink, telLink, waLink } from "@/src/lib/format";
import type { EstadoSolicitud, Mensaje, Solicitud } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ChipRow, ErrorView, Field, LoadingView, PillButton, SectionTitle } from "@/src/ui/kit";
import { PhotoGrid } from "@/src/ui/PhotoGrid";
import { useToast } from "@/src/ui/toast";

type Detalle = {
  solicitud: Solicitud;
  mensajes: Mensaje[];
  presupuesto: { id: string; numero: string; total: number; estado: string; obra_id?: string | null } | null;
};

const MSG_ESTADO: Record<string, { label: string; tone: "success" | "yellow" | "error" }> = {
  enviado: { label: "Enviado", tone: "success" },
  simulado_pendiente_api_key: { label: "Simulado", tone: "yellow" },
  error: { label: "Error", tone: "error" },
};

const TIPO_MSG: Record<string, string> = {
  confirmacion_cliente: "Confirmación al cliente",
  alerta_admin: "Alerta al admin",
  respuesta: "Respuesta",
  presupuesto: "Presupuesto",
};

export default function AdminSolicitudDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [mensaje, setMensaje] = useState("");
  const q = useQuery({ queryKey: ["admin-solicitud", id], queryFn: () => api.get<Detalle>(`/admin/solicitudes/${id}`) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-solicitud", id] });
    qc.invalidateQueries({ queryKey: ["admin-solicitudes"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
  };

  const estadoMut = useMutation({
    mutationFn: (estado: EstadoSolicitud) => api.patch(`/admin/solicitudes/${id}`, { estado }),
    onSuccess: () => {
      invalidate();
      toast.show("Estado actualizado");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const responder = useMutation({
    mutationFn: () => api.post<Mensaje>("/responder", { solicitud_id: id, mensaje: mensaje.trim() }),
    onSuccess: (m) => {
      setMensaje("");
      invalidate();
      toast.show(m.estado === "enviado" ? "Correo enviado al cliente" : m.estado === "error" ? "Guardado, pero el envío falló" : "Guardado en modo simulación (sin envío real)", m.estado === "error" ? "error" : "success");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (q.isLoading) {
    return (
      <View style={styles.screen}>
        <AppBar title="Solicitud" />
        <LoadingView />
      </View>
    );
  }
  if (q.isError || !q.data) {
    return (
      <View style={styles.screen}>
        <AppBar title="Solicitud" />
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </View>
    );
  }
  const { solicitud: s, mensajes, presupuesto } = q.data;
  const waText = `Hola ${s.nombre_cliente}, te escribimos de GM Conecta (GM Reforma Express) sobre tu solicitud ${s.numero_solicitud} de ${s.servicio}. `;

  return (
    <View style={styles.screen} testID="admin-request-detail-screen">
      <AppBar title={s.numero_solicitud} subtitle={s.servicio} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {s.es_urgencia ? (
          <View style={styles.urgent}>
            <Icon name="siren" size={20} color={colors.urgent} />
            <Text style={styles.urgentText}>Urgencia 24 horas · {fechaHora(s.fecha_creacion)}</Text>
          </View>
        ) : null}

        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text style={styles.client} testID="admin-request-client-name">
              {s.nombre_cliente}
            </Text>
            <Badge label={ESTADOS_SOLICITUD[s.estado].label} tone={ESTADOS_SOLICITUD[s.estado].tone} testID="admin-request-status" />
          </View>
          <View style={styles.row}>
            <Icon name="phone" size={16} color={colors.brand} />
            <Text style={styles.line}>{formatPhone(s.telefono_cliente)}</Text>
          </View>
          <View style={styles.row}>
            <Icon name="mail" size={16} color={colors.brand} />
            <Text style={styles.line}>{s.correo_cliente}</Text>
          </View>
          <View style={styles.row}>
            <Icon name="map-pin" size={16} color={colors.brand} />
            <Text style={styles.line}>{s.direccion}</Text>
          </View>
          <View style={styles.row}>
            <Icon name="calendar-days" size={16} color={colors.brand} />
            <Text style={styles.line}>{fechaHora(s.fecha_creacion)}</Text>
          </View>
          <View style={styles.btnRow}>
            <PillButton label="Llamar" icon="phone" variant="call" small style={styles.flex} onPress={() => Linking.openURL(telLink(s.telefono_cliente))} testID="admin-request-call-button" />
            <PillButton label="WhatsApp" icon="message-circle" variant="success" small style={styles.flex} onPress={() => Linking.openURL(waLink(s.telefono_cliente, waText))} testID="admin-request-whatsapp-button" />
          </View>
          <PillButton label="Ver en el mapa" icon="map" variant="ghost" small onPress={() => Linking.openURL(mapsLink(s.direccion))} testID="admin-request-map-button" />
          {s.cliente_id ? (
            <PillButton label="Ficha del cliente" icon="user-round" variant="outline" small onPress={() => router.push(`/admin/cliente/${s.cliente_id}` as never)} testID="admin-request-client-button" />
          ) : null}
        </Card>

        <SectionTitle title="Descripción" />
        <Card>
          <Text style={styles.desc}>{s.descripcion}</Text>
        </Card>

        <SectionTitle title={`Fotos adjuntas (${s.fotografias.length})`} />
        <Card>
          <PhotoGrid photos={s.fotografias} testIDPrefix="admin-request" emptyText="El cliente no adjuntó fotos." />
        </Card>

        <SectionTitle title="Estado" />
        <ChipRow style={styles.bleed} testID="admin-request-status-chips">
          {(Object.keys(ESTADOS_SOLICITUD) as EstadoSolicitud[]).map((e) => (
            <Chip key={e} label={ESTADOS_SOLICITUD[e].label} selected={s.estado === e} onPress={() => s.estado !== e && estadoMut.mutate(e)} testID={`admin-request-set-${e}`} />
          ))}
        </ChipRow>

        <SectionTitle title="Presupuesto" />
        <Card tone="blue" style={styles.gap}>
          {presupuesto ? (
            <>
              <View style={styles.rowBetween}>
                <Text style={styles.client}>{presupuesto.numero}</Text>
                <Badge label={ESTADOS_PRESUPUESTO[presupuesto.estado].label} tone={ESTADOS_PRESUPUESTO[presupuesto.estado].tone} />
              </View>
              <Text style={styles.line}>Total: {eur(presupuesto.total)}</Text>
              <PillButton label="Ver presupuesto" icon="file-text" variant="navy" small onPress={() => router.push(`/admin/presupuesto/${presupuesto.id}` as never)} testID="admin-request-view-quote-button" />
              {presupuesto.obra_id ? (
                <PillButton label="Ver obra" icon="hard-hat" variant="outline" small onPress={() => router.push(`/admin/obra/${presupuesto.obra_id}` as never)} testID="admin-request-view-work-button" />
              ) : null}
            </>
          ) : (
            <>
              <Text style={styles.line}>Esta solicitud aún no tiene presupuesto.</Text>
              <PillButton
                label="Convertir solicitud en presupuesto"
                icon="file-text"
                onPress={() => router.push({ pathname: "/admin/presupuesto/[id]", params: { id: "nuevo", solicitud_id: s.id } })}
                testID="admin-request-convert-quote-button"
              />
            </>
          )}
        </Card>

        <SectionTitle title="Responder al cliente" />
        <Card style={styles.gap}>
          <Field
            label="Mensaje por correo"
            multiline
            value={mensaje}
            onChangeText={setMensaje}
            placeholder={`Hola ${s.nombre_cliente}, …`}
            maxLength={4000}
            testID="admin-reply-input"
          />
          <Text style={styles.hint}>Se enviará a {s.correo_cliente} y quedará guardado en el historial.</Text>
          <PillButton
            label="Enviar respuesta"
            icon="send"
            variant="navy"
            onPress={() => responder.mutate()}
            loading={responder.isPending}
            disabled={mensaje.trim().length < 2}
            testID="admin-reply-send-button"
          />
        </Card>

        <SectionTitle title={`Historial de mensajes (${mensajes.length})`} />
        {mensajes.length === 0 ? <Text style={styles.hint}>Sin mensajes todavía.</Text> : null}
        {mensajes.map((m) => (
          <Card key={m.id} style={styles.gap} testID={`admin-message-${m.id}`}>
            <View style={styles.rowBetween}>
              <Text style={styles.msgType}>{TIPO_MSG[m.tipo] ?? m.tipo}</Text>
              <Badge label={MSG_ESTADO[m.estado]?.label ?? m.estado} tone={MSG_ESTADO[m.estado]?.tone ?? "neutral"} />
            </View>
            <Text style={styles.msgSubject}>{m.asunto}</Text>
            <Text style={styles.desc} numberOfLines={4}>
              {m.cuerpo}
            </Text>
            <Text style={styles.hint}>
              {fechaHora(m.fecha)} · {m.destinatario}
            </Text>
          </Card>
        ))}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  gap: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  btnRow: { flexDirection: "row", gap: 10 },
  urgent: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.urgentBg, borderWidth: 2, borderColor: c.urgentBorder, borderRadius: 18, padding: 12 },
  urgentText: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.urgentTitle },
  client: { fontFamily: fonts.extraBold, fontSize: 18, color: c.brandDeep, flex: 1 },
  line: { fontFamily: fonts.body, fontSize: 14, color: c.textDark, flex: 1 },
  desc: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.textDark },
  bleed: { marginHorizontal: -16 },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  msgType: { fontFamily: fonts.bodyBold, fontSize: 13, color: c.brandSecondary },
  msgSubject: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
}));
