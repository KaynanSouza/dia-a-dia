import type { SQLiteDatabase } from 'expo-sqlite';

import type { BillTemplate } from '@/bills/types';
import { addDays, shiftWeekend, todayLocal, type ISODate } from './dates';
import { occurrences } from './rrule';

/** Janela rolante de instâncias pré-geradas. */
export const INSTANCE_HORIZON_DAYS = 90;
/** Ao criar uma regra com início no passado, gera no máximo isto para trás (evita dezenas de "vencidas"). */
const BACKFILL_DAYS = 31;

/** Id determinístico: regenerar nunca duplica e o id é estável entre backup/restore. */
export const instanceId = (templateId: string, originalDue: ISODate) => `${templateId}_${originalDue.replace(/-/g, '')}`;

/**
 * Gera as instâncias de UMA regra até hoje+90 (INSERT OR IGNORE pela chave (regra, data original)).
 * Chamar dentro de withTransaction quando fizer parte de uma operação maior.
 */
export async function generateForTemplate(db: SQLiteDatabase, t: BillTemplate, today = todayLocal()): Promise<number> {
  if (!t.active) return 0;
  const horizon = addDays(today, INSTANCE_HORIZON_DAYS);
  const backfill = addDays(today, -BACKFILL_DAYS);
  const from = t.generated_until ? addDays(t.generated_until, 1) : t.dtstart > backfill ? t.dtstart : backfill;
  if (from > horizon) return 0;

  const now = Date.now();
  let created = 0;
  for (const original of occurrences(t.rrule, t.dtstart, from, horizon)) {
    const r = await db.runAsync(
      `INSERT OR IGNORE INTO bill_instances (id, template_id, original_due, due_on, amount_cents, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?);`,
      instanceId(t.id, original), t.id, original, shiftWeekend(original, t.weekend_shift),
      t.amount_kind === 'fixed' ? t.amount_cents : null, now, now,
    );
    created += r.changes;
  }
  await db.runAsync('UPDATE bill_templates SET generated_until = ? WHERE id = ?;', horizon, t.id);
  return created;
}

/** Todas as regras ativas (abertura do app, após restore). */
export async function ensureInstances(db: SQLiteDatabase, today = todayLocal()): Promise<number> {
  const templates = await db.getAllAsync<BillTemplate>(
    'SELECT * FROM bill_templates WHERE active = 1 AND (generated_until IS NULL OR generated_until < ?);',
    addDays(today, INSTANCE_HORIZON_DAYS),
  );
  let n = 0;
  for (const t of templates) n += await generateForTemplate(db, t, today);
  return n;
}

/**
 * Regra editada: descarta as ocorrências FUTURAS ainda pendentes e sem vínculo (as pagas/puladas e
 * as vencidas ficam) e regenera a partir de hoje.
 */
export async function regenerateTemplate(db: SQLiteDatabase, t: BillTemplate, today = todayLocal()) {
  await db.runAsync(
    "DELETE FROM bill_instances WHERE template_id = ? AND status = 'pending' AND due_on >= ? AND paid_tx_id IS NULL;",
    t.id, today,
  );
  const kept = await db.getFirstAsync<{ last: ISODate | null }>(
    'SELECT max(original_due) AS last FROM bill_instances WHERE template_id = ?;',
    t.id,
  );
  // nunca recria ocorrências no passado: retoma após a última mantida ou a partir de hoje
  const yesterday = addDays(today, -1);
  const updated = { ...t, generated_until: kept?.last && kept.last > yesterday ? kept.last : yesterday };
  // pendentes que ficaram (vencidas) passam a usar o valor novo da regra, se fixo
  await db.runAsync(
    `UPDATE bill_instances SET amount_cents = coalesce(?, amount_cents), updated_at = ?
     WHERE template_id = ? AND status = 'pending';`,
    t.amount_kind === 'fixed' ? t.amount_cents : null, Date.now(), t.id,
  );
  return generateForTemplate(db, updated, today);
}
