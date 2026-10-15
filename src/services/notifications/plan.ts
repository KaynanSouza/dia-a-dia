import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

import { addDays, localDateTime, type ISODate } from '@/services/recurrence/dates';

/** Preferências do motor de lembretes (app_settings 'reminders.config'). */
export type ReminderSettings = {
  enabled: boolean;
  /** dias antes do vencimento (0 = no dia) */
  leadDays: number[];
  hour: number;
  minute: number;
  /** janela de silêncio [start, end) em horas locais; pode cruzar a meia-noite (22 → 7) */
  quietStart: number;
  quietEnd: number;
  /** lembretes de atraso: 1 por dia, até N dias */
  overdueDays: number;
  /** privacidade: false = só o nome da conta na notificação */
  showAmount: boolean;
};

export const DEFAULT_REMINDERS: ReminderSettings = {
  enabled: true,
  leadDays: [7, 3, 1, 0],
  hour: 9,
  minute: 0,
  quietStart: 22,
  quietEnd: 7,
  overdueDays: 3,
  showAmount: false,
};

/** iOS mantém no máximo 64 pendentes por app; reservamos 4 (backup mensal, teste, folga). */
export const MAX_PENDING_BILLS = 60;
/** Não agenda nada além disto (o resto entra nas próximas aberturas do app). */
export const SCHEDULE_WINDOW_DAYS = 60;
export const SNOOZE_MS = 24 * 3_600_000;

export type PlanInstance = {
  id: string;
  name: string;
  due_on: ISODate;
  amount_cents: number | null;
  status: 'pending' | 'paid' | 'skipped';
  snoozed_until: number | null;
  /** JSON number[] da regra; null = padrão */
  reminders: string | null;
};

export type PlannedNotification = {
  id: string;
  instanceId: string;
  kind: 'bill_due' | 'bill_overdue' | 'bill_snooze';
  ruleId: string;
  fireAt: number;
  title: string;
  body: string;
  contentHash: string;
};

/** Id determinístico hash(instance_id + rule_id): reagendar é idempotente. */
export const notificationId = (instanceId: string, ruleId: string) =>
  `bill_${bytesToHex(sha256(utf8ToBytes(`${instanceId}|${ruleId}`))).slice(0, 32)}`;

const hashContent = (...parts: (string | number)[]) => bytesToHex(sha256(utf8ToBytes(parts.join('\u0001')))).slice(0, 16);

/** Hora dentro da janela permitida: no silêncio, antecipa para antes do início ou adia para o fim. */
export function clampToAwake(hour: number, s: Pick<ReminderSettings, 'quietStart' | 'quietEnd'>): number {
  const { quietStart: qs, quietEnd: qe } = s;
  if (qs === qe) return hour;
  const inQuiet = qs > qe ? hour >= qs || hour < qe : hour >= qs && hour < qe;
  if (!inQuiet) return hour;
  // noite (ex.: 23h com silêncio 22–7): antecipa para 21h; madrugada (ex.: 5h): adia para 7h
  if (qs > qe) return hour >= qs ? Math.max(0, qs - 1) : qe;
  return qe;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function texts(kind: PlannedNotification['kind'], lead: number, inst: PlanInstance, s: ReminderSettings) {
  const amount = s.showAmount && inst.amount_cents ? ` · ${brl.format(inst.amount_cents / 100)}` : '';
  const body = `${inst.name}${amount}`;
  if (kind === 'bill_snooze') return { title: 'Lembrete: conta a pagar', body };
  if (kind === 'bill_overdue') return { title: lead === 1 ? 'Conta vencida ontem' : `Conta vencida há ${lead} dias`, body };
  const title = lead === 0 ? 'Conta vence hoje' : lead === 1 ? 'Conta vence amanhã' : `Conta vence em ${lead} dias`;
  return { title, body };
}

/**
 * Plano completo e determinístico (função pura): o banco é a fonte da verdade, o agendador do SO é
 * derivado dele. Ordena por horário e corta no limite do iOS.
 */
export function planBillNotifications(
  instances: PlanInstance[],
  s: ReminderSettings,
  now: number,
): { planned: PlannedNotification[]; capped: boolean } {
  if (!s.enabled) return { planned: [], capped: false };
  const horizon = now + SCHEDULE_WINDOW_DAYS * 86_400_000;
  const hour = clampToAwake(s.hour, s);
  const out: PlannedNotification[] = [];

  const push = (inst: PlanInstance, kind: PlannedNotification['kind'], ruleId: string, lead: number, fireAt: number) => {
    if (fireAt <= now || fireAt > horizon) return;
    if (inst.snoozed_until && kind !== 'bill_snooze' && fireAt < inst.snoozed_until) return; // adiado
    const { title, body } = texts(kind, lead, inst, s);
    out.push({ id: notificationId(inst.id, ruleId), instanceId: inst.id, kind, ruleId, fireAt, title, body, contentHash: hashContent(title, body, fireAt) });
  };

  for (const inst of instances) {
    if (inst.status !== 'pending') continue;
    let leads = s.leadDays;
    if (inst.reminders) {
      try {
        const custom = JSON.parse(inst.reminders);
        if (Array.isArray(custom)) leads = custom.filter((n) => Number.isInteger(n) && n >= 0 && n <= 30);
      } catch {}
    }
    for (const lead of [...new Set(leads)]) {
      push(inst, 'bill_due', `d${lead}`, lead, localDateTime(addDays(inst.due_on, -lead), hour, s.minute).getTime());
    }
    for (let late = 1; late <= Math.min(3, Math.max(0, s.overdueDays)); late++) {
      push(inst, 'bill_overdue', `late${late}`, late, localDateTime(addDays(inst.due_on, late), hour, s.minute).getTime());
    }
    if (inst.snoozed_until) push(inst, 'bill_snooze', 'snooze', 0, inst.snoozed_until);
  }

  out.sort((a, b) => a.fireAt - b.fireAt || a.id.localeCompare(b.id));
  return { planned: out.slice(0, MAX_PENDING_BILLS), capped: out.length > MAX_PENDING_BILLS };
}
