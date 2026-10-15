import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting } from '@/db/repositories/settings.repo';
import { withTransaction } from '@/db/transaction';
import { bus } from '@/events/bus';
import { addDays, deviceTimeZone, todayLocal } from '@/services/recurrence/dates';
import { ensureInstances } from '@/services/recurrence/generate';
import { BILL_CATEGORY, getNotifications } from './native';
import { DEFAULT_REMINDERS, planBillNotifications, SCHEDULE_WINDOW_DAYS, type PlanInstance, type ReminderSettings } from './plan';

const SETTINGS_KEY = 'reminders.config';

export async function getReminderSettings(db: SQLiteDatabase): Promise<ReminderSettings> {
  return { ...DEFAULT_REMINDERS, ...(await getSetting<Partial<ReminderSettings>>(db, SETTINGS_KEY, {})) };
}

export async function saveReminderSettings(db: SQLiteDatabase, patch: Partial<ReminderSettings>) {
  await setSetting(db, SETTINGS_KEY, { ...(await getReminderSettings(db)), ...patch });
  await rescheduleBillReminders(db, 'settings');
}

export type RescheduleResult = { desired: number; scheduled: number; cancelled: number; capped: boolean; skipped?: 'no_module' | 'no_permission' };

let running: Promise<RescheduleResult> | null = null;
let again = false;

/**
 * Reconcilia o agendador do SO com o banco (A-04). Idempotente graças aos ids determinísticos:
 * roda na abertura do app, após editar/pagar conta, mudança de fuso, restauração de backup e
 * mudança de preferências. Execuções concorrentes são coalescidas.
 */
export function rescheduleBillReminders(db: SQLiteDatabase, reason: string): Promise<RescheduleResult> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    let r: RescheduleResult;
    do {
      again = false;
      r = await reconcile(db, reason);
    } while (again);
    return r;
  })().finally(() => {
    running = null;
  });
  return running;
}

async function reconcile(db: SQLiteDatabase, reason: string): Promise<RescheduleResult> {
  const N = getNotifications();
  const today = todayLocal();
  await ensureInstances(db, today);
  if (!N) return { desired: 0, scheduled: 0, cancelled: 0, capped: false, skipped: 'no_module' };

  const settings = await getReminderSettings(db);
  const instances = await db.getAllAsync<PlanInstance>(
    `SELECT i.id, t.name, i.due_on, i.amount_cents, i.status, i.snoozed_until, t.reminders
     FROM bill_instances i JOIN bill_templates t ON t.id = i.template_id
     WHERE i.status = 'pending' AND t.active = 1 AND i.due_on BETWEEN ? AND ?;`,
    addDays(today, -Math.max(1, settings.overdueDays)), addDays(today, SCHEDULE_WINDOW_DAYS + 30),
  );
  const now = Date.now();
  const granted = (await N.getPermissionsAsync()).granted;
  const { planned, capped } = granted ? planBillNotifications(instances, settings, now) : { planned: [], capped: false };

  const os = await N.getAllScheduledNotificationsAsync();
  const osBill = new Set(os.map((n) => n.identifier).filter((id) => id.startsWith('bill_')));
  const mirror = new Map(
    (await db.getAllAsync<{ id: string; fire_at: number; content_hash: string }>(
      "SELECT id, fire_at, content_hash FROM notification_schedule WHERE status = 'scheduled' AND kind LIKE 'bill_%';",
    )).map((r) => [r.id, r]),
  );
  const wanted = new Set(planned.map((p) => p.id));

  let cancelled = 0;
  for (const id of osBill) {
    if (!wanted.has(id)) {
      await N.cancelScheduledNotificationAsync(id).catch(() => {});
      cancelled++;
    }
  }

  let scheduled = 0;
  for (const p of planned) {
    const m = mirror.get(p.id);
    const upToDate = osBill.has(p.id) && m && m.fire_at === p.fireAt && m.content_hash === p.contentHash;
    if (upToDate) continue;
    if (osBill.has(p.id)) await N.cancelScheduledNotificationAsync(p.id).catch(() => {});
    try {
      await N.scheduleNotificationAsync({
        identifier: p.id,
        content: {
          title: p.title,
          body: p.body,
          categoryIdentifier: BILL_CATEGORY,
          data: { kind: p.kind, instanceId: p.instanceId, ruleId: p.ruleId, route: `/bills/${p.instanceId}` },
          sound: true,
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: p.fireAt, channelId: 'bills' },
      });
      scheduled++;
    } catch {
      wanted.delete(p.id); // não ficou agendada: não espelha
    }
  }

  // Espelho = exatamente o plano (o que saiu do plano: disparou ou foi cancelado)
  await withTransaction(db, async (tx) => {
    await tx.runAsync(
      `UPDATE notification_schedule SET status = CASE WHEN fire_at <= ? THEN 'fired' ELSE 'cancelled' END
       WHERE status = 'scheduled' AND kind LIKE 'bill_%';`,
      now,
    );
    for (const p of planned) {
      if (!wanted.has(p.id)) continue;
      await tx.runAsync(
        `INSERT INTO notification_schedule (id, instance_id, kind, rule_id, fire_at, content_hash, channel, status, scheduled_at)
         VALUES (?, ?, ?, ?, ?, ?, 'bills', 'scheduled', ?)
         ON CONFLICT (id) DO UPDATE SET fire_at = excluded.fire_at, content_hash = excluded.content_hash,
           status = 'scheduled', scheduled_at = excluded.scheduled_at;`,
        p.id, p.instanceId, p.kind, p.ruleId, p.fireAt, p.contentHash, now,
      );
    }
    // histórico enxuto: 60 dias
    await tx.runAsync("DELETE FROM notification_schedule WHERE status <> 'scheduled' AND fire_at < ?;", now - 60 * 86_400_000);
  });
  await setSetting(db, 'reminders.tz', deviceTimeZone());

  const result = { desired: planned.length, scheduled, cancelled, capped, skipped: granted ? undefined : ('no_permission' as const) };
  bus.emit('reminders.rescheduled', { desired: planned.length, scheduled, cancelled, capped, reason: reason.slice(0, 24) });
  return result;
}

/** Cancela já (sem esperar a reconciliação) tudo o que estiver agendado para uma instância. */
export async function cancelInstanceReminders(instanceId: string) {
  const N = getNotifications();
  if (!N) return;
  const os = await N.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of os) {
    if ((n.content.data as { instanceId?: string } | undefined)?.instanceId === instanceId) {
      await N.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
    }
  }
  const shown = await N.getPresentedNotificationsAsync().catch(() => []);
  for (const n of shown) {
    if ((n.request.content.data as { instanceId?: string } | undefined)?.instanceId === instanceId) {
      await N.dismissNotificationAsync(n.request.identifier).catch(() => {});
    }
  }
}

