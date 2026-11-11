import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { FlatList, Linking, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/lib/api";
import { DISPONIBILIDAD } from "@/src/lib/constants";
import { eur, formatPhone, parseNum, telLink, waLink } from "@/src/lib/format";
import type { Trabajador } from "@/src/lib/types";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Badge, Card, Chip, EmptyState, ErrorView, Fab, Field, IconButton, LoadingView, PillButton } from "@/src/ui/kit";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

const ORDEN: Trabajador["disponibilidad"][] = ["disponible", "ocupado", "vacaciones"];

export default function AdminTrabajadores() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["admin-trabajadores"], queryFn: () => api.get<Trabajador[]>("/admin/trabajadores") });

  const disp = useMutation({
    mutationFn: (w: Trabajador) => api.patch(`/admin/trabajadores/${w.id}`, { disponibilidad: ORDEN[(ORDEN.indexOf(w.disponibilidad) + 1) % ORDEN.length] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-trabajadores"] });
      toast.show("Disponibilidad actualizada");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  return (
    <View style={styles.screen} testID="admin-workers-screen">
      <AppBar title="Trabajadores" subtitle="Personal y colaboradores" />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : (
        <FlatList
          data={q.data ?? []}
          keyExtractor={(w) => w.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
          ListEmptyComponent={<EmptyState icon="users" title="Sin trabajadores" />}
          renderItem={({ item: w }) => (
            <Card style={styles.card} testID={`worker-card-${w.codigo.toLowerCase()}`}>
              <View style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{w.nombre.slice(0, 1)}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.name}>{w.nombre}</Text>
                  <Text style={styles.meta}>
                    {w.especialidad} · {w.codigo}
                  </Text>
                </View>
                <Chip label={DISPONIBILIDAD[w.disponibilidad].label} selected={w.disponibilidad === "disponible"} onPress={() => disp.mutate(w)} testID={`worker-availability-${w.codigo.toLowerCase()}`} />
              </View>
              <View style={styles.row}>
                <Badge label={`${eur(w.coste_hora_o_servicio, 0)}/${w.tipo_coste === "hora" ? "hora" : "servicio"}`} tone="info" />
                <Badge label={`${w.obras_activas} obras activas`} tone={w.obras_activas ? "warning" : "neutral"} />
              </View>
              <View style={styles.row}>
                <Text style={[styles.meta, styles.flex]}>{formatPhone(w.telefono)}</Text>
                <IconButton icon="phone" bg={colors.successSoft} color={colors.call} label="Llamar" onPress={() => Linking.openURL(telLink(w.telefono))} testID={`worker-call-${w.codigo.toLowerCase()}`} />
                <IconButton icon="message-circle" bg={colors.successSoft} color={colors.info} label="WhatsApp" onPress={() => Linking.openURL(waLink(w.telefono, `Hola ${w.nombre}, te escribimos de GM Conecta. `))} testID={`worker-whatsapp-${w.codigo.toLowerCase()}`} />
              </View>
            </Card>
          )}
        />
      )}
      <Fab label="Nuevo" icon="plus" onPress={() => setOpen(true)} testID="workers-new-button" bottom={insets.bottom + 16} />
      <NuevoTrabajador visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

function NuevoTrabajador({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState({ nombre: "", especialidad: "", telefono: "", coste: "", pin: "" });
  const [tipo, setTipo] = useState<"hora" | "servicio">("hora");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const mut = useMutation({
    mutationFn: () => {
      if (f.nombre.trim().length < 2 || f.especialidad.trim().length < 2) throw new Error("Indica nombre y especialidad");
      if (f.telefono.replace(/\D/g, "").length < 9) throw new Error("Teléfono no válido");
      if (!/^\d{6}$/.test(f.pin)) throw new Error("El PIN debe tener exactamente 6 cifras");
      return api.post<Trabajador>("/admin/trabajadores", {
        nombre: f.nombre.trim(),
        especialidad: f.especialidad.trim(),
        telefono: f.telefono.trim(),
        coste_hora_o_servicio: parseNum(f.coste),
        tipo_coste: tipo,
        pin: f.pin,
      });
    },
    onSuccess: (w) => {
      qc.invalidateQueries({ queryKey: ["admin-trabajadores"] });
      qc.invalidateQueries({ queryKey: ["auth-options"] });
      toast.show(`${w.nombre} añadido (${w.codigo})`);
      setF({ nombre: "", especialidad: "", telefono: "", coste: "", pin: "" });
      setError(null);
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Nuevo trabajador" testID="new-worker-sheet">
      <Field label="Nombre" value={f.nombre} onChangeText={set("nombre")} testID="new-worker-name-input" />
      <Field label="Profesión / especialidad" value={f.especialidad} onChangeText={set("especialidad")} placeholder="Fontanería, electricidad…" testID="new-worker-specialty-input" />
      <Field label="Teléfono" value={f.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" testID="new-worker-phone-input" />
      <View style={styles.rowWrap}>
        <Chip label="Por hora" selected={tipo === "hora"} onPress={() => setTipo("hora")} testID="new-worker-type-hour" />
        <Chip label="Por servicio" selected={tipo === "servicio"} onPress={() => setTipo("servicio")} testID="new-worker-type-service" />
      </View>
      <Field label={`Coste por ${tipo} (€)`} value={f.coste} onChangeText={set("coste")} keyboardType="decimal-pad" testID="new-worker-cost-input" />
      <Field
        label="PIN de acceso (6 cifras, modo Trabajador)"
        value={f.pin}
        onChangeText={(t) => set("pin")(t.replace(/\D/g, "").slice(0, 6))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={6}
        placeholder="••••••"
        hint="Sin secuencias (123456) ni repeticiones (111111)."
        testID="new-worker-pin-input"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Guardar trabajador" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="new-worker-submit-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  list: { padding: 16, gap: 10 },
  card: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowWrap: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.black, fontSize: 18, color: c.brandPrimary },
  name: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  meta: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
}));
