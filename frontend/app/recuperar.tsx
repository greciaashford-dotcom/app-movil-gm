import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "@/src/auth";
import { AuthLink, AuthScaffold, FormError, PasswordField } from "@/src/components/AuthScaffold";
import { errorMessage } from "@/src/lib/api";
import { EMAIL_RE } from "@/src/lib/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/ui/Icon";
import { Field, PillButton } from "@/src/ui/kit";

/** Forgotten password: email → 6-digit code by email → new password (signs in). */
export default function RecuperarScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { requestPasswordReset, resetPassword } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(params.email ?? "");
  const [codigo, setCodigo] = useState("");
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const enviarCodigo = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError("Introduce un correo electrónico válido");
    setLoading(true);
    try {
      const msg = await requestPasswordReset(email.trim().toLowerCase());
      setInfo(`${msg} Revisa también la carpeta de spam.`);
      setStep("code");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const cambiar = async () => {
    setError(null);
    if (!/^\d{6}$/.test(codigo)) return setError("Introduce el código de 6 cifras que te hemos enviado");
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-ZÀ-ÿ]/.test(password)) {
      return setError("La contraseña debe tener al menos 8 caracteres, con letras y números");
    }
    if (password !== repetir) return setError("Las contraseñas no coinciden");
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase(), codigo, password);
      // The root gate opens the app once signed in.
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  };

  const goLogin = () => (router.canGoBack() ? router.back() : router.replace("/login"));

  return (
    <AuthScaffold
      testID="reset-screen"
      title={step === "email" ? "¿Olvidaste tu contraseña?" : "Crea una contraseña nueva"}
      subtitle={step === "email" ? "Escribe el correo de tu cuenta y te enviaremos un código de 6 cifras." : `Introduce el código que hemos enviado a ${email.trim().toLowerCase()}.`}
      footer={<AuthLink text="¿Ya te acuerdas?" action="Inicia sesión" onPress={goLogin} testID="reset-go-login-link" />}
    >
      {step === "email" ? (
        <>
          <Field
            label="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={enviarCodigo}
            testID="reset-email-input"
          />
          <FormError message={error} testID="reset-error" />
          <PillButton label="Enviar código" icon="mail" iconRight="chevron-right" onPress={enviarCodigo} loading={loading} testID="reset-send-code-button" />
        </>
      ) : (
        <>
          {info ? (
            <View style={styles.info} testID="reset-info">
              <Icon name="mail-check" size={18} color={colors.brandSecondary} />
              <Text style={styles.infoText}>{info}</Text>
            </View>
          ) : null}
          <Field
            label="Código de 6 cifras"
            value={codigo}
            onChangeText={(t) => setCodigo(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            style={styles.code}
            testID="reset-code-input"
          />
          <PasswordField
            label="Nueva contraseña"
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            textContentType="newPassword"
            hint="Al menos 8 caracteres, con letras y números."
            testID="reset-password-input"
          />
          <PasswordField
            label="Repite la contraseña"
            value={repetir}
            onChangeText={setRepetir}
            placeholder="Repite la contraseña"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={cambiar}
            testID="reset-password-confirm-input"
          />
          <FormError message={error} testID="reset-error" />
          <PillButton label="Cambiar contraseña" icon="key-round" onPress={cambiar} loading={loading} testID="reset-submit-button" />
          <Pressable onPress={enviarCodigo} disabled={loading} hitSlop={8} style={styles.resend} testID="reset-resend-button">
            <Icon name="refresh-cw" size={16} color={colors.brandSecondary} />
            <Text style={styles.resendText}>Reenviar el código</Text>
          </Pressable>
        </>
      )}
    </AuthScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  info: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.infoCard, borderRadius: 12, padding: 12 },
  infoText: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: c.onSurfaceSecondary, lineHeight: 18 },
  code: { fontFamily: fonts.black, fontSize: 24, letterSpacing: 8, textAlign: "center" },
  resend: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44 },
  resendText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandSecondary },
}));
