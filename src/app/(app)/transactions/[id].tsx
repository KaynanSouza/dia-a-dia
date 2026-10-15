import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text } from 'react-native';

import { CategoryPicker } from '@/components/CategoryPicker';
import { categoryIcon } from '@/components/Icon';
import { Badge, Button, Card, ErrorText, Group, IconBadge, ListItem, Loading, Muted, Screen, SectionTitle, formatCents, formatDate } from '@/components/ui';
import { setCategory } from '@/categorization/learn';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { countSimilar, getTransaction, listCategoryTree } from '@/db/repositories/finance.repo';
import { makeStyles, useTheme } from '@/theme';

const SOURCE_LABEL: Record<string, string> = {
  none: 'Não categorizada',
  user_rule: 'Sua regra',
  dictionary: 'Dicionário',
  fuzzy: 'Nome parecido',
  ml: 'Modelo local',
  manual: 'Você',
  transfer_match: 'Transferência entre suas contas',
};

/** C-05: correção manual com "Aplicar a todas as parecidas". */
export default function TransactionDetail() {
  const t = useTheme();
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, bump } = useDb();
  const { data } = useDbQuery(async (d) => {
    const tx = await getTransaction(d, id);
    return { tx, categories: await listCategoryTree(d), similar: tx ? await countSimilar(d, tx.merchant_key, tx.id) : 0 };
  }, [id]);
  const [selected, setSelected] = useState<string | null>(null);
  const [applySimilar, setApplySimilar] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  if (!data) return <Loading />;
  const { tx, categories, similar } = data;
  if (!tx) return <Screen><Muted>Transação não encontrada.</Muted></Screen>;

  const chosen = selected ?? tx.category_id;
  const save = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      await setCategory(db, tx.id, chosen, applySimilar && similar > 0);
      bump();
      router.back();
    } catch {
      setError('Não foi possível salvar.');
      setBusy(false);
    }
  };

  const confidence =
    tx.category_confidence !== null && tx.category_source !== 'manual' ? ` · ${Math.round(tx.category_confidence * 100)}%` : '';

  return (
    <Screen>
      <Card style={s.hero}>
        <IconBadge name={categoryIcon(tx.category_root)} color={tx.category_color ?? t.warning} size={56} />
        <Text style={[s.amount, { color: tx.amount_cents > 0 ? t.success : t.text }]}>
          {tx.amount_cents > 0 ? '+' : ''}
          {formatCents(tx.amount_cents)}
        </Text>
        <Text style={s.desc}>{tx.description}</Text>
        <Badge label={tx.category_name ?? 'Sem categoria'} tone={tx.category_id ? 'info' : 'warning'} />
      </Card>

      <Group>
        <ListItem icon="timer" title="Data" right={<Text style={s.value}>{formatDate(tx.posted_on)}</Text>} />
        <ListItem icon="bank" title="Conta" right={<Text style={s.value}>{tx.account_name}</Text>} />
        {tx.installment_n ? (
          <ListItem icon="card" title="Parcela" right={<Text style={s.value}>{tx.installment_n}/{tx.installment_total}</Text>} />
        ) : null}
        <ListItem icon="sparkles" title="Categorizada por" right={<Text style={s.value}>{(SOURCE_LABEL[tx.category_source] ?? tx.category_source) + confidence}</Text>} />
      </Group>

      <SectionTitle>Alterar categoria</SectionTitle>
      {similar > 0 && tx.merchant_key ? (
        <Group>
          <ListItem
            title="Aplicar a todas as parecidas"
            subtitle={`${similar} outra(s) de "${tx.merchant_key}" e futuras importações`}
            right={<Switch value={applySimilar} onValueChange={setApplySimilar} trackColor={{ true: t.primary }} />}
          />
        </Group>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Button title="Salvar categoria" icon="check" onPress={save} loading={busy} disabled={!chosen || (chosen === tx.category_id && !selected)} />

      <CategoryPicker categories={categories} selected={chosen} onSelect={setSelected} />
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    hero: { alignItems: 'center', paddingVertical: 24, gap: 10 },
    amount: { fontSize: 34, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
    desc: { color: t.muted, fontSize: 15, textAlign: 'center' },
    value: { color: t.text, fontWeight: '600', fontSize: 15, flexShrink: 1, textAlign: 'right', maxWidth: '60%' },
  }),
);
