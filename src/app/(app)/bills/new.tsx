import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { AmountInput, CategorySelect, Chip, ChipSelect, DateField, FormSection } from '@/components/form';
import { Button, ErrorText, Field, ListItem, Loading, Muted, Screen, SectionTitle } from '@/components/ui';
import { BillError, createBill, deleteBill, updateBill } from '@/bills/service';
import { PAYMENT_METHOD_LABEL, type BillTemplate, type PaymentMethod, type WeekendShift } from '@/bills/types';
import { useDb, useDbQuery } from '@/db/DatabaseProvider';
import { listAccounts, listCategoryTree } from '@/db/repositories/finance.repo';
import { DEFAULT_REMINDERS } from '@/services/notifications/plan';
import { todayLocal, type ISODate } from '@/services/recurrence/dates';
import { describeRRule, presetToRRule, rruleToPreset, type RecurrencePreset } from '@/services/recurrence/rrule';
import { useTheme } from '@/theme';

const PRESETS: { id: RecurrencePreset; label: string }[] = [
  { id: 'once', label: 'Única' },
  { id: 'monthly', label: 'Mensal' },
  { id: 'monthly_last', label: 'Último dia do mês' },
  { id: 'weekly', label: 'Semanal' },
  { id: 'yearly', label: 'Anual' },
  { id: 'custom', label: 'Personalizada' },
];
const LEADS = [7, 5, 3, 2, 1, 0];
const BILL_ERROR: Record<BillError['code'], string> = {
  invalid_name: 'Informe o nome da conta.',
  invalid_amount: 'Informe o valor (ou marque como valor variável).',
  invalid_date: 'Data de vencimento inválida.',
  invalid_rrule: 'Regra de recorrência inválida. Ex.: FREQ=MONTHLY;BYMONTHDAY=10',
  not_found: 'Conta não encontrada.',
  not_pending: 'Esta ocorrência não está pendente.',
};

/** A-01: cadastro/edição da regra da conta (?templateId= para editar). */
export default function BillForm() {
  const t = useTheme();
  const { db, bump } = useDb();
  const { templateId } = useLocalSearchParams<{ templateId?: string }>();
  const { data } = useDbQuery(async (d) => ({
    accounts: await listAccounts(d),
    categories: await listCategoryTree(d),
    template: templateId ? await d.getFirstAsync<BillTemplate>('SELECT * FROM bill_templates WHERE id = ?;', templateId) : null,
  }), [templateId]);

  const [name, setName] = useState('');
  const [variable, setVariable] = useState(false);
  const [cents, setCents] = useState<number | null>(null);
  const [dtstart, setDtstart] = useState<ISODate>(todayLocal());
  const [preset, setPreset] = useState<RecurrencePreset>('monthly');
  const [custom, setCustom] = useState('');
  const [shift, setShift] = useState<WeekendShift>('none');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');
  const [leads, setLeads] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const tp = data?.template;
    if (!tp || loaded) return;
    setName(tp.name);
    setVariable(tp.amount_kind === 'variable');
    setCents(tp.amount_cents);
    setDtstart(tp.dtstart);
    setPreset(rruleToPreset(tp.rrule));
    setCustom(tp.rrule ?? '');
    setShift(tp.weekend_shift);
    setCategoryId(tp.category_id);
    setAccountId(tp.account_id);
    setMethod(tp.payment_method);
    setBarcode(tp.barcode ?? '');
    setNotes(tp.notes ?? '');
    try {
      setLeads(tp.reminders ? JSON.parse(tp.reminders) : null);
    } catch {}
    setLoaded(true);
  }, [data, loaded]);

  if (!data) return <Loading />;

  let rrule: string | null = null;
  let rruleError = false;
  try {
    rrule = presetToRRule(preset, dtstart, custom);
  } catch {
    rruleError = true;
  }
  const effectiveLeads = leads ?? DEFAULT_REMINDERS.leadDays;

  const save = async () => {
    setBusy(true);
    setError(undefined);
    const input = {
      name, amountKind: variable ? ('variable' as const) : ('fixed' as const), amountCents: cents, categoryId, accountId,
      paymentMethod: method, notes: notes || null, barcode: barcode || null, dtstart, rrule, weekendShift: shift, reminders: leads,
    };
    try {
      if (rruleError) throw new BillError('invalid_rrule');
      if (templateId) await updateBill(db, templateId, input);
      else await createBill(db, input);
      bump();
      router.back();
    } catch (e) {
      setError(e instanceof BillError ? BILL_ERROR[e.code] : 'Não foi possível salvar.');
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert('Excluir esta conta?', 'Todas as ocorrências e lembretes serão removidos. Lançamentos já feitos continuam no extrato.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          await deleteBill(db, templateId!);
          bump();
          router.dismissAll();
          router.replace('/bills');
        },
      },
    ]);

  const toggleLead = (n: number) => {
    const cur = new Set(effectiveLeads);
    if (cur.has(n)) cur.delete(n);
    else cur.add(n);
    setLeads([...cur].sort((a, b) => b - a));
  };

  return (
    <Screen>
      <FormSection>
        <Field label="Nome" value={name} onChangeText={setName} placeholder="Ex.: Energia, Aluguel, Internet" maxLength={80} autoCapitalize="sentences" />
        <ListItem
          title="Valor variável"
          subtitle="Luz, água… informe o valor quando chegar a fatura"
          right={<Switch value={variable} onValueChange={setVariable} trackColor={{ true: t.primary }} />}
        />
        {!variable && <AmountInput label="Valor" cents={cents} onChange={setCents} />}
        {variable && <AmountInput label="Valor estimado (opcional)" cents={cents} onChange={setCents} />}
      </FormSection>

      <FormSection>
        <DateField label={preset === 'once' ? 'Vencimento' : 'Primeiro vencimento'} value={dtstart} onChange={setDtstart} shortcuts={false} />
        <ChipSelect label="Repetição" options={PRESETS} value={preset} onChange={setPreset} />
        {preset === 'custom' && (
          <Field
            label="Regra (RRULE)"
            value={custom}
            onChangeText={setCustom}
            placeholder="FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=5"
            autoCapitalize="characters"
            hint="FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH"
          />
        )}
        <Text style={{ color: rruleError ? t.danger : t.muted, fontSize: 13 }}>{rruleError ? 'Regra inválida.' : describeRRule(rrule, dtstart)}</Text>
        {preset !== 'once' && (
          <ChipSelect
            label="Se cair no fim de semana"
            options={[
              { id: 'none' as const, label: 'Manter' },
              { id: 'next' as const, label: 'Próximo dia útil' },
              { id: 'previous' as const, label: 'Dia útil anterior' },
            ]}
            value={shift}
            onChange={setShift}
          />
        )}
      </FormSection>

      <FormSection>
        <CategorySelect categories={data.categories} value={categoryId} onChange={setCategoryId} />
        <ChipSelect
          label="Forma de pagamento"
          options={(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => ({ id: m, label: PAYMENT_METHOD_LABEL[m] }))}
          value={method}
          onChange={setMethod}
        />
        {data.accounts.length > 0 && (
          <ChipSelect label="Paga com a conta" options={data.accounts.map((a) => ({ id: a.id, label: a.name, icon: a.kind === 'credit_card' ? 'card' : 'bank' }))} value={accountId} onChange={setAccountId} />
        )}
        {(method === 'boleto' || barcode) && (
          <Field
            label="Código de barras / linha digitável"
            value={barcode}
            onChangeText={(v) => setBarcode(v.replace(/[^\d. ]/g, ''))}
            keyboardType="number-pad"
            maxLength={60}
            hint="Guardado só neste aparelho, criptografado."
          />
        )}
        <Field label="Observação" value={notes} onChangeText={setNotes} maxLength={500} autoCapitalize="sentences" />
      </FormSection>

      <SectionTitle>Lembretes</SectionTitle>
      <Muted>Dias antes do vencimento, às {String(DEFAULT_REMINDERS.hour).padStart(2, '0')}h (ajuste o horário em Ajustes › Lembretes).</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {LEADS.map((n) => (
          <Chip key={n} label={n === 0 ? 'No dia' : n === 1 ? '1 dia antes' : `${n} dias antes`} active={effectiveLeads.includes(n)} onPress={() => toggleLead(n)} />
        ))}
        {leads && <Chip label="Usar padrão" icon="undo" onPress={() => setLeads(null)} />}
      </View>
      {!effectiveLeads.length && <Muted>Sem lembretes antes do vencimento; só os avisos de atraso.</Muted>}

      <ErrorText>{error}</ErrorText>
      <Button title={templateId ? 'Salvar conta' : 'Adicionar conta'} icon="check" onPress={save} loading={busy} />
      {templateId && <Button title="Excluir conta" icon="trash" variant="ghost" onPress={remove} />}
    </Screen>
  );
}
