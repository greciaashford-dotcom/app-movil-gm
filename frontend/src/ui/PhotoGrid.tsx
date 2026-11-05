import { Image } from "expo-image";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePhotoPicker } from "@/src/hooks/usePhotoPicker";
import { errorMessage, fileUrl, uploadImage } from "@/src/lib/api";
import { fonts, makeStyles, useTheme } from "@/src/theme";
import { Icon } from "@/src/ui/Icon";
import { PillButton } from "@/src/ui/kit";
import { useToast } from "@/src/ui/toast";

/** Grid of stored photos + upload buttons (camera / gallery) + full screen viewer. */
export function PhotoGrid({
  photos,
  onAdd,
  testIDPrefix,
  emptyText = "Sin fotos todavía",
  max = 20,
}: {
  photos: string[];
  onAdd?: (path: string) => Promise<unknown>;
  testIDPrefix: string;
  emptyText?: string;
  max?: number;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { pick, permissionSheet } = usePhotoPicker();
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const add = async (source: "camera" | "library") => {
    if (!onAdd) return;
    const assets = await pick(source, Math.min(5, max - photos.length));
    if (!assets.length) return;
    setUploading(true);
    try {
      for (const a of assets) {
        const path = await uploadImage(a);
        await onAdd(path);
      }
      toast.show(assets.length > 1 ? "Fotos subidas" : "Foto subida");
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {photos.length === 0 && !uploading ? <Text style={styles.empty}>{emptyText}</Text> : null}
      <View style={styles.grid}>
        {photos.map((p, i) => (
          <Pressable key={`${p}-${i}`} onPress={() => setViewer(p)} testID={`${testIDPrefix}-photo-${i}`} style={styles.thumbWrap}>
            <Image source={{ uri: fileUrl(p) }} style={styles.thumb} contentFit="cover" transition={150} />
          </Pressable>
        ))}
        {uploading ? (
          <View style={[styles.thumbWrap, styles.uploading]}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : null}
      </View>
      {onAdd && photos.length < max ? (
        <View style={styles.actions}>
          <PillButton label="Cámara" icon="camera" variant="ghost" small onPress={() => add("camera")} disabled={uploading} testID={`${testIDPrefix}-camera-button`} style={styles.flex} />
          <PillButton label="Galería" icon="image-plus" variant="ghost" small onPress={() => add("library")} disabled={uploading} testID={`${testIDPrefix}-gallery-button`} style={styles.flex} />
        </View>
      ) : null}
      {permissionSheet}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <View style={styles.viewer}>
          <Image source={{ uri: fileUrl(viewer) }} style={styles.viewerImg} contentFit="contain" />
          <Pressable onPress={() => setViewer(null)} style={[styles.viewerClose, { top: insets.top + 12 }]} testID={`${testIDPrefix}-viewer-close`} accessibilityLabel="Cerrar foto">
            <Icon name="x" size={26} color={colors.onBrand} />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

/** Single photo field (receipts / ads): thumbnail or camera / gallery buttons. */
export function PhotoField({
  value,
  onChange,
  testIDPrefix,
  label = "Foto del ticket o factura",
}: {
  value?: string | null;
  onChange: (path: string | null) => void;
  testIDPrefix: string;
  label?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const { pick, permissionSheet } = usePhotoPicker();
  const [uploading, setUploading] = useState(false);

  const add = async (source: "camera" | "library") => {
    const [asset] = await pick(source, 1);
    if (!asset) return;
    setUploading(true);
    try {
      onChange(await uploadImage(asset));
    } catch (e) {
      toast.show(errorMessage(e), "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {value ? (
        <View style={styles.fieldRow}>
          <Image source={{ uri: fileUrl(value) }} style={styles.fieldThumb} contentFit="cover" />
          <PillButton label="Quitar" icon="trash-2" variant="dangerOutline" small onPress={() => onChange(null)} testID={`${testIDPrefix}-remove-button`} />
        </View>
      ) : uploading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <View style={styles.actions}>
          <PillButton label="Cámara" icon="camera" variant="ghost" small onPress={() => add("camera")} testID={`${testIDPrefix}-camera-button`} style={styles.flex} />
          <PillButton label="Galería" icon="image-plus" variant="ghost" small onPress={() => add("library")} testID={`${testIDPrefix}-gallery-button`} style={styles.flex} />
        </View>
      )}
      {permissionSheet}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: 10 },
  flex: { flex: 1 },
  empty: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: { width: 96, height: 96, borderRadius: 16, overflow: "hidden", backgroundColor: c.canvas },
  thumb: { width: "100%", height: "100%" },
  uploading: { alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 8 },
  viewer: { flex: 1, backgroundColor: c.brandDeepest, alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "100%", height: "80%" },
  viewerClose: { position: "absolute", right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  fieldThumb: { width: 72, height: 72, borderRadius: 14 },
}));
