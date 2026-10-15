import { Alert, Text } from 'react-native';

import { ListItem, Loading, Muted, Screen, colors, formatCents, formatDate } from '@/components/ui';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { listCategories, recentTransactions, setTransactionCategory, type Transaction } from '@/db/repositories/finance.repo';

export default function Transactions() {
  const { db, bump } = useDb();
  const { data: txs, loading } = useDbQuery((d) => recentTransactions(d, 200));
  const { data: categories } = useDbQuery(listCategories);

  if (loading && !txs) return <Loading />;

  const pickCategory = (t: Transaction) =>
    Alert.alert('Categoria', t.description, [
      ...(categories ?? []).slice(0, 8).map((c) => ({
        text: c.name,
        onPress: async () => {
          await setTransactionCategory(db, t.id, c.id);
          bump();
        },
      })),
      { text: 'Cancelar', style: 'cancel' as const },
    ]);

  return (
    <Screen>
      {!txs?.length && <Muted>Nenhuma transação. Importe um extrato CSV na aba Importar.</Muted>}
      {txs?.map((t) => (
        <ListItem
          key={t.id}
          title={t.description || '(sem descrição)'}
          subtitle={`${formatDate(t.posted_on)} · ${t.category_name ?? 'Sem categoria'}`}
          onPress={() => pickCategory(t)}
          right={<Text style={{ color: t.amount_cents < 0 ? colors.danger : colors.text }}>{formatCents(t.amount_cents)}</Text>}
        />
      ))}
    </Screen>
  );
}
