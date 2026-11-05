import Lucide, { type LucideIconName } from "@react-native-vector-icons/lucide";
import React from "react";
import type { StyleProp, TextStyle } from "react-native";

export type IconName = LucideIconName;

export function Icon({
  name,
  size = 20,
  color,
  style,
  testID,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}) {
  return <Lucide name={name} size={size} color={color} style={style} testID={testID} />;
}
