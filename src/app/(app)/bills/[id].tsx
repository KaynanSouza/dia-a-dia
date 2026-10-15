import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { AmountInput, ChipSelect, DateField, FormSection } from '@/components/form';
import { categoryIcon } from '@/components/Icon';
import { Badge, Button, Card, ErrorText, Group, IconBadge, ListItem, Loading, Muted, Screen, SectionTitle, formatCents, formatDate } from '@/components/ui';
import { getInstance, listTemplateInstances } from '@/bills/repo';
import { BillError, markPaid, reopenBill, setInstanceAmount, skipInstance, snoozeInstance } from '@/bills/service';
import { BILL_STATUS_LABEL, billStatus, PAYMENT_METHOD_LABEL } from '@/bills/types';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { listAccounts } from '@/db/repositories/finance.repo';
import { SNOOZE_MS } from '@/services/notifications/plan';
import { todayLocal, type ISODate } from '@/services/recurrence/dates';
import { describeRRule } from '@/services/recurrence/rrule';
import { makeStyles, useTheme } from '@/theme';

type LinkCandidate = { id: string; posted_on: ISODate; description_raw: string; amount_cents: number; origin: string };

/** Ocorrência de uma conta: status, pagar (com despesa ou vínculo), adiar, pular, reabrir. */
export default function BillDetail() {
  const t = useTheme();
  const s = useStyles();
  const { id, pay } = useLocalSearchParams<{ id: string; pay?: string }>();
  const { db, bump } = useDb();
  const { data } = useDbQuery(async (d) => {
    const inst = await getInstance(d, id);
    return {
      inst,
      accounts: await listAccounts(d),
      history: inst ? await listTemplateInstances(d, inst.template_id, 8) : [],
      paidTx: inst?.paid_tx_id
        ? await d.getFirstAsync<LinkCandidate>('SELECT id, posted_on, description_raw, amount_cents, origin FROM transactions WHERE id = ?;', inst.paid_tx_id)
        : null,
      // despesas sem vínculo, mesmo valor, perto do vencimento (pagou e importou o extrato antes)
      candidates: inst?.status === 'pending' && inst.amount_cents
        ? await d.getAllAsync<LinkCandidate>(
            `SELECT id, posted_on, description_raw, amount_cents, origin FROM transactions
             WHERE type = 'expense' AND bill_instance_id IS NULL AND amount_cents = ?
               AND posted_on BETWEEN date(?, '-10 days') AND date(?, '+10 days')
             ORDER BY abs(julianday(posted_on) - julianday(?)) LIMIT 5;`,
            -inst.amount_cents, inst.due_on, inst.due_on, inst.due_on,
          )
        : [],
    };
  }, [id]);

  const today = todayLocal();
  const [paying, setPaying] = useState(pay === '1');
  const [paidOn, setPaidOn] = useState<ISODate>(today);
  const [cents, setCents] = useState<number | null>(null);
  const [withExpense, setWithExpense] = useState(true);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [linkTx, setLinkTx] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (data?.inst && cents === null) setCents(data.inst.amount_cents);
  }, [data, cents]);

  if (!data) return <Loading />;
  const { inst } = data;
  if (!inst) return <Screen><Muted>Conta não encontrada.</Muted></Screen>;
  const st = billStatus(inst, today);
  const account = accountId ?? inst.account_id ?? data.accounts[0]?.id ?? null;
  const tone = st === 'vencida' ? 'danger' : st === 'vence_hoje' ? 'warning' : st === 'paga' ? 'success' : st === 'ignorada' ? 'neutral' : 'info';

  const run = async (fn: () => Promise<unknown>, back = false) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      bump();
      if (back) router.back();
    } catch (e) {
      setError(e instanceof BillError && e.code === 'not_pending' ? 'Esta conta não está mais pendente.' : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPay = () => {
    if (!cents) return setError('Informe o valor pago.');
    return run(
      () =>
        markPaid(db, inst.id, {
          paidOn,
          amountCents: cents,
          linkTxId: linkTx,
          createExpense: !linkTx && withExpense && account ? { accountId: account } : null,
        }),
      true,
    );
  };

  const confirmReopen = () =>
    Alert.alert(
      'Desfazer pagamento?',
      data.paidTx?.origin === 'manual' ? 'A despesa lançada no pagamento também será excluída.' : 'A conta volta a ficar pendente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desfazer', style: 'destructive', onPress: () => run(() => reopenBill(db, inst.id)) },
      ],
    );

  return (
    <Screen>
      <Card style={s.hero}>
        <IconBadge name={categoryIcon(inst.category_root)} color={inst.category_color ?? t.primary} size={56} />
        <Text style={s.name}>{inst.name}</Text>
        <Text style={s.amount}>{inst.paid_amount_cents ?? inst.amount_cents ? formatCents((inst.paid_amount_cents ?? inst.amount_cents)!) : 'Valor variável'}</Text>
        <Badge label={st === 'paga' && inst.paid_on ? `Paga em ${formatDate(inst.paid_on)}` : `${BILL_STATUS_LABEL[st]} · vence ${formatDate(inst.due_on)}`} tone={tone} />
      </Card>

      {inst.status === 'pending' && !paying && (
        <>
          <Button title="Marcar como paga" icon="checkCircle" onPress={() => setPaying(true)} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button title="Lembrar amanhã" icon="alarm" variant="secondary" small onPress={() => run(() => snoozeInstance(db, inst.id, Date.now() + SNOOZE_MS))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Pular esta" icon="skip" variant="secondary" small onPress={() => run(() => skipInstance(db, inst.id), true)} />
            </View>
          </View>
          {inst.snoozed_until && inst.snoozed_until > Date.now() ? (
            <Muted center>Lembrete adiado para {new Date(inst.snoozed_until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</Muted>
          ) : null}
        </>
      )}

      {inst.status === 'pending' && paying && (
        <>
          <SectionTitle>Pagamento</SectionTitle>
          <AmountInput label="Valor pago" cents={cents} onChange={setCents} />
          <FormSection>
            <DateField label="Data do pagamento" value={paidOn} onChange={setPaidOn} />
            {data.candidates.length === 0 || !linkTx ? (
              <ListItem
                title="Lançar como despesa"
                subtitle="Cria a despesa no extrato e vincula a esta conta"
                right={<Switch value={withExpense} onValueChange={setWithExpense} trackColor={{ true: t.primary }} />}
              />
            ) : null}
            {withExpense && !linkTx && data.accounts.length > 1 && (
              <ChipSelect label="Saiu da conta" options={data.accounts.map((a) => ({ id: a.id, label: a.name }))} value={account} onChange={setAccountId} />
            )}
          </FormSection>
          {data.candidates.length > 0 && (
            <Group title="Ou vincular a uma transação existente" footer="Despesas com o mesmo valor perto do vencimento.">
              {data.candidates.map((c) => (
                <ListItem
                  key={c.id}
                  icon="link"
                  title={c.description_raw}
                  subtitle={`${formatDate(c.posted_on)} · ${formatCents(c.amount_cents)} · ${c.origin === 'csv' ? 'importada' : 'manual'}`}
                  onPress={() => {
                    setLinkTx(linkTx === c.id ? null : c.id);
                    if (linkTx !== c.id) setPaidOn(c.posted_on);
                  }}
                  selected={linkTx === c.id}
                />
              ))}
            </Group>
          )}
          <ErrorText>{error}</ErrorText>
          <Button title="Confirmar pagamento" icon="check" onPress={confirmPay} loading={busy} />
          <Button title="Cancelar" variant="ghost" onPress={() => setPaying(false)} />
        </>
      )}

      {inst.status !== 'pending' && (
        <>
          {data.paidTx && (
            <Group title="Pago com">
              <ListItem
                icon="link"
                title={data.paidTx.description_raw}
                subtitle={`${formatDate(data.paidTx.posted_on)} · ${formatCents(data.paidTx.amount_cents)} · ${data.paidTx.origin === 'csv' ? 'importada' : 'manual'}`}
                onPress={() => router.push({ pathname: '/transactions/[id]', params: { id: data.paidTx!.id } })}
              />
            </Group>
          )}
          <Button title={inst.status === 'paid' ? 'Desfazer pagamento' : 'Voltar a pendente'} icon="undo" variant="secondary" onPress={inst.status === 'paid' ? confirmReopen : () => run(() => reopenBill(db, inst.id))} loading={busy} />
        </>
      )}
      {!paying && <ErrorText>{error}</ErrorText>}

      <Group title="Detalhes">
        <ListItem icon="repeat" title="Repetição" right={<Text style={s.value}>{describeRRule(inst.rrule, inst.dtstart)}</Text>} />
        {inst.payment_method ? <ListItem icon="card" title="Forma de pagamento" right={<Text style={s.value}>{PAYMENT_METHOD_LABEL[inst.payment_method]}</Text>} /> : null}
        {inst.category_name ? <ListItem icon="tag" title="Categoria" right={<Text style={s.value}>{inst.category_name}</Text>} /> : null}
        {inst.amount_kind === 'variable' && inst.status === 'pending' ? (
          <ListItem icon="edit" title="Valor desta fatura" subtitle={inst.amount_cents ? formatCents(inst.amount_cents) : 'Ainda não informado'} onPress={() => setPaying(true)} />
        ) : null}
        {inst.notes ? <ListItem icon="doc" title="Observação" subtitle={inst.notes} /> : null}
      </Group>

      {inst.barcode ? (
        <Card>
          <Text style={s.label}>Código de barras</Text>
          <Text selectable style={s.barcode}>{inst.barcode.replace(/(\d{5})(?=\d)/g, '$1 ')}</Text>
          <Muted>Toque e segure para copiar.</Muted>
        </Card>
      ) : null}

      {data.history.length > 1 && (
        <Group title="Ocorrências">
          {data.history.map((h) => {
            const hs = billStatus(h, today);
            return (
              <ListItem
                key={h.id}
                title={formatDate(h.due_on)}
                subtitle={h.amount_cents ? formatCents(h.paid_amount_cents ?? h.amount_cents) : 'valor variável'}
                right={<Badge label={BILL_STATUS_LABEL[hs]} tone={hs === 'vencida' ? 'danger' : hs === 'paga' ? 'success' : hs === 'vence_hoje' ? 'warning' : 'neutral'} />}
                onPress={h.id === inst.id ? undefined : () => router.replace({ pathname: '/bills/[id]', params: { id: h.id } })}
              />
            );
          })}
        </Group>
      )}

      <Button title="Editar conta" icon="edit" variant="ghost" onPress={() => router.push({ pathname: '/bills/new', params: { templateId: inst.template_id } })} />
      {inst.amount_kind === 'variable' && inst.status === 'pending' && cents && cents !== inst.amount_cents && !paying ? (
        <Button title="Salvar valor desta fatura" variant="secondary" onPress={() => run(() => setInstanceAmount(db, inst.id, cents))} />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) =>
  StyleSheet.create({
    hero: { alignItems: 'center', paddingVertical: 24, gap: 8 },
    name: { color: t.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    amount: { color: t.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
    value: { color: t.text, fontWeight: '600', fontSize: 14, flexShrink: 1, textAlign: 'right', maxWidth: '55%' },
    label: { color: t.muted, fontWeight: '600' },
    barcode: { color: t.text, fontSize: 16, fontFamily: 'monospace', letterSpacing: 1 },
  }),
);
