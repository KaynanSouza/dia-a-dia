/** Fuso fixo America/Sao_Paulo (C-06). Sem horário de verão desde 2019: fallback UTC−3. */
const TZ = 'America/Sao_Paulo';

export function todaySP(now = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value;
    const s = `${get('year')}-${get('month')}-${get('day')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch {}
  return new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export const currentMonthSP = () => todaySP().slice(0, 7);

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Intervalo semiaberto [start, end) em datas locais 'YYYY-MM-DD' (comparação lexicográfica usa o índice). */
export const monthRange = (ym: string) => ({ start: `${ym}-01`, end: `${shiftMonth(ym, 1)}-01` });

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;

/** 'YYYY-MM-DD' ± dias (calendário, sem fuso). */
export function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}
