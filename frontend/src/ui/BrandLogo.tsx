import React from "react";
import { Text, View } from "react-native";
import Svg, { Ellipse, Line, Path, Rect } from "react-native-svg";

import { fonts, makeStyles, useTheme } from "@/src/theme";

/** Isotipo: casa minimalista + wifi + órbita con cursor y destellos. */
export function Isotype({ size = 56 }: { size?: number }) {
  const { colors } = useTheme();
  const y = colors.logoYellow;
  const w = colors.onBrand;
  const h = size * 0.86;
  return (
    <Svg width={size} height={h} viewBox="0 0 120 104" testID="brand-isotype">
      {/* órbita */}
      <Ellipse cx={58} cy={66} rx={54} ry={20} stroke={y} strokeWidth={3.5} fill="none" strokeDasharray="230 30" transform="rotate(-14 58 66)" />
      {/* wifi */}
      <Path d="M46 22 Q58 12 70 22" stroke={y} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Path d="M39 15 Q58 0 77 15" stroke={y} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Path d="M52 28 Q58 24 64 28" stroke={y} strokeWidth={4} fill="none" strokeLinecap="round" />
      {/* tejado */}
      <Path d="M24 60 L58 34 L92 60" stroke={w} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* chimenea */}
      <Rect x={77} y={34} width={8} height={16} rx={2} fill={w} />
      {/* muros */}
      <Path d="M33 58 L33 84 L83 84 L83 58" stroke={w} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* ventana 2x2 */}
      <Rect x={49} y={56} width={8} height={8} rx={1.5} fill={y} />
      <Rect x={59} y={56} width={8} height={8} rx={1.5} fill={y} />
      <Rect x={49} y={66} width={8} height={8} rx={1.5} fill={y} />
      <Rect x={59} y={66} width={8} height={8} rx={1.5} fill={y} />
      {/* cursor */}
      <Path d="M96 70 L96 92 L101 87 L105 96 L109 94 L105 85 L112 85 Z" fill={w} stroke={colors.brand} strokeWidth={1.5} strokeLinejoin="round" />
      {/* destellos */}
      <Line x1={92} y1={64} x2={89} y2={59} stroke={y} strokeWidth={3} strokeLinecap="round" />
      <Line x1={100} y1={62} x2={101} y2={56} stroke={y} strokeWidth={3} strokeLinecap="round" />
      <Line x1={107} y1={67} x2={112} y2={63} stroke={y} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

export function Wordmark({ size = 30 }: { size?: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View testID="brand-wordmark">
      <Text style={[styles.word, { fontSize: size, lineHeight: size * 1.15 }]} accessibilityRole="header">
        GM <Text style={styles.conecta}>Conecta</Text>
      </Text>
      <Svg width={size * 3.1} height={size * 0.32} viewBox="0 0 100 10" preserveAspectRatio="none" style={styles.swoosh}>
        <Path d="M3 7 Q50 1 97 5" stroke={colors.brandPrimary} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      </Svg>
    </View>
  );
}

export function Slogan({ size = 13 }: { size?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.sloganRow} testID="brand-slogan">
      <View style={styles.sloganLine} />
      <Text style={[styles.slogan, { fontSize: size }]}>Servicios para tu hogar</Text>
      <View style={styles.sloganLine} />
    </View>
  );
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.logoRow}>
      <Isotype size={compact ? 40 : 58} />
      <View style={styles.logoText}>
        <Wordmark size={compact ? 21 : 30} />
        <Slogan size={compact ? 10 : 12.5} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  word: { fontFamily: fonts.logo, color: c.onBrand, letterSpacing: -0.5 },
  conecta: { color: c.brandPrimary },
  swoosh: { alignSelf: "flex-end", marginTop: -3 },
  sloganRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  sloganLine: { height: 2, width: 14, backgroundColor: c.logoYellow, borderRadius: 1 },
  slogan: { fontFamily: fonts.boldItalic, color: c.onBrand },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoText: { alignItems: "flex-start" },
}));
