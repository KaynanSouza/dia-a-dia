import type { ISODate } from '@/services/recurrence/dates';

export type PaymentMethod = 'boleto' | 'pix' | 'debito_automatico' | 'cartao' | 'dinheiro' | 'transferencia' | 'outro';
export type WeekendShift = 'none' | 'next' | 'previous';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  boleto: 'Boleto',
  pix: 'Pix',
  debito_automatico: 'Débito automático',
  cartao: 'Cartão',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  outro: 'Outro',
};

export type BillTemplate = {
  id: string;
  name: string;
  amount_kind: 'fixed' | 'variable';
  amount_cents: number | null;
  category_id: string | null;
  account_id: string | null;
  payment_method: PaymentMethod | null;
  notes: string | null;
  barcode: string | null;
  dtstart: ISODate;
  rrule: string | null;
  weekend_shift: WeekendShift;
  reminders: string | null; // JSON number[]
  active: 0 | 1;
  generated_until: ISODate | null;
  created_at: number;
  updated_at: number;
};

/** Estado persistido. O estado exibido (vencida/vence hoje) é derivado da data. */
export type StoredStatus = 'pending' | 'paid' | 'skipped';
export type BillStatus = 'a_vencer' | 'vence_hoje' | 'vencida' | 'paga' | 'ignorada';

export type BillInstanceRow = {
  id: string;
  template_id: string;
  original_due: ISODate;
  due_on: ISODate;
  amount_cents: number | null;
  status: StoredStatus;
  paid_on: ISODate | null;
  paid_amount_cents: number | null;
  paid_tx_id: string | null;
  snoozed_until: number | null;
  // do template
  name: string;
  amount_kind: 'fixed' | 'variable';
  category_id: string | null;
  category_name: string | null;
  category_color: string | null;
  category_root: string | null;
  account_id: string | null;
  payment_method: PaymentMethod | null;
  barcode: string | null;
  notes: string | null;
  rrule: string | null;
  dtstart: ISODate;
  reminders: string | null;
};

export type BillInput = {
  name: string;
  amountKind: 'fixed' | 'variable';
  amountCents: number | null;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  barcode: string | null;
  dtstart: ISODate;
  rrule: string | null;
  weekendShift: WeekendShift;
  /** dias de antecedência; null = padrão global */
  reminders: number[] | null;
};

export function billStatus(i: Pick<BillInstanceRow, 'status' | 'due_on'>, today: ISODate): BillStatus {
  if (i.status === 'paid') return 'paga';
  if (i.status === 'skipped') return 'ignorada';
  if (i.due_on < today) return 'vencida';
  if (i.due_on === today) return 'vence_hoje';
  return 'a_vencer';
}

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  a_vencer: 'A vencer',
  vence_hoje: 'Vence hoje',
  vencida: 'Vencida',
  paga: 'Paga',
  ignorada: 'Ignorada',
};
