import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from '@/db/transaction';

import { bus } from '@/events/bus';

export type ImportLogRow = {
  id: string;
  account_id: string;
  account_name: string;
  profile_id: string;
  status: 'committed' | 'failed' | 'undone';
  rows_total: number;
  rows_imported: number;
  rows_duplicate: number;
  rows_error: number;
  rows_categorized: number;
  error_code: string | null;
  finished_at: number;
  undo_until: number | null;
};

export const listImportLogs = (db: SQLiteDatabase, limit = 50) =>
  db.getAllAsync<ImportLogRow>(
    `SELECT l.id, l.account_id, a.name AS account_name, l.profile_id, l.status, l.rows_total, l.rows_imported, l.rows_duplicate,
            l.rows_error, l.rows_categorized, l.error_code, l.finished_at, l.undo_until
     FROM import_logs l JOIN accounts a ON a.id = l.account_id ORDER BY l.finished_at DESC LIMIT ?;`,
    limit,
  );

export const canUndo = (l: ImportLogRow, now = Date.now()) => l.status === 'committed' && !!l.undo_until && now < l.undo_until;

/**
 * C-03: desfaz uma importação inteira (até 30 dias). Desfaz também o pareamento de transferências
 * com lançamentos de outras importações. Edições manuais nesses lançamentos são perdidas.
 */
export async function undoImport(db: SQLiteDatabase, importLogId: string): Promise<number> {
  let removed = 0;
  await withTransaction(db, async (tx) => {
    const log = await tx.getFirstAsync<{ status: string; undo_until: number | null }>(
      'SELECT status, undo_until FROM import_logs WHERE id = ?;', importLogId,
    );
    if (!log || log.status !== 'committed' || !log.undo_until || Date.now() >= log.undo_until) throw new Error('undo_not_allowed');

    await tx.runAsync(
      `UPDATE transactions SET
         transfer_peer_id = NULL,
         type = CASE WHEN amount_cents < 0 THEN 'expense' ELSE 'income' END,
         category_id = CASE WHEN category_source = 'transfer_match' THEN NULL ELSE category_id END,
         category_confidence = CASE WHEN category_source = 'transfer_match' THEN NULL ELSE category_confidence END,
         category_source = CASE WHEN category_source = 'transfer_match' THEN 'none' ELSE category_source END,
         updated_at = ?
       WHERE transfer_peer_id IN (SELECT id FROM transactions WHERE import_log_id = ?)
         AND coalesce(import_log_id, '') <> ?;`,
      Date.now(), importLogId, importLogId,
    );
    removed = (await tx.runAsync('DELETE FROM transactions WHERE import_log_id = ?;', importLogId)).changes;
    await tx.runAsync("UPDATE import_logs SET status = 'undone', undone_at = ? WHERE id = ?;", Date.now(), importLogId);
  });
  bus.emit('import.undone', { rows: removed });
  return removed;
}
