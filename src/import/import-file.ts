import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { randomUUID } from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { categorize, compileRules } from '@/core/categorization/engine';
import { assignFingerprints } from '@/core/dedup/fingerprint';
import { splitDuplicates } from '@/core/dedup/matcher';
import { parseStatementCsv, StatementFormatError, type ParsedRow, type RowError } from '@/core/parsing/statement';
import { existingFingerprints, listRules } from '@/db/repositories/finance.repo';
import { bus } from '@/events/bus';
import { dirs, ensureDir } from '@/lib/files';

const MAX_CSV_BYTES = 10 * 1024 * 1024;

type PreparedRow = ParsedRow & { fingerprint: string; categoryId: string | null };

export type ImportPreview = {
  id: string;
  accountId: string;
  parser: string;
  fileSha256: string;
  rows: PreparedRow[];
  duplicates: number;
  errors: RowError[];
  alreadyImported: boolean;
};

export class ImportError extends Error {
  constructor(public code: 'too_large' | 'empty' | 'unknown_layout' | 'encoding') {
    super(code);
    this.name = 'ImportError';
  }
}

const pending = new Map<string, { preview: ImportPreview; file: File }>();

/**
 * 1) Usuário escolhe o CSV → cópia para a pasta PRIVADA de imports (retenção máx. 30 dias)
 * 2) parse → fingerprint → dedup → categorização → preview (nada gravado ainda)
 */
export async function prepareImport(db: SQLiteDatabase, accountId: string): Promise<ImportPreview | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel'],
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;

  const source = new File(picked.assets[0].uri);
  const id = randomUUID();
  const file = new File(ensureDir(dirs.imports()), `${id}.csv`);
  await source.move(file);

  try {
    if ((file.size ?? 0) > MAX_CSV_BYTES) throw new ImportError('too_large');
    const bytes = await file.bytes();
    const text = decodeText(bytes);

    let parsed;
    try {
      parsed = parseStatementCsv(text);
    } catch (e) {
      throw new ImportError(e instanceof StatementFormatError ? e.code : 'unknown_layout');
    }

    const fileSha256 = bytesToHex(sha256(bytes));
    const already = await db.getFirstAsync<{ id: string }>(
      'SELECT id FROM imports WHERE account_id = ? AND file_sha256 = ?;', accountId, fileSha256,
    );
    const withFp = assignFingerprints(accountId, parsed.rows);
    const { fresh, duplicates } = splitDuplicates(withFp, await existingFingerprints(db, accountId, withFp.map((r) => r.fingerprint)));
    const rules = compileRules(await listRules(db));

    const preview: ImportPreview = {
      id,
      accountId,
      parser: parsed.parser,
      fileSha256,
      rows: fresh.map((r) => ({ ...r, categoryId: categorize(r.descriptionNorm, rules) })),
      duplicates: duplicates.length,
      errors: parsed.errors,
      alreadyImported: !!already,
    };
    pending.set(id, { preview, file });
    return preview;
  } catch (e) {
    if (file.exists) file.delete();
    bus.emit('import.failed', { code: e instanceof ImportError ? e.code : 'unknown' });
    throw e;
  }
}

export const getPreview = (id: string) => pending.get(id)?.preview ?? null;

/** 3) Grava em transação única e DESCARTA o CSV original. */
export async function commitImport(db: SQLiteDatabase, id: string): Promise<{ imported: number; duplicates: number }> {
  const entry = pending.get(id);
  if (!entry) throw new Error('preview_expired');
  const { preview, file } = entry;
  let imported = 0;
  const now = Date.now();

  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO imports (id, account_id, source, parser, file_sha256, rows_total, rows_imported, rows_duplicate, imported_at)
       VALUES (?, ?, 'csv', ?, ?, ?, 0, ?, ?)
       ON CONFLICT (account_id, file_sha256) DO UPDATE SET imported_at = excluded.imported_at;`,
      preview.id, preview.accountId, preview.parser, preview.fileSha256,
      preview.rows.length + preview.duplicates, preview.duplicates, now,
    );
    const importRow = await tx.getFirstAsync<{ id: string }>(
      'SELECT id FROM imports WHERE account_id = ? AND file_sha256 = ?;', preview.accountId, preview.fileSha256,
    );
    for (const r of preview.rows) {
      const res = await tx.runAsync(
        `INSERT OR IGNORE INTO transactions
           (id, account_id, posted_on, amount_cents, description, description_norm, category_id, categorized_by,
            fingerprint, import_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        randomUUID(), preview.accountId, r.postedOn, r.amountCents, r.description, r.descriptionNorm,
        r.categoryId, r.categoryId ? 'rule' : 'none', r.fingerprint, importRow!.id, now, now,
      );
      imported += res.changes;
    }
    await tx.runAsync('UPDATE imports SET rows_imported = rows_imported + ? WHERE id = ?;', imported, importRow!.id);
  });

  discardImport(id);
  const duplicates = preview.duplicates + (preview.rows.length - imported);
  bus.emit('import.completed', { rows: imported, duplicates, parser: preview.parser });
  return { imported, duplicates };
}

export function discardImport(id: string) {
  const entry = pending.get(id);
  pending.delete(id);
  if (entry?.file.exists) entry.file.delete();
}

/** UTF-8; se houver bytes inválidos, cai para Windows-1252 (comum em extratos de bancos brasileiros). */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    let out = '';
    for (const b of bytes) out += String.fromCharCode(CP1252[b - 0x80] ?? b);
    return out;
  }
}

// 0x80–0x9F do Windows-1252 (0xA0–0xFF coincidem com Latin-1)
const CP1252: Record<number, number> = Object.fromEntries(
  [0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
   0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178]
    .map((cp, i) => [i, cp || 0x80 + i]),
);
