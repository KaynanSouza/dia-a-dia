import { normalizeDescription, parseAmountCents, parseDate } from '@/core/parsing/values';
import type { DateFormat, ResolvedMapping } from './profiles/types';

export type MappedRow = {
  line: number;
  postedOn: string;
  amountCents: number;
  description: string;
  /** normalização estável usada no hash de deduplicação */
  descriptionNorm: string;
};

export type RowError = { line: number; reason: 'date' | 'amount' | 'description' };

function parseDateAs(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim();
  if (fmt === 'ymd_compact' || (fmt === 'auto' && /^\d{8}$/.test(s))) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    return m ? parseDate(`${m[1]}-${m[2]}-${m[3]}`) : null;
  }
  if (fmt === 'ymd' && !/^\d{4}-/.test(s)) return null;
  if (fmt === 'dmy' && /^\d{4}-/.test(s)) return null;
  return parseDate(s);
}

/**
 * Linha do CSV → lançamento. Retorna null para linhas a ignorar em silêncio
 * (sem data: rodapés/subtotais; descrições de saldo).
 */
export function mapRow(cols: string[], line: number, m: ResolvedMapping): MappedRow | RowError | null {
  const rawDate = (cols[m.date] ?? '').trim();
  if (!rawDate) return null;
  const postedOn = parseDateAs(rawDate, m.dateFormat);
  if (!postedOn) return { line, reason: 'date' };

  const extra = m.descriptionExtra !== null ? (cols[m.descriptionExtra] ?? '').trim() : '';
  const main = (cols[m.description] ?? '').trim();
  const description = [main, extra].filter(Boolean).join(' - ').slice(0, 200);
  if (!description) return { line, reason: 'description' };
  const descriptionNorm = normalizeDescription(description);
  if (m.skip.some((re) => re.test(descriptionNorm))) return null;

  let amount: number | null;
  if (m.amount !== null) {
    amount = parseAmountCents(cols[m.amount] ?? '');
    if (amount !== null && m.dcFlag) {
      const flag = (cols[m.dcFlag.column] ?? '').trim().toLowerCase();
      amount = m.dcFlag.debitValues.includes(flag) ? -Math.abs(amount) : Math.abs(amount);
    }
  } else {
    const debit = m.debit !== null ? parseAmountCents(cols[m.debit] ?? '') : null;
    const credit = m.credit !== null ? parseAmountCents(cols[m.credit] ?? '') : null;
    amount = debit ? -Math.abs(debit) : credit ? Math.abs(credit) : (debit ?? credit);
  }
  if (amount === null) return { line, reason: 'amount' };
  if (m.amountSign === 'invert') amount = -amount;

  return { line, postedOn, amountCents: amount, description, descriptionNorm };
}

export const isRowError = (r: MappedRow | RowError): r is RowError => 'reason' in r;
