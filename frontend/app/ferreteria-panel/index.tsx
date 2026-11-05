import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { RefreshControl, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage, fileUrl } from "@/src/lib/api";
import { addDays, eur, fecha, isValidDateStr, todayStr } from "@/src/lib/format";
import type { Anuncio, Ferreteria } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { AppBar } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Badge, Card, Chip, EmptyState, ErrorView, Field, IconButton, KpiCard, LoadingView, PillButton, SectionTitle } from "@/src/ui/kit";
import { PhotoField } from "@/src/ui/PhotoGrid";
import { Sheet } from "@/src/ui/Sheet";
import { useToast } from "@/src/ui/toast";

const KEY = ["ferreteria-me"];

export default function FerreteriaPanel() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Anuncio | "new" | null>(null);
  const [deleting, setDeleting] = useState<Anuncio | null>(null);
  const [storeOpen, setStoreOpen] = useState(false);
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get<Ferreteria>("/ferreteria/me") });

  const onUpdated = (d: Ferreteria, msg: string) => {
    qc.setQueryData(KEY, d);
    qc.invalidateQueries({ queryKey: ["ferreterias-public"] });
    qc.invalidateQueries({ queryKey: ["ferreteria-public", d.id] });
    toast.show(msg);
  };

  const toggle = useMutation({
    mutationFn: (a: Anuncio) => api.patch<Ferreteria>(`/ferreteria/me/anuncios/${a.id}`, { activo: !a.activo }),
    onSuccess: (d, a) => onUpdated(d, a.activo ? "Promoción pausada" : "Promoción publicada"),
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  const del = useMutation({
    mutationFn: (a: Anuncio) => api.del<Ferreteria>(`/ferreteria/me/anuncios/${a.id}`),
    onSuccess: (d) => {
      setDeleting(null);
      onUpdated(d, "Promoción eliminada");
    },
    onError: (e) => toast.show(errorMessage(e), "error"),
  });

  if (q.isLoading || q.isError || !q.data) {
    return (
      <View style={styles.screen}>
        <AppBar title="Mi ferretería" showBack={false} />
        {q.isLoading ? <LoadingView /> : <ErrorView message={errorMessage(q.error)} onRetry={() => void q.refetch()} />}
      </View>
    );
  }
  const f = q.data;
  const activos = f.anuncios.filter((a) => a.activo).length;
  const derivs = f.derivaciones ?? [];

  return (
    <View style={styles.screen} testID="store-panel-screen">
      <AppBar title="Mi ferretería" subtitle={f.nombre} showBack={false} />
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.brand} />}
      >
        <View style={styles.hero}>
          {f.imagen ? <Image source={{ uri: fileUrl(f.imagen) }} style={styles.heroImg} contentFit="cover" /> : null}
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle} testID="store-panel-name">{f.nombre}</Text>
            <Text style={styles.heroText}>
              {f.direccion}
              {f.barrio ? ` · ${f.barrio}` : ""}
            </Text>
            <PillButton label="Ver mi ficha pública" icon="eye" variant="outline" small onPress={() => router.push(`/ferreterias/${f.id}` as never)} testID="store-panel-public-button" />
          </View>
        </View>

        <View style={styles.kpis}>
          <KpiCard label="Promociones activas" value={String(activos)} icon="megaphone" tone="yellow" testID="store-kpi-ads" />
          <KpiCard label="Clientes derivados" value={String(derivs.length)} icon="users" tone="info" testID="store-kpi-referrals" />
          <KpiCard label="Comisión GM Conecta" value={`${f.porcentaje_comision ?? 0}%`} icon="percent" tone="navy" testID="store-kpi-commission" />
        </View>

        <SectionTitle title="Mis promociones" action="+ Nueva" onAction={() => setEditing("new")} testID="store-new-ad-link" />
        {f.anuncios.length === 0 ? (
          <Card>
            <EmptyState icon="megaphone" title="Publica tu primera promoción" text="Los clientes de GM Conecta la verán en el directorio de ferreterías recomendadas." action="Crear promoción" onAction={() => setEditing("new")} testID="store-ads-empty" />
          </Card>
        ) : null}
        {f.anuncios.map((a) => (
          <Card key={a.id} style={styles.ad} testID={`store-ad-${a.id}`}>
            {a.imagen ? <Image source={{ uri: fileUrl(a.imagen) }} style={styles.adImg} contentFit="cover" /> : null}
            <View style={styles.rowBetween}>
              <View style={styles.row}>
                {a.descuento ? (
                  <View style={styles.discount}>
                    <Text style={styles.discountText}>{a.descuento}</Text>
                  </View>
                ) : null}
                <Badge label={a.activo ? "Publicada" : "Pausada"} tone={a.activo ? "success" : "neutral"} testID={`store-ad-status-${a.id}`} />
              </View>
              <Switch
                value={a.activo}
                onValueChange={() => toggle.mutate(a)}
                trackColor={{ false: colors.border, true: colors.success }}
                thumbColor={colors.surface}
                testID={`store-ad-toggle-${a.id}`}
                accessibilityLabel={a.activo ? "Pausar promoción" : "Publicar promoción"}
              />
            </View>
            <Text style={styles.adTitle}>{a.titulo}</Text>
            {a.descripcion ? <Text style={styles.line}>{a.descripcion}</Text> : null}
            <Text style={styles.hint}>
              Desde {fecha(a.fecha_inicio)}
              {a.fecha_fin ? ` · hasta ${fecha(a.fecha_fin)}` : " · sin fecha de fin"}
            </Text>
            <View style={styles.btnRow}>
              <PillButton label="Editar" icon="pencil" variant="ghost" small style={styles.flex} onPress={() => setEditing(a)} testID={`store-ad-edit-${a.id}`} />
              <IconButton icon="trash-2" bg={colors.errorSoft} color={colors.urgent} label="Eliminar promoción" onPress={() => setDeleting(a)} testID={`store-ad-delete-${a.id}`} />
            </View>
          </Card>
        ))}

        <SectionTitle title="Datos de la tienda" action="Editar" onAction={() => setStoreOpen(true)} testID="store-edit-info-link" />
        <Card style={styles.gap}>
          <InfoLine icon="phone" text={f.telefono || "Sin teléfono"} />
          <InfoLine icon="clock" text={f.horario || "Sin horario"} />
          <InfoLine icon="info" text={f.descripcion || "Sin descripción"} />
          <View style={styles.tags}>
            {f.productos_destacados.map((p) => (
              <View key={p} style={styles.tag}>
                <Icon name="package" size={13} color={colors.brandSecondary} />
                <Text style={styles.tagText}>{p}</Text>
              </View>
            ))}
          </View>
        </Card>

        <SectionTitle title="Clientes derivados por GM Conecta" />
        <Card style={styles.gapSm}>
          {derivs.length === 0 ? <Text style={styles.hint}>Todavía no hay clientes derivados.</Text> : null}
          {derivs.map((d, i) => (
            <View key={d.id} style={[styles.derivRow, i < derivs.length - 1 && styles.divider]} testID={`store-referral-${d.id}`}>
              <View style={styles.flex}>
                <Text style={styles.derivName}>{d.cliente_nombre}</Text>
                <Text style={styles.hint}>
                  {fecha(d.fecha)} · {d.descripcion || "Compra"} · {eur(d.importe_compra)}
                </Text>
              </View>
              <View style={styles.derivRight}>
                <Text style={styles.comision}>{eur(d.comision)}</Text>
                <Badge label={d.estado === "cobrada" ? "Liquidada" : "Pendiente"} tone={d.estado === "cobrada" ? "success" : "yellow"} />
              </View>
            </View>
          ))}
        </Card>
      </KeyboardAwareScrollView>

      <AnuncioSheet anuncio={editing} onClose={() => setEditing(null)} onDone={(d, msg) => { setEditing(null); onUpdated(d, msg); }} />
      <StoreSheet visible={storeOpen} store={f} onClose={() => setStoreOpen(false)} onDone={(d) => { setStoreOpen(false); onUpdated(d, "Datos guardados"); }} />
      <Sheet visible={!!deleting} onClose={() => setDeleting(null)} title="¿Eliminar promoción?" testID="delete-ad-sheet">
        <Text style={styles.line}>«{deleting?.titulo}» dejará de mostrarse a los clientes. Esta acción no se puede deshacer.</Text>
        <PillButton label="Eliminar" icon="trash-2" variant="danger" onPress={() => deleting && del.mutate(deleting)} loading={del.isPending} testID="delete-ad-confirm-button" />
        <PillButton label="Cancelar" variant="outline" onPress={() => setDeleting(null)} testID="delete-ad-cancel-button" />
      </Sheet>
    </View>
  );
}

function InfoLine({ icon, text }: { icon: "phone" | "clock" | "info"; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Icon name={icon} size={16} color={colors.brand} />
      <Text style={styles.line}>{text}</Text>
    </View>
  );
}

function AnuncioSheet({ anuncio, onClose, onDone }: { anuncio: Anuncio | "new" | null; onClose: () => void; onDone: (d: Ferreteria, msg: string) => void }) {
  const styles = useStyles();
  const isNew = anuncio === "new";
  const [form, setForm] = useState({ titulo: "", descripcion: "", descuento: "", fecha_fin: "" });
  const [imagen, setImagen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const currentKey = anuncio === null ? null : isNew ? "new" : anuncio.id;
  if (currentKey !== loadedFor) {
    setLoadedFor(currentKey);
    if (anuncio && anuncio !== "new") {
      setForm({ titulo: anuncio.titulo, descripcion: anuncio.descripcion, descuento: anuncio.descuento, fecha_fin: anuncio.fecha_fin ?? "" });
      setImagen(anuncio.imagen ?? null);
    } else {
      setForm({ titulo: "", descripcion: "", descuento: "", fecha_fin: addDays(todayStr(), 30) });
      setImagen(null);
    }
    setError(null);
  }
  const set = (k: keyof typeof form) => (v: string) => setForm((x) => ({ ...x, [k]: v }));

  const mut = useMutation({
    mutationFn: () => {
      if (form.titulo.trim().length < 3) throw new Error("El título debe tener al menos 3 caracteres");
      if (form.fecha_fin && !isValidDateStr(form.fecha_fin)) throw new Error("La fecha de fin debe tener el formato AAAA-MM-DD");
      const body = { titulo: form.titulo.trim(), descripcion: form.descripcion.trim(), descuento: form.descuento.trim() };
      if (isNew) {
        return api.post<Ferreteria>("/ferreteria/me/anuncios", { ...body, fecha_fin: form.fecha_fin || null, imagen });
      }
      return api.patch<Ferreteria>(`/ferreteria/me/anuncios/${(anuncio as Anuncio).id}`, { ...body, fecha_fin: form.fecha_fin, imagen: imagen ?? "" });
    },
    onSuccess: (d) => onDone(d, isNew ? "Promoción publicada" : "Promoción actualizada"),
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Sheet visible={anuncio !== null} onClose={onClose} title={isNew ? "Nueva promoción" : "Editar promoción"} testID="ad-sheet">
      <Field label="Título" value={form.titulo} onChangeText={set("titulo")} placeholder="Ej. 20% en grifería termostática" maxLength={100} testID="ad-title-input" />
      <Field label="Descuento o etiqueta" value={form.descuento} onChangeText={set("descuento")} placeholder="-20%, 2x1…" maxLength={40} testID="ad-discount-input" />
      <Field label="Descripción" value={form.descripcion} onChangeText={set("descripcion")} placeholder="Condiciones, productos incluidos…" multiline maxLength={500} testID="ad-description-input" />
      <Field label="Válida hasta (AAAA-MM-DD)" value={form.fecha_fin} onChangeText={set("fecha_fin")} placeholder="Sin fecha de fin" testID="ad-end-date-input" />
      <View style={styles.chips}>
        {[7, 15, 30].map((d) => (
          <Chip key={d} label={`${d} días`} onPress={() => set("fecha_fin")(addDays(todayStr(), d))} testID={`ad-end-${d}`} />
        ))}
        <Chip label="Sin fecha" onPress={() => set("fecha_fin")("")} testID="ad-end-none" />
      </View>
      <PhotoField value={imagen} onChange={setImagen} testIDPrefix="ad-image" label="Imagen de la promoción (opcional)" />
      {error ? <Text style={styles.error} testID="ad-form-error">{error}</Text> : null}
      <PillButton label={isNew ? "Publicar promoción" : "Guardar cambios"} icon="megaphone" onPress={() => mut.mutate()} loading={mut.isPending} testID="ad-submit-button" />
    </Sheet>
  );
}

function StoreSheet({ visible, store, onClose, onDone }: { visible: boolean; store: Ferreteria; onClose: () => void; onDone: (d: Ferreteria) => void }) {
  const styles = useStyles();
  const [form, setForm] = useState({ telefono: "", horario: "", descripcion: "", productos: "" });
  const [imagen, setImagen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (visible !== open) {
    setOpen(visible);
    if (visible) {
      setForm({ telefono: store.telefono, horario: store.horario, descripcion: store.descripcion, productos: store.productos_destacados.join(", ") });
      setImagen(store.imagen ?? null);
      setError(null);
    }
  }
  const set = (k: keyof typeof form) => (v: string) => setForm((x) => ({ ...x, [k]: v }));
  const mut = useMutation({
    mutationFn: () =>
      api.patch<Ferreteria>("/ferreteria/me", {
        telefono: form.telefono.trim(),
        horario: form.horario.trim(),
        descripcion: form.descripcion.trim(),
        productos_destacados: form.productos.split(",").map((p) => p.trim()).filter(Boolean).slice(0, 20),
        imagen: imagen ?? "",
      }),
    onSuccess: onDone,
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet visible={visible} onClose={onClose} title="Datos de la tienda" testID="store-info-sheet">
      <Field label="Teléfono" value={form.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" maxLength={20} testID="store-phone-input" />
      <Field label="Horario" value={form.horario} onChangeText={set("horario")} placeholder="L-V 9:00-14:00 / 17:00-20:30" maxLength={120} testID="store-hours-input" />
      <Field label="Descripción" value={form.descripcion} onChangeText={set("descripcion")} multiline maxLength={600} testID="store-description-input" />
      <Field label="Productos destacados" value={form.productos} onChangeText={set("productos")} hint="Separados por comas" testID="store-products-input" />
      <PhotoField value={imagen} onChange={setImagen} testIDPrefix="store-image" label="Foto de la tienda" />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PillButton label="Guardar" icon="check" onPress={() => mut.mutate()} loading={mut.isPending} testID="store-info-submit-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  gap: { gap: 10 },
  gapSm: { gap: 4 },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  btnRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hero: { backgroundColor: c.brand, borderRadius: radius.xl, overflow: "hidden" },
  heroImg: { width: "100%", height: 130 },
  heroBody: { padding: 18, gap: 8 },
  heroTitle: { fontFamily: fonts.extraBoldItalic, fontSize: 22, color: c.onBrand },
  heroText: { fontFamily: fonts.body, fontSize: 14, color: c.pillBorder },
  kpis: { flexDirection: "row", gap: 10 },
  ad: { gap: 8 },
  adImg: { width: "100%", height: 130, borderRadius: 16 },
  adTitle: { fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  discount: { backgroundColor: c.urgent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  discountText: { fontFamily: fonts.black, fontSize: 13, color: c.onError },
  line: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.textDark, lineHeight: 20 },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: c.muted, lineHeight: 18 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.infoCard, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  tagText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: c.brandDeep },
  derivRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: c.divider },
  derivName: { fontFamily: fonts.bodySemi, fontSize: 14.5, color: c.brandDeep },
  derivRight: { alignItems: "flex-end", gap: 4 },
  comision: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.brandDeep },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
}));
