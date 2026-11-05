import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { CATEGORIAS_MOV } from "@/src/lib/constants";
import { eur, fecha, isValidDateStr, parseNum, todayStr } from "@/src/lib/format";
import type { Ambito, Movimiento, Obra, Recordatorio, TipoMov } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BarChart, CategoryBars } from "@/src/ui/BarChart";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Card, Chip, ErrorView, Fab, Field, KpiCard, LoadingView, PillButton, SectionTitle, Segmented } from "@/src/ui/kit";
import { PhotoField } from "@/src/ui/PhotoGrid";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

type Resumen = {
  kpis: { saldo_disponible: number; ingresos_mes: number; gastos_mes: number; beneficio: number; rentabilidad_pct: number; iva_repercutido_mes: number; iva_soportado_mes: number };
  serie: { label: string; ingresos: number; gastos: number }[];
  categorias: { categoria: string; total: number; pct: number }[];
  ultimos: Movimiento[];
  proximos_pagos: Recordatorio[];
};
type Periodo = "diario" | "semanal" | "mensual" | "anual";

export default function AdminFinanzas() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [ambito, setAmbito] = useState<Ambito>("EMPRESA");
  const [periodo, setPeriodo] = useState<Periodo>("mensual");
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["finanzas", ambito, periodo], queryFn: () => api.get<Resumen>(`/admin/finanzas/resumen?ambito=${ambito}&periodo=${periodo}`) });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/movimientos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finanzas"] });
      toast.show("Movimiento eliminado");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  const empresa = ambito === "EMPRESA";
  const k = q.data?.kpis;

  return (
    <View style={styles.screen} testID="admin-finance-screen">
      <AppBar title="Panel financiero" subtitle={empresa ? "GM Reforma Express" : "Personal / Hogar"} />
      <View style={styles.segWrap}>
        <Segmented
          options={[
            { value: "EMPRESA", label: "Empresa", icon: "building-2" },
            { value: "PERSONAL_HOGAR", label: "Personal / Hogar", icon: "house" },
          ]}
          value={ambito}
          onChange={(v) => setAmbito(v as Ambito)}
          testIDPrefix="finance-scope"
        />
      </View>
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError || !k ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}>
          <View style={[styles.balance, !empresa && styles.balanceHome]} testID="finance-balance-card">
            <Text style={styles.balanceLabel}>{empresa ? "Saldo disponible empresa" : "Saldo disponible hogar"}</Text>
            <Text style={styles.balanceValue} testID="finance-balance-value">{eur(k.saldo_disponible)}</Text>
            <Text style={styles.balanceSub}>
              {empresa ? "Los gastos del hogar nunca afectan a la rentabilidad de la empresa." : "Separado de la contabilidad de GM Reforma Express."}
            </Text>
          </View>
          <View style={styles.kpis}>
            <KpiCard label="Ingresos del mes" value={eur(k.ingresos_mes, 0)} icon="trending-up" tone="success" testID="finance-kpi-income" />
            <KpiCard label="Gastos del mes" value={eur(k.gastos_mes, 0)} icon="trending-down" tone="error" testID="finance-kpi-expenses" />
            <KpiCard label={empresa ? "Beneficio empresarial" : "Ahorro del mes"} value={eur(k.beneficio, 0)} icon="piggy-bank" tone="navy" testID="finance-kpi-profit" />
            <KpiCard label={empresa ? "Rentabilidad" : "Tasa de ahorro"} value={`${k.rentabilidad_pct}%`} icon="percent" tone="yellow" testID="finance-kpi-margin" />
          </View>
          {empresa ? (
            <Card tone="blue" style={styles.ivaCard}>
              <Icon name="landmark" size={18} color={colors.brandDeep} />
              <Text style={styles.ivaText}>IVA del mes · repercutido {eur(k.iva_repercutido_mes, 0)} · soportado {eur(k.iva_soportado_mes, 0)}</Text>
            </Card>
          ) : null}

          <SectionTitle title="Evolución" />
          <Card style={styles.gap}>
            <View style={styles.chips}>
              {(["diario", "semanal", "mensual", "anual"] as Periodo[]).map((p) => (
                <Chip key={p} label={p[0].toUpperCase() + p.slice(1)} selected={periodo === p} onPress={() => setPeriodo(p)} testID={`finance-period-${p}`} />
              ))}
            </View>
            <BarChart data={q.data!.serie} />
          </Card>

          <SectionTitle title="Gastos por categoría (mes)" />
          <Card>{q.data!.categorias.length ? <CategoryBars items={q.data!.categorias} /> : <Text style={styles.hint}>Sin gastos este mes.</Text>}</Card>

          <SectionTitle title="Próximos pagos" />
          {q.data!.proximos_pagos.length === 0 ? <Text style={styles.hint}>Sin pagos programados.</Text> : null}
          {q.data!.proximos_pagos.map((r) => (
            <Card key={r.id} tone="yellow" style={styles.rowCard}>
              <Icon name="wallet" size={18} color={colors.urgent} />
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{r.titulo}</Text>
                <Text style={styles.hint}>{fecha(r.fecha)}</Text>
              </View>
              {r.importe ? <Text style={styles.amountNeg}>{eur(r.importe)}</Text> : null}
            </Card>
          ))}

          <SectionTitle title="Últimos movimientos" />
          {q.data!.ultimos.map((m) => (
            <Pressable key={m.id} onLongPress={() => del.mutate(m.id)} delayLongPress={600} testID={`finance-mov-${m.id}`}>
              <Card style={styles.rowCard}>
                <View style={[styles.movIcon, m.tipo === "INGRESO" ? styles.movIn : styles.movOut]}>
                  <Icon name={m.tipo === "INGRESO" ? "trending-up" : "trending-down"} size={16} color={m.tipo === "INGRESO" ? colors.info : colors.urgent} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{m.concepto}</Text>
                  <Text style={styles.hint} numberOfLines={1}>{m.categoria} · {fecha(m.fecha)}{m.foto_ticket_factura ? " · 📎" : ""}</Text>
                </View>
                <Text style={m.tipo === "INGRESO" ? styles.amountPos : styles.amountNeg}>{m.tipo === "INGRESO" ? "+" : "−"}{eur(m.total)}</Text>
              </Card>
            </Pressable>
          ))}
          <Text style={styles.hint}>Mantén pulsado un movimiento manual para eliminarlo.</Text>
        </ScrollView>
      )}
      <Fab label="Movimiento" icon="plus" onPress={() => setOpen(true)} testID="finance-new-movement-button" bottom={insets.bottom + 16} />
      <MovimientoSheet visible={open} ambito={ambito} onClose={() => setOpen(false)} />
    </View>
  );
}

function MovimientoSheet({ visible, ambito, onClose }: { visible: boolean; ambito: Ambito; onClose: () => void }) {
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<TipoMov>("GASTO");
  const [categoria, setCategoria] = useState("");
  const [concepto, setConcepto] = useState("");
  const [importe, setImporte] = useState("");
  const [iva, setIva] = useState(ambito === "EMPRESA" ? "21" : "0");
  const [fechaMov, setFechaMov] = useState(todayStr());
  const [obraId, setObraId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAmbito, setLastAmbito] = useState(ambito);
  if (lastAmbito !== ambito) {
    setLastAmbito(ambito);
    setCategoria("");
    setObraId(null);
    setIva(ambito === "EMPRESA" ? "21" : "0");
  }
  const obras = useQuery({ queryKey: ["admin-obras", ""], queryFn: () => api.get<Obra[]>("/admin/obras"), enabled: visible && ambito === "EMPRESA" });
  const cats = CATEGORIAS_MOV[ambito][tipo];
  const mut = useMutation({
    mutationFn: () => {
      if (!categoria) throw new Error("Elige una categoría");
      if (concepto.trim().length < 2) throw new Error("Indica el concepto");
      if (parseNum(importe) <= 0) throw new Error("Indica el importe");
      if (!isValidDateStr(fechaMov)) throw new Error("Fecha con formato AAAA-MM-DD");
      return api.post<Movimiento>("/admin/movimientos", {
        tipo,
        ambito,
        categoria,
        concepto: concepto.trim(),
        importe: parseNum(importe),
        iva: parseNum(iva),
        fecha: fechaMov,
        obra_id: ambito === "EMPRESA" ? obraId : null,
        foto_ticket_factura: ticket,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finanzas"] });
      qc.invalidateQueries({ queryKey: ["gestoria"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      toast.show("Movimiento registrado");
      setConcepto("");
      setImporte("");
      setTicket(null);
      setError(null);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={`Nuevo movimiento · ${ambito === "EMPRESA" ? "Empresa" : "Personal / Hogar"}`} testID="movement-sheet">
      <Segmented
        options={[
          { value: "GASTO", label: "Gasto", icon: "trending-down" },
          { value: "INGRESO", label: "Ingreso", icon: "trending-up" },
        ]}
        value={tipo}
        onChange={(v) => {
          setTipo(v as TipoMov);
          setCategoria("");
        }}
        testIDPrefix="movement-type"
      />
      <Text style={styles.label}>Categoría</Text>
      <View style={styles.chips}>
        {cats.map((c) => (
          <Chip key={c} label={c} selected={categoria === c} onPress={() => setCategoria(c)} testID={`movement-category-${c.split(" ")[0].toLowerCase()}`} />
        ))}
      </View>
      <Field label="Concepto" value={concepto} onChangeText={setConcepto} testID="movement-concept-input" />
      <View style={styles.rowInputs}>
        <View style={styles.flex}>
          <Field label="Importe base (€)" value={importe} onChangeText={setImporte} keyboardType="decimal-pad" testID="movement-amount-input" />
        </View>
        <View style={styles.flex}>
          <Field label="IVA (%)" value={iva} onChangeText={setIva} keyboardType="decimal-pad" testID="movement-iva-input" />
        </View>
      </View>
      <Field label="Fecha (AAAA-MM-DD)" value={fechaMov} onChangeText={setFechaMov} testID="movement-date-input" />
      {ambito === "EMPRESA" ? (
        <>
          <Text style={styles.label}>Asociar a obra (opcional)</Text>
          <View style={styles.chips}>
            <Chip label="Ninguna" selected={!obraId} onPress={() => setObraId(null)} testID="movement-work-none" />
            {(obras.data ?? []).map((o) => (
              <Chip key={o.id} label={o.numero_obra} selected={obraId === o.id} onPress={() => setObraId(o.id)} testID={`movement-work-${o.numero_obra}`} />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.hint}>Los movimientos del hogar no se asocian a obras ni afectan al beneficio de la empresa.</Text>
      )}
      <PhotoField value={ticket} onChange={setTicket} testIDPrefix="movement-ticket" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Guardar movimiento" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="movement-submit-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  segWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  content: { padding: 16, gap: 12 },
  gap: { gap: 12 },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  rowInputs: { flexDirection: "row", gap: 10 },
  balance: { backgroundColor: c.brand, borderRadius: radius.xxl, padding: 20, gap: 4 },
  balanceHome: { backgroundColor: c.renovation },
  balanceLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onBrand, opacity: 0.85 },
  balanceValue: { fontFamily: fonts.black, fontSize: 32, color: c.brandPrimary },
  balanceSub: { fontFamily: fonts.body, fontSize: 12.5, color: c.onBrand, lineHeight: 18 },
  kpis: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ivaCard: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  ivaText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, color: c.brandDeep },
  rowCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  movIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  movIn: { backgroundColor: c.successSoft },
  movOut: { backgroundColor: c.errorSoft },
  itemTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted },
  amountPos: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.info },
  amountNeg: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.urgent },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
}));
