import type { SQLiteDatabase } from 'expo-sqlite';

import { scheduleBackupReminder } from './backup-reminder';
import { getNotifications } from './native';

/** O banco é a fonte da verdade; o agendador do SO é derivado dele (após restore e na manutenção). */
export async function rescheduleAllNotifications(db: SQLiteDatabase) {
  const N = getNotifications();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync();
  await scheduleBackupReminder(db);
  // + lembretes dos módulos (contas a pagar etc.) quando existirem
}

export async function clearAllNotifications() {
  const N = getNotifications();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync().catch(() => {});
  await N.dismissAllNotificationsAsync().catch(() => {});
}
