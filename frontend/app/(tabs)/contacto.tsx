import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ROLE_LABELS, useAuth } from "@/src/auth";
import { api } from "@/src/lib/api";
import { COMPANY_PHONE } from "@/src/lib/constants";
import { EMAIL_RE, formatPhone, telLink, waLink } from "@/src/lib/format";
import { EMPTY_PERFIL, getPerfil, Perfil, savePerfil } from "@/src/lib/localData";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { BrandHeader } from "@/src/ui/BrandHeader";
import { useDrawer } from "@/src/ui/drawer";
import { Icon } from "@/src/ui/Icon";
import { Card, Field, PillButton } from "@/src/ui/kit";
import { useToast } from "@/src/ui/toast";

type PublicConfig = { nombre: string; empresa: string; telefono: string; whatsapp: string; email_contacto: string; direccion: string };

export default function ContactoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { open } = useDrawer();
  const { role, account, signOut } = useAuth();
  const toast = useToast();
  const [perfil, setPerfil] = useState<Perfil>(EMPTY_PERFIL);
  const config = useQuery({ queryKey: ["config-public"], queryFn: () => api.get<PublicConfig>("/config/public") });
  const tel = config.data?.telefono || COMPANY_PHONE;

  useEffect(() => {
    getPerfil().then((p) => setPerfil({ ...p, nombre: p.nombre || account?.nombre || "", correo: p.correo || account?.email || "" }));
  }, [account]);

  const guardar = async () => {
    if (perfil.correo && !EMAIL_RE.test(perfil.correo)) {
      toast.show("Revisa el correo electrónico", "error");
      return;
    }
    await savePerfil(perfil);
    toast.show("Datos guardados en este móvil");
  };

  const set = (k: keyof Perfil) => (v: string) => setPerfil((p) => ({ ...p, [k]: v }));

  return (
    <View style={styles.screen} testID="contact-screen">
      <BrandHeader variant="compact" />
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: bottomChrome + 24 }]}>
        <Text style={styles.title}>Contacto</Text>
        <Card style={styles.gap}>
          <View style={styles.row}>
            <View style={styles.badgeIcon}>
              <Icon name="building-2" size={22} color={colors.brandPrimary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.company}>{config.data?.empresa ?? "GM Reforma Express"}</Text>
              <Text style={styles.meta}>Servicios de mantenimiento, reparaciones y reformas · {config.data?.direccion ?? "Madrid"}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Icon name="phone" size={18} color={colors.brand} />
            <Text style={styles.line} testID="contact-phone">{formatPhone(tel)}</Text>
          </View>
          <View style={styles.row}>
            <Icon name="clock" size={18} color={colors.brand} />
            <Text style={styles.line}>L-V 8:00-20:00 · Urgencias 24 h</Text>
          </View>
          {config.data?.email_contacto ? (
            <View style={styles.row}>
              <Icon name="mail" size={18} color={colors.brand} />
              <Text style={styles.line}>{config.data.email_contacto}</Text>
            </View>
          ) : null}
          <View style={styles.btnRow}>
            <PillButton label="Llamar" icon="phone" variant="call" small style={styles.flex} onPress={() => Linking.openURL(telLink(tel))} testID="contact-call-button" />
            <PillButton
              label="WhatsApp"
              icon="message-circle"
              variant="navy"
              small
              style={styles.flex}
              onPress={() => Linking.openURL(waLink(config.data?.whatsapp || tel, "Hola GM Conecta, quería información sobre un trabajo en casa."))}
              testID="contact-whatsapp-button"
            />
          </View>
          {config.data?.email_contacto ? (
            <PillButton label="Escribir un correo" icon="mail" variant="outline" small onPress={() => Linking.openURL(`mailto:${config.data?.email_contacto}`)} testID="contact-email-button" />
          ) : null}
        </Card>

        <Text style={styles.section}>Mi cuenta</Text>
        {account ? (
          <Card style={styles.gap} testID="account-card">
            <View style={styles.row}>
              <View style={styles.badgeIcon}>
                <Text style={styles.initial}>{(account.nombre || account.email).slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.company} numberOfLines={1} testID="account-card-name">
                  {account.nombre}
                </Text>
                <Text style={styles.meta} numberOfLines={1} testID="account-card-email">
                  {account.email} · {account.proveedores.includes("google") ? "Google" : "correo y contraseña"}
                </Text>
              </View>
            </View>
            <PillButton label="Cerrar sesión" icon="log-out" variant="dangerOutline" small onPress={() => void signOut()} testID="account-logout-button" />
          </Card>
        ) : null}
        <Card style={styles.gap}>
          <Text style={styles.meta}>Guarda tus datos para rellenar más rápido tus solicitudes. Se quedan solo en este móvil.</Text>
          <Field label="Nombre completo" value={perfil.nombre} onChangeText={set("nombre")} placeholder="Tu nombre" testID="account-name-input" />
          <Field label="Teléfono" value={perfil.telefono} onChangeText={set("telefono")} keyboardType="phone-pad" placeholder="600 000 000" testID="account-phone-input" />
          <Field label="Correo electrónico" value={perfil.correo} onChangeText={set("correo")} keyboardType="email-address" autoCapitalize="none" placeholder="tu@correo.com" testID="account-email-input" />
          <Field label="Dirección" value={perfil.direccion} onChangeText={set("direccion")} placeholder="Calle, número, Madrid" testID="account-address-input" />
          <PillButton label="Guardar mis datos" icon="check" onPress={guardar} testID="account-save-button" />
        </Card>

        <Card tone="blue" style={styles.gap}>
          <View style={styles.row}>
            <Icon name="user-round" size={18} color={colors.brandDeep} />
            <Text style={styles.line} testID="contact-current-role">
              Modo actual: <Text style={styles.bold}>{ROLE_LABELS[role]}</Text>
            </Text>
          </View>
          <PillButton label="Cambiar de modo / rol" icon="sliders-horizontal" variant="navy" small onPress={open} testID="contact-switch-role-button" />
          <PillButton label="Ferreterías recomendadas" icon="store" variant="outline" small onPress={() => router.push("/ferreterias")} testID="contact-stores-button" />
        </Card>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.canvas },
  content: { padding: 16, gap: 12 },
  title: { fontFamily: fonts.black, fontSize: 26, color: c.brandDeep },
  section: { fontFamily: fonts.extraBold, fontSize: 18, color: c.brandDeep, marginTop: 8 },
  gap: { gap: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  flex: { flex: 1 },
  badgeIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  initial: { fontFamily: fonts.black, fontSize: 20, color: c.brandPrimary },
  company: { fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep },
  meta: { fontFamily: fonts.body, fontSize: 13, color: c.muted, lineHeight: 18 },
  line: { fontFamily: fonts.bodyMedium, fontSize: 14.5, color: c.textDark, flexShrink: 1 },
  bold: { fontFamily: fonts.bodyBold },
  btnRow: { flexDirection: "row", gap: 10 },
}));
