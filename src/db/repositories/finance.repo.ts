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

export type Transaction = {
  id: string;
  account_id: string;
  posted_on: string;
  amount_cents: number;
  description: string;
  category_id: string | null;
  category_name: string | null;
};

export type Category = { id: string; name: string; kind: 'expense' | 'income' | 'transfer' };
export type CategoryRule = { id: string; category_id: string; match_type: 'contains' | 'starts_with' | 'equals' | 'regex'; pattern: string; priority: number };

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

export const recentTransactions = (db: SQLiteDatabase, limit = 100, accountId?: string) =>
  db.getAllAsync<Transaction>(
    `SELECT t.id, t.account_id, t.posted_on, t.amount_cents, t.description, t.category_id, c.name AS category_name
     FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     ${accountId ? 'WHERE t.account_id = ?' : ''}
     ORDER BY t.posted_on DESC, t.created_at DESC LIMIT ?;`,
    ...(accountId ? [accountId, limit] : [limit]),
  );

export const listCategories = (db: SQLiteDatabase) =>
  db.getAllAsync<Category>('SELECT id, name, kind FROM categories ORDER BY kind, name;');

export const listRules = (db: SQLiteDatabase) =>
  db.getAllAsync<CategoryRule>('SELECT id, category_id, match_type, pattern, priority FROM category_rules ORDER BY priority, id;');

export async function setTransactionCategory(db: SQLiteDatabase, txId: string, categoryId: string | null) {
  await db.runAsync(
    "UPDATE transactions SET category_id = ?, categorized_by = 'user', updated_at = ? WHERE id = ?;",
    categoryId, Date.now(), txId,
  );
}

export const existingFingerprints = async (db: SQLiteDatabase, accountId: string, fingerprints: string[]) => {
  const found = new Set<string>();
  for (let i = 0; i < fingerprints.length; i += 500) {
    const chunk = fingerprints.slice(i, i + 500);
    const rows = await db.getAllAsync<{ fingerprint: string }>(
      `SELECT fingerprint FROM transactions WHERE account_id = ? AND fingerprint IN (${chunk.map(() => '?').join(',')});`,
      accountId, ...chunk,
    );
    rows.forEach((r) => found.add(r.fingerprint));
  }
  return found;
};
