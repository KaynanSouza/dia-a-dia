import { addDays, daysInMonth, fromParts, isValidISODate, parseISODate, weekday, type ISODate } from './dates';

/**
 * Subconjunto do RRULE (RFC 5545) suficiente para contas:
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY; INTERVAL; COUNT; UNTIL;
 *   BYDAY (WEEKLY: MO,TU…; MONTHLY: 1MO, -1FR); BYMONTHDAY (1..31, -1..-31); BYMONTH (YEARLY).
 * Diferença deliberada da RFC: BYMONTHDAY maior que o mês é AJUSTADO para o último dia
 * ("todo dia 31" vence em 28/02), em vez de pular o mês — é o que boletos fazem.
 */
export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type ByDay = { wd: number; n: number | null }; // wd 0=domingo; n = ordinal (1, -1…) só em MONTHLY

export type RRule = {
  freq: Freq;
  interval: number;
  count: number | null;
  until: ISODate | null;
  byDay: ByDay[];
  byMonthDay: number[];
  byMonth: number[];
};

const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export class RRuleError extends Error {
  constructor(public reason: string) {
    super(`rrule:${reason}`);
    this.name = 'RRuleError';
  }
}

export function parseRRule(src: string): RRule {
  const rule: RRule = { freq: 'MONTHLY', interval: 1, count: null, until: null, byDay: [], byMonthDay: [], byMonth: [] };
  let hasFreq = false;
  for (const part of src.replace(/^RRULE:/i, '').split(';').filter(Boolean)) {
    const [k, v = ''] = part.split('=');
    const key = k.trim().toUpperCase();
    const val = v.trim().toUpperCase();
    switch (key) {
      case 'FREQ':
        if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(val)) throw new RRuleError('freq');
        rule.freq = val as Freq;
        hasFreq = true;
        break;
      case 'INTERVAL':
        rule.interval = Number(val);
        if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 99) throw new RRuleError('interval');
        break;
      case 'COUNT':
        rule.count = Number(val);
        if (!Number.isInteger(rule.count) || rule.count < 1 || rule.count > 1000) throw new RRuleError('count');
        break;
      case 'UNTIL': {
        const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(val);
        if (!m || !isValidISODate(`${m[1]}-${m[2]}-${m[3]}`)) throw new RRuleError('until');
        rule.until = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
      case 'BYDAY':
        rule.byDay = val.split(',').map((t) => {
          const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(t.trim());
          if (!m) throw new RRuleError('byday');
          const n = m[1] ? Number(m[1]) : null;
          if (n !== null && (n === 0 || Math.abs(n) > 5)) throw new RRuleError('byday');
          return { wd: WD.indexOf(m[2]), n };
        });
        break;
      case 'BYMONTHDAY':
        rule.byMonthDay = val.split(',').map((t) => {
          const n = Number(t);
          if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 31) throw new RRuleError('bymonthday');
          return n;
        });
        break;
      case 'BYMONTH':
        rule.byMonth = val.split(',').map((t) => {
          const n = Number(t);
          if (!Number.isInteger(n) || n < 1 || n > 12) throw new RRuleError('bymonth');
          return n;
        });
        break;
      case 'WKST':
        break; // irrelevante para os padrões suportados
      default:
        throw new RRuleError(`unsupported:${key}`);
    }
  }
  if (!hasFreq) throw new RRuleError('freq');
  if (rule.count && rule.until) throw new RRuleError('count_and_until');
  return rule;
}

export function formatRRule(r: RRule): string {
  const parts = [`FREQ=${r.freq}`];
  if (r.interval !== 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byDay.length) parts.push(`BYDAY=${r.byDay.map((b) => `${b.n ?? ''}${WD[b.wd]}`).join(',')}`);
  if (r.byMonthDay.length) parts.push(`BYMONTHDAY=${r.byMonthDay.join(',')}`);
  if (r.byMonth.length) parts.push(`BYMONTH=${r.byMonth.join(',')}`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, '')}`);
  return parts.join(';');
}

const clampDay = (y: number, m: number, day: number) => {
  const dim = daysInMonth(y, m);
  return day > 0 ? Math.min(day, dim) : Math.max(1, dim + day + 1);
};

/** n-ésimo dia da semana `wd` do mês (n<0 conta do fim); null se não existir (ex.: 5ª segunda). */
function nthWeekday(y: number, m: number, wd: number, n: number): ISODate | null {
  const dim = daysInMonth(y, m);
  if (n > 0) {
    const first = weekday(fromParts(y, m, 1));
    const day = 1 + ((wd - first + 7) % 7) + (n - 1) * 7;
    return day <= dim ? fromParts(y, m, day) : null;
  }
  const last = weekday(fromParts(y, m, dim));
  const day = dim - ((last - wd + 7) % 7) + (n + 1) * 7;
  return day >= 1 ? fromParts(y, m, day) : null;
}

/** Datas candidatas dentro de um período (dia/semana/mês/ano) que começa em `anchor`. */
function candidates(r: RRule, dtstart: ISODate, k: number): ISODate[] {
  const s = parseISODate(dtstart);
  switch (r.freq) {
    case 'DAILY':
      return [addDays(dtstart, k * r.interval)];
    case 'WEEKLY': {
      const weekStart = addDays(dtstart, k * r.interval * 7 - ((weekday(dtstart) + 6) % 7)); // segunda da semana
      const days = r.byDay.length ? r.byDay.map((b) => b.wd) : [weekday(dtstart)];
      return days.map((wd) => addDays(weekStart, (wd + 6) % 7)).sort();
    }
    case 'MONTHLY': {
      const base = parseISODate(fromParts(s.y, s.m + k * r.interval, 1));
      const out: ISODate[] = [];
      if (r.byDay.length) {
        for (const b of r.byDay) {
          if (b.n !== null) {
            const d = nthWeekday(base.y, base.m, b.wd, b.n);
            if (d) out.push(d);
          } else {
            for (let d = 1; d <= daysInMonth(base.y, base.m); d++) {
              const iso = fromParts(base.y, base.m, d);
              if (weekday(iso) === b.wd) out.push(iso);
            }
          }
        }
      } else {
        const days = r.byMonthDay.length ? r.byMonthDay : [s.d];
        for (const d of days) out.push(fromParts(base.y, base.m, clampDay(base.y, base.m, d)));
      }
      return [...new Set(out)].sort();
    }
    case 'YEARLY': {
      const y = s.y + k * r.interval;
      const months = r.byMonth.length ? r.byMonth : [s.m];
      const days = r.byMonthDay.length ? r.byMonthDay : [s.d];
      const out: ISODate[] = [];
      for (const m of months) for (const d of days) out.push(fromParts(y, m, clampDay(y, m, d)));
      return [...new Set(out)].sort();
    }
  }
}

/**
 * Ocorrências da regra em [from, to] (inclusive). COUNT é contado desde DTSTART, então a janela
 * não altera quais ocorrências existem. Sem RRULE = ocorrência única em DTSTART.
 */
export function occurrences(rrule: string | null, dtstart: ISODate, from: ISODate, to: ISODate, max = 500): ISODate[] {
  if (!rrule) return dtstart >= from && dtstart <= to ? [dtstart] : [];
  const r = parseRRule(rrule);
  const out: ISODate[] = [];
  let emitted = 0;
  // limite de períodos: ~10 anos diários / 1000 ocorrências
  for (let k = 0; k < 4000; k++) {
    const batch = candidates(r, dtstart, k);
    if (!batch.length) continue;
    if (batch[0] > to) break;
    for (const d of batch) {
      if (d < dtstart) continue;
      if (r.until && d > r.until) return out;
      if (r.count !== null && emitted >= r.count) return out;
      emitted++;
      if (d > to) return out;
      if (d >= from) {
        out.push(d);
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

// ───────────────────────── Presets da UI

export type RecurrencePreset = 'once' | 'weekly' | 'monthly' | 'monthly_last' | 'yearly' | 'custom';

export function presetToRRule(preset: RecurrencePreset, dtstart: ISODate, custom?: string): string | null {
  const { d } = parseISODate(dtstart);
  switch (preset) {
    case 'once':
      return null;
    case 'weekly':
      return 'FREQ=WEEKLY';
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${d}`;
    case 'monthly_last':
      return 'FREQ=MONTHLY;BYMONTHDAY=-1';
    case 'yearly':
      return 'FREQ=YEARLY';
    case 'custom':
      return custom ? formatRRule(parseRRule(custom)) : null;
  }
}

export function rruleToPreset(rrule: string | null): RecurrencePreset {
  if (!rrule) return 'once';
  try {
    const r = parseRRule(rrule);
    const simple = r.interval === 1 && !r.count && !r.until;
    if (simple && r.freq === 'WEEKLY' && !r.byDay.length) return 'weekly';
    if (simple && r.freq === 'MONTHLY' && !r.byDay.length && r.byMonthDay.length === 1) return r.byMonthDay[0] === -1 ? 'monthly_last' : 'monthly';
    if (simple && r.freq === 'YEARLY' && !r.byMonth.length && !r.byMonthDay.length) return 'yearly';
  } catch {}
  return 'custom';
}

const WD_PT = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Descrição curta em português ("Todo mês no dia 10"). */
export function describeRRule(rrule: string | null, dtstart: ISODate): string {
  if (!rrule) return 'Única';
  try {
    const r = parseRRule(rrule);
    const every = (one: string, many: string) => (r.interval === 1 ? one : `A cada ${r.interval} ${many}`);
    let s: string;
    switch (r.freq) {
      case 'DAILY':
        s = every('Todo dia', 'dias');
        break;
      case 'WEEKLY':
        s = `${every('Toda semana', 'semanas')}${r.byDay.length ? ` (${r.byDay.map((b) => WD_PT[b.wd]).join(', ')})` : ` (${WD_PT[weekday(dtstart)]})`}`;
        break;
      case 'MONTHLY': {
        const days = r.byMonthDay.length ? r.byMonthDay : [parseISODate(dtstart).d];
        s = `${every('Todo mês', 'meses')} ${days.map((d) => (d === -1 ? 'no último dia' : `no dia ${d}`)).join(', ')}`;
        if (r.byDay.length) s = `${every('Todo mês', 'meses')} (${r.byDay.map((b) => `${b.n ?? ''}ª ${WD_PT[b.wd]}`).join(', ')})`;
        break;
      }
      case 'YEARLY':
        s = every('Todo ano', 'anos');
        break;
    }
    if (r.count) s += `, ${r.count} vezes`;
    if (r.until) s += `, até ${r.until.split('-').reverse().join('/')}`;
    return s;
  } catch {
    return 'Personalizada';
  }
}
