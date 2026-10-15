import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from '@/db/transaction';

const DAY = 86_400_000;

/** F-05: mantém só os últimos 7 dias e no máximo 1 MB (mais recentes primeiro). */
export async function rotateEventLog(db: SQLiteDatabase, maxAgeDays = 7, maxBytes = 1_048_576) {
  await withTransaction(db, async () => {
    await db.runAsync('DELETE FROM event_log WHERE ts < ?;', Date.now() - maxAgeDays * DAY);
    await db.runAsync(
      `DELETE FROM event_log WHERE id <= (
         SELECT id FROM (
           SELECT id, SUM(size_bytes) OVER (ORDER BY id DESC) AS acc FROM event_log
         ) WHERE acc > ? ORDER BY id DESC LIMIT 1
       );`,
      maxBytes,
    );
  });
}
