import { StyleSheet, Text, View } from 'react-native';

import { makeStyles, useTheme } from '@/theme';
import { formatCents } from './ui';

export function ProgressBar({ ratio, label }: { ratio: number; label?: string }) {
  const s = useStyles();
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <View style={{ gap: 8 }}>
      {label ? (
        <View style={s.row}>
          <Text style={s.label}>{label}</Text>
          <Text style={s.pct}>{Math.round(pct * 100)}%</Text>
        </View>
      ) : null}
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.max(pct * 100, 2)}%` }]} />
      </View>
    </View>
  );
}

/** Barra empilhada: composição dos gastos por categoria. */
export function StackedBar({ parts }: { parts: { key: string; value: number; color: string }[] }) {
  const t = useTheme();
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  if (!total) return null;
  return (
    <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, backgroundColor: t.surfaceAlt }}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <View key={p.key} style={{ flex: p.value / total, backgroundColor: p.color }} />
        ))}
    </View>
  );
}

/** Barra fina de proporção (linha de categoria / estabelecimento). */
export function Meter({ ratio, color }: { ratio: number; color?: string | null }) {
  const t = useTheme();
  const pct = Math.max(0.02, Math.min(1, ratio));
  return (
    <View style={{ height: 6, backgroundColor: t.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ height: 6, borderRadius: 3, width: `${pct * 100}%`, backgroundColor: color ?? t.primary }} />
    </View>
  );
}

const SHORT_MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Receitas × despesas dos últimos meses (barras agrupadas). */
export function MonthBars({ series, selected }: { series: { ym: string; income_cents: number; expense_cents: number }[]; selected: string }) {
  const t = useTheme();
  const s = useStyles();
  const max = Math.max(1, ...series.flatMap((p) => [p.income_cents, p.expense_cents]));
  const H = 96;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: H }}>
        {series.map((p) => {
          const active = p.ym === selected;
          return (
            <View key={p.ym} style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3, opacity: active ? 1 : 0.55 }}>
              <View style={[s.bar, { height: Math.max(3, (p.income_cents / max) * H), backgroundColor: t.success }]} />
              <View style={[s.bar, { height: Math.max(3, (p.expense_cents / max) * H), backgroundColor: t.danger }]} />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {series.map((p) => (
          <Text key={p.ym} style={[s.axis, p.ym === selected && { color: t.text, fontWeight: '700' }]}>
            {SHORT_MONTH[Number(p.ym.slice(5, 7)) - 1]}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Legend color={t.success} label="Receitas" />
        <Legend color={t.danger} label="Despesas" />
      </View>
    </View>
  );
}

export function Legend({ color, label, value }: { color: string; label: string; value?: number }) {
  const s = useStyles();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={s.legend}>{label}</Text>
      {value !== undefined ? <Text style={s.legendValue}>{formatCents(value)}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    label: { flex: 1, color: t.text, fontWeight: '600' },
    pct: { color: t.primary, fontWeight: '700', fontVariant: ['tabular-nums'] },
    track: { height: 10, backgroundColor: t.surfaceAlt, borderRadius: 5, overflow: 'hidden' },
    fill: { height: 10, backgroundColor: t.primary, borderRadius: 5 },
    bar: { width: 9, borderRadius: 4 },
    axis: { flex: 1, textAlign: 'center', color: t.muted, fontSize: 12 },
    legend: { color: t.muted, fontSize: 12 },
    legendValue: { color: t.text, fontSize: 12, fontWeight: '600' },
  }),
);
