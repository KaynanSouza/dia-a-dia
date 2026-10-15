export type Delimiter = ',' | ';' | '\t';
export type Encoding = 'utf-8' | 'windows-1252';
export type DateFormat = 'auto' | 'dmy' | 'ymd' | 'ymd_compact';
export type StatementKind = 'checking' | 'credit_card';

/** Aliases de cabeçalho já normalizados por normalizeHeader(). */
export type ColumnSpec = {
  date: string[];
  description: string[];
  descriptionExtra?: string[];
  amount?: string[];
  debit?: string[];
  credit?: string[];
  /** coluna de indicador D/C (ex.: Caixa "Deb_Cred") */
  dcFlag?: { column: string[]; debitValues: string[] };
};

export type ProfileConfig = {
  delimiter?: Delimiter;
  dateFormat: DateFormat;
  columns: ColumnSpec;
  /** 'invert': extratos de cartão trazem compra positiva; o ledger guarda saída negativa */
  amountSign: 'as_is' | 'invert';
  /** regex sobre a descrição normalizada: linhas ignoradas (saldos, totais) */
  skip?: string[];
};

export type ImportProfile = {
  id: string;
  name: string;
  bank: string;
  kind: StatementKind;
  builtin: boolean;
  /** cabeçalhos normalizados que precisam existir para auto-detecção */
  signature: string[];
  config: ProfileConfig;
};

/** Mapeamento resolvido para índices de coluna do arquivo atual. */
export type ResolvedMapping = {
  date: number;
  description: number;
  descriptionExtra: number | null;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  dcFlag: { column: number; debitValues: string[] } | null;
  dateFormat: DateFormat;
  amountSign: 'as_is' | 'invert';
  skip: RegExp[];
};

export const normalizeHeader = (h: string) =>
  h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]/g, '');
