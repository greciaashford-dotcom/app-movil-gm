import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_PRESUPUESTO } from "@/src/lib/constants";
import { addDays, eur, fecha, isValidDateStr, parseNum, todayStr, waLink } from "@/src/lib/format";
import type { EstadoPresupuesto, Mensaje, Obra, Presupuesto, Solicitud, Trabajador } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ErrorView, Field, LoadingView, MoneyRow, PillButton, SectionTitle } from "@/src/ui/kit";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

type LineaForm = { key: string; tipo: "MATERIAL" | "MANO_OBRA"; concepto: string; cantidad: string; precio: string };
let lineSeq = 0;
const newLine = (tipo: LineaForm["tipo"], concepto = "", cantidad = "1", precio = ""): LineaForm => ({ key: `l${++lineSeq}`, tipo, concepto, cantidad, precio });

export default function PresupuestoEditor() {
  const { id, solicitud_id } = useLocalSearchParams<{ id: string; solicitud_id?: string }>();
  const isNew = id === "nuevo";
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();

  const existing = useQuery({ queryKey: ["admin-presupuesto", id], queryFn: () => api.get<Presupuesto>(`/admin/presupuestos/${id}`), enabled: !isNew });
  const sol = useQuery({
    queryKey: ["admin-solicitud", solicitud_id],
    queryFn: () => api.get<{ solicitud: Solicitud }>(`/admin/solicitudes/${solicitud_id}`),
    enabled: isNew && !!solicitud_id,
  });

  const [init, setInit] = useState(false);
  const [cliente, setCliente] = useState({ nombre: "", telefono: "", correo: "", direccion: "" });
  const [titulo, setTitulo] = useState("");
  const [servicio, setServicio] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([newLine("MATERIAL"), newLine("MANO_OBRA")]);
  const [iva, setIva] = useState("21");
  const [notas, setNotas] = useState("Presupuesto válido 30 días. Forma de pago: 50% al inicio y 50% a la finalización.");
  const [formError, setFormError] = useState<string | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => {
    if (init) return;
    if (!isNew && existing.data) {
      const p = existing.data;
      setCliente({ nombre: p.cliente_nombre, telefono: p.cliente_telefono, correo: p.cliente_correo, direccion: p.direccion });
      setTitulo(p.titulo);
      setServicio(p.servicio);
      setLineas(p.lineas.map((l) => newLine(l.tipo, l.concepto, String(l.cantidad), String(l.precio_unitario))));
      setIva(String(p.iva_porcentaje));
      setNotas(p.notas);
      setInit(true);
    } else if (isNew && sol.data) {
      const s = sol.data.solicitud;
      setCliente({ nombre: s.nombre_cliente, telefono: s.telefono_cliente, correo: s.correo_cliente, direccion: s.direccion });
      setServicio(s.servicio);
      setTitulo(`${s.servicio} – ${s.nombre_cliente}`);
      setInit(true);
    } else if (isNew && !solicitud_id) {
      setInit(true);
    }
  }, [init, isNew, existing.data, sol.data, solicitud_id]);

  const p = existing.data;
  const locked = !!p?.obra_id;
  const totals = useMemo(() => {
    const base = lineas.reduce((acc, l) => acc + parseNum(l.cantidad) * parseNum(l.precio), 0);
    const ivaImp = (base * parseNum(iva)) / 100;
    const mat = lineas.filter((l) => l.tipo === "MATERIAL").reduce((a, l) => a + parseNum(l.cantidad) * parseNum(l.precio), 0);
    return { base, ivaImp, total: base + ivaImp, mat, mo: base - mat };
  }, [lineas, iva]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-presupuestos"] });
    qc.invalidateQueries({ queryKey: ["admin-presupuesto", id] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    qc.invalidateQueries({ queryKey: ["admin-solicitud"] });
    qc.invalidateQueries({ queryKey: ["admin-solicitudes"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const valid = lineas.filter((l) => l.concepto.trim() && parseNum(l.cantidad) > 0);
      if (cliente.nombre.trim().length < 2) throw new Error("Indica el nombre del cliente");
      if (titulo.trim().length < 3) throw new Error("Indica un título para el presupuesto");
      if (!valid.length) throw new Error("Añade al menos una línea con concepto y cantidad");
      const body = {
        lineas: valid.map((l) => ({ tipo: l.tipo, concepto: l.concepto.trim(), cantidad: parseNum(l.cantidad), precio_unitario: parseNum(l.precio) })),
        iva_porcentaje: parseNum(iva),
        notas,
        titulo: titulo.trim(),
      };
      if (isNew) {
        return api.post<Presupuesto>("/admin/presupuestos", {
          ...body,
          solicitud_id: solicitud_id || null,
          cliente_nombre: cliente.nombre.trim(),
          cliente_telefono: cliente.telefono.trim(),
          cliente_correo: cliente.correo.trim(),
          direccion: cliente.direccion.trim(),
          servicio: servicio.trim(),
        });
      }
      return api.patch<Presupuesto>(`/admin/presupuestos/${id}`, { ...body, cliente_correo: cliente.correo.trim(), direccion: cliente.direccion.trim() });
    },
    onSuccess: (res) => {
      setFormError(null);
      invalidate();
      toast.show(isNew ? `Presupuesto ${res.numero_presupuesto} creado` : "Presupuesto guardado");
      if (isNew) router.replace(`/admin/presupuesto/${res.id}` as never);
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const estado = useMutation({
    mutationFn: (e: EstadoPresupuesto) => api.patch<Presupuesto>(`/admin/presupuestos/${id}`, { estado: e }),
    onSuccess: (r) => {
      invalidate();
      toast.show(`Presupuesto ${ESTADOS_PRESUPUESTO[r.estado].label.toLowerCase()}`);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const enviar = useMutation({
    mutationFn: () => api.post<{ mensaje: Mensaje }>(`/admin/presupuestos/${id}/enviar`),
    onSuccess: (r) => {
      invalidate();
      toast.show(r.mensaje.estado === "enviado" ? "Presupuesto enviado por correo" : r.mensaje.estado === "error" ? "No se pudo enviar el correo" : "Envío simulado guardado en el historial", r.mensaje.estado === "error" ? "error" : "success");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if ((!isNew && existing.isLoading) || (isNew && solicitud_id && sol.isLoading)) {
    return (
      <View style={styles.screen}>
        <AppBar title="Presupuesto" />
        <LoadingView />
      </View>
    );
  }
  if (!isNew && (existing.isError || !p)) {
    return (
      <View style={styles.screen}>
        <AppBar title="Presupuesto" />
        <ErrorView message={errorMessage(existing.error)} onRetry={() => existing.refetch()} />
      </View>
    );
  }

  const updateLine = (key: string, patch: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const waText = p
    ? `Hola ${p.cliente_nombre}, te enviamos el presupuesto ${p.numero_presupuesto} de GM Conecta: ${p.titulo}.\nBase: ${eur(p.base_imponible)}\nIVA (${p.iva_porcentaje}%): ${eur(p.iva_importe)}\nTotal: ${eur(p.total)}\n¿Te parece bien que empecemos?`
    : "";

  const renderSection = (tipo: LineaForm["tipo"], title: string) => (
    <Card style={styles.gap}>
      <View style={styles.rowBetween}>
        <View style={styles.row}>
          <Icon name={tipo === "MATERIAL" ? "package" : "hard-hat"} size={18} color={colors.brand} />
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Text style={styles.sectionTotal}>{eur(tipo === "MATERIAL" ? totals.mat : totals.mo)}</Text>
      </View>
      {lineas
        .filter((l) => l.tipo === tipo)
        .map((l) => (
          <View key={l.key} style={styles.line}>
            <TextInput
              value={l.concepto}
              onChangeText={(t) => updateLine(l.key, { concepto: t })}
              placeholder={tipo === "MATERIAL" ? "Concepto (ej. Grifería termostática)" : "Concepto (ej. Fontanería, horas)"}
              placeholderTextColor={colors.muted}
              style={styles.input}
              editable={!locked}
              testID={`quote-line-${tipo.toLowerCase()}-concept-input`}
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text style={styles.miniLabel}>Cantidad</Text>
                <TextInput value={l.cantidad} onChangeText={(t) => updateLine(l.key, { cantidad: t })} keyboardType="decimal-pad" style={styles.input} editable={!locked} testID={`quote-line-${tipo.toLowerCase()}-qty-input`} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.miniLabel}>Precio unit. (€)</Text>
                <TextInput value={l.precio} onChangeText={(t) => updateLine(l.key, { precio: t })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.muted} style={styles.input} editable={!locked} testID={`quote-line-${tipo.toLowerCase()}-price-input`} />
              </View>
              <View style={styles.subtotal}>
                <Text style={styles.miniLabel}>Subtotal</Text>
                <Text style={styles.subtotalText}>{eur(parseNum(l.cantidad) * parseNum(l.precio))}</Text>
              </View>
              {!locked ? (
                <Pressable onPress={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))} style={styles.del} hitSlop={6} testID={`quote-line-${tipo.toLowerCase()}-delete-button`} accessibilityLabel="Eliminar línea">
                  <Icon name="trash-2" size={18} color={colors.urgent} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))}
      {!locked ? <PillButton label={tipo === "MATERIAL" ? "Añadir material" : "Añadir mano de obra"} icon="plus" variant="ghost" small onPress={() => setLineas((ls) => [...ls, newLine(tipo)])} testID={`quote-add-${tipo.toLowerCase()}-button`} /> : null}
    </Card>
  );

  return (
    <View style={styles.screen} testID="admin-quote-editor-screen">
      <AppBar title={isNew ? "Nuevo presupuesto" : p!.numero_presupuesto} subtitle={isNew ? "Generador de presupuestos" : p!.cliente_nombre} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {p ? (
          <Card tone="blue" style={styles.gap}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>Estado del presupuesto</Text>
              <Badge label={ESTADOS_PRESUPUESTO[p.estado].label} tone={ESTADOS_PRESUPUESTO[p.estado].tone} testID="quote-status-badge" />
            </View>
            <View style={styles.chips}>
              {(["pendiente", "aceptado", "rechazado"] as EstadoPresupuesto[]).map((e) => (
                <Chip key={e} label={ESTADOS_PRESUPUESTO[e].label} selected={p.estado === e} onPress={() => p.estado !== e && estado.mutate(e)} testID={`quote-set-${e}`} />
              ))}
            </View>
            {p.fecha_envio ? <Text style={styles.hint}>Enviado el {fecha(p.fecha_envio)}</Text> : null}
            <View style={styles.row}>
              <PillButton label="Correo" icon="mail" variant="navy" small style={styles.flex} onPress={() => enviar.mutate()} loading={enviar.isPending} testID="quote-send-email-button" />
              <PillButton label="WhatsApp" icon="message-circle" variant="success" small style={styles.flex} onPress={() => Linking.openURL(waLink(p.cliente_telefono, waText))} testID="quote-send-whatsapp-button" />
            </View>
            {p.obra_id ? (
              <PillButton label="Ver obra" icon="hard-hat" onPress={() => router.push(`/admin/obra/${p.obra_id}` as never)} testID="quote-view-work-button" />
            ) : p.estado === "aceptado" ? (
              <PillButton label="Convertir en Obra" icon="hard-hat" onPress={() => setConvertOpen(true)} testID="quote-convert-work-button" />
            ) : (
              <Text style={styles.hint}>Marca el presupuesto como aceptado para poder convertirlo en obra.</Text>
            )}
          </Card>
        ) : null}

        <SectionTitle title="Cliente y trabajo" />
        <Card style={styles.gap}>
          <Field label="Cliente" value={cliente.nombre} onChangeText={(t) => setCliente((c) => ({ ...c, nombre: t }))} editable={isNew} testID="quote-client-name-input" />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label="Teléfono" value={cliente.telefono} onChangeText={(t) => setCliente((c) => ({ ...c, telefono: t }))} keyboardType="phone-pad" editable={isNew} testID="quote-client-phone-input" />
            </View>
          </View>
          <Field label="Correo" value={cliente.correo} onChangeText={(t) => setCliente((c) => ({ ...c, correo: t }))} keyboardType="email-address" autoCapitalize="none" testID="quote-client-email-input" />
          <Field label="Dirección de la obra" value={cliente.direccion} onChangeText={(t) => setCliente((c) => ({ ...c, direccion: t }))} testID="quote-address-input" />
          <Field label="Título del presupuesto" value={titulo} onChangeText={setTitulo} editable={!locked} testID="quote-title-input" />
        </Card>

        <SectionTitle title="Desglose" />
        {renderSection("MATERIAL", "Materiales")}
        {renderSection("MANO_OBRA", "Mano de obra")}

        <Card style={styles.gap}>
          <Text style={styles.sectionTitle}>IVA</Text>
          <View style={styles.chips}>
            {["21", "10", "0"].map((v) => (
              <Chip key={v} label={`${v}%`} selected={parseNum(iva) === parseNum(v)} onPress={() => !locked && setIva(v)} testID={`quote-iva-${v}`} />
            ))}
          </View>
          <MoneyRow label="Base imponible" value={eur(totals.base)} />
          <MoneyRow label={`IVA (${parseNum(iva)}%)`} value={eur(totals.ivaImp)} />
          <View style={styles.divider} />
          <MoneyRow label="Total" value={eur(totals.total)} strong />
        </Card>

        <Field label="Notas y condiciones" value={notas} onChangeText={setNotas} multiline testID="quote-notes-input" />
        {formError ? <Text style={styles.error} testID="quote-form-error">{formError}</Text> : null}
        <PillButton label={isNew ? "Crear presupuesto" : "Guardar cambios"} icon="check" onPress={() => save.mutate()} loading={save.isPending} disabled={!init} testID="quote-save-button" />
      </KeyboardAwareScrollView>
      {p ? (
        <ConvertSheet
          visible={convertOpen}
          onClose={() => setConvertOpen(false)}
          quoteId={p.id}
          onDone={(o) => {
            setConvertOpen(false);
            invalidate();
            qc.invalidateQueries({ queryKey: ["admin-obras"] });
            toast.show(`Obra ${o.numero_obra} creada`);
            router.push(`/admin/obra/${o.id}` as never);
          }}
        />
      ) : null}
    </View>
  );
}

function ConvertSheet({ visible, onClose, quoteId, onDone }: { visible: boolean; onClose: () => void; quoteId: string; onDone: (o: Obra) => void }) {
  const styles = useStyles();
  const [inicio, setInicio] = useState(addDays(todayStr(), 3));
  const [fin, setFin] = useState(addDays(todayStr(), 17));
  const [sel, setSel] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const workers = useQuery({ queryKey: ["admin-trabajadores"], queryFn: () => api.get<Trabajador[]>("/admin/trabajadores"), enabled: visible });
  const mut = useMutation({
    mutationFn: () => {
      if (!isValidDateStr(inicio) || !isValidDateStr(fin)) throw new Error("Usa fechas con formato AAAA-MM-DD");
      if (fin < inicio) throw new Error("La fecha de fin debe ser posterior al inicio");
      return api.post<Obra>(`/admin/presupuestos/${quoteId}/convertir-obra`, { fecha_inicio: inicio, fecha_fin_prevista: fin, trabajadores: sel });
    },
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Convertir en obra" testID="convert-work-sheet">
      <Field label="Fecha de inicio (AAAA-MM-DD)" value={inicio} onChangeText={setInicio} testID="convert-start-input" />
      <Field label="Fecha de fin prevista (AAAA-MM-DD)" value={fin} onChangeText={setFin} testID="convert-end-input" />
      <Text style={styles.sectionTitle}>Trabajadores asignados</Text>
      <View style={styles.chips}>
        {(workers.data ?? []).map((w) => (
          <Chip key={w.id} label={`${w.nombre} · ${w.especialidad}`} selected={sel.includes(w.id)} onPress={() => setSel((s) => (s.includes(w.id) ? s.filter((x) => x !== w.id) : [...s, w.id]))} testID={`convert-worker-${w.codigo.toLowerCase()}`} />
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Crear obra" icon="hard-hat" onPress={() => mut.mutate()} loading={mut.isPending} testID="convert-submit-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  gap: { gap: 12 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 15.5, color: c.brandDeep },
  sectionTotal: { fontFamily: fonts.extraBold, fontSize: 15, color: c.brand },
  line: { gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.infoDivider },
  input: { minHeight: 46, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, paddingHorizontal: 12, fontFamily: fonts.body, fontSize: 14.5, color: c.onSurface },
  miniLabel: { fontFamily: fonts.bodyMedium, fontSize: 11.5, color: c.muted, marginBottom: 4 },
  subtotal: { minWidth: 78, alignItems: "flex-end" },
  subtotalText: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.brandDeep, minHeight: 46, textAlignVertical: "center", paddingTop: 12 },
  del: { width: 40, height: 46, alignItems: "center", justifyContent: "center", marginTop: 16 },
  divider: { height: 1, backgroundColor: c.infoDivider },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
}));
