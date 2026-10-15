import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting } from '@/db/repositories/settings.repo';
import { getNotifications } from './native';

export const BACKUP_REMINDER_ID = 'backup-monthly';

export async function ensureNotificationPermission(): Promise<boolean> {
  const N = getNotifications();
  if (!N) return false;
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await N.requestPermissionsAsync()).granted;
}

/** Conteúdo genérico: aparece na tela bloqueada, então nunca inclui valores ou contas. */
export async function scheduleBackupReminder(db: SQLiteDatabase) {
  const N = getNotifications();
  if (!N) return;
  await N.cancelScheduledNotificationAsync(BACKUP_REMINDER_ID).catch(() => {});
  if (!(await getSetting<boolean>(db, 'backup.reminder_enabled', true))) return;
  if (!(await N.getPermissionsAsync()).granted) return;
  await N.scheduleNotificationAsync({
    identifier: BACKUP_REMINDER_ID,
    content: { title: 'Hora do backup', body: 'Faça o backup mensal do Dia a Dia.', data: { route: '/settings/backup' } },
    trigger: { type: N.SchedulableTriggerInputTypes.MONTHLY, day: 1, hour: 10, minute: 0, channelId: 'backup' },
  });
}
