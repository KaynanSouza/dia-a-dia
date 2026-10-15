import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_VERSION } from '@/db/migrations';
import { bus } from '@/events/bus';
import { dirs, freshFile, removeDir } from '@/lib/files';

export type DataExport = { json: File; csv: File; transactions: number };

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  // aspas + neutraliza injeção de fórmula em planilhas
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** F-04: JSON completo + CSV de transações na pasta privada; a UI compartilha cada um via expo-sharing. */
export async function exportMyData(db: SQLiteDatabase): Promise<DataExport> {
  removeDir(dirs.dataExport());
  const [accounts, categories, rules, transactions, imports, settings] = await Promise.all([
    db.getAllAsync('SELECT * FROM accounts ORDER BY created_at;'),
    db.getAllAsync('SELECT * FROM categories ORDER BY name;'),
    db.getAllAsync('SELECT * FROM category_rules ORDER BY priority;'),
    db.getAllAsync<Record<string, unknown>>(
      `SELECT t.posted_on, a.name AS account, t.description, t.amount_cents, c.name AS category, t.notes, t.id
       FROM transactions t JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id
       ORDER BY t.posted_on, t.created_at;`,
    ),
    db.getAllAsync('SELECT id, account_id, source, parser, rows_total, rows_imported, rows_duplicate, imported_at FROM imports;'),
    db.getAllAsync('SELECT key, value, updated_at FROM app_settings;'),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  const json = freshFile(dirs.dataExport(), `dia-a-dia-dados-${stamp}.json`);
  json.write(
    JSON.stringify(
      { exportedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, accounts, categories, rules, transactions, imports, settings },
      null,
      2,
    ),
  );

  const header = ['data', 'conta', 'descricao', 'valor', 'categoria', 'observacoes', 'id'];
  const lines = transactions.map((t) =>
    [t.posted_on, t.account, t.description, ((t.amount_cents as number) / 100).toFixed(2).replace('.', ','), t.category, t.notes, t.id]
      .map(csvCell)
      .join(';'),
  );
  const csv = freshFile(dirs.dataExport(), `dia-a-dia-transacoes-${stamp}.csv`);
  csv.write('﻿' + [header.join(';'), ...lines].join('\r\n')); // BOM: Excel abre acentos corretamente

  bus.emit('data.exported', { transactions: transactions.length });
  return { json, csv, transactions: transactions.length };
}
