import { BUILTIN_PROFILES, GENERIC_PROFILE } from './builtin';
import { normalizeHeader, type ColumnSpec, type ImportProfile, type ProfileConfig, type ResolvedMapping, type StatementKind } from './types';

const ALL_ALIASES = new Set(
  [...BUILTIN_PROFILES, GENERIC_PROFILE('checking')].flatMap((p) =>
    Object.values(p.config.columns).flatMap((v) => (Array.isArray(v) ? v : v ? v.column : [])),
  ),
);

/** Linha de cabeçalho = primeira (entre as 20 iniciais) com ≥ 2 nomes de coluna conhecidos. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const known = rows[i].map(normalizeHeader).filter((h) => ALL_ALIASES.has(h)).length;
    if (known >= 2) return i;
  }
  return -1;
}

/** Maior assinatura contida no cabeçalho vence; empate decide pelo tipo da conta escolhida. */
export function detectProfile(headers: string[], accountKind: StatementKind, custom: ImportProfile[]): ImportProfile | null {
  const set = new Set(headers.map(normalizeHeader));
  let best: { p: ImportProfile; score: number } | null = null;
  for (const p of [...custom, ...BUILTIN_PROFILES]) {
    if (!p.signature.length || !p.signature.every((s) => set.has(s))) continue;
    const score = p.signature.length * 10 + (p.kind === accountKind ? 5 : 0) + (p.builtin ? 0 : 1);
    if (!best || score > best.score) best = { p, score };
  }
  return best?.p ?? null;
}

const indexOf = (headers: string[], aliases?: string[]) => {
  if (!aliases?.length) return null;
  const norm = headers.map(normalizeHeader);
  for (const a of aliases) {
    const i = norm.indexOf(a);
    if (i >= 0) return i;
  }
  return null;
};

export class MappingError extends Error {
  constructor(public code: 'no_date' | 'no_description' | 'no_amount') {
    super(code);
    this.name = 'MappingError';
  }
}

export function resolveMapping(headers: string[], config: ProfileConfig): ResolvedMapping {
  const c: ColumnSpec = config.columns;
  const date = indexOf(headers, c.date);
  const description = indexOf(headers, c.description);
  const amount = indexOf(headers, c.amount);
  const debit = indexOf(headers, c.debit);
  const credit = indexOf(headers, c.credit);
  if (date === null) throw new MappingError('no_date');
  if (description === null) throw new MappingError('no_description');
  if (amount === null && debit === null && credit === null) throw new MappingError('no_amount');
  const dcCol = c.dcFlag ? indexOf(headers, c.dcFlag.column) : null;
  return {
    date,
    description,
    descriptionExtra: indexOf(headers, c.descriptionExtra),
    amount,
    debit: amount === null ? debit : null,
    credit: amount === null ? credit : null,
    dcFlag: c.dcFlag && dcCol !== null ? { column: dcCol, debitValues: c.dcFlag.debitValues } : null,
    dateFormat: config.dateFormat,
    amountSign: config.amountSign,
    skip: (config.skip ?? []).flatMap((s) => {
      try {
        return [new RegExp(s)];
      } catch {
        return [];
      }
    }),
  };
}

/** Mapeamento manual (índices escolhidos na UI) → ProfileConfig salvável usando os nomes reais das colunas. */
export function configFromManual(
  headers: string[],
  m: { date: number; description: number; amount?: number; debit?: number; credit?: number; dateFormat: ProfileConfig['dateFormat']; invert: boolean },
): ProfileConfig {
  const h = (i?: number) => (i === undefined || i < 0 ? undefined : [normalizeHeader(headers[i])]);
  return {
    dateFormat: m.dateFormat,
    amountSign: m.invert ? 'invert' : 'as_is',
    skip: ['^saldo\\b', '^total\\b'],
    columns: { date: h(m.date)!, description: h(m.description)!, amount: h(m.amount), debit: h(m.debit), credit: h(m.credit) },
  };
}

export const profileSignature = (headers: string[]) => headers.map(normalizeHeader).filter(Boolean);
