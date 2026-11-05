import { Redirect, Stack } from "expo-router";
import React from "react";
import { View } from "react-native";

import { StaffRole, useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme";
import { LoadingView } from "@/src/ui/kit";

/** Stack layout that only renders for the given staff role (PIN protected). */
export function RoleStack({ role }: { role: StaffRole }) {
  const { hydrated, role: current } = useAuth();
  const { colors } = useTheme();
  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <LoadingView />
      </View>
    );
  }
  if (current !== role) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />;
}
