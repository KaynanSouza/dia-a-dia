import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from '@/db/transaction';
import { bus } from '@/events/bus';
import { cancelInstanceReminders, rescheduleBillReminders } from '@/services/notifications/reminders';
import { isValidISODate, type ISODate } from '@/services/recurrence/dates';
import { generateForTemplate, regenerateTemplate } from '@/services/recurrence/generate';
import { parseRRule } from '@/services/recurrence/rrule';
import { createEngine } from '@/categorization/factory';
import { insertManualTx, linkTxToBill, type ResolvedCategory } from '@/transactions/manual';
import type { BillInput, BillTemplate } from './types';

export class BillError extends Error {
  constructor(public code: 'invalid_name' | 'invalid_amount' | 'invalid_date' | 'invalid_rrule' | 'not_found' | 'not_pending') {
    super(code);
    this.name = 'BillError';
  }
}

function validate(i: BillInput) {
  if (!i.name.trim() || i.name.length > 80) throw new BillError('invalid_name');
  if (i.amountKind === 'fixed' && (!i.amountCents || i.amountCents <= 0 || !Number.isSafeInteger(i.amountCents))) throw new BillError('invalid_amount');
  if (!isValidISODate(i.dtstart)) throw new BillError('invalid_date');
  if (i.rrule) {
    try {
      parseRRule(i.rrule);
    } catch {
      throw new BillError('invalid_rrule');
    }
  }
}

const toRow = (i: BillInput) => [
  i.name.trim(),
  i.amountKind,
  i.amountKind === 'fixed' ? i.amountCents : i.amountCents || null,
  i.categoryId,
  i.accountId,
  i.paymentMethod,
  i.notes?.trim() || null,
  i.barcode?.replace(/\D/g, '') || null,
  i.dtstart,
  i.rrule,
  i.weekendShift,
  i.reminders ? JSON.stringify([...new Set(i.reminders)].sort((a, b) => b - a)) : null,
];

/** Reagenda em segundo plano: a operação no banco já terminou; falha de agendamento não a desfaz. */
const reschedule = (db: SQLiteDatabase, reason: string) => {
  rescheduleBillReminders(db, reason).catch(() => {});
};

export async function createBill(db: SQLiteDatabase, input: BillInput): Promise<string> {
  validate(input);
  const id = randomUUID();
  const now = Date.now();
  await withTransaction(db, async (tx) => {
    await tx.runAsync(
      `INSERT INTO bill_templates (id, name, amount_kind, amount_cents, category_id, account_id, payment_method, notes, barcode,
         dtstart, rrule, weekend_shift, reminders, active, generated_until, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?, ?);`,
      id, ...toRow(input), now, now,
    );
    const t = await tx.getFirstAsync<BillTemplate>('SELECT * FROM bill_templates WHERE id = ?;', id);
    await generateForTemplate(tx, t!);
  });
  bus.emit('bill.saved', { action: 'create', recurring: !!input.rrule });
  reschedule(db, 'bill_create');
  return id;
}

export async function updateBill(db: SQLiteDatabase, id: string, input: BillInput): Promise<void> {
  validate(input);
  await withTransaction(db, async (tx) => {
    const r = await tx.runAsync(
      `UPDATE bill_templates SET name = ?, amount_kind = ?, amount_cents = ?, category_id = ?, account_id = ?, payment_method = ?,
         notes = ?, barcode = ?, dtstart = ?, rrule = ?, weekend_shift = ?, reminders = ?, updated_at = ?
       WHERE id = ?;`,
      ...toRow(input), Date.now(), id,
    );
    if (!r.changes) throw new BillError('not_found');
    const t = await tx.getFirstAsync<BillTemplate>('SELECT * FROM bill_templates WHERE id = ?;', id);
    await regenerateTemplate(tx, t!);
  });
  bus.emit('bill.saved', { action: 'update', recurring: !!input.rrule });
  reschedule(db, 'bill_update');
}

/**
 * Exclui a regra e todas as ocorrências. Transações que pagaram ocorrências continuam no extrato
 * (só perdem o vínculo — ON DELETE SET NULL).
 */
export async function deleteBill(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM bill_templates WHERE id = ?;', id);
  bus.emit('bill.saved', { action: 'delete', recurring: false });
  reschedule(db, 'bill_delete');
}

export type PayOptions = {
  paidOn: ISODate;
  /** valor efetivamente pago (obrigatório se a conta for de valor variável) */
  amountCents: number;
  /** cria uma despesa manual na conta indicada e a vincula */
  createExpense?: { accountId: string } | null;
  /** ou vincula uma transação existente (CSV ou manual) */
  linkTxId?: string | null;
  via?: 'app' | 'notification';
};

/** A-01: baixa da conta — data real, valor pago, vínculo opcional, lembretes cancelados. */
export async function markPaid(db: SQLiteDatabase, instanceId: string, o: PayOptions): Promise<void> {
  if (!isValidISODate(o.paidOn)) throw new BillError('invalid_date');
  if (!Number.isSafeInteger(o.amountCents) || o.amountCents <= 0) throw new BillError('invalid_amount');
  const inst = await db.getFirstAsync<{ status: string; name: string; category_id: string | null }>(
    `SELECT i.status, t.name, t.category_id FROM bill_instances i JOIN bill_templates t ON t.id = i.template_id WHERE i.id = ?;`,
    instanceId,
  );
  if (!inst) throw new BillError('not_found');
  if (inst.status !== 'pending') throw new BillError('not_pending');

  // categoria da despesa: a da conta, ou o motor automático
  let category: ResolvedCategory = {
    categoryId: inst.category_id,
    source: 'manual',
    confidence: null,
  };
  if (o.createExpense && !inst.category_id) {
    const r = (await createEngine(db)).categorize({ description: inst.name, amountCents: -o.amountCents, accountId: o.createExpense.accountId, accountKind: 'checking' });
    category = { categoryId: r.categoryId, source: r.source, confidence: r.confidence };
  }

  await withTransaction(db, async (tx) => {
    if (o.createExpense) {
      await insertManualTx(
        tx,
        { accountId: o.createExpense.accountId, type: 'expense', amountCents: o.amountCents, postedOn: o.paidOn, description: inst.name, categoryId: null, billInstanceId: instanceId },
        category,
      );
    } else if (o.linkTxId) {
      await linkTxToBill(tx, o.linkTxId, instanceId, o.paidOn, o.amountCents);
    } else {
      await tx.runAsync(
        `UPDATE bill_instances SET status = 'paid', paid_on = ?, paid_amount_cents = ?, snoozed_until = NULL, updated_at = ?
         WHERE id = ? AND status = 'pending';`,
        o.paidOn, o.amountCents, Date.now(), instanceId,
      );
    }
  });
  bus.emit('bill.paid', { via: o.via ?? 'app', with_tx: !!(o.createExpense || o.linkTxId) });
  await cancelInstanceReminders(instanceId);
  reschedule(db, 'bill_paid');
}

/**
 * Desfaz o pagamento. Se uma despesa MANUAL foi criada na baixa, ela é removida (o trigger reabre a
 * conta); se o vínculo era com uma transação importada, só o vínculo é desfeito.
 */
export async function reopenBill(db: SQLiteDatabase, instanceId: string): Promise<void> {
  await withTransaction(db, async (tx) => {
    const i = await tx.getFirstAsync<{ paid_tx_id: string | null }>('SELECT paid_tx_id FROM bill_instances WHERE id = ?;', instanceId);
    if (!i) throw new BillError('not_found');
    if (i.paid_tx_id) {
      const t = await tx.getFirstAsync<{ origin: string }>('SELECT origin FROM transactions WHERE id = ?;', i.paid_tx_id);
      if (t?.origin === 'manual') await tx.runAsync('DELETE FROM transactions WHERE id = ?;', i.paid_tx_id);
      else if (t) await tx.runAsync('UPDATE transactions SET bill_instance_id = NULL, updated_at = ? WHERE id = ?;', Date.now(), i.paid_tx_id);
    }
    // sem transação (ou já reaberta pelo trigger): garante o estado
    await tx.runAsync(
      `UPDATE bill_instances SET status = 'pending', paid_on = NULL, paid_amount_cents = NULL, paid_tx_id = NULL, updated_at = ?
       WHERE id = ?;`,
      Date.now(), instanceId,
    );
  });
  bus.emit('bill.reopened', { via: 'app' });
  reschedule(db, 'bill_reopen');
}

/** "Esta não vou pagar" (ex.: conta cancelada só neste mês). */
export async function skipInstance(db: SQLiteDatabase, instanceId: string): Promise<void> {
  await db.runAsync("UPDATE bill_instances SET status = 'skipped', updated_at = ? WHERE id = ? AND status = 'pending';", Date.now(), instanceId);
  await cancelInstanceReminders(instanceId);
  reschedule(db, 'bill_skip');
}

/** Valor de uma ocorrência específica (contas variáveis: luz, água…). */
export async function setInstanceAmount(db: SQLiteDatabase, instanceId: string, amountCents: number | null): Promise<void> {
  if (amountCents !== null && (!Number.isSafeInteger(amountCents) || amountCents <= 0)) throw new BillError('invalid_amount');
  await db.runAsync('UPDATE bill_instances SET amount_cents = ?, updated_at = ? WHERE id = ?;', amountCents, Date.now(), instanceId);
  reschedule(db, 'bill_amount');
}

/** A-05 "Lembrar amanhã" (também usado pela fila de ações da notificação). */
export async function snoozeInstance(db: SQLiteDatabase, instanceId: string, until: number): Promise<void> {
  await db.runAsync("UPDATE bill_instances SET snoozed_until = ?, updated_at = ? WHERE id = ? AND status = 'pending';", until, Date.now(), instanceId);
  reschedule(db, 'bill_snooze');
}

