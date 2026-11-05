import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/ui/Icon";

type Tone = "success" | "error" | "info";
type ToastState = { id: number; message: string; tone: Tone } | null;

const ToastCtx = createContext<{ show: (message: string, tone?: Tone) => void }>({ show: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();

  const show = useCallback((message: string, tone: Tone = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, tone });
    timer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const bg = toast?.tone === "error" ? colors.error : toast?.tone === "info" ? colors.brandDeep : colors.success;
  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInUp}
          exiting={FadeOutUp}
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + 8 }]}
        >
          <View style={[styles.toast, { backgroundColor: bg }]} testID="app-toast">
            <Icon name={toast.tone === "error" ? "circle-alert" : toast.tone === "info" ? "info" : "circle-check"} size={20} color={colors.onSuccess} />
            <Text style={styles.text} testID="app-toast-message">{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", left: 16, right: 16, elevation: 20 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    shadowColor: c.brandDeepest,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  text: { flex: 1, color: c.onSuccess, fontFamily: fonts.bodySemi, fontSize: 14 },
}));
