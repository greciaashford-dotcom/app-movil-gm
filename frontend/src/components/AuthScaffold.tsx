import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { fonts, makeStyles, radius, useTheme } from "@/src/theme";
import { BrandLogo } from "@/src/ui/BrandLogo";
import { Icon } from "@/src/ui/Icon";

/** Navy full-screen layout shared by the login and sign-up screens. */
export function AuthScaffold({
  title,
  subtitle,
  children,
  footer,
  testID,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testID: string;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen} testID={testID}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
      >
        <Animated.View entering={FadeInDown.duration(380)} style={styles.head}>
          <BrandLogo />
          <View style={styles.pill}>
            <Text style={styles.pillText}>
              Una plataforma de <Text style={styles.pillStrong}>GM Reforma Express</Text>
            </Text>
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(90).duration(380)} style={styles.card}>
          <Text style={styles.title} testID={`${testID}-title`}>
            {title}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          {children}
        </Animated.View>
        {footer ? <Animated.View entering={FadeInDown.delay(160).duration(380)}>{footer}</Animated.View> : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

/** Multi-colour Google "G" (third-party brand colours stay fixed in every theme). */
function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <Path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <Path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <Path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
    </Svg>
  );
}

export function GoogleButton({ onPress, loading, testID }: { onPress: () => void; loading?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel="Continuar con Google"
      style={({ pressed }) => [styles.google, pressed && styles.pressed, loading && styles.disabled]}
    >
      {loading ? <ActivityIndicator color={colors.brand} /> : <GoogleMark />}
      <Text style={styles.googleText}>Continuar con Google</Text>
    </Pressable>
  );
}

export function OrDivider({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.divider}>
      <View style={styles.line} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

/** Password input with show / hide toggle. */
export function PasswordField({ label, testID, hint, ...props }: TextInputProps & { label: string; testID: string; hint?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.passwordWrap}>
        <TextInput
          testID={testID}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
          style={styles.passwordInput}
          {...props}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          style={styles.eye}
          testID={`${testID}-toggle`}
          accessibilityLabel={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          <Icon name={visible ? "eye-off" : "eye"} size={20} color={colors.muted} />
        </Pressable>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function FormError({ message, testID }: { message: string | null; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View style={styles.errorBox} testID={testID}>
      <Icon name="circle-alert" size={18} color={colors.urgent} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function AuthLink({ text, action, onPress, testID }: { text: string; action: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.link} testID={testID} accessibilityRole="link">
      <Text style={styles.linkText}>
        {text} <Text style={styles.linkAction}>{action}</Text>
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.brand },
  content: { flexGrow: 1, paddingHorizontal: 16, gap: 20, justifyContent: "center" },
  head: { alignItems: "center", gap: 10 },
  pill: { borderWidth: 1.5, borderColor: c.pillBorder, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 5, backgroundColor: c.brandDeep },
  pillText: { fontFamily: fonts.body, fontSize: 13, color: c.onBrand },
  pillStrong: { fontFamily: fonts.bodyBold },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.xl,
    padding: 20,
    gap: 14,
    shadowColor: c.brandDeepest,
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: { fontFamily: fonts.black, fontSize: 24, color: c.brandDeep },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: c.muted, lineHeight: 20, marginTop: -6 },
  google: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 18,
  },
  googleText: { fontFamily: fonts.bodySemi, fontSize: 15.5, color: c.onSurface },
  pressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  disabled: { opacity: 0.6 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: c.divider },
  dividerText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: c.muted },
  field: { gap: 6 },
  fieldLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  passwordWrap: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: { flex: 1, minHeight: 48, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: c.onSurface },
  eye: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  hint: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: c.errorSoft, borderRadius: 12, padding: 12 },
  errorText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: c.urgentTitle, lineHeight: 18 },
  link: { alignSelf: "center", minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
  linkText: { fontFamily: fonts.body, fontSize: 14.5, color: c.onBrand, textAlign: "center" },
  linkAction: { fontFamily: fonts.bodyBold, color: c.brandPrimary },
}));
