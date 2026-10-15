import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { SQLiteDatabase } from 'expo-sqlite';

import { withTransaction } from '@/db/transaction';

import { BOOTSTRAP_SQL } from '../schema/0000_bootstrap.sql';
import { MIGRATIONS, SCHEMA_VERSION } from './index';

export class MigrationError extends Error {
  constructor(public code: 'db_newer_than_app' | 'checksum_mismatch') {
    super(code);
    this.name = 'MigrationError';
  }
}

export const sqlChecksum = (sql: string) => bytesToHex(sha256(utf8ToBytes(sql)));

/** Cada migração roda em transação exclusiva, registra checksum e atualiza PRAGMA user_version. */
export async function runMigrations(db: SQLiteDatabase): Promise<{ from: number; to: number }> {
  await db.execAsync(BOOTSTRAP_SQL);
  const applied = await db.getAllAsync<{ version: number; checksum: string }>(
    'SELECT version, checksum FROM schema_migrations ORDER BY version;',
  );
  const from = applied.at(-1)?.version ?? 0;
  if (from > SCHEMA_VERSION) throw new MigrationError('db_newer_than_app');

  for (const row of applied) {
    const m = MIGRATIONS.find((x) => x.version === row.version);
    if (!m || sqlChecksum(m.sql) !== row.checksum) throw new MigrationError('checksum_mismatch');
  }

  for (const m of MIGRATIONS.filter((x) => x.version > from)) {
    await withTransaction(db, async (tx) => {
      await tx.execAsync(m.sql);
      await tx.runAsync(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?);',
        m.version, m.name, sqlChecksum(m.sql), Date.now(),
      );
      await tx.execAsync(`PRAGMA user_version = ${m.version};`);
    });
  }
  return { from, to: SCHEMA_VERSION };
}
