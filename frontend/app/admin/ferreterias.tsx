import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { eur, fecha, parseNum } from "@/src/lib/format";
import type { Derivacion, Ferreteria } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, EmptyState, ErrorView, Fab, Field, KpiCard, LoadingView, PillButton, Segmented } from "@/src/ui/kit";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

type PorFerreteria = {
  id: string;
  nombre: string;
  porcentaje_comision: number;
  pendiente: number;
  cobrada: number;
  tarifa_publicidad_mensual: number;
  anuncios_activos: number;
};
type DerivacionAdmin = Derivacion & { ferreteria_id: string; ferreteria_nombre: string };
type Comisiones = {
  pendientes: number;
  cobradas: number;
  publicidad_mensual: number;
  publicidad_anual_cobrada: number;
  por_ferreteria: PorFerreteria[];
  derivaciones: DerivacionAdmin[];
};
type Tab = "tiendas" | "derivaciones";

function useRefreshAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin-comisiones"] });
    qc.invalidateQueries({ queryKey: ["admin-ferreterias"] });
    qc.invalidateQueries({ queryKey: ["finanzas"] });
    qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    qc.invalidateQueries({ queryKey: ["ferreterias-public"] });
    qc.invalidateQueries({ queryKey: ["auth-options"] });
  };
}

export default function AdminFerreterias() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const refreshAll = useRefreshAll();
  const [tab, setTab] = useState<Tab>("tiendas");
  const [derivFor, setDerivFor] = useState<Ferreteria | null>(null);
  const [editFor, setEditFor] = useState<Ferreteria | null>(null);
  const [nueva, setNueva] = useState(false);
  const stores = useQuery({ queryKey: ["admin-ferreterias"], queryFn: () => api.get<Ferreteria[]>("/admin/ferreterias") });
  const com = useQuery({ queryKey: ["admin-comisiones"], queryFn: () => api.get<Comisiones>("/admin/comisiones") });

  const estado = useMutation({
    mutationFn: (d: DerivacionAdmin) => api.patch(`/admin/ferreterias/${d.ferreteria_id}/derivaciones/${d.id}`, { estado: "cobrada" }),
    onSuccess: () => {
      refreshAll();
      toast.show("Comisión cobrada: ingreso registrado en Empresa");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const publicidad = useMutation({
    mutationFn: (f: Ferreteria) => api.post(`/admin/ferreterias/${f.id}/publicidad`, {}),
    onSuccess: (_r, f) => {
      refreshAll();
      toast.show(`Cuota de publicidad de ${f.nombre} registrada`);
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const loading = stores.isLoading || com.isLoading;
  const failed = stores.isError || com.isError;
  const refetch = () => {
    void stores.refetch();
    void com.refetch();
  };
  const porId = new Map((com.data?.por_ferreteria ?? []).map((p) => [p.id, p]));

  return (
    <View style={styles.screen} testID="admin-stores-screen">
      <AppBar title="Ferreterías y comisiones" subtitle="Derivaciones, comisiones y publicidad" />
      {loading ? (
        <LoadingView />
      ) : failed || !com.data ? (
        <ErrorView message={errorMessage(stores.error ?? com.error)} onRetry={refetch} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={stores.isRefetching || com.isRefetching} onRefresh={refetch} tintColor={colors.brand} />}
        >
          <View style={styles.kpis}>
            <KpiCard label="Comisiones pendientes" value={eur(com.data.pendientes, 0)} icon="hourglass" tone="yellow" testID="stores-kpi-pending" />
            <KpiCard label="Comisiones cobradas" value={eur(com.data.cobradas, 0)} icon="circle-check" tone="success" testID="stores-kpi-collected" />
          </View>
          <View style={styles.kpis}>
            <KpiCard label="Publicidad / mes" value={eur(com.data.publicidad_mensual, 0)} icon="megaphone" tone="info" testID="stores-kpi-ads-month" />
            <KpiCard label="Publicidad cobrada (año)" value={eur(com.data.publicidad_anual_cobrada, 0)} icon="badge-euro" tone="navy" testID="stores-kpi-ads-year" />
          </View>

          <Segmented
            options={[
              { value: "tiendas", label: `Ferreterías (${stores.data?.length ?? 0})`, icon: "store" },
              { value: "derivaciones", label: `Derivaciones (${com.data.derivaciones.length})`, icon: "arrow-left-right" },
            ]}
            value={tab}
            onChange={setTab}
            testIDPrefix="stores-tab"
          />

          {tab === "tiendas"
            ? (stores.data ?? []).map((f) => {
                const p = porId.get(f.id);
                return (
                  <Card key={f.id} style={styles.card} testID={`admin-store-${(f.codigo ?? f.id).toLowerCase()}`}>
                    <View style={styles.rowBetween}>
                      <View style={styles.flex}>
                        <Text style={styles.name}>{f.nombre}</Text>
                        <Text style={styles.hint}>
                          {f.codigo} · {f.barrio || f.direccion}
                        </Text>
                      </View>
                      <Badge label={f.activa === false ? "Inactiva" : "Activa"} tone={f.activa === false ? "neutral" : "success"} />
                    </View>
                    <View style={styles.badges}>
                      <Badge label={`Comisión ${f.porcentaje_comision ?? 0}%`} tone="navy" />
                      <Badge label={`Publicidad ${eur(f.tarifa_publicidad_mensual ?? 0, 0)}/mes`} tone="info" />
                      <Badge label={`${p?.anuncios_activos ?? 0} promos activas`} tone="yellow" />
                    </View>
                    <View style={styles.money}>
                      <View style={styles.flex}>
                        <Text style={styles.moneyLabel}>Pendiente</Text>
                        <Text style={styles.moneyValue} testID={`admin-store-pending-${f.id}`}>{eur(p?.pendiente ?? 0)}</Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.moneyLabel}>Cobrado</Text>
                        <Text style={[styles.moneyValue, styles.ok]}>{eur(p?.cobrada ?? 0)}</Text>
                      </View>
                    </View>
                    <View style={styles.btnRow}>
                      <PillButton label="Derivar" icon="user-plus" small style={styles.flex} onPress={() => setDerivFor(f)} testID={`admin-store-referral-${f.id}`} />
                      <PillButton label="Condiciones" icon="settings" variant="ghost" small style={styles.flex} onPress={() => setEditFor(f)} testID={`admin-store-edit-${f.id}`} />
                    </View>
                    {f.tarifa_publicidad_mensual ? (
                      <PillButton
                        label={`Cobrar publicidad (${eur(f.tarifa_publicidad_mensual, 0)})`}
                        icon="badge-euro"
                        variant="outline"
                        small
                        loading={publicidad.isPending && publicidad.variables?.id === f.id}
                        onPress={() => publicidad.mutate(f)}
                        testID={`admin-store-charge-ads-${f.id}`}
                      />
                    ) : null}
                  </Card>
                );
              })
            : null}

          {tab === "derivaciones" ? (
            com.data.derivaciones.length === 0 ? (
              <Card>
                <EmptyState icon="arrow-left-right" title="Sin derivaciones" text="Registra los clientes que envías a cada ferretería para controlar tus comisiones." testID="referrals-empty" />
              </Card>
            ) : (
              com.data.derivaciones.map((d) => (
                <Card key={d.id} style={styles.card} testID={`referral-${d.id}`}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.name}>{d.cliente_nombre}</Text>
                    <Badge label={d.estado === "cobrada" ? "Cobrada" : "Pendiente"} tone={d.estado === "cobrada" ? "success" : "yellow"} testID={`referral-status-${d.id}`} />
                  </View>
                  <View style={styles.row}>
                    <Icon name="store" size={15} color={colors.brand} />
                    <Text style={styles.hint}>
                      {d.ferreteria_nombre} · {fecha(d.fecha)}
                    </Text>
                  </View>
                  {d.descripcion ? <Text style={styles.line}>{d.descripcion}</Text> : null}
                  <View style={styles.rowBetween}>
                    <Text style={styles.hint}>Compra {eur(d.importe_compra)}</Text>
                    <Text style={styles.comision}>Comisión {eur(d.comision)}</Text>
                  </View>
                  {d.estado === "pendiente" ? (
                    <PillButton
                      label="Marcar como cobrada"
                      icon="circle-dollar-sign"
                      variant="success"
                      small
                      loading={estado.isPending && estado.variables?.id === d.id}
                      onPress={() => estado.mutate(d)}
                      testID={`referral-toggle-${d.id}`}
                    />
                  ) : (
                    <Text style={styles.hint}>Facturada e incluida en los ingresos de Empresa.</Text>
                  )}
                </Card>
              ))
            )
          ) : null}
        </ScrollView>
      )}
      <Fab label="Nueva" icon="plus" onPress={() => setNueva(true)} testID="stores-new-button" bottom={insets.bottom + 16} />
      <DerivacionSheet store={derivFor} onClose={() => setDerivFor(null)} onDone={() => { setDerivFor(null); refreshAll(); toast.show("Derivación registrada"); }} />
      <CondicionesSheet store={editFor} onClose={() => setEditFor(null)} onDone={() => { setEditFor(null); refreshAll(); toast.show("Condiciones actualizadas"); }} />
      <NuevaFerreteriaSheet visible={nueva} onClose={() => setNueva(false)} onDone={(f) => { setNueva(false); refreshAll(); toast.show(`${f.nombre} añadida (${f.codigo})`); }} />
    </View>
  );
}

function DerivacionSheet({ store, onClose, onDone }: { store: Ferreteria | null; onClose: () => void; onDone: () => void }) {
  const styles = useStyles();
  const [cliente, setCliente] = useState("");
  const [desc, setDesc] = useState("");
  const [importe, setImporte] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pct = store?.porcentaje_comision ?? 0;
  const mut = useMutation({
    mutationFn: () => {
      if (cliente.trim().length < 2) throw new Error("Indica el nombre del cliente");
      if (parseNum(importe) <= 0) throw new Error("Indica el importe de la compra");
      return api.post(`/admin/ferreterias/${store!.id}/derivaciones`, { cliente_nombre: cliente.trim(), descripcion: desc.trim(), importe_compra: parseNum(importe) });
    },
    onSuccess: () => {
      setCliente("");
      setDesc("");
      setImporte("");
      setError(null);
      onDone();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={!!store} onClose={onClose} title={`Derivar cliente a ${store?.nombre ?? ""}`} testID="referral-sheet">
      <Field label="Cliente" value={cliente} onChangeText={setCliente} placeholder="Nombre del cliente" testID="referral-client-input" />
      <Field label="¿Qué compra?" value={desc} onChangeText={setDesc} placeholder="Ej. Grifería y plato de ducha" testID="referral-description-input" />
      <Field
        label="Importe de la compra (€)"
        value={importe}
        onChangeText={setImporte}
        keyboardType="decimal-pad"
        hint={`Comisión ${pct}% = ${eur((parseNum(importe) * pct) / 100)}`}
        testID="referral-amount-input"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Registrar derivación" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="referral-submit-button" />
    </Sheet>
  );
}

function CondicionesSheet({ store, onClose, onDone }: { store: Ferreteria | null; onClose: () => void; onDone: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [pct, setPct] = useState("");
  const [tarifa, setTarifa] = useState("");
  const [activa, setActiva] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if ((store?.id ?? null) !== loadedFor) {
    setLoadedFor(store?.id ?? null);
    if (store) {
      setPct(String(store.porcentaje_comision ?? 0));
      setTarifa(String(store.tarifa_publicidad_mensual ?? 0));
      setActiva(store.activa !== false);
      setError(null);
    }
  }
  const mut = useMutation({
    mutationFn: () => api.patch(`/admin/ferreterias/${store!.id}`, { porcentaje_comision: parseNum(pct), tarifa_publicidad_mensual: parseNum(tarifa), activa }),
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={!!store} onClose={onClose} title={`Condiciones · ${store?.nombre ?? ""}`} testID="store-conditions-sheet">
      <Field label="Comisión por cliente derivado (%)" value={pct} onChangeText={setPct} keyboardType="decimal-pad" testID="conditions-commission-input" />
      <Field label="Tarifa de publicidad mensual (€)" value={tarifa} onChangeText={setTarifa} keyboardType="decimal-pad" testID="conditions-ads-input" />
      <View style={styles.rowBetween}>
        <Text style={styles.name}>Visible en el directorio</Text>
        <Switch value={activa} onValueChange={setActiva} trackColor={{ false: colors.border, true: colors.success }} thumbColor={colors.surface} testID="conditions-active-switch" />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Guardar" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="conditions-submit-button" />
    </Sheet>
  );
}

const EMPTY = { nombre: "", direccion: "", barrio: "", telefono: "", horario: "", descripcion: "", comision: "5", tarifa: "0", pin: "" };

function NuevaFerreteriaSheet({ visible, onClose, onDone }: { visible: boolean; onClose: () => void; onDone: (f: Ferreteria) => void }) {
  const styles = useStyles();
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const mut = useMutation({
    mutationFn: () => {
      if (f.nombre.trim().length < 2 || f.direccion.trim().length < 3) throw new Error("Indica nombre y dirección");
      if (!/^\d{6}$/.test(f.pin)) throw new Error("El PIN debe tener exactamente 6 cifras");
      return api.post<Ferreteria>("/admin/ferreterias", {
        nombre: f.nombre.trim(),
        direccion: f.direccion.trim(),
        barrio: f.barrio.trim(),
        telefono: f.telefono.trim(),
        horario: f.horario.trim(),
        descripcion: f.descripcion.trim(),
        porcentaje_comision: parseNum(f.comision),
        tarifa_publicidad_mensual: parseNum(f.tarifa),
        pin: f.pin,
      });
    },
    onSuccess: (store) => {
      setF(EMPTY);
      setError(null);
      onDone(store);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Nueva ferretería colaboradora" testID="new-store-sheet">
      <Field label="Nombre" value={f.nombre} onChangeText={set("nombre")} testID="new-store-name-input" />
      <Field label="Dirección" value={f.direccion} onChangeText={set("direccion")} testID="new-store-address-input" />
      <Field label="Barrio" value={f.barrio} onChangeText={set("barrio")} testID="new-store-district-input" />
      <Field label="Teléfono" value={f.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" testID="new-store-phone-input" />
      <Field label="Horario" value={f.horario} onChangeText={set("horario")} testID="new-store-hours-input" />
      <Field label="Descripción" value={f.descripcion} onChangeText={set("descripcion")} multiline testID="new-store-description-input" />
      <View style={styles.btnRow}>
        <View style={styles.flex}>
          <Field label="Comisión (%)" value={f.comision} onChangeText={set("comision")} keyboardType="decimal-pad" testID="new-store-commission-input" />
        </View>
        <View style={styles.flex}>
          <Field label="Publicidad €/mes" value={f.tarifa} onChangeText={set("tarifa")} keyboardType="decimal-pad" testID="new-store-ads-input" />
        </View>
      </View>
      <Field
        label="PIN de acceso (6 cifras, modo Ferretería)"
        value={f.pin}
        onChangeText={(t) => set("pin")(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        placeholder="••••••"
        hint="Sin secuencias (123456) ni repeticiones (111111)."
        testID="new-store-pin-input"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Guardar ferretería" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="new-store-submit-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  kpis: { flexDirection: "row", gap: 10 },
  card: { gap: 10 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  btnRow: { flexDirection: "row", gap: 10 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  name: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep, flexShrink: 1 },
  hint: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  line: { fontFamily: fonts.body, fontSize: 14, color: c.textDark },
  money: { flexDirection: "row", gap: 10, backgroundColor: c.infoCard, borderRadius: 14, padding: 12 },
  moneyLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: c.muted },
  moneyValue: { fontFamily: fonts.black, fontSize: 18, color: c.brandDeep },
  ok: { color: c.info },
  comision: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.brandDeep },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
}));
