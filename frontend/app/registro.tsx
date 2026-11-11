import { useRouter } from "expo-router";
import React, { useState } from "react";

import { useAuth } from "@/src/auth";
import { AuthLink, AuthScaffold, FormError, GoogleButton, OrDivider, PasswordField } from "@/src/components/AuthScaffold";
import { errorMessage } from "@/src/lib/api";
import { EMAIL_RE } from "@/src/lib/format";
import { Field, PillButton } from "@/src/ui/kit";

export default function RegistroScreen() {
  const router = useRouter();
  const { signUp, signInWithGoogle } = useAuth();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (nombre.trim().length < 2) return setError("Indica tu nombre");
    if (!EMAIL_RE.test(email.trim())) return setError("Introduce un correo electrónico válido");
    if (password.length < 8 || !/\d/.test(password) || !/[a-zA-ZÀ-ÿ]/.test(password)) {
      return setError("La contraseña debe tener al menos 8 caracteres, con letras y números");
    }
    if (password !== repetir) return setError("Las contraseñas no coinciden");
    setLoading(true);
    try {
      await signUp(nombre.trim(), email.trim().toLowerCase(), password);
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

  const goLogin = () => (router.canGoBack() ? router.back() : router.replace("/login"));

  return (
    <AuthScaffold
      testID="register-screen"
      title="Crea tu cuenta"
      subtitle="Un solo registro para clientes, trabajadores, ferreterías y administración."
      footer={<AuthLink text="¿Ya tienes cuenta?" action="Inicia sesión" onPress={goLogin} testID="register-go-login-link" />}
    >
      <GoogleButton onPress={google} loading={googleLoading} testID="register-google-button" />
      <OrDivider label="o regístrate con tu correo" />
      <Field label="Nombre y apellidos" value={nombre} onChangeText={setNombre} placeholder="Tu nombre" autoComplete="name" textContentType="name" returnKeyType="next" testID="register-name-input" />
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
        testID="register-email-input"
      />
      <PasswordField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        placeholder="Mínimo 8 caracteres"
        autoComplete="new-password"
        textContentType="newPassword"
        hint="Al menos 8 caracteres, con letras y números."
        returnKeyType="next"
        testID="register-password-input"
      />
      <PasswordField
        label="Repite la contraseña"
        value={repetir}
        onChangeText={setRepetir}
        placeholder="Repite la contraseña"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        testID="register-password-confirm-input"
      />
      <FormError message={error} testID="register-error" />
      <PillButton label="Crear cuenta" icon="user-plus" onPress={submit} loading={loading} testID="register-submit-button" />
    </AuthScaffold>
  );
}
