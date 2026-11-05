import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { TIPOS_RECORDATORIO } from "@/src/lib/constants";
import { DIAS_CORTOS, eur, fecha, isValidDateStr, MESES_LARGOS, pad2, parseNum, toDateStr, todayStr } from "@/src/lib/format";
import type { Ambito, Recordatorio } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, ErrorView, Fab, Field, IconButton, LoadingView, PillButton, SectionTitle } from "@/src/ui/kit";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

export default function AdminAgenda() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState(todayStr());
  const [open, setOpen] = useState(false);
  const desde = `${ym.y}-${pad2(ym.m + 1)}-01`;
  const hasta = toDateStr(new Date(ym.y, ym.m + 1, 0));
  const q = useQuery({ queryKey: ["agenda", desde], queryFn: () => api.get<Recordatorio[]>(`/admin/recordatorios?desde=${desde}&hasta=${hasta}`) });

  const toggle = useMutation({
    mutationFn: (r: Recordatorio) => api.patch(`/admin/recordatorios/${r.id}`, { completado: !r.completado }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agenda"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["finanzas"] });
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/recordatorios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agenda"] });
      toast.show("Recordatorio eliminado");
    },
  });

  const byDay = useMemo(() => {
    const map: Record<string, Recordatorio[]> = {};
    (q.data ?? []).forEach((r) => (map[r.fecha] = [...(map[r.fecha] ?? []), r]));
    return map;
  }, [q.data]);

  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: days }, (_, i) => `${ym.y}-${pad2(ym.m + 1)}-${pad2(i + 1)}`)];
  const shift = (d: number) => setYm(({ y, m }) => ({ y: m + d < 0 ? y - 1 : m + d > 11 ? y + 1 : y, m: (m + d + 12) % 12 }));
  const dayItems = byDay[selected] ?? [];
  const pendientes = (q.data ?? []).filter((r) => !r.completado && r.fecha >= todayStr());

  return (
    <View style={styles.screen} testID="admin-agenda-screen">
      <AppBar title="Agenda" subtitle="Visitas, obras, cobros y pagos" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}>
        <Card style={styles.gap}>
          <View style={styles.monthRow}>
            <IconButton icon="chevron-left" onPress={() => shift(-1)} testID="agenda-prev-month" label="Mes anterior" />
            <Text style={styles.month} testID="agenda-month-label">{MESES_LARGOS[ym.m]} {ym.y}</Text>
            <IconButton icon="chevron-right" onPress={() => shift(1)} testID="agenda-next-month" label="Mes siguiente" />
          </View>
          <View style={styles.week}>
            {DIAS_CORTOS.map((d) => (
              <Text key={d} style={styles.weekDay}>{d}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((c, i) => {
              if (!c) return <View key={`e${i}`} style={styles.cell} />;
              const items = byDay[c] ?? [];
              const sel = c === selected;
              const today = c === todayStr();
              return (
                <Pressable key={c} onPress={() => setSelected(c)} style={styles.cell} testID={`agenda-day-${c}`}>
                  <View style={[styles.dayCircle, today && styles.dayToday, sel && styles.daySelected]}>
                    <Text style={[styles.dayText, sel && styles.dayTextSel]}>{Number(c.slice(8))}</Text>
                  </View>
                  <View style={styles.dots}>
                    {items.slice(0, 3).map((r) => (
                      <View key={r.id} style={[styles.dot, { backgroundColor: r.tipo === "pago" ? colors.urgent : r.tipo === "cobro" ? colors.success : r.tipo === "obra" ? colors.renovation : colors.brandSecondary }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <SectionTitle title={fecha(selected)} />
        {q.isLoading ? <LoadingView /> : q.isError ? <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} /> : null}
        {!q.isLoading && dayItems.length === 0 ? <Text style={styles.hint}>Nada programado este día.</Text> : null}
        {dayItems.map((r) => (
          <ReminderRow key={r.id} r={r} onToggle={() => toggle.mutate(r)} onDelete={() => del.mutate(r.id)} />
        ))}

        <SectionTitle title={`Pendientes del mes (${pendientes.length})`} />
        {pendientes.map((r) => (
          <ReminderRow key={r.id} r={r} onToggle={() => toggle.mutate(r)} onDelete={() => del.mutate(r.id)} showDate />
        ))}
      </ScrollView>
      <Fab label="Recordatorio" icon="plus" onPress={() => setOpen(true)} testID="agenda-new-button" bottom={insets.bottom + 16} />
      <NuevoRecordatorio visible={open} onClose={() => setOpen(false)} defaultDate={selected} />
    </View>
  );
}

function ReminderRow({ r, onToggle, onDelete, showDate }: { r: Recordatorio; onToggle: () => void; onDelete: () => void; showDate?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = TIPOS_RECORDATORIO[r.tipo];
  return (
    <Card style={styles.row} testID={`reminder-${r.id}`}>
      <Pressable onPress={onToggle} hitSlop={8} testID={`reminder-toggle-${r.id}`} accessibilityLabel="Marcar como hecho">
        <Icon name={r.completado ? "circle-check" : "clock"} size={24} color={r.completado ? colors.success : colors.muted} />
      </Pressable>
      <View style={styles.flex}>
        <Text style={[styles.title, r.completado && styles.done]}>{r.titulo}</Text>
        <Text style={styles.hint}>
          {showDate ? `${fecha(r.fecha)} · ` : ""}
          {r.hora ? `${r.hora} · ` : ""}
          {r.ambito === "PERSONAL_HOGAR" ? "Hogar" : "Empresa"}
          {r.importe ? ` · ${eur(r.importe)}` : ""}
        </Text>
        {r.descripcion ? <Text style={styles.hint}>{r.descripcion}</Text> : null}
      </View>
      <Badge label={t.label} tone={t.tone} />
      <Pressable onPress={onDelete} hitSlop={8} testID={`reminder-delete-${r.id}`} accessibilityLabel="Eliminar">
        <Icon name="trash-2" size={18} color={colors.muted} />
      </Pressable>
    </Card>
  );
}

function NuevoRecordatorio({ visible, onClose, defaultDate }: { visible: boolean; onClose: () => void; defaultDate: string }) {
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<Recordatorio["tipo"]>("visita");
  const [ambito, setAmbito] = useState<Ambito>("EMPRESA");
  const [fechaR, setFechaR] = useState(defaultDate);
  const [hora, setHora] = useState("");
  const [importe, setImporte] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (visible !== wasOpen) {
    setWasOpen(visible);
    if (visible) setFechaR(defaultDate);
  }
  const mut = useMutation({
    mutationFn: () => {
      if (titulo.trim().length < 2) throw new Error("Indica un título");
      if (!isValidDateStr(fechaR)) throw new Error("Fecha con formato AAAA-MM-DD");
      if (hora && !/^\d{2}:\d{2}$/.test(hora)) throw new Error("Hora con formato HH:MM");
      return api.post("/admin/recordatorios", { titulo: titulo.trim(), tipo, ambito, fecha: fechaR, hora: hora || null, importe: importe ? parseNum(importe) : null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agenda"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      qc.invalidateQueries({ queryKey: ["finanzas"] });
      toast.show("Recordatorio creado");
      setTitulo("");
      setHora("");
      setImporte("");
      setError(null);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Nuevo recordatorio" testID="reminder-sheet">
      <Field label="Título" value={titulo} onChangeText={setTitulo} placeholder="Ej. Visita técnica en Chamberí" testID="reminder-title-input" />
      <Text style={styles.label}>Tipo</Text>
      <View style={styles.chips}>
        {(Object.keys(TIPOS_RECORDATORIO) as Recordatorio["tipo"][]).map((t) => (
          <Chip key={t} label={TIPOS_RECORDATORIO[t].label} icon={TIPOS_RECORDATORIO[t].icon} selected={tipo === t} onPress={() => setTipo(t)} testID={`reminder-type-${t}`} />
        ))}
      </View>
      <View style={styles.chips}>
        <Chip label="Empresa" selected={ambito === "EMPRESA"} onPress={() => setAmbito("EMPRESA")} testID="reminder-scope-empresa" />
        <Chip label="Personal / Hogar" selected={ambito === "PERSONAL_HOGAR"} onPress={() => setAmbito("PERSONAL_HOGAR")} testID="reminder-scope-hogar" />
      </View>
      <View style={styles.inputs}>
        <View style={styles.flex}><Field label="Fecha" value={fechaR} onChangeText={setFechaR} testID="reminder-date-input" /></View>
        <View style={styles.flex}><Field label="Hora (opcional)" value={hora} onChangeText={setHora} placeholder="10:00" testID="reminder-time-input" /></View>
      </View>
      {tipo === "pago" || tipo === "cobro" || tipo === "factura" ? (
        <Field label="Importe (€)" value={importe} onChangeText={setImporte} keyboardType="decimal-pad" testID="reminder-amount-input" />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Guardar" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="reminder-submit-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 10 },
  gap: { gap: 8 },
  flex: { flex: 1 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  month: { fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep, textTransform: "capitalize" },
  week: { flexDirection: "row" },
  weekDay: { width: `${100 / 7}%`, textAlign: "center", fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: 50, alignItems: "center", justifyContent: "flex-start", paddingTop: 2 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dayToday: { borderWidth: 2, borderColor: c.brandPrimary },
  daySelected: { backgroundColor: c.brand, borderColor: c.brand },
  dayText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  dayTextSel: { color: c.onBrand },
  dots: { flexDirection: "row", gap: 2, marginTop: 2, height: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderRadius: radius.lg },
  title: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  done: { textDecorationLine: "line-through", color: c.muted },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  inputs: { flexDirection: "row", gap: 10 },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
}));
