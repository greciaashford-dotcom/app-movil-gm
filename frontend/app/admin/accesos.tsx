import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ROLE_LABELS, StaffRole } from "@/src/auth";
import { api, errorMessage } from "@/src/lib/api";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon, IconName } from "@/src/ui/Icon";
import { Badge, Card, ErrorView, Field, LoadingView, PillButton, SectionTitle } from "@/src/ui/kit";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

type Acceso = {
  id: string;
  role: StaffRole;
  code: string;
  display_name: string;
  account_email: string;
  vinculado: boolean;
  pin_reset_required: boolean;
};

const ROLES: StaffRole[] = ["admin", "trabajador", "ferreteria"];
const ROLE_ICON: Record<StaffRole, IconName> = { admin: "layout-dashboard", trabajador: "hard-hat", ferreteria: "store" };
const SECTION: Record<StaffRole, string> = { admin: "Administración", trabajador: "Trabajadores", ferreteria: "Ferreterías" };

export default function AdminAccesos() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [pinFor, setPinFor] = useState<Acceso | null>(null);
  const [unlinkFor, setUnlinkFor] = useState<Acceso | null>(null);
  const q = useQuery({ queryKey: ["admin-accesos"], queryFn: () => api.get<Acceso[]>("/admin/accesos") });

  return (
    <View style={styles.screen} testID="admin-access-screen">
      <AppBar title="Accesos y PIN" subtitle="Cuentas vinculadas y PIN de 6 cifras" />
      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <ErrorView message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
        >
          <Card tone="blue" style={styles.intro}>
            <Icon name="shield-check" size={22} color={colors.brandSecondary} />
            <Text style={styles.introText}>
              Cada perfil se vincula a la cuenta (correo o Google) que entra por primera vez con su PIN. Desvincúlalo si esa persona cambia de cuenta o deja de trabajar con vosotros.
            </Text>
          </Card>
          {ROLES.map((r) => {
            const items = (q.data ?? []).filter((a) => a.role === r);
            if (!items.length) return null;
            return (
              <View key={r} style={styles.section}>
                <SectionTitle title={SECTION[r]} />
                {items.map((a) => (
                  <Card key={a.id} style={styles.card} testID={`access-card-${a.code.toLowerCase()}`}>
                    <View style={styles.row}>
                      <View style={styles.avatar}>
                        <Icon name={ROLE_ICON[a.role]} size={20} color={colors.brandPrimary} />
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.name} numberOfLines={1}>
                          {a.display_name}
                        </Text>
                        <Text style={styles.meta}>
                          {ROLE_LABELS[a.role]}
                          {a.role !== "admin" ? ` · ${a.code}` : ""}
                        </Text>
                      </View>
                      {a.pin_reset_required ? <Badge label="PIN pendiente" tone="warning" testID={`access-pin-pending-${a.code.toLowerCase()}`} /> : null}
                    </View>
                    <View style={styles.linkRow}>
                      <Icon name={a.vinculado ? "link" : "unlink"} size={16} color={a.vinculado ? colors.info : colors.muted} />
                      <Text style={[styles.linkText, a.vinculado && styles.linkTextOn]} numberOfLines={2} testID={`access-account-${a.code.toLowerCase()}`}>
                        {a.vinculado ? a.account_email : "Sin vincular: se vinculará con la primera cuenta que entre con su PIN"}
                      </Text>
                    </View>
                    <View style={styles.row}>
                      <PillButton label="Cambiar PIN" icon="key-round" variant="ghost" small style={styles.flex} onPress={() => setPinFor(a)} testID={`access-change-pin-${a.code.toLowerCase()}`} />
                      {a.vinculado ? (
                        <PillButton label="Desvincular" icon="unlink" variant="dangerOutline" small style={styles.flex} onPress={() => setUnlinkFor(a)} testID={`access-unlink-${a.code.toLowerCase()}`} />
                      ) : null}
                    </View>
                  </Card>
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
      <PinSheet acceso={pinFor} onClose={() => setPinFor(null)} />
      <UnlinkSheet acceso={unlinkFor} onClose={() => setUnlinkFor(null)} />
    </View>
  );
}

function PinSheet({ acceso, onClose }: { acceso: Acceso | null; onClose: () => void }) {
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const close = () => {
    setPin("");
    setRepetir("");
    setError(null);
    onClose();
  };
  const mut = useMutation({
    mutationFn: () => {
      if (!/^\d{6}$/.test(pin)) throw new Error("El PIN debe tener exactamente 6 cifras");
      if (pin !== repetir) throw new Error("Los PIN no coinciden");
      return api.patch<Acceso>(`/admin/accesos/${acceso!.id}/pin`, { pin });
    },
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["admin-accesos"] });
      toast.show(`PIN actualizado para ${a.display_name}`);
      close();
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const clean = (t: string) => t.replace(/\D/g, "").slice(0, 6);
  return (
    <Sheet visible={!!acceso} onClose={close} title={`Nuevo PIN · ${acceso?.display_name ?? ""}`} testID="access-pin-sheet">
      <Text style={styles.meta}>6 cifras, sin secuencias (123456) ni repeticiones (111111). Comunícaselo en persona o por un canal privado.</Text>
      <Field label="Nuevo PIN" value={pin} onChangeText={(t) => setPin(clean(t))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" testID="access-pin-input" />
      <Field label="Repite el PIN" value={repetir} onChangeText={(t) => setRepetir(clean(t))} keyboardType="number-pad" secureTextEntry maxLength={6} placeholder="••••••" testID="access-pin-confirm-input" />
      {error ? (
        <Text style={styles.error} testID="access-pin-error">
          {error}
        </Text>
      ) : null}
      <PillButton label="Guardar PIN" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="access-pin-submit-button" />
    </Sheet>
  );
}

function UnlinkSheet({ acceso, onClose }: { acceso: Acceso | null; onClose: () => void }) {
  const styles = useStyles();
  const toast = useToast();
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.del<Acceso>(`/admin/accesos/${acceso!.id}/cuenta`),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ["admin-accesos"] });
      toast.show(`${a.display_name} ya no está vinculado a ninguna cuenta`);
      onClose();
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });
  return (
    <Sheet visible={!!acceso} onClose={onClose} title="¿Desvincular la cuenta?" testID="access-unlink-sheet">
      <Text style={styles.body}>
        {acceso?.display_name} dejará de estar vinculado a <Text style={styles.bold}>{acceso?.account_email}</Text>. Su sesión se cerrará y el perfil se vinculará con la próxima cuenta que entre con su PIN.
      </Text>
      <PillButton label="Desvincular" icon="unlink" variant="danger" onPress={() => mut.mutate()} loading={mut.isPending} testID="access-unlink-confirm-button" />
      <PillButton label="Cancelar" variant="outline" small onPress={onClose} testID="access-unlink-cancel-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  intro: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  introText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: c.onSurfaceSecondary, lineHeight: 19 },
  section: { gap: 10 },
  card: { gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  meta: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 18 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.canvas, borderRadius: 12, padding: 10 },
  linkText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: c.muted },
  linkTextOn: { fontFamily: fonts.bodySemi, color: c.textDark },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
  body: { fontFamily: fonts.body, fontSize: 14.5, color: c.textDark, lineHeight: 21 },
  bold: { fontFamily: fonts.bodyBold },
}));
