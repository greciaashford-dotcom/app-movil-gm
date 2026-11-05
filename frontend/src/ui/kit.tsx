import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from "react-native";

import type { Tone } from "@/src/lib/constants";
import { fonts, makeStyles, radius, ThemeColors, useTheme } from "@/src/theme";
import { Icon, IconName } from "@/src/ui/Icon";

// ------------------------------------------------------------------ buttons
type Variant = "primary" | "outline" | "navy" | "call" | "dangerOutline" | "danger" | "ghost" | "success";

export function PillButton({
  label,
  icon,
  iconRight,
  variant = "primary",
  onPress,
  disabled,
  loading,
  testID,
  small,
  style,
}: {
  label: string;
  icon?: IconName;
  iconRight?: IconName;
  variant?: Variant;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const v = variantColors(variant, colors);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.borderWidth },
        (disabled || loading) && styles.btnDisabled,
        pressed && styles.btnPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={small ? 17 : 20} color={v.fg} /> : null}
          <Text style={[styles.btnText, small && styles.btnTextSmall, { color: v.fg }]} numberOfLines={1}>
            {label}
          </Text>
          {iconRight ? <Icon name={iconRight} size={small ? 17 : 20} color={v.fg} /> : null}
        </>
      )}
    </Pressable>
  );
}

function variantColors(v: Variant, c: ThemeColors) {
  switch (v) {
    case "outline":
      return { bg: c.surface, fg: c.brandDeep, border: c.brand, borderWidth: 3 };
    case "navy":
      return { bg: c.brand, fg: c.onBrand, border: c.brand, borderWidth: 0 };
    case "call":
      return { bg: c.call, fg: c.onInfo, border: c.call, borderWidth: 0 };
    case "success":
      return { bg: c.success, fg: c.onSuccess, border: c.success, borderWidth: 0 };
    case "dangerOutline":
      return { bg: c.surface, fg: c.urgent, border: c.urgent, borderWidth: 2 };
    case "danger":
      return { bg: c.urgent, fg: c.onError, border: c.urgent, borderWidth: 0 };
    case "ghost":
      return { bg: c.infoCard, fg: c.brand, border: c.infoCard, borderWidth: 0 };
    default:
      return { bg: c.brandPrimary, fg: c.onBrandPrimary, border: c.brandPrimary, borderWidth: 0 };
  }
}

export function IconButton({
  icon,
  onPress,
  testID,
  color,
  bg,
  size = 44,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  testID?: string;
  color?: string;
  bg?: string;
  size?: number;
  label?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? colors.canvas },
        pressed && styles.btnPressed,
      ]}
    >
      <Icon name={icon} size={size * 0.46} color={color ?? colors.brand} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ containers
export function Card({
  children,
  style,
  tone = "white",
  testID,
  onPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "white" | "blue" | "yellow";
  testID?: string;
  onPress?: () => void;
}) {
  const styles = useStyles();
  const toneStyle = tone === "blue" ? styles.cardBlue : tone === "yellow" ? styles.cardYellow : styles.cardWhite;
  if (onPress) {
    return (
      <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.card, toneStyle, pressed && styles.cardPressed, style]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[styles.card, toneStyle, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} testID={testID}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ chips
export function Chip({
  label,
  selected,
  onPress,
  testID,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  icon?: IconName;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.btnPressed]}
    >
      {icon ? <Icon name={icon} size={15} color={selected ? colors.onBrand : colors.brand} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChipRow({ children, testID, style }: { children: React.ReactNode; testID?: string; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <View style={[styles.chipRowWrap, style]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} testID={testID} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  testIDPrefix: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testIDPrefix}-${o.value.toLowerCase()}`}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            accessibilityState={{ selected: active }}
          >
            {o.icon ? <Icon name={o.icon} size={16} color={active ? colors.onBrandPrimary : colors.onBrand} /> : null}
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ badges / kpis
export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: Tone; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = toneColors(tone, colors);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]} testID={testID}>
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function toneColors(tone: Tone, c: ThemeColors) {
  switch (tone) {
    case "success":
      return { bg: c.successSoft, fg: c.info };
    case "warning":
      return { bg: c.warningSoft, fg: c.warning };
    case "error":
      return { bg: c.errorSoft, fg: c.urgentTitle };
    case "yellow":
      return { bg: c.noteCard, fg: c.textDark };
    case "info":
      return { bg: c.infoCard, fg: c.brandSecondary };
    case "navy":
      return { bg: c.brand, fg: c.onBrand };
    default:
      return { bg: c.canvas, fg: c.muted };
  }
}

export function KpiCard({
  label,
  value,
  icon,
  tone = "info",
  testID,
  onPress,
  hint,
}: {
  label: string;
  value: string;
  icon: IconName;
  tone?: Tone;
  testID?: string;
  onPress?: () => void;
  hint?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = toneColors(tone, colors);
  return (
    <Pressable testID={testID} onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.kpi, pressed && styles.cardPressed]}>
      <View style={[styles.kpiIcon, { backgroundColor: t.bg }]}>
        <Icon name={icon} size={18} color={t.fg} />
      </View>
      <Text
        style={[styles.kpiValue, value.length > 8 ? styles.kpiValueXs : value.length > 6 ? styles.kpiValueSm : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        testID={testID ? `${testID}-value` : undefined}
      >
        {value}
      </Text>
      <Text style={styles.kpiLabel} numberOfLines={2}>
        {label}
      </Text>
      {hint ? <Text style={styles.kpiHint} numberOfLines={1}>{hint}</Text> : null}
    </Pressable>
  );
}

export function ProgressBar({ value, testID }: { value: number; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.progressTrack} testID={testID}>
      <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, value))}%` }]} />
    </View>
  );
}

// ------------------------------------------------------------------ form
export function Field({
  label,
  error,
  testID,
  multiline,
  style,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string | null; testID?: string; hint?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMulti, !!error && styles.inputError, style]}
        textAlignVertical={multiline ? "top" : "center"}
        {...props}
      />
      {error ? (
        <Text style={styles.fieldError} testID={testID ? `${testID}-error` : undefined}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

// ------------------------------------------------------------------ states
export function LoadingView({ label = "Cargando…" }: { label?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.center} testID="loading-view">
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.centerText}>{label}</Text>
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.center} testID="error-view">
      <Icon name="triangle-alert" size={36} color={colors.urgent} />
      <Text style={styles.centerText}>{message}</Text>
      {onRetry ? <PillButton label="Reintentar" icon="refresh-cw" onPress={onRetry} testID="error-retry-button" small /> : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
  onAction,
  testID,
}: {
  icon: IconName;
  title: string;
  text?: string;
  action?: string;
  onAction?: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.empty} testID={testID ?? "empty-state"}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} color={colors.brand} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {text ? <Text style={styles.emptyText}>{text}</Text> : null}
      {action ? <PillButton label={action} onPress={onAction} small testID={testID ? `${testID}-action` : "empty-state-action"} /> : null}
    </View>
  );
}

export function InfoRow({
  icon,
  label,
  value,
  last,
  testID,
}: {
  icon: IconName;
  label: string;
  value: string;
  last?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Icon name={icon} size={20} color={colors.textDark} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} testID={testID} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export function MoneyRow({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "plus" | "minus" | "result" }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const color = tone === "minus" ? colors.urgent : tone === "result" ? colors.info : colors.onSurface;
  return (
    <View style={styles.moneyRow}>
      <Text style={[styles.moneyLabel, strong && styles.moneyStrong]}>{label}</Text>
      <Text style={[styles.moneyValue, strong && styles.moneyStrong, { color }]}>{value}</Text>
    </View>
  );
}

export function Fab({ label, icon, onPress, testID, bottom }: { label: string; icon: IconName; onPress: () => void; testID: string; bottom: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.fab, { bottom }, pressed && styles.btnPressed]}>
      <Icon name={icon} size={22} color={colors.onBrandPrimary} />
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  btn: {
    minHeight: 54,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  btnSmall: { minHeight: 44, paddingHorizontal: 16, gap: 8 },
  btnText: { fontFamily: fonts.extraBold, fontSize: 16, flexShrink: 1 },
  btnTextSmall: { fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  btnPressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  iconBtn: { alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radius.xl, padding: 16 },
  cardWhite: {
    backgroundColor: c.surface,
    shadowColor: c.brandDeepest,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardBlue: { backgroundColor: c.infoCard },
  cardYellow: { backgroundColor: c.noteCard },
  cardPressed: { transform: [{ scale: 0.985 }], opacity: 0.95 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 18, color: c.brandDeep },
  sectionAction: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandSecondary },
  chipRowWrap: { height: 56, justifyContent: "center" },
  chipRow: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipSelected: { backgroundColor: c.brand, borderColor: c.brand },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.brand },
  chipTextSelected: { color: c.onBrand },
  segment: { flexDirection: "row", backgroundColor: c.brandDeep, borderRadius: radius.pill, padding: 4, gap: 4 },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 8,
  },
  segmentItemActive: { backgroundColor: c.brandPrimary },
  segmentText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onBrand },
  segmentTextActive: { color: c.onBrandPrimary },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 12 },
  kpi: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: 14,
    gap: 4,
    shadowColor: c.brandDeepest,
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  kpiIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  kpiValue: { fontFamily: fonts.black, fontSize: 22, color: c.brandDeep },
  kpiValueSm: { fontSize: 18 },
  kpiValueXs: { fontSize: 15 },
  kpiLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: c.muted, lineHeight: 16 },
  kpiHint: { fontFamily: fonts.body, fontSize: 11, color: c.muted },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: c.infoDivider, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: c.brandPrimary },
  field: { gap: 6 },
  fieldLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandDeep },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: c.onSurface,
  },
  inputMulti: { minHeight: 120, paddingTop: 12, paddingBottom: 12 },
  inputError: { borderColor: c.urgent },
  fieldError: { fontFamily: fonts.bodyMedium, fontSize: 12, color: c.urgent },
  fieldHint: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  centerText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: c.muted, textAlign: "center" },
  empty: { alignItems: "center", gap: 10, paddingVertical: 32, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: c.infoCard, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontFamily: fonts.extraBold, fontSize: 17, color: c.brandDeep, textAlign: "center" },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: c.muted, textAlign: "center", lineHeight: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13 },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: c.infoDivider },
  infoLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: c.textDark },
  infoValue: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: c.textDark, textAlign: "right" },
  moneyRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  moneyLabel: { fontFamily: fonts.body, fontSize: 14, color: c.onSurfaceSecondary, flex: 1 },
  moneyValue: { fontFamily: fonts.bodySemi, fontSize: 14 },
  moneyStrong: { fontFamily: fonts.extraBold, fontSize: 17 },
  fab: {
    position: "absolute",
    right: 16,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 20,
    backgroundColor: c.brandPrimary,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    shadowColor: c.brandDeepest,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { fontFamily: fonts.extraBold, fontSize: 15, color: c.onBrandPrimary },
}));
