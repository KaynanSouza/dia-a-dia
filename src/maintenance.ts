import type { SQLiteDatabase } from 'expo-sqlite';

import { purgeBackupTemp } from '@/backup/export-backup';
import { seedBuiltins } from '@/categorization/seed';
import { getSetting } from '@/db/repositories/settings.repo';
import { purgeExpiredImports } from '@/import/csv-retention';
import { flush } from '@/logging/logger';
import { rotateEventLog } from '@/logging/rotation';
import { scheduleBackupReminder } from '@/notifications/backup-reminder';

/** Roda a cada abertura do banco (após unlock). Cada tarefa é independente. */
export async function runMaintenance(db: SQLiteDatabase) {
  const tasks: (() => unknown)[] = [
    () => seedBuiltins(db), // árvore de categorias e dicionário embutidos (versionados)
    () => purgeBackupTemp(),
    () => purgeExpiredImports(db),
    async () => {
      await flush(db);
      await rotateEventLog(
        db,
        await getSetting<number>(db, 'log.max_age_days', 7),
        await getSetting<number>(db, 'log.max_bytes', 1_048_576),
      );
    },
    () => scheduleBackupReminder(db),
  ];
  for (const t of tasks) {
    try {
      await t();
    } catch {}
  }
}
