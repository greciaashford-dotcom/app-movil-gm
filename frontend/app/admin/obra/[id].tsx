import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { ESTADOS_OBRA, FASES } from "@/src/lib/constants";
import { eur, fecha, formatPhone, mapsLink, parseNum, telLink, waLink } from "@/src/lib/format";
import type { EstadoObra, Fase, Material, ObraDetalle, Trabajador } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ErrorView, Field, IconButton, LoadingView, PillButton, ProgressBar, SectionTitle, Segmented } from "@/src/ui/kit";
import { PhotoField, PhotoGrid } from "@/src/ui/PhotoGrid";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

type SheetKind = null | "material" | "compra" | "mano" | "cobro" | "workers";

export default function AdminObraDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [fase, setFase] = useState<Fase>("antes");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const q = useQuery({ queryKey: ["admin-obra", id], queryFn: () => api.get<ObraDetalle>(`/admin/obras/${id}`) });

  const onUpdated = (data: ObraDetalle, msg?: string) => {
    qc.setQueryData(["admin-obra", id], data);
    qc.invalidateQueries({ queryKey: ["admin-obras"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    qc.invalidateQueries({ queryKey: ["finanzas"] });
    if (msg) toast.show(msg);
  };

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<ObraDetalle>(`/admin/obras/${id}`, body),
    onSuccess: (d) => onUpdated(d, "Obra actualizada"),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const delMano = useMutation({
    mutationFn: (lid: string) => api.del<ObraDetalle>(`/admin/obras/${id}/mano-obra/${lid}`),
    onSuccess: (d) => onUpdated(d, "Registro eliminado"),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (q.isLoading || q.isError || !q.data) {
    return (
      <View style={styles.screen}>
        <AppBar title="Obra" />
        {q.isLoading ? <LoadingView /> : <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      </View>
    );
  }
  const o = q.data;
  const positive = o.beneficio_neto >= 0;

  return (
    <View style={styles.screen} testID="admin-work-detail-screen">
      <AppBar title={o.numero_obra} subtitle={o.titulo} />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card style={styles.gap}>
          <View style={styles.rowBetween}>
            <Text style={styles.title}>{o.titulo}</Text>
            <Badge label={ESTADOS_OBRA[o.estado].label} tone={ESTADOS_OBRA[o.estado].tone} testID="work-status-badge" />
          </View>
          <View style={styles.row}>
            <Icon name="user-round" size={16} color={colors.brand} />
            <Text style={styles.line}>{o.cliente_nombre} · {formatPhone(o.cliente_telefono)}</Text>
          </View>
          <View style={styles.row}>
            <Icon name="map-pin" size={16} color={colors.brand} />
            <Text style={styles.line}>{o.direccion}</Text>
          </View>
          <View style={styles.row}>
            <Icon name="calendar-days" size={16} color={colors.brand} />
            <Text style={styles.line}>{fecha(o.fecha_inicio)} → {fecha(o.fecha_fin_prevista)}{o.fecha_fin_real ? ` · Fin real ${fecha(o.fecha_fin_real)}` : ""}</Text>
          </View>
          <View style={styles.btnRow}>
            <PillButton label="Llamar" icon="phone" variant="call" small style={styles.flex} onPress={() => Linking.openURL(telLink(o.cliente_telefono))} testID="work-call-client-button" />
            <PillButton label="Mapa" icon="navigation" variant="navy" small style={styles.flex} onPress={() => Linking.openURL(mapsLink(o.direccion))} testID="work-map-button" />
          </View>
          {o.presupuesto_id ? <PillButton label="Ver presupuesto" icon="file-text" variant="ghost" small onPress={() => router.push(`/admin/presupuesto/${o.presupuesto_id}` as never)} testID="work-view-quote-button" /> : null}
        </Card>

        {/* Rentabilidad */}
        <View style={styles.profit} testID="work-profitability-card">
          <Text style={styles.profitTitle}>Rentabilidad real de la obra</Text>
          <ProfitRow label="Ingresos (presupuesto sin IVA)" value={eur(o.ingresos_totales)} testID="work-income" />
          <ProfitRow label="− Materiales (coste real)" value={eur(o.coste_materiales_real)} minus testID="work-materials-cost" />
          <ProfitRow label="− Mano de obra (coste real)" value={eur(o.coste_mano_obra_real)} minus testID="work-labor-cost" />
          <View style={styles.profitDivider} />
          <View style={styles.rowBetween}>
            <Text style={styles.profitResultLabel}>= Beneficio real</Text>
            <Text style={[styles.profitResult, !positive && styles.profitNeg]} testID="work-net-profit">
              {eur(o.beneficio_neto)}
            </Text>
          </View>
          <Text style={styles.profitMeta}>Margen {o.margen_pct}% · Materiales previstos {eur(o.coste_materiales_previsto, 0)}</Text>
          <View style={styles.cobros}>
            <Text style={styles.cobrosText} testID="work-collected">Cobrado {eur(o.cobrado)}</Text>
            <Text style={styles.cobrosText}>Pendiente {eur(o.pendiente_cobro)}</Text>
          </View>
          <PillButton label="Registrar cobro" icon="circle-dollar-sign" small onPress={() => setSheet("cobro")} testID="work-add-payment-button" />
        </View>

        <SectionTitle title="Estado y avance" />
        <Card style={styles.gap}>
          <View style={styles.chips}>
            {(Object.keys(ESTADOS_OBRA) as EstadoObra[]).map((e) => (
              <Chip key={e} label={ESTADOS_OBRA[e].label} selected={o.estado === e} onPress={() => o.estado !== e && patch.mutate({ estado: e })} testID={`work-set-${e}`} />
            ))}
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ProgressBar value={o.porcentaje_avance} testID="work-progress-bar" />
            </View>
            <Text style={styles.pct} testID="work-progress-value">{o.porcentaje_avance}%</Text>
          </View>
          <View style={styles.chips}>
            {[0, 25, 50, 75, 100].map((v) => (
              <Chip key={v} label={`${v}%`} selected={o.porcentaje_avance === v} onPress={() => patch.mutate({ porcentaje_avance: v })} testID={`work-progress-${v}`} />
            ))}
          </View>
        </Card>

        <SectionTitle title={`Trabajadores (${o.trabajadores.length})`} action="Asignar" onAction={() => setSheet("workers")} testID="work-assign-workers-button" />
        {o.trabajadores.length === 0 ? <Text style={styles.hint}>Sin trabajadores asignados.</Text> : null}
        {o.trabajadores.map((w) => (
          <Card key={w.id} style={styles.itemRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{w.nombre.slice(0, 1)}</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{w.nombre}</Text>
              <Text style={styles.hint}>{w.especialidad} · {eur(w.coste_hora_o_servicio, 0)}/{w.tipo_coste === "hora" ? "h" : "servicio"}</Text>
            </View>
            <IconButton icon="message-circle" bg={colors.successSoft} color={colors.info} label="Avisar por WhatsApp" testID={`work-worker-whatsapp-${w.id}`} onPress={() => Linking.openURL(waLink(w.telefono, `Hola ${w.nombre}, tienes asignada la obra ${o.numero_obra} "${o.titulo}" en ${o.direccion}. Inicio: ${fecha(o.fecha_inicio)}. — GM Conecta`))} />
          </Card>
        ))}

        <SectionTitle title="Materiales y compras" action="Añadir" onAction={() => setSheet("material")} testID="work-add-material-button" />
        {o.materiales.length === 0 ? <Text style={styles.hint}>Sin materiales.</Text> : null}
        {o.materiales.map((m) => (
          <Card
            key={m.id}
            onPress={() => {
              setMaterial(m);
              setSheet("compra");
            }}
            style={styles.gapSm}
            testID={`work-material-${m.id}`}
          >
            <View style={styles.rowBetween}>
              <Text style={styles.itemTitle} numberOfLines={2}>{m.concepto}</Text>
              <Badge label={m.comprado ? "Comprado" : "Pendiente"} tone={m.comprado ? "success" : "yellow"} />
            </View>
            <Text style={styles.hint}>
              {m.cantidad} {m.unidad} · Previsto {eur(m.cantidad * m.precio_previsto)} · Real {m.precio_real != null ? eur(m.cantidad * m.precio_real) : "—"}
            </Text>
            {m.proveedor ? <Text style={styles.hint}>Proveedor: {m.proveedor}{m.ticket_foto ? " · Ticket adjunto" : ""}</Text> : null}
          </Card>
        ))}

        <SectionTitle title="Mano de obra" action="Registrar" onAction={() => setSheet("mano")} testID="work-add-labor-button" />
        {o.mano_obra.length === 0 ? <Text style={styles.hint}>Sin horas registradas.</Text> : null}
        {o.mano_obra.map((l) => (
          <Card key={l.id} style={styles.itemRow}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{l.trabajador_nombre} · {eur(l.coste)}</Text>
              <Text style={styles.hint}>{l.concepto} · {l.horas} × {eur(l.coste_hora)} · {fecha(l.fecha)}</Text>
            </View>
            <IconButton icon="trash-2" bg={colors.errorSoft} color={colors.urgent} label="Eliminar" onPress={() => delMano.mutate(l.id)} testID={`work-labor-delete-${l.id}`} />
          </Card>
        ))}

        {o.cobros.length ? <SectionTitle title="Cobros registrados" /> : null}
        {o.cobros.map((c) => (
          <Card key={c.id} style={styles.itemRow}>
            <Icon name="circle-dollar-sign" size={20} color={colors.success} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{eur(c.importe)} + IVA {c.iva}%</Text>
              <Text style={styles.hint}>{c.numero_factura} · {fecha(c.fecha)}</Text>
            </View>
          </Card>
        ))}

        <SectionTitle title="Galería de la obra" />
        <Segmented options={FASES.map((f) => ({ value: f.key, label: `${f.label} (${o.fotos[f.key].length})` }))} value={fase} onChange={setFase} testIDPrefix="work-phase" />
        <Card>
          <PhotoGrid
            photos={o.fotos[fase]}
            testIDPrefix={`work-${fase}`}
            emptyText={`Sin fotos de la fase "${FASES.find((f) => f.key === fase)?.label}".`}
            onAdd={async (path) => onUpdated(await api.post<ObraDetalle>(`/admin/obras/${id}/fotos`, { fase, path }))}
          />
        </Card>

        <Field
          label="Notas internas"
          defaultValue={o.notas}
          multiline
          onEndEditing={(e) => e.nativeEvent.text !== o.notas && patch.mutate({ notas: e.nativeEvent.text })}
          testID="work-notes-input"
        />
      </KeyboardAwareScrollView>

      <MaterialSheet visible={sheet === "material"} onClose={() => setSheet(null)} obraId={o.id} onDone={(d) => { setSheet(null); onUpdated(d, "Material añadido"); }} />
      <CompraSheet visible={sheet === "compra"} material={material} onClose={() => setSheet(null)} obraId={o.id} onDone={(d, msg) => { setSheet(null); onUpdated(d, msg); }} />
      <ManoSheet visible={sheet === "mano"} onClose={() => setSheet(null)} obra={o} onDone={(d) => { setSheet(null); onUpdated(d, "Mano de obra registrada"); }} />
      <CobroSheet visible={sheet === "cobro"} onClose={() => setSheet(null)} obra={o} onDone={(d) => { setSheet(null); onUpdated(d, "Cobro registrado"); }} />
      <WorkersSheet visible={sheet === "workers"} onClose={() => setSheet(null)} selected={o.trabajadores_asignados} onSave={(ids) => { setSheet(null); patch.mutate({ trabajadores_asignados: ids }); }} />
    </View>
  );
}

function ProfitRow({ label, value, minus, testID }: { label: string; value: string; minus?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.rowBetween}>
      <Text style={styles.profitLabel}>{label}</Text>
      <Text style={[styles.profitValue, minus && styles.profitMinus]} testID={testID}>{value}</Text>
    </View>
  );
}

function MaterialSheet({ visible, onClose, obraId, onDone }: { visible: boolean; onClose: () => void; obraId: string; onDone: (d: ObraDetalle) => void }) {
  const styles = useStyles();
  const [concepto, setConcepto] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [unidad, setUnidad] = useState("ud");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => {
      if (concepto.trim().length < 1 || parseNum(cantidad) <= 0) throw new Error("Indica concepto y cantidad");
      return api.post<ObraDetalle>(`/admin/obras/${obraId}/materiales`, { concepto: concepto.trim(), cantidad: parseNum(cantidad), unidad: unidad.trim() || "ud", precio_previsto: parseNum(precio) });
    },
    onSuccess: (d) => {
      setConcepto("");
      setPrecio("");
      setCantidad("1");
      setError(null);
      onDone(d);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Añadir material" testID="material-sheet">
      <Field label="Concepto" value={concepto} onChangeText={setConcepto} placeholder="Ej. Saco de cemento cola" testID="material-concept-input" />
      <View style={styles.btnRow}>
        <View style={styles.flex}><Field label="Cantidad" value={cantidad} onChangeText={setCantidad} keyboardType="decimal-pad" testID="material-qty-input" /></View>
        <View style={styles.flex}><Field label="Unidad" value={unidad} onChangeText={setUnidad} testID="material-unit-input" /></View>
      </View>
      <Field label="Precio previsto por unidad (€)" value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" testID="material-price-input" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Añadir material" icon="plus" onPress={() => mut.mutate()} loading={mut.isPending} testID="material-submit-button" />
    </Sheet>
  );
}

function CompraSheet({ visible, material, onClose, obraId, onDone }: { visible: boolean; material: Material | null; onClose: () => void; obraId: string; onDone: (d: ObraDetalle, msg: string) => void }) {
  const styles = useStyles();
  const [precio, setPrecio] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  if (material && material.id !== lastId) {
    setLastId(material.id);
    setPrecio(material.precio_real != null ? String(material.precio_real) : String(material.precio_previsto));
    setProveedor(material.proveedor);
    setTicket(material.ticket_foto ?? null);
    setError(null);
  }
  const save = useMutation({
    mutationFn: (comprado: boolean) =>
      api.patch<ObraDetalle>(`/admin/obras/${obraId}/materiales/${material!.id}`, { comprado, precio_real: parseNum(precio), proveedor: proveedor.trim(), ticket_foto: ticket ?? "" }),
    onSuccess: (d, comprado) => onDone(d, comprado ? "Compra registrada (gasto de empresa)" : "Material marcado como pendiente"),
    onError: (e) => setError(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: () => api.del<ObraDetalle>(`/admin/obras/${obraId}/materiales/${material!.id}`),
    onSuccess: (d) => onDone(d, "Material eliminado"),
    onError: (e) => setError(errorMessage(e)),
  });
  if (!material) return null;
  return (
    <Sheet visible={visible} onClose={onClose} title={material.concepto} testID="purchase-sheet">
      <Text style={styles.hint}>
        {material.cantidad} {material.unidad} · Previsto {eur(material.precio_previsto)}/ud
      </Text>
      <Field label="Precio real por unidad (€)" value={precio} onChangeText={setPrecio} keyboardType="decimal-pad" testID="purchase-price-input" hint={`Total real: ${eur(material.cantidad * parseNum(precio))}`} />
      <Field label="Proveedor / ferretería" value={proveedor} onChangeText={setProveedor} placeholder="Ej. Suministros Alcalá" testID="purchase-supplier-input" />
      <PhotoField value={ticket} onChange={setTicket} testIDPrefix="purchase-ticket" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Registrar compra" icon="receipt" onPress={() => save.mutate(true)} loading={save.isPending} testID="purchase-submit-button" />
      {material.comprado ? <PillButton label="Marcar como pendiente" variant="outline" small onPress={() => save.mutate(false)} testID="purchase-unmark-button" /> : null}
      <PillButton label="Eliminar material" icon="trash-2" variant="dangerOutline" small onPress={() => del.mutate()} loading={del.isPending} testID="purchase-delete-button" />
    </Sheet>
  );
}

function ManoSheet({ visible, onClose, obra, onDone }: { visible: boolean; onClose: () => void; obra: ObraDetalle; onDone: (d: ObraDetalle) => void }) {
  const styles = useStyles();
  const [wid, setWid] = useState<string>("");
  const [concepto, setConcepto] = useState("");
  const [horas, setHoras] = useState("");
  const [error, setError] = useState<string | null>(null);
  const workers = useQuery({ queryKey: ["admin-trabajadores"], queryFn: () => api.get<Trabajador[]>("/admin/trabajadores"), enabled: visible });
  const w = workers.data?.find((x) => x.id === wid);
  const mut = useMutation({
    mutationFn: () => {
      if (!wid) throw new Error("Elige el trabajador");
      if (concepto.trim().length < 2 || parseNum(horas) <= 0) throw new Error("Indica concepto y horas / servicios");
      return api.post<ObraDetalle>(`/admin/obras/${obra.id}/mano-obra`, { trabajador_id: wid, concepto: concepto.trim(), horas: parseNum(horas) });
    },
    onSuccess: (d) => {
      setConcepto("");
      setHoras("");
      setError(null);
      onDone(d);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const list = (workers.data ?? []).sort((a, b) => Number(obra.trabajadores_asignados.includes(b.id)) - Number(obra.trabajadores_asignados.includes(a.id)));
  return (
    <Sheet visible={visible} onClose={onClose} title="Registrar mano de obra" testID="labor-sheet">
      <Text style={styles.label}>Trabajador</Text>
      <View style={styles.chips}>
        {list.map((x) => (
          <Chip key={x.id} label={x.nombre} selected={wid === x.id} onPress={() => setWid(x.id)} testID={`labor-worker-${x.codigo.toLowerCase()}`} />
        ))}
      </View>
      <Field label="Concepto" value={concepto} onChangeText={setConcepto} placeholder="Ej. Alicatado de paredes" testID="labor-concept-input" />
      <Field
        label={w?.tipo_coste === "servicio" ? "Nº de servicios" : "Horas"}
        value={horas}
        onChangeText={setHoras}
        keyboardType="decimal-pad"
        hint={w ? `Coste: ${eur(parseNum(horas) * w.coste_hora_o_servicio)} (${eur(w.coste_hora_o_servicio)}/${w.tipo_coste === "hora" ? "h" : "servicio"})` : undefined}
        testID="labor-hours-input"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Registrar" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="labor-submit-button" />
    </Sheet>
  );
}

function CobroSheet({ visible, onClose, obra, onDone }: { visible: boolean; onClose: () => void; obra: ObraDetalle; onDone: (d: ObraDetalle) => void }) {
  const styles = useStyles();
  const [importe, setImporte] = useState("");
  const [iva, setIva] = useState("21");
  const [concepto, setConcepto] = useState("Cobro de obra");
  const [error, setError] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: () => {
      if (parseNum(importe) <= 0) throw new Error("Indica el importe (sin IVA)");
      return api.post<ObraDetalle>(`/admin/obras/${obra.id}/cobros`, { importe: parseNum(importe), iva: parseNum(iva), concepto: concepto.trim() || "Cobro de obra" });
    },
    onSuccess: (d) => {
      setImporte("");
      setError(null);
      onDone(d);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Registrar cobro" testID="payment-sheet">
      <Text style={styles.hint}>Pendiente de cobro: {eur(obra.pendiente_cobro)} (sin IVA). Se generará una factura emitida.</Text>
      <View style={styles.chips}>
        {[0.5, 1].map((f) => (
          <Chip key={f} label={f === 1 ? "Todo lo pendiente" : "50% del presupuesto"} onPress={() => setImporte(String(Math.max(0, f === 1 ? obra.pendiente_cobro : obra.ingresos_totales * 0.5).toFixed(2)))} testID={`payment-quick-${f * 100}`} />
        ))}
      </View>
      <Field label="Importe base (€, sin IVA)" value={importe} onChangeText={setImporte} keyboardType="decimal-pad" testID="payment-amount-input" />
      <View style={styles.chips}>
        {["21", "10", "0"].map((v) => (
          <Chip key={v} label={`IVA ${v}%`} selected={iva === v} onPress={() => setIva(v)} testID={`payment-iva-${v}`} />
        ))}
      </View>
      <Field label="Concepto" value={concepto} onChangeText={setConcepto} testID="payment-concept-input" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Registrar cobro" icon="circle-dollar-sign" onPress={() => mut.mutate()} loading={mut.isPending} testID="payment-submit-button" />
    </Sheet>
  );
}

function WorkersSheet({ visible, onClose, selected, onSave }: { visible: boolean; onClose: () => void; selected: string[]; onSave: (ids: string[]) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [sel, setSel] = useState<string[]>(selected);
  const [open, setOpen] = useState(false);
  if (visible !== open) {
    setOpen(visible);
    if (visible) setSel(selected);
  }
  const workers = useQuery({ queryKey: ["admin-trabajadores"], queryFn: () => api.get<Trabajador[]>("/admin/trabajadores"), enabled: visible });
  return (
    <Sheet visible={visible} onClose={onClose} title="Asignar trabajadores" testID="assign-workers-sheet">
      {(workers.data ?? []).map((w) => {
        const on = sel.includes(w.id);
        return (
          <Pressable key={w.id} onPress={() => setSel((s) => (on ? s.filter((x) => x !== w.id) : [...s, w.id]))} style={[styles.workerOpt, on && styles.workerOptOn]} testID={`assign-worker-${w.codigo.toLowerCase()}`}>
            <Icon name={on ? "circle-check" : "user-round"} size={20} color={on ? colors.success : colors.brand} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{w.nombre}</Text>
              <Text style={styles.hint}>{w.especialidad} · {w.disponibilidad}</Text>
            </View>
          </Pressable>
        );
      })}
      <PillButton label="Guardar asignación" icon="check" onPress={() => onSave(sel)} testID="assign-workers-save-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  gap: { gap: 10 },
  gapSm: { gap: 4 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  btnRow: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  title: { fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep, flex: 1 },
  line: { fontFamily: fonts.body, fontSize: 14, color: c.textDark, flex: 1 },
  profit: { backgroundColor: c.brand, borderRadius: radius.xl, padding: 18, gap: 8 },
  profitTitle: { fontFamily: fonts.extraBoldItalic, fontSize: 17, color: c.brandPrimary, marginBottom: 2 },
  profitLabel: { fontFamily: fonts.body, fontSize: 14, color: c.onBrand, flex: 1 },
  profitValue: { fontFamily: fonts.bodyBold, fontSize: 15, color: c.onBrand },
  profitMinus: { color: c.pillBorder },
  profitDivider: { height: 1, backgroundColor: c.brandSecondary, marginVertical: 2 },
  profitResultLabel: { fontFamily: fonts.extraBold, fontSize: 16, color: c.onBrand },
  profitResult: { fontFamily: fonts.black, fontSize: 26, color: c.brandPrimary },
  profitNeg: { color: c.errorSoft },
  profitMeta: { fontFamily: fonts.body, fontSize: 12.5, color: c.pillBorder },
  cobros: { flexDirection: "row", justifyContent: "space-between", backgroundColor: c.brandTertiary, borderRadius: 12, padding: 10 },
  cobrosText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onBrand },
  pct: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.brandDeep },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted, lineHeight: 18 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  itemTitle: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: c.brandDeep, flexShrink: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.black, fontSize: 16, color: c.brandPrimary },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
  workerOpt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: c.border, minHeight: 56 },
  workerOptOn: { borderColor: c.success, backgroundColor: c.successSoft },
}));
