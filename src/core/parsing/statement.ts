import { parseCsv } from './csv';
import { normalizeDescription, parseAmountCents, parseDate } from './values';

export type ParsedRow = { postedOn: string; amountCents: number; description: string; descriptionNorm: string };
export type RowError = { line: number; reason: 'date' | 'amount' | 'columns' };
export type ParseResult = { parser: string; rows: ParsedRow[]; errors: RowError[] };

const norm = (h: string) => normalizeDescription(h).replace(/[^a-z]/g, '');
const DATE_H = ['data', 'date', 'datalancamento', 'datamovimento', 'dtlancamento', 'dataoperacao'];
const DESC_H = ['descricao', 'historico', 'description', 'lancamento', 'memo', 'estabelecimento', 'titulo', 'detalhe'];
const AMOUNT_H = ['valor', 'amount', 'valorrs', 'valorbrl', 'quantia'];
const DEBIT_H = ['debito', 'saida', 'debit'];
const CREDIT_H = ['credito', 'entrada', 'credit'];

const find = (headers: string[], names: string[]) => headers.findIndex((h) => names.includes(h));

export class StatementFormatError extends Error {
  constructor(public code: 'empty' | 'unknown_layout') {
    super(code);
    this.name = 'StatementFormatError';
  }
}

/**
 * Extrato genérico: localiza o cabeçalho nas 15 primeiras linhas e mapeia
 * data/descrição + (valor | débito/crédito). Linhas inválidas viram RowError (não abortam).
 */
export function parseStatementCsv(text: string): ParseResult {
  const table = parseCsv(text);
  if (!table.length) throw new StatementFormatError('empty');

  for (let h = 0; h < Math.min(15, table.length); h++) {
    const headers = table[h].map(norm);
    const iDate = find(headers, DATE_H);
    const iDesc = find(headers, DESC_H);
    const iAmount = find(headers, AMOUNT_H);
    const iDebit = find(headers, DEBIT_H);
    const iCredit = find(headers, CREDIT_H);
    if (iDate < 0 || iDesc < 0 || (iAmount < 0 && iDebit < 0 && iCredit < 0)) continue;

    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];
    for (let r = h + 1; r < table.length; r++) {
      const cols = table[r];
      const line = r + 1;
      const rawDate = (cols[iDate] ?? '').trim();
      if (!rawDate) continue; // rodapés/subtotais sem data ("Saldo final"): ignora em silêncio
      const postedOn = parseDate(rawDate);
      if (!postedOn) {
        errors.push({ line, reason: 'date' });
        continue;
      }
      let amount: number | null;
      if (iAmount >= 0) amount = parseAmountCents(cols[iAmount] ?? '');
      else {
        const debit = iDebit >= 0 ? parseAmountCents(cols[iDebit] ?? '') : null;
        const credit = iCredit >= 0 ? parseAmountCents(cols[iCredit] ?? '') : null;
        amount = debit ? -Math.abs(debit) : credit ? Math.abs(credit) : debit ?? credit;
      }
      if (amount === null) {
        errors.push({ line, reason: 'amount' });
        continue;
      }
      const description = (cols[iDesc] ?? '').trim().slice(0, 200);
      const descriptionNorm = normalizeDescription(description);
      if (/^saldo\b/.test(descriptionNorm)) continue; // linhas de saldo não são transações
      rows.push({ postedOn, amountCents: amount, description, descriptionNorm });
    }
    return { parser: iAmount >= 0 ? 'generic-amount' : 'generic-debit-credit', rows, errors };
  }
  throw new StatementFormatError('unknown_layout');
}
