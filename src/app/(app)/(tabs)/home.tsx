import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Meter, MonthBars, StackedBar } from '@/components/charts';
import { Icon, categoryIcon } from '@/components/Icon';
import { Button, Card, EmptyState, IconBadge, Loading, Notice, Screen, ScreenHeader, SectionTitle, formatCents } from '@/components/ui';
import { loadDashboard } from '@/dashboard/service';
import { useDbQuery } from '@/db/DatabaseProvider';
import { currentMonthSP, monthLabel, shiftMonth } from '@/lib/time';
import { makeStyles, useTheme } from '@/theme';

const pctDelta = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** C-06: dashboard 100% SQL local (transferências e faturas excluídas). */
export default function Dashboard() {
  const t = useTheme();
  const s = useStyles();
  const [ym, setYm] = useState(currentMonthSP());
  const [showAllCats, setShowAllCats] = useState(false);
  const { data, loading } = useDbQuery((db) => loadDashboard(db, ym), [ym]);
  const isCurrent = ym >= currentMonthSP();

  const series = useMemo(() => {
    const byYm = new Map((data?.series ?? []).map((p) => [p.ym, p]));
    return Array.from({ length: 6 }, (_, i) => {
      const m = shiftMonth(ym, i - 5);
      return byYm.get(m) ?? { ym: m, income_cents: 0, expense_cents: 0 };
    });
  }, [data?.series, ym]);

  const monthSwitcher = (
    <View style={s.switcher}>
      <Pressable onPress={() => setYm(shiftMonth(ym, -1))} hitSlop={10} style={s.switchBtn} accessibilityLabel="Mês anterior">
        <Icon name="chevronLeft" size={16} color={t.text} />
      </Pressable>
      <Pressable onPress={() => setYm(shiftMonth(ym, 1))} hitSlop={10} disabled={isCurrent} style={[s.switchBtn, isCurrent && { opacity: 0.3 }]} accessibilityLabel="Próximo mês">
        <Icon name="chevronRight" size={16} color={t.text} />
      </Pressable>
    </View>
  );
  const header = <ScreenHeader subtitle="Visão geral" title={capitalize(monthLabel(ym))} right={monthSwitcher} />;

  if (loading && !data) return <Loading />;
  if (!data) return <Screen edges={['top']}>{header}</Screen>;

  const { overview, previous } = data;
  const expenseDelta = pctDelta(overview.expense_cents, previous.expense_cents);
  const incomeDelta = pctDelta(overview.income_cents, previous.income_cents);
  const totalSpent = data.byCategory.reduce((a, c) => a + Math.max(0, c.spent_cents), 0);
  const cats = showAllCats ? data.byCategory : data.byCategory.slice(0, 5);
  const maxMerchant = Math.max(1, ...data.topMerchants.map((m) => m.spent_cents));
  const income = data.dre.filter((l) => l.section === 'income');
  const expenses = data.dre.filter((l) => l.section === 'expense');

  return (
    <Screen edges={['top']}>
      {header}

      <LinearGradient colors={t.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <View style={s.heroGlow} />
        <Text style={s.heroLabel}>Resultado do mês</Text>
        <Text style={s.heroValue} adjustsFontSizeToFit numberOfLines={1}>{formatCents(overview.net_cents)}</Text>
        <View style={s.heroRow}>
          <HeroStat icon="up" label="Receitas" cents={overview.income_cents} delta={incomeDelta} />
          <View style={s.heroDivider} />
          <HeroStat icon="down" label="Despesas" cents={overview.expense_cents} delta={expenseDelta} invert />
        </View>
      </LinearGradient>

      {!overview.tx_count && (
        <Card>
          <EmptyState
            icon="doc"
            title="Nenhum lançamento neste mês"
            text="Importe o extrato CSV do seu banco para ver para onde vai o seu dinheiro."
            action={<Button title="Importar extrato" icon="import" onPress={() => router.push('/import/upload')} />}
          />
        </Card>
      )}

      {overview.uncategorized_count > 0 && (
        <Notice
          tone="warning"
          title={`${overview.uncategorized_count} despesa(s) sem categoria`}
          onPress={() => router.push({ pathname: '/transactions', params: { filter: 'uncategorized' } })}
        >
          Toque para revisar e ensinar o app.
        </Notice>
      )}

      {data.byCategory.length > 0 && (
        <Card>
          <SectionTitle
            action={data.byCategory.length > 5 ? (showAllCats ? 'Ver menos' : 'Ver todas') : undefined}
            onAction={() => setShowAllCats((v) => !v)}
          >
            Gastos por categoria
          </SectionTitle>
          <StackedBar parts={data.byCategory.map((c) => ({ key: c.category_id, value: c.spent_cents, color: c.color ?? t.faint }))} />
          {cats.map((c) => {
            const prev = data.comparison.find((x) => x.category_id === c.category_id)?.previous_cents ?? 0;
            const d = pctDelta(c.spent_cents, prev);
            const share = totalSpent ? Math.round((c.spent_cents / totalSpent) * 100) : 0;
            return (
              <View key={c.category_id} style={s.catRow}>
                <IconBadge name={categoryIcon(c.category_id === '__none' ? null : c.category_id)} color={c.color ?? t.muted} size={38} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={s.between}>
                    <Text style={s.rowTitle} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.rowValue}>{formatCents(c.spent_cents)}</Text>
                  </View>
                  <View style={s.between}>
                    <Text style={s.rowHint}>{share}% · {c.tx_count} lanç.</Text>
                    {d !== null && (
                      <Text style={[s.rowHint, { color: d > 0 ? t.danger : t.success, fontWeight: '600' }]}>
                        {d > 0 ? '▲' : '▼'} {Math.abs(d)}%
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      )}

      {series.some((p) => p.income_cents || p.expense_cents) && (
        <Card>
          <SectionTitle>Últimos 6 meses</SectionTitle>
          <MonthBars series={series} selected={ym} />
        </Card>
      )}

      {data.topMerchants.length > 0 && (
        <Card>
          <SectionTitle>Onde você mais gastou</SectionTitle>
          {data.topMerchants.map((m, i) => (
            <View key={m.merchant_key} style={{ gap: 6 }}>
              <View style={s.merchantRow}>
                <View style={s.rank}>
                  <Text style={s.rankText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle} numberOfLines={1}>{m.name}</Text>
                  <Text style={s.rowHint}>{m.tx_count} compra(s)</Text>
                </View>
                <Text style={s.rowValue}>{formatCents(m.spent_cents)}</Text>
              </View>
              <Meter ratio={m.spent_cents / maxMerchant} />
            </View>
          ))}
        </Card>
      )}

      {data.dre.length > 0 && (
        <Card>
          <SectionTitle>DRE simplificado</SectionTitle>
          <DreSection title="Receitas" lines={income} />
          <DreSection title="Despesas" lines={expenses} />
          <View style={[s.between, s.dreTotal]}>
            <Text style={s.dreTotalLabel}>Resultado</Text>
            <Text style={[s.dreTotalLabel, { color: overview.net_cents < 0 ? t.danger : t.success }]}>{formatCents(overview.net_cents)}</Text>
          </View>
        </Card>
      )}

      <View style={s.footer}>
        <Icon name={data.reconciled ? 'checkCircle' : 'warning'} size={14} color={data.reconciled ? t.success : t.warning} />
        <Text style={s.footerText}>
          {data.reconciled ? 'Totais conferidos' : 'Totais divergentes: veja Ajustes › Diagnóstico'} · transferências e faturas fora dos totais
        </Text>
      </View>
    </Screen>
  );
}

function HeroStat({ icon, label, cents, delta, invert }: { icon: 'up' | 'down'; label: string; cents: number; delta: number | null; invert?: boolean }) {
  const s = useStyles();
  const good = delta === null ? null : invert ? delta <= 0 : delta >= 0;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={s.heroIcon}>
          <Icon name={icon} size={12} color="#FFF" />
        </View>
        <Text style={s.heroStatLabel}>{label}</Text>
      </View>
      <Text style={s.heroStatValue} numberOfLines={1} adjustsFontSizeToFit>{formatCents(cents)}</Text>
      {delta !== null && (
        <Text style={[s.heroDelta, { backgroundColor: good ? 'rgba(52,208,122,0.25)' : 'rgba(255,92,114,0.28)' }]}>
          {delta > 0 ? '+' : ''}{delta}% vs mês anterior
        </Text>
      )}
    </View>
  );
}

function DreSection({ title, lines }: { title: string; lines: { category_id: string; name: string; total_cents: number }[] }) {
  const s = useStyles();
  const total = lines.reduce((a, l) => a + l.total_cents, 0);
  return (
    <View style={{ gap: 6 }}>
      <View style={s.between}>
        <Text style={s.rowTitle}>{title}</Text>
        <Text style={s.rowValue}>{formatCents(total)}</Text>
      </View>
      {lines.map((l) => (
        <View key={l.category_id} style={[s.between, { paddingLeft: 12 }]}>
          <Text style={s.rowHint}>{l.name}</Text>
          <Text style={s.rowHint}>{formatCents(l.total_cents)}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    switcher: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    switchBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    hero: { borderRadius: 24, padding: 20, gap: 6, overflow: 'hidden' },
    heroGlow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.08)', top: -90, right: -60 },
    heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600' },
    heroValue: { color: '#FFF', fontSize: 36, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
    heroRow: { flexDirection: 'row', marginTop: 14, gap: 14 },
    heroDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.3)' },
    heroIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
    heroStatLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
    heroStatValue: { color: '#FFF', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
    heroDelta: { color: '#FFF', fontSize: 11, fontWeight: '700', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    rowTitle: { color: t.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
    rowValue: { color: t.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
    rowHint: { color: t.muted, fontSize: 12 },
    merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' },
    rankText: { color: t.primary, fontWeight: '800', fontSize: 13 },
    dreTotal: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: t.border, paddingTop: 10 },
    dreTotalLabel: { color: t.text, fontWeight: '800', fontSize: 16 },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingHorizontal: 8 },
    footerText: { color: t.muted, fontSize: 12, textAlign: 'center', flexShrink: 1 },
  }),
);
