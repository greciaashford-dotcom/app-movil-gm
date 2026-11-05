import { Tabs } from "expo-router/js-tabs";
import { NativeTabs } from "expo-router/native-tabs";
import React from "react";
import { Platform } from "react-native";

import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";
import { CLIENT_TABS, TabLabel } from "@/src/ui/ClientTabs";
import { Icon } from "@/src/ui/Icon";

export default function ClientTabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brand}>
        {CLIENT_TABS.map((t) => (
          <NativeTabs.Trigger key={t.name} name={t.name}>
            <NativeTabs.Trigger.Icon sf={t.sf as never} />
            <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          </NativeTabs.Trigger>
        ))}
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.onSurfaceInverse,
        tabBarStyle: {
          backgroundColor: colors.surfaceInverse,
          borderTopWidth: 0,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
      }}
    >
      {CLIENT_TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.label,
            popToTopOnBlur: t.name === "servicios",
            tabBarButtonTestID: `tab-${t.name}`,
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={22} color={String(color)} />,
            tabBarLabel: ({ focused, color }) => <TabLabel label={t.label} focused={focused} color={String(color)} />,
          }}
        />
      ))}
    </Tabs>
  );
}
