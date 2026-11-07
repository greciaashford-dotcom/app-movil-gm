import React from "react";
import Svg, { Line, Path, Rect } from "react-native-svg";

import { useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/ui/Icon";

/** Filled, colourful service illustrations used on the home screen (48×48 artboard). */
export function ServiceArt({ slug, size = 32, fallback }: { slug: string; size?: number; fallback: IconName }) {
  const { colors: c } = useTheme();
  switch (slug) {
    case "fontaneria":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Rect x={18} y={5} width={16} height={4.5} rx={2.25} fill={c.brandBright} />
          <Rect x={23.75} y={8} width={4.5} height={8} fill={c.brandBright} />
          <Path d="M43 15 H15 C9.5 15 6 18.5 6 24 V29 H14 V25 C14 24.4 14.4 24 15 24 H43 Z" fill={c.plumbingBlue} />
          <Rect x={39} y={11.5} width={6} height={16} rx={1.5} fill={c.brandSecondary} />
          <Path d="M10 33 C10 33 6.2 37.8 6.2 40.4 a3.8 3.8 0 0 0 7.6 0 C13.8 37.8 10 33 10 33 Z" fill={c.waterDrop} />
        </Svg>
      );
    case "electricidad":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Path d="M29 3 L9 27 H22 L17.5 45 L39.5 19 H26.5 Z" fill={c.brandPrimary} stroke={c.yellowSecondary} strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      );
    case "pintura":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          <Path d="M36 12 H40 a2 2 0 0 1 2 2 V20 a2 2 0 0 1 -2 2 H26 a2 2 0 0 0 -2 2 V30" stroke={c.yellowSecondary} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Rect x={5} y={5} width={32} height={13} rx={4} fill={c.brandPrimary} />
          <Rect x={5} y={5} width={6} height={13} rx={3} fill={c.yellowSecondary} />
          <Rect x={20.5} y={29} width={7} height={16} rx={3.5} fill={c.brandDeep} />
        </Svg>
      );
    case "reformas":
      return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
          {[
            [3, 9, 20], [25, 9, 20],
            [3, 19.5, 9], [14, 19.5, 20], [36, 19.5, 9],
            [3, 30, 20], [25, 30, 20],
          ].map(([x, y, w]) => (
            <Rect key={`${x}-${y}`} x={x} y={y} width={w} height={8.5} rx={1.6} fill={c.renovation} />
          ))}
        </Svg>
      );
    default:
      return <Icon name={fallback} size={size * 0.8} color={c.brand} />;
  }
}

/** Red emergency beacon used in the 24h urgencies block. */
export function SirenArt({ size = 48 }: { size?: number }) {
  const { colors: c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {[
        [24, 3, 24, 8.5],
        [9.5, 8.5, 13, 12.5],
        [38.5, 8.5, 35, 12.5],
        [3, 22, 8, 22],
        [45, 22, 40, 22],
      ].map(([x1, y1, x2, y2]) => (
        <Line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c.urgent} strokeWidth={3} strokeLinecap="round" />
      ))}
      <Path d="M13.5 35 V25 a10.5 10.5 0 0 1 21 0 V35 Z" fill={c.urgentBorder} />
      <Path d="M18.5 30 V25 a5.5 5.5 0 0 1 5.5 -5.5" stroke={c.surface} strokeOpacity={0.75} strokeWidth={2.6} fill="none" strokeLinecap="round" />
      <Rect x={9.5} y={34} width={29} height={8} rx={2.5} fill={c.urgentTitle} />
    </Svg>
  );
}
