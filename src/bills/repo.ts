import type { SQLiteDatabase } from 'expo-sqlite';

import type { ISODate } from '@/services/recurrence/dates';
import type { BillInstanceRow, BillTemplate } from './types';

const INSTANCE_SELECT = /* sql */ `
  SELECT i.id, i.template_id, i.original_due, i.due_on, i.amount_cents, i.status, i.paid_on, i.paid_amount_cents,
         i.paid_tx_id, i.snoozed_until,
         t.name, t.amount_kind, t.category_id, c.name AS category_name,
         coalesce(c.color, pc.color) AS category_color, coalesce(pc.id, c.id) AS category_root,
         t.account_id, t.payment_method, t.barcode, t.notes, t.rrule, t.dtstart, t.reminders
  FROM bill_instances i
  JOIN bill_templates t ON t.id = i.template_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id`;

/** Pendentes até `to` (inclui vencidas) — usa idx_bills_status_date. */
export const listPendingInstances = (db: SQLiteDatabase, to: ISODate) =>
  db.getAllAsync<BillInstanceRow>(
    `${INSTANCE_SELECT} WHERE i.status = 'pending' AND i.due_on <= ? AND t.active = 1 ORDER BY i.due_on, t.name;`,
    to,
  );

export const listPaidInstances = (db: SQLiteDatabase, limit = 100) =>
  db.getAllAsync<BillInstanceRow>(`${INSTANCE_SELECT} WHERE i.status = 'paid' ORDER BY i.paid_on DESC, i.due_on DESC LIMIT ?;`, limit);

export const getInstance = (db: SQLiteDatabase, id: string) =>
  db.getFirstAsync<BillInstanceRow>(`${INSTANCE_SELECT} WHERE i.id = ?;`, id);

export const getTemplate = (db: SQLiteDatabase, id: string) =>
  db.getFirstAsync<BillTemplate>('SELECT * FROM bill_templates WHERE id = ?;', id);

export const listActiveTemplates = (db: SQLiteDatabase) =>
  db.getAllAsync<BillTemplate>('SELECT * FROM bill_templates WHERE active = 1 ORDER BY name;');

/** Próximas ocorrências de uma regra (detalhe da conta). */
export const listTemplateInstances = (db: SQLiteDatabase, templateId: string, limit = 12) =>
  db.getAllAsync<BillInstanceRow>(`${INSTANCE_SELECT} WHERE i.template_id = ? ORDER BY i.due_on DESC LIMIT ?;`, templateId, limit);

/** Candidatas a vínculo com uma transação: pendentes, valor igual (ou variável) e vencimento próximo. */
export const suggestInstancesForPayment = (db: SQLiteDatabase, amountCents: number, postedOn: ISODate, windowDays = 10) =>
  db.getAllAsync<BillInstanceRow & { score: number }>(
    `${INSTANCE_SELECT.replace('SELECT i.id', 'SELECT abs(julianday(i.due_on) - julianday(?)) AS score, i.id')}
     WHERE i.status = 'pending' AND t.active = 1
       AND abs(julianday(i.due_on) - julianday(?)) <= ?
       AND (i.amount_cents IS NULL OR i.amount_cents = ?)
     ORDER BY (i.amount_cents IS NULL), score LIMIT 5;`,
    postedOn, postedOn, windowDays, Math.abs(amountCents),
  );

export type BillsSummary = { overdue_count: number; overdue_cents: number; today_count: number; today_cents: number; week_count: number; week_cents: number };

export const billsSummary = (db: SQLiteDatabase, today: ISODate, weekEnd: ISODate) =>
  db.getFirstAsync<BillsSummary>(
    `SELECT
       count(CASE WHEN i.due_on < ?1 THEN 1 END) AS overdue_count,
       coalesce(sum(CASE WHEN i.due_on < ?1 THEN i.amount_cents END), 0) AS overdue_cents,
       count(CASE WHEN i.due_on = ?1 THEN 1 END) AS today_count,
       coalesce(sum(CASE WHEN i.due_on = ?1 THEN i.amount_cents END), 0) AS today_cents,
       count(CASE WHEN i.due_on > ?1 AND i.due_on <= ?2 THEN 1 END) AS week_count,
       coalesce(sum(CASE WHEN i.due_on > ?1 AND i.due_on <= ?2 THEN i.amount_cents END), 0) AS week_cents
     FROM bill_instances i JOIN bill_templates t ON t.id = i.template_id
     WHERE i.status = 'pending' AND t.active = 1 AND i.due_on <= ?2;`,
    today, weekEnd,
  );
