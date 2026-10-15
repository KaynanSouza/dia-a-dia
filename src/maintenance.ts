import type { SQLiteDatabase } from 'expo-sqlite';

import { purgeBackupTemp } from '@/backup/export-backup';
import { seedBuiltins } from '@/categorization/seed';
import { getSetting } from '@/db/repositories/settings.repo';
import { purgeExpiredImports } from '@/import/csv-retention';
import { flush } from '@/logging/logger';
import { rotateEventLog } from '@/logging/rotation';
import { setSetting } from '@/db/repositories/settings.repo';
import { drainActionQueue, takePendingTest } from '@/services/notifications/actions';
import { scheduleBackupReminder } from '@/services/notifications/backup-reminder';
import { rescheduleBillReminders } from '@/services/notifications/reminders';

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
    // A-05: ações tocadas na notificação com o app travado/fechado
    () => drainActionQueue(db),
    async () => {
      const test = takePendingTest();
      if (test) await setSetting(db, 'reminders.last_test', test);
    },
    // A-04: janela de 90 dias de instâncias + reconciliação (cobre fuso alterado, reboot e restore)
    () => rescheduleBillReminders(db, 'open'),
  ];
  for (const t of tasks) {
    try {
      await t();
    } catch {}
  }
}
