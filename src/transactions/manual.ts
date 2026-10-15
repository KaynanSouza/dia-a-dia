import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import type { CategorySource } from '@/categorization/engine';
import { createEngine } from '@/categorization/factory';
import { normalizeForCategorization } from '@/categorization/normalize';
import { normalizeDescription } from '@/core/parsing/values';
import { withTransaction } from '@/db/transaction';
import { bus } from '@/events/bus';
import { isValidISODate, type ISODate } from '@/services/recurrence/dates';

export type ManualTxInput = {
  accountId: string;
  type: 'income' | 'expense';
  /** sempre positivo; o sinal vem de `type` */
  amountCents: number;
  postedOn: ISODate;
  description: string;
  /** null = categorização automática (mesmo motor da importação) */
  categoryId: string | null;
  notes?: string | null;
  /** paga esta conta (marca a instância como paga, na mesma transação SQL) */
  billInstanceId?: string | null;
};

export class ManualTxError extends Error {
  constructor(public code: 'invalid' | 'not_manual' | 'not_found' | 'bill_unavailable') {
    super(code);
    this.name = 'ManualTxError';
  }
}

function validate(i: ManualTxInput) {
  if (!i.accountId || !Number.isSafeInteger(i.amountCents) || i.amountCents <= 0 || !isValidISODate(i.postedOn)) throw new ManualTxError('invalid');
  if (!i.description.trim() || i.description.length > 200) throw new ManualTxError('invalid');
}

/** Lançamento manual nunca colide com o hash de idempotência do CSV (que é derivado do conteúdo). */
const manualHash = (id: string) => bytesToHex(sha256(utf8ToBytes(`v1|manual|${id}`)));

export type ResolvedCategory = { categoryId: string | null; source: CategorySource | 'manual'; confidence: number | null };

async function resolveCategory(db: SQLiteDatabase, i: ManualTxInput, signed: number): Promise<ResolvedCategory> {
  if (i.categoryId) return { categoryId: i.categoryId, source: 'manual', confidence: null };
  const engine = await createEngine(db);
  const r = engine.categorize({ description: i.description, amountCents: signed, accountId: i.accountId, accountKind: 'checking' });
  return { categoryId: r.categoryId, source: r.source, confidence: r.confidence };
}

/**
 * Marca a instância como paga por esta transação. Executar DENTRO de uma transação SQL.
 * A instância precisa estar pendente (ou já ligada a esta mesma transação).
 */
export async function linkTxToBill(tx: SQLiteDatabase, txId: string, billInstanceId: string, paidOn: ISODate, amountCents: number) {
  const r = await tx.runAsync(
    `UPDATE bill_instances
        SET status = 'paid', paid_on = ?, paid_amount_cents = ?, paid_tx_id = ?, snoozed_until = NULL, updated_at = ?
      WHERE id = ? AND (status = 'pending' OR paid_tx_id = ?);`,
    paidOn, Math.abs(amountCents), txId, Date.now(), billInstanceId, txId,
  );
  if (!r.changes) throw new ManualTxError('bill_unavailable');
  await tx.runAsync('UPDATE transactions SET bill_instance_id = ?, updated_at = ? WHERE id = ?;', billInstanceId, Date.now(), txId);
}

/** INSERT + (opcional) baixa da conta. Executar DENTRO de withTransaction. */
export async function insertManualTx(tx: SQLiteDatabase, i: ManualTxInput, category: ResolvedCategory): Promise<string> {
  validate(i);
  const id = randomUUID();
  const signed = i.type === 'expense' ? -i.amountCents : i.amountCents;
  const now = Date.now();
  await tx.runAsync(
    `INSERT INTO transactions (id, account_id, import_log_id, posted_on, amount_cents, type, description_raw, description_norm,
       merchant_key, category_id, category_source, category_confidence, occurrence_n, dedup_hash, notes, origin, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 'manual', ?, ?);`,
    id, i.accountId, i.postedOn, signed, i.type, i.description.trim().slice(0, 200), normalizeDescription(i.description),
    normalizeForCategorization(i.description).merchantKey, category.categoryId, category.source, category.confidence,
    manualHash(id), i.notes?.trim() || null, now, now,
  );
  if (i.billInstanceId) await linkTxToBill(tx, id, i.billInstanceId, i.postedOn, i.amountCents);
  return id;
}

export async function createManualTransaction(db: SQLiteDatabase, i: ManualTxInput): Promise<string> {
  validate(i);
  const category = await resolveCategory(db, i, i.type === 'expense' ? -i.amountCents : i.amountCents);
  const id = await withTransaction(db, (tx) => insertManualTx(tx, i, category));
  bus.emit('tx.manual_saved', { action: 'create', linked_bill: !!i.billInstanceId });
  return id;
}

/** Edita um lançamento MANUAL (os importados só mudam de categoria, para manter a idempotência do CSV). */
export async function updateManualTransaction(db: SQLiteDatabase, id: string, i: ManualTxInput): Promise<void> {
  validate(i);
  const cur = await db.getFirstAsync<{ origin: string; bill_instance_id: string | null }>(
    'SELECT origin, bill_instance_id FROM transactions WHERE id = ?;',
    id,
  );
  if (!cur) throw new ManualTxError('not_found');
  if (cur.origin !== 'manual') throw new ManualTxError('not_manual');
  const signed = i.type === 'expense' ? -i.amountCents : i.amountCents;
  const category = await resolveCategory(db, i, signed);

  await withTransaction(db, async (tx) => {
    // trocar/remover o vínculo reabre a conta antiga (trigger trg_tx_unlink_reopen_bill)
    if (cur.bill_instance_id && cur.bill_instance_id !== (i.billInstanceId ?? null)) {
      await tx.runAsync('UPDATE transactions SET bill_instance_id = NULL WHERE id = ?;', id);
    }
    await tx.runAsync(
      `UPDATE transactions SET account_id = ?, posted_on = ?, amount_cents = ?, type = ?, description_raw = ?, description_norm = ?,
              merchant_key = ?, category_id = ?, category_source = ?, category_confidence = ?, notes = ?, updated_at = ?
        WHERE id = ? AND origin = 'manual';`,
      i.accountId, i.postedOn, signed, i.type, i.description.trim().slice(0, 200), normalizeDescription(i.description),
      normalizeForCategorization(i.description).merchantKey, category.categoryId, category.source, category.confidence,
      i.notes?.trim() || null, Date.now(), id,
    );
    if (i.billInstanceId) await linkTxToBill(tx, id, i.billInstanceId, i.postedOn, i.amountCents);
  });
  bus.emit('tx.manual_saved', { action: 'update', linked_bill: !!i.billInstanceId });
}

/**
 * Remove um lançamento manual. O dashboard é calculado por SQL a cada leitura, então os totais
 * se ajustam sozinhos; a conta paga por ele volta a "pendente" (trigger trg_tx_delete_reopen_bill).
 * Retorna o id da conta reaberta (para reagendar os lembretes).
 */
export async function deleteManualTransaction(db: SQLiteDatabase, id: string): Promise<string | null> {
  return withTransaction(db, async (tx) => {
    const cur = await tx.getFirstAsync<{ origin: string; bill_instance_id: string | null }>(
      'SELECT origin, bill_instance_id FROM transactions WHERE id = ?;',
      id,
    );
    if (!cur) throw new ManualTxError('not_found');
    if (cur.origin !== 'manual') throw new ManualTxError('not_manual');
    await tx.runAsync("DELETE FROM transactions WHERE id = ? AND origin = 'manual';", id);
    bus.emit('tx.manual_saved', { action: 'delete', linked_bill: !!cur.bill_instance_id });
    return cur.bill_instance_id;
  });
}

/**
 * Vínculo automático após importar CSV: despesa com o MESMO valor de uma conta pendente, lançada entre
 * 7 dias antes e 5 dias depois do vencimento. Ambiguidade (2+ candidatas) → não vincula.
 */
export async function autoLinkImported(db: SQLiteDatabase, importLogId: string): Promise<number> {
  const pairs = await db.getAllAsync<{ tx_id: string; posted_on: ISODate; amount_cents: number; instance_id: string; n_inst: number; n_tx: number }>(
    `WITH cand AS (
       SELECT t.id AS tx_id, t.posted_on, t.amount_cents, i.id AS instance_id
       FROM transactions t
       JOIN bill_instances i ON i.status = 'pending' AND i.amount_cents = -t.amount_cents
                            AND t.posted_on BETWEEN date(i.due_on, '-7 days') AND date(i.due_on, '+5 days')
       JOIN bill_templates bt ON bt.id = i.template_id AND bt.active = 1
                             AND (bt.account_id IS NULL OR bt.account_id = t.account_id)
       WHERE t.import_log_id = ? AND t.type = 'expense' AND t.bill_instance_id IS NULL
     )
     SELECT c.*, (SELECT count(*) FROM cand x WHERE x.tx_id = c.tx_id) AS n_inst,
                 (SELECT count(*) FROM cand y WHERE y.instance_id = c.instance_id) AS n_tx
     FROM cand c;`,
    importLogId,
  );
  const unique = pairs.filter((p) => p.n_inst === 1 && p.n_tx === 1);
  if (!unique.length) return 0;
  await withTransaction(db, async (tx) => {
    for (const p of unique) await linkTxToBill(tx, p.tx_id, p.instance_id, p.posted_on, p.amount_cents);
  });
  return unique.length;
}
