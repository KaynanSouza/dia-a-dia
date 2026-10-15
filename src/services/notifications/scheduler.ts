import type { SQLiteDatabase } from 'expo-sqlite';

import { scheduleBackupReminder } from './backup-reminder';
import { getNotifications } from './native';
import { rescheduleBillReminders } from './reminders';

/** O banco é a fonte da verdade; o agendador do SO é derivado dele (após restore e na manutenção). */
export async function rescheduleAllNotifications(db: SQLiteDatabase) {
  const N = getNotifications();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync();
  // o espelho veio do backup e não vale para este aparelho: limpa e reagenda tudo
  await db.runAsync("UPDATE notification_schedule SET status = 'cancelled' WHERE status = 'scheduled';");
  await scheduleBackupReminder(db);
  await rescheduleBillReminders(db, 'restore');
}

export async function clearAllNotifications() {
  const N = getNotifications();
  if (!N) return;
  await N.cancelAllScheduledNotificationsAsync().catch(() => {});
  await N.dismissAllNotificationsAsync().catch(() => {});
}
