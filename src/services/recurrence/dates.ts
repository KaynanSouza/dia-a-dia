/**
 * Aritmética de datas de CALENDÁRIO ('YYYY-MM-DD'), sem fuso: vencimento é um dia, não um instante.
 * Internamente usa Date em UTC só como calculadora.
 */
export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function parseISODate(s: ISODate): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`invalid_date:${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export const fromParts = (y: number, m: number, d: number): ISODate => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

export function addDays(s: ISODate, n: number): ISODate {
  const { y, m, d } = parseISODate(s);
  return fromParts(y, m, d + n);
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 0 = domingo … 6 = sábado */
export function weekday(s: ISODate): number {
  const { y, m, d } = parseISODate(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parseISODate(a);
  const pb = parseISODate(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86_400_000);
}

export const isValidISODate = (s: string) => {
  try {
    const { y, m, d } = parseISODate(s);
    return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
  } catch {
    return false;
  }
};

/** Data de hoje no FUSO DO APARELHO (os lembretes disparam no relógio local). */
export function todayLocal(now = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Instante local (fuso do aparelho) de uma data + hora:minuto. */
export function localDateTime(s: ISODate, hour: number, minute = 0): Date {
  const { y, m, d } = parseISODate(s);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

/** Fuso atual do aparelho (mudança → reagendar tudo). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || `UTC${-new Date().getTimezoneOffset() / 60}`;
  } catch {
    return `UTC${-new Date().getTimezoneOffset() / 60}`;
  }
}

/** Sábado/domingo → próximo dia útil ('next') ou anterior ('previous'). Feriados não são considerados. */
export function shiftWeekend(s: ISODate, mode: 'none' | 'next' | 'previous'): ISODate {
  if (mode === 'none') return s;
  const wd = weekday(s);
  if (wd === 6) return addDays(s, mode === 'next' ? 2 : -1);
  if (wd === 0) return addDays(s, mode === 'next' ? 1 : -2);
  return s;
}
