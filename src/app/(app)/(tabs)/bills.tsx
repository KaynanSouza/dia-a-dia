import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { categoryIcon, Icon } from '@/components/Icon';
import { Badge, Button, EmptyState, IconBadge, Loading, ScreenHeader, Segmented, formatCents } from '@/components/ui';
import { billsSummary, listPaidInstances, listPendingInstances } from '@/bills/repo';
import { markPaid } from '@/bills/service';
import { BILL_STATUS_LABEL, billStatus, type BillInstanceRow, type BillStatus } from '@/bills/types';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { addDays, diffDays, todayLocal } from '@/services/recurrence/dates';
import { makeStyles, useTheme } from '@/theme';

type Tab = 'pending' | 'paid';

const TONE: Record<BillStatus, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
  vencida: 'danger',
  vence_hoje: 'warning',
  a_vencer: 'info',
  paga: 'success',
  ignorada: 'neutral',
};

const whenLabel = (due: string, today: string) => {
  const d = diffDays(due, today);
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  if (d === -1) return 'ontem';
  if (d < 0) return `há ${-d} dias`;
  if (d < 7) return `em ${d} dias`;
  return due.split('-').reverse().slice(0, 2).join('/');
};

/** A-01: contas a pagar — vencidas, hoje, próximos dias; "Paguei" em um toque. */
export default function Bills() {
  const t = useTheme();
  const s = useStyles();
  const { db, bump } = useDb();
  const [tab, setTab] = useState<Tab>('pending');
  const [paying, setPaying] = useState<string | null>(null);
  const today = todayLocal();
  const { data, loading } = useDbQuery(
    async (d) => ({
      pending: await listPendingInstances(d, addDays(today, 90)),
      paid: tab === 'paid' ? await listPaidInstances(d) : [],
      summary: await billsSummary(d, today, addDays(today, 7)),
    }),
    [tab, today],
  );

  const sections = useMemo(() => {
    if (!data) return [];
    if (tab === 'paid') return data.paid.length ? [{ title: 'Pagas recentemente', data: data.paid }] : [];
    const groups: { title: string; data: BillInstanceRow[] }[] = [
      { title: 'Vencidas', data: [] },
      { title: 'Vence hoje', data: [] },
      { title: 'Próximos 7 dias', data: [] },
      { title: 'Mais adiante', data: [] },
    ];
    for (const i of data.pending) {
      const d = diffDays(i.due_on, today);
      groups[d < 0 ? 0 : d === 0 ? 1 : d <= 7 ? 2 : 3].data.push(i);
    }
    return groups.filter((g) => g.data.length);
  }, [data, tab, today]);

  if (loading && !data) return <Loading />;

  const quickPay = async (i: BillInstanceRow) => {
    if (!i.amount_cents) return router.push({ pathname: '/bills/[id]', params: { id: i.id, pay: '1' } });
    setPaying(i.id);
    try {
      await markPaid(db, i.id, { paidOn: today, amountCents: i.amount_cents });
      bump();
    } finally {
      setPaying(null);
    }
  };

  const sm = data?.summary;
  const header = (
    <View style={{ gap: 14, paddingBottom: 4 }}>
      <ScreenHeader
        title="Contas"
        subtitle="A pagar"
        right={
          <Pressable onPress={() => router.push('/bills/new')} style={s.addBtn} accessibilityLabel="Nova conta a pagar">
            <Icon name="plus" size={22} color="#FFF" />
          </Pressable>
        }
      />
      {sm && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <SummaryTile label="Vencidas" count={sm.overdue_count} cents={sm.overdue_cents} color={t.danger} />
          <SummaryTile label="Hoje" count={sm.today_count} cents={sm.today_cents} color={t.warning} />
          <SummaryTile label="7 dias" count={sm.week_count} cents={sm.week_cents} color={t.primary} />
        </View>
      )}
      <Segmented<Tab>
        options={[
          { id: 'pending', label: 'A pagar' },
          { id: 'paid', label: 'Pagas' },
        ]}
        value={tab}
        onChange={setTab}
      />
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        contentContainerStyle={s.content}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          tab === 'paid' ? (
            <EmptyState icon="checkCircle" title="Nenhuma conta paga ainda" />
          ) : (
            <EmptyState
              icon="bills"
              title="Nenhuma conta a pagar"
              text="Cadastre aluguel, luz, internet… O app lembra antes do vencimento, mesmo offline."
              action={<Button title="Adicionar conta" icon="plus" onPress={() => router.push('/bills/new')} />}
            />
          )
        }
        renderSectionHeader={({ section }) => <Text style={s.sectionTitle}>{section.title}</Text>}
        renderItem={({ item: i, index, section }) => {
          const st = billStatus(i, today);
          const first = index === 0;
          const last = index === section.data.length - 1;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/bills/[id]', params: { id: i.id } })}
              style={({ pressed }) => [s.row, first && s.rowFirst, last && s.rowLast, pressed && { backgroundColor: t.surfaceAlt }]}
            >
              <IconBadge name={categoryIcon(i.category_root)} color={i.category_color ?? t.primary} size={42} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.name} numberOfLines={1}>{i.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Badge label={st === 'paga' ? `paga ${whenLabel(i.paid_on!, today)}` : `${BILL_STATUS_LABEL[st]}${st === 'a_vencer' || st === 'vencida' ? ` · ${whenLabel(i.due_on, today)}` : ''}`} tone={TONE[st]} />
                  {i.rrule ? <Icon name="repeat" size={13} color={t.faint} /> : null}
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={s.amount}>{i.paid_amount_cents ?? i.amount_cents ? formatCents((i.paid_amount_cents ?? i.amount_cents)!) : 'variável'}</Text>
                {i.status === 'pending' && (
                  <Pressable onPress={() => quickPay(i)} disabled={!!paying} style={s.payBtn} hitSlop={6} accessibilityLabel={`Marcar ${i.name} como paga`}>
                    <Icon name="check" size={14} color={t.success} />
                    <Text style={[s.payText, { color: t.success }]}>{paying === i.id ? '…' : 'Paguei'}</Text>
                  </Pressable>
                )}
              </View>
              {!last && <View style={s.separator} />}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

function SummaryTile({ label, count, cents, color }: { label: string; count: number; cents: number; color: string }) {
  const s = useStyles();
  return (
    <View style={s.tile}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text style={s.tileLabel}>{label}</Text>
      </View>
      <Text style={s.tileCount}>{count}</Text>
      <Text style={s.tileCents} numberOfLines={1} adjustsFontSizeToFit>{formatCents(cents)}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 32 },
    addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    tile: { flex: 1, backgroundColor: t.surface, borderRadius: 16, padding: 12, gap: 2, borderWidth: t.dark ? StyleSheet.hairlineWidth : 0, borderColor: t.border },
    tileLabel: { color: t.muted, fontSize: 12, fontWeight: '600' },
    tileCount: { color: t.text, fontSize: 22, fontWeight: '800' },
    tileCents: { color: t.muted, fontSize: 12, fontVariant: ['tabular-nums'] },
    sectionTitle: { color: t.muted, fontSize: 13, fontWeight: '700', paddingTop: 18, paddingBottom: 8, paddingHorizontal: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: t.surface },
    rowFirst: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
    rowLast: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
    separator: { position: 'absolute', bottom: 0, left: 68, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.border },
    name: { color: t.text, fontSize: 16, fontWeight: '700' },
    amount: { color: t.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
    payBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.successSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    payText: { fontSize: 12, fontWeight: '800' },
  }),
);
