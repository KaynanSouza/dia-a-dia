import type { SQLiteDatabase } from 'expo-sqlite';

import { markPaid, snoozeInstance } from '@/bills/service';
import { peekDatabase } from '@/db/client';
import { setSetting } from '@/db/repositories/settings.repo';
import { bus } from '@/events/bus';
import { secureKv } from '@/security/keystore/secure-kv';
import { todayLocal } from '@/services/recurrence/dates';
import { ACTION_PAID, ACTION_SNOOZE, BILL_CATEGORY, getNotifications } from './native';
import { notificationId, SNOOZE_MS } from './plan';

type NotificationResponse = import('expo-notifications').NotificationResponse;

/**
 * Ações rápidas (A-05) sem backend. O banco é cifrado e só abre após o desbloqueio, então a ação é
 * registrada numa FILA (Keystore/Keychain) e aplicada no SQLite assim que houver conexão aberta —
 * na hora, se o app estiver desbloqueado; senão, na próxima abertura (drainActionQueue).
 * "Lembrar amanhã" também agenda o novo alarme imediatamente, sem depender do banco.
 */
type QueuedAction =
  | { type: 'paid'; instanceId: string; paidOn: string; at: number }
  | { type: 'snooze'; instanceId: string; until: number; at: number };

const QUEUE_KEY = 'notif.action_queue';
const LAST_KEY = 'notif.last_response';
const MAX_QUEUE = 50;

let pendingRoute: string | null = null;
/** Rota pedida por toque numa notificação; consumida pelo layout do app após o desbloqueio. */
export const takePendingRoute = () => {
  const r = pendingRoute;
  pendingRoute = null;
  return r;
};

async function enqueue(a: QueuedAction) {
  const q = await secureKv.getJson<QueuedAction[]>(QUEUE_KEY, []);
  q.push(a);
  await secureKv.setJson(QUEUE_KEY, q.slice(-MAX_QUEUE));
}

/** Aplica as ações pendentes. Chamado na abertura do banco e logo após uma ação, se o banco já estiver aberto. */
export async function drainActionQueue(db: SQLiteDatabase): Promise<number> {
  const q = await secureKv.getJson<QueuedAction[]>(QUEUE_KEY, []);
  if (!q.length) return 0;
  await secureKv.del(QUEUE_KEY);
  let applied = 0;
  for (const a of q) {
    try {
      if (a.type === 'paid') {
        const i = await db.getFirstAsync<{ status: string; amount_cents: number | null }>(
          'SELECT status, amount_cents FROM bill_instances WHERE id = ?;',
          a.instanceId,
        );
        if (i?.status !== 'pending') continue; // já paga/pulada/removida
        if (i.amount_cents) {
          await markPaid(db, a.instanceId, { paidOn: a.paidOn, amountCents: i.amount_cents, via: 'notification' });
        } else {
          // valor variável sem valor informado: marca como paga sem valor (o usuário completa depois)
          await db.runAsync(
            "UPDATE bill_instances SET status = 'paid', paid_on = ?, snoozed_until = NULL, updated_at = ? WHERE id = ? AND status = 'pending';",
            a.paidOn, Date.now(), a.instanceId,
          );
          bus.emit('bill.paid', { via: 'notification', with_tx: false });
        }
      } else {
        await snoozeInstance(db, a.instanceId, a.until);
      }
      applied++;
    } catch {}
  }
  return applied;
}

async function handleResponse(resp: NotificationResponse) {
  const N = getNotifications();
  if (!N) return;
  const req = resp.notification.request;
  // dedupe: getLastNotificationResponseAsync devolve a mesma resposta em toda abertura
  const key = `${req.identifier}|${resp.actionIdentifier}|${resp.notification.date}`;
  if ((await secureKv.get(LAST_KEY)) === key) return;
  await secureKv.set(LAST_KEY, key);

  const data = (req.content.data ?? {}) as { kind?: string; instanceId?: string; route?: string; scheduledFor?: number };

  if (data.kind === 'test') {
    await recordTestDelivery(data.scheduledFor, resp.notification.date);
    return;
  }
  if (!data.instanceId) {
    if (data.route) pendingRoute = data.route;
    return;
  }

  if (resp.actionIdentifier === ACTION_PAID) {
    await enqueue({ type: 'paid', instanceId: data.instanceId, paidOn: todayLocal(), at: Date.now() });
    await dismissForInstance(data.instanceId);
  } else if (resp.actionIdentifier === ACTION_SNOOZE) {
    const until = Date.now() + SNOOZE_MS;
    // agenda já (vale mesmo que o app seja fechado antes de abrir o banco)
    await N.scheduleNotificationAsync({
      identifier: notificationId(data.instanceId, 'snooze'),
      content: {
        title: 'Lembrete: conta a pagar',
        body: req.content.body ?? '',
        categoryIdentifier: BILL_CATEGORY,
        data: { ...data, kind: 'bill_snooze', ruleId: 'snooze' },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: until, channelId: 'bills' },
    }).catch(() => {});
    await enqueue({ type: 'snooze', instanceId: data.instanceId, until, at: Date.now() });
    await N.dismissNotificationAsync(req.identifier).catch(() => {});
  } else {
    pendingRoute = data.route ?? `/bills/${data.instanceId}`;
  }

  const db = peekDatabase();
  bus.emit('reminders.action', {
    action: resp.actionIdentifier === ACTION_PAID ? 'paid' : resp.actionIdentifier === ACTION_SNOOZE ? 'snooze' : 'open',
    queued: !db,
  });
  if (db) await drainActionQueue(db).catch(() => {});
}

async function dismissForInstance(instanceId: string) {
  const N = getNotifications();
  const shown = (await N?.getPresentedNotificationsAsync().catch(() => [])) ?? [];
  for (const n of shown) {
    if ((n.request.content.data as { instanceId?: string } | undefined)?.instanceId === instanceId) {
      await N?.dismissNotificationAsync(n.request.identifier).catch(() => {});
    }
  }
}

// ───────────────────────── Notificação de teste (diagnóstico A-03)

export const TEST_NOTIFICATION_ID = 'test_alert';

export async function recordTestDelivery(scheduledFor: number | undefined, deliveredAt: number) {
  if (!scheduledFor) return;
  const delayS = Math.max(0, Math.round((deliveredAt - scheduledFor) / 1000));
  pendingTest = { scheduledFor, deliveredAt, delayS };
  const db = peekDatabase();
  if (db) await setSetting(db, 'reminders.last_test', pendingTest).catch(() => {});
  bus.emit('reminders.test', { delay_s: delayS });
}

export type TestResult = { scheduledFor: number; deliveredAt: number; delayS: number };
let pendingTest: TestResult | null = null;
/** Resultado medido antes do banco abrir (gravado na próxima oportunidade). */
export const takePendingTest = () => {
  const t = pendingTest;
  pendingTest = null;
  return t;
};

// ───────────────────────── Registro

let started = false;

/** Chamar uma vez, no módulo raiz: escuta respostas e recebimentos (teste) e trata a resposta que abriu o app. */
export function startNotificationResponses() {
  const N = getNotifications();
  if (!N || started) return;
  started = true;
  N.addNotificationResponseReceivedListener((r) => {
    handleResponse(r).catch(() => {});
  });
  // notificação de teste recebida com o app aberto
  N.addNotificationReceivedListener((n) => {
    const d = n.request.content.data as { kind?: string; scheduledFor?: number } | undefined;
    if (d?.kind === 'test') recordTestDelivery(d.scheduledFor, n.date).catch(() => {});
  });
  N.getLastNotificationResponseAsync()
    .then((r) => (r ? handleResponse(r) : undefined))
    .catch(() => {});
}
