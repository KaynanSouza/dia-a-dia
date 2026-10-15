import { Directory, File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { bus } from '@/events/bus';
import { sqlString, toFsPath } from '@/lib/bytes';
import { getOrCreateDbKey } from '@/security/keystore/db-key';
import { runMigrations } from './migrations/runner';

export const DB_NAME = 'diaadia.db';
export const dbDir = () => new Directory(SQLite.defaultDatabaseDirectory as string);
export const dbFile = (suffix = '') => new File(dbDir(), DB_NAME + suffix);

/** Chave bruta (x'…'): sem o PBKDF interno do SQLCipher, a chave já tem 256 bits de entropia. */
export const keyPragma = (hex: string) => `PRAGMA key = "x'${hex}'";`;
export const attachKeyed = (file: File, alias: string, hex: string) =>
  `ATTACH DATABASE ${sqlString(toFsPath(file.uri))} AS ${alias} KEY "x'${hex}'";`;

export class DatabaseError extends Error {
  constructor(public code: 'not_sqlcipher' | 'bad_key') {
    super(code);
    this.name = 'DatabaseError';
  }
}

let db: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return Promise.resolve(db);
  opening ??= (async () => {
    const key = await getOrCreateDbKey(dbFile().exists);
    const conn = await SQLite.openDatabaseAsync(DB_NAME);
    try {
      await conn.execAsync(keyPragma(key)); // precisa ser o 1º comando
      // Fail-closed: um build sem SQLCipher gravaria em texto claro
      const ver = await conn.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
      if (!ver?.cipher_version) throw new DatabaseError('not_sqlcipher');
      try {
        await conn.getFirstAsync('SELECT count(*) FROM sqlite_master;');
      } catch {
        throw new DatabaseError('bad_key');
      }
      await conn.execAsync(`
        PRAGMA cipher_memory_security = ON;
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA secure_delete = ON;
        PRAGMA temp_store = MEMORY;
      `);
      const { from, to } = await runMigrations(conn);
      bus.emit('db.opened', { schemaVersion: to, migratedFrom: from });
      db = conn;
      return conn;
    } catch (e) {
      await conn.closeAsync().catch(() => {});
      bus.emit('db.error', { code: e instanceof Error ? (('code' in e && String(e.code)) || e.name) : 'unknown' });
      throw e;
    }
  })().finally(() => {
    opening = null;
  });
  return opening;
}

export async function closeDatabase() {
  if (!db) return;
  const conn = db;
  db = null;
  await conn.execAsync('PRAGMA wal_checkpoint(TRUNCATE);').catch(() => {});
  await conn.closeAsync();
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('Banco fechado (app travado?)');
  return db;
}

/** Para quem tolera banco fechado (logger). */
export const peekDatabase = () => db;

/** Troca atômica do arquivo principal com rollback (usado pelo restore). */
export async function swapDatabase(staged: File) {
  await closeDatabase();
  const hadMain = dbFile().exists;
  if (dbFile('.rollback').exists) dbFile('.rollback').delete();
  for (const s of ['-wal', '-shm']) if (dbFile(s).exists) dbFile(s).delete();

  if (hadMain) await dbFile().move(dbFile('.rollback'));
  await staged.move(dbFile());
  try {
    await openDatabase(); // migra até SCHEMA_VERSION
    if (dbFile('.rollback').exists) dbFile('.rollback').delete();
  } catch (e) {
    await closeDatabase().catch(() => {});
    for (const s of ['', '-wal', '-shm']) if (dbFile(s).exists) dbFile(s).delete();
    if (hadMain) {
      await dbFile('.rollback').move(dbFile());
      await openDatabase();
    }
    throw e;
  }
}

/** F-04: remove banco e arquivos auxiliares. */
export async function deleteDatabaseFiles() {
  await closeDatabase().catch(() => {});
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => {});
  for (const s of ['', '-wal', '-shm', '-journal', '.rollback']) if (dbFile(s).exists) dbFile(s).delete();
}
