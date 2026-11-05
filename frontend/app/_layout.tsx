import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { fonts, useTheme } from "@/src/theme";
import { DrawerProvider } from "@/src/ui/drawer";
import { ToastProvider } from "@/src/ui/toast";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { colors } = useTheme();
  // Pre-warm every font (brand fonts + the Lucide icon font) before the first
  // render so icons never show as empty boxes in Expo Go.
  const [loaded, error] = useFonts({
    [fonts.logo]: require("../assets/fonts/Montserrat-BlackItalic.ttf"),
    [fonts.black]: require("../assets/fonts/Montserrat-Black.ttf"),
    [fonts.extraBold]: require("../assets/fonts/Montserrat-ExtraBold.ttf"),
    [fonts.extraBoldItalic]: require("../assets/fonts/Montserrat-ExtraBoldItalic.ttf"),
    [fonts.bold]: require("../assets/fonts/Montserrat-Bold.ttf"),
    [fonts.boldItalic]: require("../assets/fonts/Montserrat-BoldItalic.ttf"),
    [fonts.body]: require("../assets/fonts/Inter-Regular.ttf"),
    [fonts.bodyMedium]: require("../assets/fonts/Inter-Medium.ttf"),
    [fonts.bodySemi]: require("../assets/fonts/Inter-SemiBold.ttf"),
    [fonts.bodyBold]: require("../assets/fonts/Inter-Bold.ttf"),
    Lucide: require("@react-native-vector-icons/lucide/fonts/Lucide.ttf"),
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // One app level ErrorBoundary; GestureHandlerRootView wraps the whole tree.
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <KeyboardProvider>
              <AuthProvider>
                <ToastProvider>
                  <DrawerProvider>
                    <StatusBar style="light" />
                    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.canvas } }} />
                  </DrawerProvider>
                </ToastProvider>
              </AuthProvider>
            </KeyboardProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
