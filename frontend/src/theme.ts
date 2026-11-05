// Design tokens for GM Conecta. Light theme only (brand identity is fixed).
// Keys match the "color" block of /app/design_guidelines.json plus the brand's
// semantic service colors. Never write color literals in components.

import { useMemo } from "react";
import { Appearance, ImageStyle, StyleSheet, TextStyle, useColorScheme, ViewStyle } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  // Surfaces
  surface: "#FFFFFF",
  onSurface: "#081B35",
  surfaceSecondary: "#E3F0FF",
  onSurfaceSecondary: "#001D3D",
  surfaceTertiary: "#FFF3CD",
  onSurfaceTertiary: "#071B35",
  surfaceInverse: "#001D3D",
  onSurfaceInverse: "#FFFFFF",
  muted: "#556476",
  canvas: "#F2F6FB",

  // Brand
  brand: "#002B55",
  onBrand: "#FFFFFF",
  brandPrimary: "#FFCC00",
  onBrandPrimary: "#001D3D",
  brandSecondary: "#0055A5",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#002659",
  onBrandTertiary: "#FFFFFF",
  brandDeep: "#001D3D",
  brandDeepest: "#00152E",
  brandBright: "#0076CE",
  logoYellow: "#FFD21A",
  yellowSecondary: "#FFB900",
  textDark: "#071B35",
  pillBorder: "#6FA8E0",

  // Status
  success: "#00AA27",
  onSuccess: "#FFFFFF",
  successSoft: "#E2F6E7",
  warning: "#C95413",
  onWarning: "#FFFFFF",
  warningSoft: "#FBEADF",
  error: "#BD0000",
  onError: "#FFFFFF",
  errorSoft: "#FDE9E7",
  info: "#008438",
  onInfo: "#FFFFFF",

  // Services & semantic
  plumbingBlue: "#008BC2",
  waterDrop: "#00CFFF",
  renovation: "#C95413",
  urgent: "#BD0000",
  urgentTitle: "#A50000",
  urgentBorder: "#FF0000",
  urgentBg: "#FFF7F5",
  call: "#008438",
  infoCard: "#E3F0FF",
  infoDivider: "#CFDCE9",
  noteCard: "#FFF3CD",

  // Lines
  border: "#CFDCE9",
  borderStrong: "#0076CE",
  divider: "#CFDCE9",
  overlay: "rgba(0,21,46,0.55)",
  heroFade: "rgba(255,255,255,0)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 8, md: 16, lg: 22, xl: 24, xxl: 30, pill: 999 };

export const fonts = {
  logo: "Montserrat-BlackItalic",
  black: "Montserrat-Black",
  extraBold: "Montserrat-ExtraBold",
  extraBoldItalic: "Montserrat-ExtraBoldItalic",
  bold: "Montserrat-Bold",
  boldItalic: "Montserrat-BoldItalic",
  body: "Inter-Regular",
  bodyMedium: "Inter-Medium",
  bodySemi: "Inter-SemiBold",
  bodyBold: "Inter-Bold",
};

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = (system === "light" || system === "dark") && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

export function makeStyles<T extends NamedStyles<T>>(factory: (colors: ThemeColors) => T): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors) as never) as T, [colors]);
  };
}
