import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from '@/db/transaction';

import { bus } from '@/events/bus';

/**
 * C-05: correção manual. Com applyToSimilar, cria regra 'merchant' (camada 1) e recategoriza
 * as transações do mesmo estabelecimento que NÃO foram corrigidas à mão. Tudo numa transação.
 * O modelo local é retreinado na próxima importação (assinatura do treino muda).
 */
export async function setCategory(
  db: SQLiteDatabase,
  txId: string,
  categoryId: string,
  applyToSimilar: boolean,
): Promise<{ affected: number }> {
  let affected = 0;
  await withTransaction(db, async (tx) => {
    const t = await tx.getFirstAsync<{ merchant_key: string; account_id: string }>(
      'SELECT merchant_key, account_id FROM transactions WHERE id = ?;', txId,
    );
    if (!t) throw new Error('not_found');
    const kind = await tx.getFirstAsync<{ kind: string }>('SELECT kind FROM categories WHERE id = ?;', categoryId);
    if (!kind) throw new Error('category_not_found');
    const now = Date.now();
    // type segue o kind da categoria; corrigir manualmente desfaz um eventual par de transferência
    await tx.runAsync(
      `UPDATE transactions SET category_id = ?, category_source = 'manual', category_confidence = 1,
         type = ?, transfer_peer_id = CASE WHEN ? = 'transfer' THEN transfer_peer_id END, updated_at = ? WHERE id = ?;`,
      categoryId, kind.kind, kind.kind, now, txId,
    );
    affected = 1;

    if (applyToSimilar && t.merchant_key.length >= 3) {
      await tx.runAsync(
        `INSERT INTO categorization_rules (id, category_id, match_type, pattern, priority, source, created_at)
         VALUES (?, ?, 'merchant', ?, 50, 'apply_similar', ?)
         ON CONFLICT (match_type, pattern, coalesce(account_id, '')) DO UPDATE SET category_id = excluded.category_id, created_at = excluded.created_at;`,
        randomUUID(), categoryId, t.merchant_key, now,
      );
      const res = await tx.runAsync(
        `UPDATE transactions SET category_id = ?, category_source = 'user_rule', category_confidence = 1,
           type = ?, updated_at = ?
         WHERE merchant_key = ? AND id <> ? AND category_source NOT IN ('manual', 'transfer_match');`,
        categoryId, kind.kind, now, t.merchant_key, txId,
      );
      affected += res.changes;
    }
  });
  bus.emit('categorize.learned', { affected, similar: applyToSimilar });
  return { affected };
}
