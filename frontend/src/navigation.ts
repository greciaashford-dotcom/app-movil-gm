import { Platform } from "react-native";

// iOS 26+ renders the native Liquid Glass tab bar; everything else uses JS tabs.
export const usesNativeTabs = Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;
