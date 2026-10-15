import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, categoryIcon } from '@/components/Icon';
import { Amount, Button, EmptyState, IconBadge, Loading, ScreenHeader, Segmented, formatCents } from '@/components/ui';
import { normalizeDescription } from '@/core/parsing/values';
import { useDbQuery } from '@/db/DatabaseProvider';
import { recentTransactions, type Transaction } from '@/db/repositories/finance.repo';
import { shiftDay, todaySP } from '@/lib/time';
import { makeStyles, useTheme } from '@/theme';

type Filter = 'all' | 'uncategorized';

const TYPE_HINT: Record<Transaction['type'], string> = {
  expense: '',
  income: '',
  transfer: 'Transferência',
  card_payment: 'Pagamento de fatura',
};

const WEEKDAY = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MONTH = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function dayLabel(iso: string, today: string) {
  if (iso === today) return 'Hoje';
  if (iso === shiftDay(today, -1)) return 'Ontem';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd}, ${d} ${MONTH[m - 1]}${iso.slice(0, 4) !== today.slice(0, 4) ? ` ${y}` : ''}`;
}

export default function Transactions() {
  const t = useTheme();
  const s = useStyles();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [filter, setFilter] = useState<Filter>(params.filter === 'uncategorized' ? 'uncategorized' : 'all');
  const [query, setQuery] = useState('');
  const { data: txs, loading } = useDbQuery(
    (d) => recentTransactions(d, { limit: 500, uncategorizedOnly: filter === 'uncategorized' }),
    [filter],
  );

  const sections = useMemo(() => {
    const q = normalizeDescription(query);
    const today = todaySP();
    const out: { title: string; total: number; data: Transaction[] }[] = [];
    for (const tx of txs ?? []) {
      if (q && !normalizeDescription(`${tx.description} ${tx.category_name ?? ''}`).includes(q)) continue;
      const title = dayLabel(tx.posted_on, today);
      let sec = out[out.length - 1];
      if (!sec || sec.title !== title) out.push((sec = { title, total: 0, data: [] }));
      sec.data.push(tx);
      if (tx.type === 'expense' || tx.type === 'income') sec.total += tx.amount_cents;
    }
    return out;
  }, [txs, query]);

  if (loading && !txs) return <Loading />;

  const header = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      <ScreenHeader title="Transações" subtitle={txs ? `${txs.length} mais recentes` : undefined} />
      <View style={s.search}>
        <Icon name="search" size={18} color={t.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por descrição ou categoria"
          placeholderTextColor={t.faint}
          style={s.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={t.primary}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Limpar busca">
            <Icon name="close" size={18} color={t.faint} />
          </Pressable>
        ) : null}
      </View>
      <Segmented<Filter>
        options={[
          { id: 'all', label: 'Todas' },
          { id: 'uncategorized', label: 'Sem categoria' },
        ]}
        value={filter}
        onChange={setFilter}
      />
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <SectionList
        sections={sections}
        keyExtractor={(tx) => tx.id}
        ListHeaderComponent={header}
        contentContainerStyle={s.content}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        ListEmptyComponent={
          query ? (
            <EmptyState icon="search" title="Nada encontrado" text={`Nenhuma transação com "${query}".`} />
          ) : filter === 'uncategorized' ? (
            <EmptyState icon="sparkles" title="Tudo categorizado" text="Nenhuma despesa esperando categoria." />
          ) : (
            <EmptyState
              icon="list"
              title="Nenhuma transação ainda"
              text="Importe o extrato CSV do seu banco e o app categoriza tudo sozinho."
              action={<Button title="Importar extrato" icon="import" onPress={() => router.push('/import/upload')} />}
            />
          )
        }
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            {section.total !== 0 && <Text style={s.sectionTotal}>{formatCents(section.total)}</Text>}
          </View>
        )}
        renderItem={({ item: tx, index, section }) => {
          const first = index === 0;
          const last = index === section.data.length - 1;
          const hint = TYPE_HINT[tx.type];
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/transactions/[id]', params: { id: tx.id } })}
              style={({ pressed }) => [s.row, first && s.rowFirst, last && s.rowLast, pressed && { backgroundColor: t.surfaceAlt }]}
            >
              <IconBadge
                name={tx.type === 'transfer' ? 'transfer' : tx.type === 'card_payment' ? 'card' : categoryIcon(tx.category_root)}
                color={tx.category_color ?? (tx.category_id ? t.primary : t.warning)}
                size={40}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.title} numberOfLines={1}>{tx.description || '(sem descrição)'}</Text>
                <Text style={[s.subtitle, !tx.category_id && tx.type === 'expense' && { color: t.warning }]} numberOfLines={1}>
                  {hint || tx.category_name || 'Sem categoria'}
                  {tx.installment_n ? ` · ${tx.installment_n}/${tx.installment_total}` : ''} · {tx.account_name}
                </Text>
              </View>
              <Amount cents={tx.amount_cents} size={15} />
              {!last && <View style={s.separator} />}
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 32 },
    search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderRadius: 14, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
    searchInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: t.text },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 18, paddingBottom: 8, paddingHorizontal: 4 },
    sectionTitle: { color: t.muted, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
    sectionTotal: { color: t.muted, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: t.surface },
    rowFirst: { borderTopLeftRadius: 18, borderTopRightRadius: 18 },
    rowLast: { borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
    separator: { position: 'absolute', bottom: 0, left: 66, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: t.border },
    title: { color: t.text, fontSize: 15, fontWeight: '600' },
    subtitle: { color: t.muted, fontSize: 13 },
  }),
);
