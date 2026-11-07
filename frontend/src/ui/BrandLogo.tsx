import React from "react";
import { Image, View } from "react-native";

import { makeStyles } from "@/src/theme";

/** Official GM Conecta logo artwork (house mark + wordmark + tagline), supplied by the client. */
const LOGO_SOURCE = require("../../assets/images/gm-logo-trim.png");
const LOGO_RATIO = 1356 / 494;

/** Full logo lockup rendered from the brand artwork (trimmed to its visible bounds). Height drives the layout; width follows the source aspect ratio. */
export function BrandLogo({ compact = false }: { compact?: boolean }) {
  const styles = useStyles();
  const height = compact ? 23 : 84;
  const width = height * LOGO_RATIO;
  return (
    <View style={[styles.logoRow, compact && styles.compactRow]} testID="brand-logo">
      <Image source={LOGO_SOURCE} style={{ width, height }} resizeMode="contain" accessibilityRole="image" accessibilityLabel="GM Conecta" />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  logoRow: { alignItems: "center", justifyContent: "center" },
  compactRow: { height: 46 },
}));
