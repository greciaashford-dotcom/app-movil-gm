import { useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, useTheme } from "@/src/theme";
import { BrandLogo } from "@/src/ui/BrandLogo";
import { useDrawer } from "@/src/ui/drawer";
import { Icon } from "@/src/ui/Icon";

/** Client-facing header with the GM Conecta logo. */
export function BrandHeader({ variant = "home", showBack, onBack }: { variant?: "home" | "compact"; showBack?: boolean; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { open } = useDrawer();
  const router = useRouter();

  const back = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  if (variant === "home") {
    return (
      <View style={[styles.home, { paddingTop: insets.top + 10 }]} testID="brand-header">
        <BrandLogo />
        <View style={styles.pill} testID="brand-header-pill">
          <Text style={styles.pillText}>Una plataforma de GM Reforma Express</Text>
        </View>
        <Pressable onPress={open} style={[styles.menuAbs, { top: insets.top + 6 }]} hitSlop={8} testID="header-menu-button" accessibilityLabel="Abrir menú">
          <Icon name="menu" size={26} color={colors.onBrand} />
        </Pressable>
      </View>
    );
  }
  return (
    <View style={[styles.compact, { paddingTop: insets.top + 6 }]} testID="brand-header">
      {showBack ? (
        <Pressable onPress={back} style={styles.sideBtn} hitSlop={8} testID="header-back-button" accessibilityLabel="Volver">
          <Icon name="chevron-left" size={28} color={colors.onBrand} />
        </Pressable>
      ) : (
        <View style={styles.sideBtn} />
      )}
      <BrandLogo compact />
      <Pressable onPress={open} style={styles.sideBtn} hitSlop={8} testID="header-menu-button" accessibilityLabel="Abrir menú">
        <Icon name="menu" size={26} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}

/** Header for staff areas (admin / worker / hardware store). */
export function AppBar({
  title,
  subtitle,
  showBack = true,
  right,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();
  const { open } = useDrawer();
  const router = useRouter();
  return (
    <View style={[styles.appbar, { paddingTop: insets.top + 6 }]} testID="app-bar">
      {showBack ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          style={styles.sideBtn}
          hitSlop={8}
          testID="appbar-back-button"
          accessibilityLabel="Volver"
        >
          <Icon name="chevron-left" size={28} color={colors.onBrand} />
        </Pressable>
      ) : null}
      <View style={styles.titleWrap}>
        <Text style={styles.title} numberOfLines={1} testID="appbar-title">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      <Pressable onPress={open} style={styles.sideBtn} hitSlop={8} testID="header-menu-button" accessibilityLabel="Abrir menú">
        <Icon name="menu" size={26} color={colors.onBrand} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  home: { backgroundColor: c.brand, alignItems: "center", paddingBottom: 16, gap: 10 },
  pill: { borderWidth: 1.5, borderColor: c.pillBorder, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 5 },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.onBrand },
  menuAbs: { position: "absolute", right: 10, width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  compact: { backgroundColor: c.brandDeep, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingBottom: 10 },
  sideBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  appbar: { backgroundColor: c.brandDeep, flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10, gap: 4 },
  titleWrap: { flex: 1, paddingHorizontal: 6 },
  title: { fontFamily: fonts.extraBold, fontSize: 19, color: c.onBrand },
  subtitle: { fontFamily: fonts.body, fontSize: 12, color: c.pillBorder, marginTop: 1 },
}));
