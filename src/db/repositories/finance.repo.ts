import { randomUUID } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

export type AccountKind = 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment';

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  number_last4: string | null;
  currency: string;
  created_at: number;
  archived_at: number | null;
};

export type AccountWithBalance = Account & { balance_cents: number; tx_count: number };

export type TxType = 'expense' | 'income' | 'transfer' | 'card_payment';

export type Transaction = {
  id: string;
  account_id: string;
  account_name: string;
  posted_on: string;
  amount_cents: number;
  type: TxType;
  description: string;
  merchant_key: string;
  category_id: string | null;
  category_name: string | null;
  category_source: string;
  category_confidence: number | null;
  installment_n: number | null;
  installment_total: number | null;
  /** cor/ícone vêm da categoria raiz quando a subcategoria não define */
  category_color: string | null;
  category_root: string | null;
  origin: 'csv' | 'manual';
  bill_instance_id: string | null;
  notes: string | null;
};

export type Category = {
  id: string;
  name: string;
  parent_id: string | null;
  kind: TxType;
  color: string | null;
  is_system: number;
  depth: number;
};

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  cash: 'Dinheiro',
  investment: 'Investimento',
};

export const listAccounts = (db: SQLiteDatabase) =>
  db.getAllAsync<AccountWithBalance>(
    `SELECT a.*, coalesce(sum(t.amount_cents), 0) AS balance_cents, count(t.id) AS tx_count
     FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
     WHERE a.archived_at IS NULL GROUP BY a.id ORDER BY a.created_at;`,
  );

export async function createAccount(
  db: SQLiteDatabase,
  input: { name: string; kind: AccountKind; institution?: string; numberLast4?: string },
) {
  const id = randomUUID();
  await db.runAsync(
    'INSERT INTO accounts (id, name, kind, institution, number_last4, created_at) VALUES (?, ?, ?, ?, ?, ?);',
    id, input.name.trim(), input.kind, input.institution?.trim() || null, input.numberLast4 || null, Date.now(),
  );
  return id;
}

const TX_SELECT = `
  SELECT t.id, t.account_id, a.name AS account_name, t.posted_on, t.amount_cents, t.type, t.description_raw AS description,
         t.merchant_key, t.category_id, c.name AS category_name, t.category_source, t.category_confidence,
         t.installment_n, t.installment_total,
         coalesce(c.color, pc.color) AS category_color, coalesce(pc.id, c.id) AS category_root,
         t.origin, t.bill_instance_id, t.notes
  FROM transactions t
  JOIN accounts a ON a.id = t.account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN categories pc ON pc.id = c.parent_id`;

export const recentTransactions = (db: SQLiteDatabase, opts: { limit?: number; uncategorizedOnly?: boolean } = {}) =>
  db.getAllAsync<Transaction>(
    `${TX_SELECT}
     ${opts.uncategorizedOnly ? "WHERE t.category_id IS NULL AND t.type = 'expense'" : ''}
     ORDER BY t.posted_on DESC, t.created_at DESC LIMIT ?;`,
    opts.limit ?? 200,
  );

export const getTransaction = (db: SQLiteDatabase, id: string) => db.getFirstAsync<Transaction>(`${TX_SELECT} WHERE t.id = ?;`, id);

export const countSimilar = async (db: SQLiteDatabase, merchantKey: string, exceptId: string) =>
  (await db.getFirstAsync<{ n: number }>(
    "SELECT count(*) AS n FROM transactions WHERE merchant_key = ? AND id <> ? AND category_source NOT IN ('manual', 'transfer_match');",
    merchantKey, exceptId,
  ))?.n ?? 0;

/** Árvore achatada em pré-ordem (pai seguido dos filhos), com profundidade. */
export const listCategoryTree = (db: SQLiteDatabase) =>
  db.getAllAsync<Category>(
    `WITH RECURSIVE tree(id, name, parent_id, kind, color, is_system, sort_order, depth, path) AS (
       SELECT id, name, parent_id, kind, color, is_system, sort_order, 0, printf('%05d', sort_order) || name
       FROM categories WHERE parent_id IS NULL AND archived_at IS NULL
       UNION ALL
       SELECT c.id, c.name, c.parent_id, c.kind, c.color, c.is_system, c.sort_order, t.depth + 1,
              t.path || '/' || printf('%05d', c.sort_order) || c.name
       FROM categories c JOIN tree t ON c.parent_id = t.id WHERE c.archived_at IS NULL
     )
     SELECT id, name, parent_id, kind, color, is_system, depth FROM tree ORDER BY path;`,
  );

export async function createCategory(db: SQLiteDatabase, name: string, parentId: string | null, kind?: TxType) {
  const parent = parentId
    ? await db.getFirstAsync<{ kind: TxType }>('SELECT kind FROM categories WHERE id = ?;', parentId)
    : null;
  const id = `usr_${randomUUID()}`;
  await db.runAsync(
    'INSERT INTO categories (id, name, parent_id, kind, is_system, sort_order, created_at) VALUES (?, ?, ?, ?, 0, 1000, ?);',
    id, name.trim(), parentId, parent?.kind ?? kind ?? 'expense', Date.now(),
  );
  return id;
}

export const renameCategory = (db: SQLiteDatabase, id: string, name: string) =>
  db.runAsync('UPDATE categories SET name = ? WHERE id = ?;', name.trim(), id);
