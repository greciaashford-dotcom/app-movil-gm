import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { useAuth } from "@/src/auth";
import { AuthLink, AuthScaffold, FormError, GoogleButton, OrDivider, PasswordField } from "@/src/components/AuthScaffold";
import { errorMessage } from "@/src/lib/api";
import { EMAIL_RE } from "@/src/lib/format";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/ui/Icon";
import { Field, PillButton } from "@/src/ui/kit";

export default function LoginScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { signIn, signInWithGoogle, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError("Introduce un correo electrónico válido");
    if (!password) return setError("Introduce tu contraseña");
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
      // The root gate opens the app as soon as the account is set.
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
    }
  };

  const google = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthScaffold
      testID="login-screen"
      title="Inicia sesión"
      subtitle="Accede con tu cuenta para pedir presupuestos, seguir tus obras o entrar en tu panel."
      footer={<AuthLink text="¿No tienes cuenta?" action="Regístrate" onPress={() => router.push("/registro")} testID="login-go-register-link" />}
    >
      <GoogleButton onPress={google} loading={googleLoading} testID="login-google-button" />
      <OrDivider label="o con tu correo" />
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
        returnKeyType="next"
        testID="login-email-input"
      />
      <PasswordField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="Tu contraseña"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        testID="login-password-input"
      />
      <FormError message={error ?? authError} testID="login-error" />
      <PillButton label="Entrar" icon="log-in" onPress={submit} loading={loading} testID="login-submit-button" />
      <View style={styles.note}>
        <Icon name="shield-check" size={16} color={colors.brandSecondary} />
        <Text style={styles.noteText}>Solo tendrás que iniciar sesión una vez: tu cuenta queda guardada en este móvil.</Text>
      </View>
    </AuthScaffold>
  );
}

const useStyles = makeStyles((c) => ({
  note: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.infoCard, borderRadius: 12, padding: 10 },
  noteText: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: c.onSurfaceSecondary, lineHeight: 17 },
}));
