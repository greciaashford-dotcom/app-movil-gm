import { usePathname, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/ui/Icon";

export const CLIENT_TABS: { name: string; href: string; label: string; icon: IconName; sf: string }[] = [
  { name: "index", href: "/", label: "Inicio", icon: "house", sf: "house.fill" },
  { name: "servicios", href: "/servicios", label: "Servicios", icon: "wrench", sf: "wrench.and.screwdriver.fill" },
  { name: "mis-solicitudes", href: "/mis-solicitudes", label: "Mis solicitudes", icon: "clipboard-list", sf: "list.clipboard.fill" },
  { name: "contacto", href: "/contacto", label: "Contacto", icon: "user-round", sf: "person.crop.circle.fill" },
];

export function TabLabel({ label, focused, color }: { label: string; focused: boolean; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.labelWrap}>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.underline, focused && styles.underlineActive]} />
    </View>
  );
}

/** Same look as the JS tab bar, for full screens outside the tab navigator (e.g. confirmation). */
export function StaticTabBar({ active }: { active: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 6) }, Platform.OS === "web" && styles.barWeb]} testID="static-tab-bar">
      {CLIENT_TABS.map((t) => {
        const focused = t.name === active;
        const color = focused ? colors.brandPrimary : colors.onSurfaceInverse;
        return (
          <Pressable
            key={t.name}
            testID={`static-tab-${t.name}`}
            style={styles.item}
            onPress={() => {
              if (pathname !== t.href) router.dismissTo(t.href as never);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
          >
            <Icon name={t.icon} size={22} color={color} />
            <TabLabel label={t.label} focused={focused} color={color} />
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  labelWrap: { alignItems: "center" },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, marginTop: 2 },
  underline: { height: 3, width: 22, borderRadius: 2, marginTop: 3, backgroundColor: "transparent" },
  underlineActive: { backgroundColor: c.brandPrimary },
  bar: { flexDirection: "row", backgroundColor: c.surfaceInverse, paddingTop: 8 },
  barWeb: { minHeight: 64 },
  item: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48 },
}));
