import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { usePhotoPicker } from "@/src/hooks/usePhotoPicker";
import { api, errorMessage, uploadImage } from "@/src/lib/api";
import { CATEGORIAS_FORM, COMPANY_PHONE, URGENCIA_TIPOS } from "@/src/lib/constants";
import { EMAIL_RE, formatPhone, genKey, telLink } from "@/src/lib/format";
import { addStoredRequest, getPerfil, savePerfil } from "@/src/lib/localData";
import type { SolicitudPublica } from "@/src/lib/types";
import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { Icon } from "@/src/ui/Icon";
import { Field, PillButton } from "@/src/ui/kit";

type Foto = { uri: string; path?: string; uploading: boolean; error?: string };
const STEP_TITLES = ["¿Qué necesitas?", "Describe el trabajo", "Fotografías", "Tus datos de contacto"];
const MAX_FOTOS = 5;
const BAR_HEIGHT = 84;

export function RequestForm({ urgent = false, initialServicio }: { urgent?: boolean; initialServicio?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const idemKey = useRef(genKey());
  const { pick, permissionSheet } = usePhotoPicker();
  const { account } = useAuth();

  const [step, setStep] = useState(0);
  const [categoria, setCategoria] = useState<string>(urgent ? "Urgencia 24h" : initialServicio ?? "");
  const [urgTipo, setUrgTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [correo, setCorreo] = useState("");
  const [direccion, setDireccion] = useState("");
  const [guardar, setGuardar] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    getPerfil().then((p) => {
      setNombre((v) => v || p.nombre || account?.nombre || "");
      setTelefono((v) => v || p.telefono);
      setCorreo((v) => v || p.correo || account?.email || "");
      setDireccion((v) => v || p.direccion);
    });
  }, [account]);

  const isUrgent = categoria === "Urgencia 24h";
  const servicio = isUrgent ? `Urgencia 24h · ${urgTipo}` : categoria;

  const addFotos = async (source: "camera" | "library") => {
    const remaining = MAX_FOTOS - fotos.length;
    if (remaining <= 0) return;
    const assets = await pick(source, remaining);
    for (const a of assets) {
      const local: Foto = { uri: a.uri, uploading: true };
      setFotos((f) => [...f, local]);
      try {
        const path = await uploadImage(a);
        setFotos((f) => f.map((x) => (x.uri === a.uri ? { ...x, path, uploading: false } : x)));
      } catch (e) {
        setFotos((f) => f.map((x) => (x.uri === a.uri ? { ...x, uploading: false, error: errorMessage(e) } : x)));
      }
    }
  };

  const validate = (s: number): boolean => {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!categoria) e.categoria = "Elige una categoría";
      if (categoria === "Urgencia 24h" && !urgTipo) e.categoria = "Elige el tipo de urgencia";
    }
    if (s === 1 && descripcion.trim().length < 10) e.descripcion = "Describe el trabajo con al menos 10 caracteres";
    if (s === 2 && fotos.some((f) => f.uploading)) e.fotos = "Espera a que terminen de subirse las fotos";
    if (s === 3) {
      if (nombre.trim().length < 2) e.nombre = "Indica tu nombre completo";
      if (telefono.replace(/\D/g, "").length < 9) e.telefono = "Indica un teléfono válido (9 cifras)";
      if (!EMAIL_RE.test(correo.trim())) e.correo = "Indica un correo electrónico válido";
      if (direccion.trim().length < 3) e.direccion = "Indica la dirección del trabajo";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (!validate(step)) return;
    if (step < 3) setStep(step + 1);
    else void submit();
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post<SolicitudPublica>("/solicitudes", {
        idempotency_key: idemKey.current,
        servicio,
        es_urgencia: isUrgent || urgent,
        descripcion: descripcion.trim(),
        fotografias: fotos.filter((f) => f.path).map((f) => f.path),
        nombre_cliente: nombre.trim(),
        telefono_cliente: telefono.trim(),
        correo_cliente: correo.trim(),
        direccion: direccion.trim(),
      });
      await addStoredRequest({ numero: res.numero_solicitud, key: idemKey.current });
      if (guardar) await savePerfil({ nombre: nombre.trim(), telefono: telefono.trim(), correo: correo.trim(), direccion: direccion.trim() });
      router.replace({
        pathname: "/solicitud-confirmada",
        params: { numero: res.numero_solicitud, fecha: res.fecha_creacion, servicio: res.servicio, direccion: res.direccion },
      });
    } catch (e) {
      setSubmitError(errorMessage(e));
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen} testID={urgent ? "urgent-request-screen" : "quote-request-screen"}>
      <BrandHeader variant="compact" showBack onBack={step > 0 ? () => setStep(step - 1) : undefined} />
      <View style={styles.progressWrap}>
        <View style={styles.progressHead}>
          <Text style={styles.stepCount} testID="request-step-indicator">
            Paso {step + 1} de 4
          </Text>
          {urgent ? (
            <View style={styles.urgentTag}>
              <Icon name="siren" size={14} color={colors.urgent} />
              <Text style={styles.urgentTagText}>Urgencia 24h</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.segments}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={[styles.segment, i <= step && styles.segmentActive]} />
          ))}
        </View>
        <Text style={styles.stepTitle}>{STEP_TITLES[step]}</Text>
      </View>

      <KeyboardAwareScrollView bottomOffset={BAR_HEIGHT + 16} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: BAR_HEIGHT + insets.bottom + 24 }]}>
        {urgent && step === 0 ? (
          <View style={styles.urgentBox}>
            <Text style={styles.urgentBoxText}>¿Es una emergencia ahora mismo? Llámanos y te atendemos al momento.</Text>
            <PillButton label={`Llamar ${formatPhone(COMPANY_PHONE)}`} icon="phone" variant="call" small onPress={() => Linking.openURL(telLink(COMPANY_PHONE))} testID="request-urgent-call-button" />
          </View>
        ) : null}

        {step === 0 ? (
          <Animated.View entering={FadeIn} style={styles.gap}>
            {(urgent ? CATEGORIAS_FORM.filter((c) => c.urgent) : CATEGORIAS_FORM).map((c) => {
              const active = categoria === c.label;
              return (
                <Pressable
                  key={c.label}
                  testID={`request-category-${c.label.split(" ")[0].toLowerCase()}`}
                  onPress={() => setCategoria(c.label)}
                  style={[styles.option, active && styles.optionActive, c.urgent && styles.optionUrgent, c.urgent && active && styles.optionUrgentActive]}
                >
                  <View style={[styles.optionIcon, c.urgent && styles.optionIconUrgent]}>
                    <Icon name={c.icon} size={22} color={c.urgent ? colors.urgent : colors.brand} />
                  </View>
                  <Text style={styles.optionText}>{c.label}</Text>
                  <Icon name={active ? "circle-check" : "chevron-right"} size={22} color={active ? (c.urgent ? colors.urgent : colors.brand) : colors.muted} />
                </Pressable>
              );
            })}
            {isUrgent ? (
              <View style={styles.gap}>
                <Text style={styles.label}>Tipo de urgencia</Text>
                <View style={styles.urgTypes}>
                  {URGENCIA_TIPOS.map((t) => {
                    const active = urgTipo === t.label;
                    return (
                      <Pressable key={t.label} testID={`request-urgent-type-${t.label.toLowerCase()}`} onPress={() => setUrgTipo(t.label)} style={[styles.urgType, active && styles.urgTypeActive]}>
                        <Icon name={t.icon} size={20} color={active ? colors.onError : colors.urgent} />
                        <Text style={[styles.urgTypeText, active && styles.urgTypeTextActive]}>{t.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {errors.categoria ? <Text style={styles.error} testID="request-category-error">{errors.categoria}</Text> : null}
          </Animated.View>
        ) : null}

        {step === 1 ? (
          <Animated.View entering={FadeIn} style={styles.gap}>
            <Field
              label="Descripción detallada del trabajo"
              placeholder="Ej.: Tengo una fuga bajo el fregadero desde ayer. El mueble está mojado y gotea el sifón…"
              multiline
              value={descripcion}
              onChangeText={setDescripcion}
              maxLength={3000}
              error={errors.descripcion}
              hint={`${descripcion.trim().length}/3000 · Cuanto más detalle, más preciso será el presupuesto.`}
              testID="request-description-input"
            />
          </Animated.View>
        ) : null}

        {step === 2 ? (
          <Animated.View entering={FadeIn} style={styles.gap}>
            <Text style={styles.help}>Adjunta hasta 5 fotos del problema o de la zona a reformar (opcional).</Text>
            <View style={styles.photoGrid}>
              {fotos.map((f) => (
                <View key={f.uri} style={styles.photo}>
                  <Image source={{ uri: f.uri }} style={styles.photoImg} contentFit="cover" />
                  {f.uploading ? (
                    <View style={styles.photoOverlay}>
                      <ActivityIndicator color={colors.onBrand} />
                    </View>
                  ) : null}
                  {f.error ? (
                    <View style={[styles.photoOverlay, styles.photoError]}>
                      <Icon name="triangle-alert" size={20} color={colors.onError} />
                    </View>
                  ) : null}
                  <Pressable onPress={() => setFotos((x) => x.filter((y) => y.uri !== f.uri))} style={styles.photoRemove} hitSlop={6} testID="request-photo-remove-button" accessibilityLabel="Quitar foto">
                    <Icon name="x" size={14} color={colors.onBrand} />
                  </Pressable>
                </View>
              ))}
            </View>
            <Text style={styles.help} testID="request-photo-count">
              {fotos.length}/{MAX_FOTOS} fotos
            </Text>
            <View style={styles.row}>
              <PillButton label="Cámara" icon="camera" variant="ghost" small style={styles.flex} disabled={fotos.length >= MAX_FOTOS} onPress={() => addFotos("camera")} testID="request-photo-camera-button" />
              <PillButton label="Galería" icon="image-plus" variant="ghost" small style={styles.flex} disabled={fotos.length >= MAX_FOTOS} onPress={() => addFotos("library")} testID="request-photo-gallery-button" />
            </View>
            {fotos.some((f) => f.error) ? <Text style={styles.error}>Alguna foto no se pudo subir. Quítala o inténtalo de nuevo.</Text> : null}
            {errors.fotos ? <Text style={styles.error}>{errors.fotos}</Text> : null}
          </Animated.View>
        ) : null}

        {step === 3 ? (
          <Animated.View entering={FadeIn} style={styles.gap}>
            <Field label="Nombre completo" value={nombre} onChangeText={setNombre} placeholder="Nombre y apellidos" autoComplete="name" error={errors.nombre} testID="request-name-input" />
            <Field label="Teléfono" value={telefono} onChangeText={setTelefono} placeholder="600 000 000" keyboardType="phone-pad" autoComplete="tel" error={errors.telefono} testID="request-phone-input" />
            <Field label="Correo electrónico" value={correo} onChangeText={setCorreo} placeholder="tu@correo.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.correo} testID="request-email-input" />
            <Field label="Dirección" value={direccion} onChangeText={setDireccion} placeholder="Calle, número, piso · Madrid" error={errors.direccion} testID="request-address-input" />
            <Pressable style={styles.checkRow} onPress={() => setGuardar(!guardar)} testID="request-save-data-toggle">
              <View style={[styles.check, guardar && styles.checkOn]}>{guardar ? <Icon name="check" size={14} color={colors.onBrand} /> : null}</View>
              <Text style={styles.help}>Guardar mis datos en este móvil para próximas solicitudes</Text>
            </Pressable>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                <Text style={styles.bold}>Servicio:</Text> {servicio}
              </Text>
              <Text style={styles.summaryText}>
                <Text style={styles.bold}>Fotos:</Text> {fotos.filter((f) => f.path).length}
              </Text>
            </View>
            {submitError ? (
              <Text style={styles.error} testID="request-submit-error">
                {submitError}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
          {step > 0 ? <PillButton label="Atrás" icon="chevron-left" variant="outline" small onPress={() => setStep(step - 1)} testID="request-prev-button" style={styles.barBack} /> : null}
          <PillButton
            label={step < 3 ? "Siguiente" : "Enviar solicitud"}
            icon={step < 3 ? undefined : "send"}
            iconRight={step < 3 ? "chevron-right" : undefined}
            onPress={next}
            loading={submitting}
            variant={urgent && step === 3 ? "danger" : "primary"}
            testID={step < 3 ? "request-next-button" : "request-submit-button"}
            style={styles.flex}
          />
        </View>
      </KeyboardStickyView>
      {permissionSheet}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  flex: { flex: 1 },
  gap: { gap: 12 },
  row: { flexDirection: "row", gap: 10 },
  progressWrap: { backgroundColor: c.surface, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 8, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stepCount: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.muted },
  urgentTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.urgentBg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: c.urgentBorder },
  urgentTagText: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.urgentTitle },
  segments: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: c.infoDivider },
  segmentActive: { backgroundColor: c.brandPrimary },
  stepTitle: { fontFamily: fonts.black, fontSize: 23, color: c.brandDeep },
  content: { padding: 16, gap: 14 },
  urgentBox: { backgroundColor: c.urgentBg, borderColor: c.urgentBorder, borderWidth: 3, borderRadius: radius.xl, padding: 14, gap: 10 },
  urgentBoxText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.urgentTitle, lineHeight: 20 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, borderWidth: 2, borderColor: c.surface, minHeight: 64 },
  optionActive: { borderColor: c.brand, backgroundColor: c.infoCard },
  optionUrgent: { backgroundColor: c.urgentBg },
  optionUrgentActive: { borderColor: c.urgent },
  optionIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: c.infoCard, alignItems: "center", justifyContent: "center" },
  optionIconUrgent: { backgroundColor: c.errorSoft },
  optionText: { flex: 1, fontFamily: fonts.extraBold, fontSize: 16, color: c.brandDeep },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  urgTypes: { flexDirection: "row", gap: 8 },
  urgType: { flex: 1, alignItems: "center", gap: 6, paddingVertical: 14, borderRadius: 18, borderWidth: 2, borderColor: c.urgent, backgroundColor: c.surface },
  urgTypeActive: { backgroundColor: c.urgent },
  urgTypeText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgent },
  urgTypeTextActive: { color: c.onError },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: c.urgent },
  help: { fontFamily: fonts.body, fontSize: 13.5, color: c.muted, lineHeight: 19, flexShrink: 1 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photo: { width: 100, height: 100, borderRadius: 16, overflow: "hidden", backgroundColor: c.infoCard },
  photoImg: { width: "100%", height: "100%" },
  photoOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.overlay, alignItems: "center", justifyContent: "center" },
  photoError: { backgroundColor: c.urgent },
  photoRemove: { position: "absolute", top: 6, right: 6, width: 26, height: 26, borderRadius: 13, backgroundColor: c.brandDeep, alignItems: "center", justifyContent: "center" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: c.brand, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: c.brand },
  summary: { backgroundColor: c.infoCard, borderRadius: 16, padding: 12, gap: 4 },
  summaryText: { fontFamily: fonts.body, fontSize: 14, color: c.textDark },
  bold: { fontFamily: fonts.bodyBold },
  bar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
  barBack: { minWidth: 110 },
}));
