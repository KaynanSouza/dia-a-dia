import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from '@/db/transaction';

import { CAT } from '@/categorization/builtin/categories';
import { bus } from '@/events/bus';
import type { ImportPlan, PlannedRow } from './analyze';
import { IMPORT_LIMITS, ImportError } from './limits';
import { importProgress } from './progress-store';
import type { ImportSession } from './session';

const DAY = 86_400_000;
const COLS = [
  'id', 'account_id', 'import_log_id', 'posted_on', 'amount_cents', 'type', 'description_raw', 'description_norm', 'merchant_key',
  'category_id', 'category_source', 'category_confidence', 'installment_n', 'installment_total', 'occurrence_n', 'dedup_hash',
  'created_at', 'updated_at',
] as const;

export type CommitResult = { importLogId: string; imported: number; duplicates: number; categorized: number; transfers: number };

/**
 * C-01/C-03: tudo ou nada. Uma única transação exclusiva grava o import_log, os lançamentos em lotes
 * multi-VALUES (ON CONFLICT no hash = idempotente), pareia transferências entre contas próprias e
 * atualiza contadores. Qualquer erro → ROLLBACK completo; o log de falha é gravado depois, fora dela.
 */
export async function commitPlan(db: SQLiteDatabase, session: ImportSession, plan: ImportPlan): Promise<CommitResult> {
  const importLogId = randomUUID();
  const startedAt = Date.now();
  let imported = 0;
  let transfers = 0;

  try {
    await withTransaction(db, async (tx) => {
      const dup = await tx.getFirstAsync<{ id: string }>(
        "SELECT id FROM import_logs WHERE account_id = ? AND file_sha256 = ? AND status = 'committed';",
        session.accountId, plan.fileSha256,
      );
      if (dup) throw new ImportError('already_imported');

      await tx.runAsync(
        `INSERT INTO import_logs (id, account_id, profile_id, file_sha256, file_bytes, status, rows_total, started_at, finished_at, undo_until)
         VALUES (?, ?, ?, ?, ?, 'committed', ?, ?, ?, ?);`,
        importLogId, session.accountId, session.profileId, plan.fileSha256, session.bytes, plan.rowsTotal,
        startedAt, startedAt, startedAt + IMPORT_LIMITS.undoDays * DAY,
      );

      const now = Date.now();
      const ids = new Map<PlannedRow, string>();
      const placeholders = `(${COLS.map(() => '?').join(',')})`;
      for (let i = 0; i < plan.fresh.length; i += IMPORT_LIMITS.insertBatch) {
        const batch = plan.fresh.slice(i, i + IMPORT_LIMITS.insertBatch);
        const params: (string | number | null)[] = [];
        for (const r of batch) {
          const id = randomUUID();
          ids.set(r, id);
          params.push(
            id, session.accountId, importLogId, r.postedOn, r.amountCents, r.type, r.description, r.descriptionNorm, r.merchantKey,
            r.categoryId, r.categoryId ? r.source : 'none', r.confidence, r.installment?.n ?? null, r.installment?.total ?? null,
            r.occurrence, r.dedupHash, now, now,
          );
        }
        const res = await tx.runAsync(
          `INSERT INTO transactions (${COLS.join(',')}) VALUES ${batch.map(() => placeholders).join(',')}
           ON CONFLICT (dedup_hash) DO NOTHING;`,
          ...params,
        );
        imported += res.changes;
        importProgress.set({ stage: 'committing', ratio: (i + batch.length) / plan.fresh.length, rows: imported });
      }

      // C-04: transferência entre contas próprias = par (valor oposto, outra conta, ±3 dias)
      importProgress.set({ stage: 'matching_transfers', ratio: 0 });
      const others = await tx.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM accounts WHERE id <> ?;', session.accountId);
      if (others?.n) {
        const hints = plan.fresh.filter((r) => r.transferHint && r.type !== 'card_payment');
        for (const r of hints) {
          const id = ids.get(r)!;
          const peer = await tx.getFirstAsync<{ id: string }>(
            `SELECT id FROM transactions
             WHERE account_id <> ? AND amount_cents = ? AND transfer_peer_id IS NULL AND category_source <> 'manual'
               AND type <> 'card_payment' AND posted_on BETWEEN date(?, '-3 day') AND date(?, '+3 day')
             ORDER BY abs(julianday(posted_on) - julianday(?)) LIMIT 1;`,
            session.accountId, -r.amountCents, r.postedOn, r.postedOn, r.postedOn,
          );
          if (!peer) continue;
          await tx.runAsync(
            `UPDATE transactions SET type = 'transfer', category_id = ?, category_source = 'transfer_match',
               category_confidence = 0.9, transfer_peer_id = CASE id WHEN ? THEN ? ELSE ? END, updated_at = ?
             WHERE id IN (?, ?);`,
            CAT.TRANSFER, id, peer.id, id, Date.now(), id, peer.id,
          );
          transfers++;
        }
      }

      for (const [ruleId, hits] of plan.ruleHits) {
        await tx.runAsync('UPDATE categorization_rules SET hits = hits + ? WHERE id = ?;', hits, ruleId);
      }
      await tx.runAsync(
        `UPDATE import_logs SET rows_imported = ?, rows_duplicate = ?, rows_error = ?, rows_categorized = ?, finished_at = ?
         WHERE id = ?;`,
        imported, plan.duplicates + (plan.fresh.length - imported), plan.errors.length, plan.categorized, Date.now(), importLogId,
      );
    });
  } catch (e) {
    const code = e instanceof ImportError ? e.code : 'commit_failed';
    if (code !== 'already_imported') {
      await db
        .runAsync(
          `INSERT INTO import_logs (id, account_id, profile_id, file_sha256, file_bytes, status, rows_total, error_code, started_at, finished_at)
           VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?);`,
          randomUUID(), session.accountId, session.profileId, plan.fileSha256, session.bytes, plan.rowsTotal, code, startedAt, Date.now(),
        )
        .catch(() => {});
    }
    bus.emit('import.failed', { code });
    throw e instanceof ImportError ? e : new ImportError('commit_failed');
  }

  const result = {
    importLogId,
    imported,
    duplicates: plan.duplicates + (plan.fresh.length - imported),
    categorized: plan.categorized,
    transfers,
  };
  bus.emit('import.committed', {
    rows: imported,
    duplicates: result.duplicates,
    errors: plan.errors.length,
    coverage_pct: Math.round(plan.coverage * 100),
    transfers,
    ms: Date.now() - startedAt,
  });
  return result;
}
