import * as ImagePicker from "expo-image-picker";
import React, { useCallback, useRef, useState } from "react";
import { Linking, Platform, Text, View } from "react-native";

import { fonts, makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/ui/Icon";
import { PillButton } from "@/src/ui/kit";
import { Sheet } from "@/src/ui/Sheet";

export type PhotoSource = "camera" | "library";

type Prompt = { source: PhotoSource; blocked: boolean };

/**
 * Photo picking with a contextual pre-permission explanation, a second chance
 * when denied, and an "Abrir ajustes" button when permanently blocked.
 */
export function usePhotoPicker() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = (p: Prompt) =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPrompt(p);
    });

  const answer = (ok: boolean) => {
    setPrompt(null);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const ensurePermission = useCallback(async (source: PhotoSource) => {
    if (Platform.OS === "web") return true;
    const current = source === "camera" ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    const blocked = current.status === "denied" && !current.canAskAgain;
    const proceed = await ask({ source, blocked });
    if (!proceed) return false;
    if (blocked) {
      await Linking.openSettings();
      return false;
    }
    const res = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    return res.granted;
  }, []);

  const pick = useCallback(
    async (source: PhotoSource, max = 1): Promise<ImagePicker.ImagePickerAsset[]> => {
      if (!(await ensurePermission(source))) return [];
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 0.6,
        allowsMultipleSelection: source === "library" && max > 1,
        selectionLimit: max,
      };
      const result = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled) return [];
      return result.assets.slice(0, max);
    },
    [ensurePermission],
  );

  const permissionSheet = <PermissionSheet prompt={prompt} onAnswer={answer} />;
  return { pick, permissionSheet };
}

function PermissionSheet({ prompt, onAnswer }: { prompt: Prompt | null; onAnswer: (ok: boolean) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const camera = prompt?.source === "camera";
  return (
    <Sheet visible={!!prompt} onClose={() => onAnswer(false)} title={camera ? "Usar la cámara" : "Acceder a tus fotos"} testID="permission-sheet">
      <View style={styles.row}>
        <View style={styles.icon}>
          <Icon name={camera ? "camera" : "image"} size={26} color={colors.brand} />
        </View>
        <Text style={styles.text}>
          {prompt?.blocked
            ? `El acceso a ${camera ? "la cámara" : "tus fotos"} está desactivado. Actívalo en los ajustes del teléfono para adjuntar fotos del trabajo.`
            : `Las fotos ayudan a nuestro equipo a entender el trabajo y darte un presupuesto más preciso. Solo usaremos ${camera ? "la cámara" : "las fotos"} que tú elijas.`}
        </Text>
      </View>
      <PillButton
        label={prompt?.blocked ? "Abrir ajustes" : "Continuar"}
        icon={prompt?.blocked ? "settings" : "check"}
        onPress={() => onAnswer(true)}
        testID="permission-continue-button"
      />
      <PillButton label="Ahora no" variant="outline" onPress={() => onAnswer(false)} testID="permission-cancel-button" />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  icon: { width: 52, height: 52, borderRadius: 26, backgroundColor: c.infoCard, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.onSurface },
}));
