import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { AmountInput, CategorySelect, ChipSelect, DateField, FormSection } from '@/components/form';
import { Button, ErrorText, Field, Group, ListItem, Loading, Screen, Segmented, formatCents, formatDate } from '@/components/ui';
import { suggestInstancesForPayment } from '@/bills/repo';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { createAccount, listAccounts, listCategoryTree } from '@/db/repositories/finance.repo';
import { rescheduleBillReminders } from '@/services/notifications/reminders';
import { todayLocal, type ISODate } from '@/services/recurrence/dates';
import { createManualTransaction, deleteManualTransaction, ManualTxError, updateManualTransaction } from '@/transactions/manual';

type Kind = 'expense' | 'income';

/** Receita/despesa manual: criar (?billInstanceId= para pagar uma conta) ou editar (?id=). */
export default function ManualTransaction() {
  const { db, bump } = useDb();
  const params = useLocalSearchParams<{ id?: string; billInstanceId?: string; type?: Kind }>();
  const editing = !!params.id;
  const { data } = useDbQuery(async (d) => ({
    accounts: await listAccounts(d),
    categories: await listCategoryTree(d),
    tx: params.id
      ? await d.getFirstAsync<{ account_id: string; type: string; amount_cents: number; posted_on: ISODate; description_raw: string; category_id: string | null; category_source: string; notes: string | null; origin: string; bill_instance_id: string | null }>(
          'SELECT account_id, type, amount_cents, posted_on, description_raw, category_id, category_source, notes, origin, bill_instance_id FROM transactions WHERE id = ?;',
          params.id,
        )
      : null,
    bill: params.billInstanceId
      ? await d.getFirstAsync<{ name: string; amount_cents: number | null; category_id: string | null; account_id: string | null }>(
          'SELECT t.name, i.amount_cents, t.category_id, t.account_id FROM bill_instances i JOIN bill_templates t ON t.id = i.template_id WHERE i.id = ?;',
          params.billInstanceId,
        )
      : null,
  }), [params.id, params.billInstanceId]);

  const [kind, setKind] = useState<Kind>(params.type === 'income' ? 'income' : 'expense');
  const [cents, setCents] = useState<number | null>(null);
  const [date, setDate] = useState<ISODate>(todayLocal());
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [billId, setBillId] = useState<string | null>(params.billInstanceId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  // preenche uma vez (edição ou "pagar conta")
  useEffect(() => {
    if (!data || loaded) return;
    if (data.tx) {
      setKind(data.tx.type === 'income' ? 'income' : 'expense');
      setCents(Math.abs(data.tx.amount_cents));
      setDate(data.tx.posted_on);
      setDescription(data.tx.description_raw);
      setCategoryId(data.tx.category_id);
      setAccountId(data.tx.account_id);
      setNotes(data.tx.notes ?? '');
      setBillId(data.tx.bill_instance_id);
    } else if (data.bill) {
      setKind('expense');
      setCents(data.bill.amount_cents);
      setDescription(data.bill.name);
      setCategoryId(data.bill.category_id);
      setAccountId(data.bill.account_id);
    }
    setLoaded(true);
  }, [data, loaded]);

  // contas pendentes que esta despesa pode quitar (mesmo valor, vencimento próximo)
  const { data: suggestions } = useDbQuery(
    (d) => (kind === 'expense' && cents ? suggestInstancesForPayment(d, cents, date) : Promise.resolve([])),
    [kind, cents, date],
  );

  if (!data) return <Loading />;
  if (editing && data.tx?.origin !== 'manual') {
    return (
      <Screen>
        <ErrorText>Só lançamentos manuais podem ser editados aqui. Os importados só mudam de categoria.</ErrorText>
      </Screen>
    );
  }
  const account = accountId ?? data.accounts[0]?.id ?? null;
  const linkOptions = [
    ...(billId && !suggestions?.some((x) => x.id === billId) ? [{ id: billId, name: data.bill?.name ?? 'Conta vinculada', due_on: '', amount_cents: null as number | null }] : []),
    ...(suggestions ?? []),
  ];

  const save = async () => {
    if (!cents) return setError('Informe o valor.');
    if (!description.trim()) return setError('Informe uma descrição.');
    setBusy(true);
    setError(undefined);
    // sem nenhuma conta cadastrada: cria a "Carteira" (dinheiro) para lançamentos avulsos
    const accId = account ?? (await createAccount(db, { name: 'Carteira', kind: 'cash' }));
    const input = {
      accountId: accId, type: kind, amountCents: cents, postedOn: date, description, categoryId,
      notes: notes || null, billInstanceId: kind === 'expense' ? billId : null,
    };
    try {
      if (editing) await updateManualTransaction(db, params.id!, input);
      else await createManualTransaction(db, input);
      if (input.billInstanceId || data.tx?.bill_instance_id) rescheduleBillReminders(db, 'manual_tx').catch(() => {});
      bump();
      router.back();
    } catch (e) {
      setError(e instanceof ManualTxError && e.code === 'bill_unavailable' ? 'Essa conta já foi paga por outro lançamento.' : 'Não foi possível salvar. Confira os campos.');
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(
      'Excluir lançamento?',
      data.tx?.bill_instance_id ? 'A conta paga por ele voltará a ficar pendente.' : 'Os totais do painel serão recalculados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const reopened = await deleteManualTransaction(db, params.id!);
            if (reopened) rescheduleBillReminders(db, 'manual_delete').catch(() => {});
            bump();
            router.back();
          },
        },
      ],
    );

  return (
    <Screen>
      <Segmented<Kind>
        options={[
          { id: 'expense', label: 'Despesa' },
          { id: 'income', label: 'Receita' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <AmountInput label={kind === 'expense' ? 'Valor da despesa' : 'Valor da receita'} cents={cents} onChange={setCents} tone={kind} autoFocus={!editing && !params.billInstanceId} />

      <FormSection>
        <Field label="Descrição" value={description} onChangeText={setDescription} placeholder={kind === 'expense' ? 'Ex.: Mercado do bairro' : 'Ex.: Salário'} maxLength={200} autoCapitalize="sentences" />
        <DateField label="Data" value={date} onChange={setDate} />
        <CategorySelect categories={data.categories} value={categoryId} onChange={setCategoryId} allowAuto />
        {data.accounts.length > 1 && (
          <ChipSelect label="Conta" options={data.accounts.map((a) => ({ id: a.id, label: a.name, icon: a.kind === 'credit_card' ? 'card' : 'bank' }))} value={account} onChange={setAccountId} />
        )}
        <Field label="Observação (opcional)" value={notes} onChangeText={setNotes} maxLength={500} autoCapitalize="sentences" />
      </FormSection>

      {kind === 'expense' && linkOptions.length > 0 && (
        <Group title="Esta despesa paga uma conta?" footer="Vincular marca a conta como paga. Excluir o lançamento reabre a conta.">
          {linkOptions.map((b) => (
            <ListItem
              key={b.id}
              icon="bills"
              title={b.name}
              subtitle={[b.due_on ? `vence ${formatDate(b.due_on)}` : '', b.amount_cents ? formatCents(b.amount_cents) : ''].filter(Boolean).join(' · ') || undefined}
              onPress={() => setBillId(billId === b.id ? null : b.id)}
              selected={billId === b.id}
            />
          ))}
        </Group>
      )}

      <ErrorText>{error}</ErrorText>
      <Button title={editing ? 'Salvar alterações' : kind === 'expense' ? 'Adicionar despesa' : 'Adicionar receita'} icon="check" onPress={save} loading={busy} />
      {editing && <Button title="Excluir lançamento" icon="trash" variant="ghost" onPress={remove} />}
    </Screen>
  );
}
