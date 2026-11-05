import React from "react";
import { ScrollView, Text, View } from "react-native";

import { eur } from "@/src/lib/format";
import { fonts, makeStyles } from "@/src/theme";

export function BarChart({ data, height = 150 }: { data: { label: string; ingresos: number; gastos: number }[]; height?: number }) {
  const styles = useStyles();
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.gastos]));
  return (
    <View testID="finance-bar-chart">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {data.map((d) => (
          <View key={d.label} style={styles.col}>
            <View style={[styles.bars, { height }]}>
              <View style={[styles.bar, styles.inc, { height: Math.max(2, (d.ingresos / max) * height) }]} />
              <View style={[styles.bar, styles.exp, { height: Math.max(2, (d.gastos / max) * height) }]} />
            </View>
            <Text style={styles.label} numberOfLines={1}>
              {d.label}
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.legend}>
        <View style={[styles.dot, styles.inc]} />
        <Text style={styles.legendText}>Ingresos</Text>
        <View style={[styles.dot, styles.exp]} />
        <Text style={styles.legendText}>Gastos</Text>
      </View>
    </View>
  );
}

export function CategoryBars({ items }: { items: { categoria: string; total: number; pct: number }[] }) {
  const styles = useStyles();
  return (
    <View style={styles.cats} testID="finance-category-bars">
      {items.map((i) => (
        <View key={i.categoria} style={styles.catRow}>
          <View style={styles.catHead}>
            <Text style={styles.catName} numberOfLines={1}>
              {i.categoria}
            </Text>
            <Text style={styles.catValue}>
              {eur(i.total, 0)} · {i.pct}%
            </Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, i.pct)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { gap: 12, paddingHorizontal: 4, alignItems: "flex-end" },
  col: { alignItems: "center", minWidth: 34 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  bar: { width: 12, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  inc: { backgroundColor: c.success },
  exp: { backgroundColor: c.renovation },
  label: { fontFamily: fonts.bodyMedium, fontSize: 11, color: c.muted, marginTop: 6 },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginRight: 10 },
  cats: { gap: 12 },
  catRow: { gap: 6 },
  catHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  catName: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.brandDeep, flex: 1 },
  catValue: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  track: { height: 10, borderRadius: 5, backgroundColor: c.canvas, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5, backgroundColor: c.brandSecondary },
}));
