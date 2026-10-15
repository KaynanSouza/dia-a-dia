import { Directory, File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { bus } from '@/events/bus';
import { sqlString, toFileUri, toFsPath } from '@/lib/bytes';
import { DB_ENCRYPTED } from '@/lib/runtime';
import { getOrCreateDbKey } from '@/security/keystore/db-key';
import { runMigrations } from './migrations/runner';

// Arquivo separado no modo de teste: um banco sem criptografia nunca se mistura com um cifrado
export const DB_NAME = DB_ENCRYPTED ? 'diaadia.db' : 'diaadia-expogo-test.db';
// defaultDatabaseDirectory é um caminho puro ("/data/user/0/…/files/SQLite"); expo-file-system exige URI file://
export const dbDir = () => new Directory(toFileUri(SQLite.defaultDatabaseDirectory as string));
export const dbFile = (suffix = '') => new File(dbDir(), DB_NAME + suffix);

/** Chave bruta (x'…'): sem o PBKDF interno do SQLCipher, a chave já tem 256 bits de entropia. */
export const keyPragma = (hex: string) => `PRAGMA key = "x'${hex}'";`;
export const attachKeyed = (file: File, alias: string, hex: string) =>
  `ATTACH DATABASE ${sqlString(toFsPath(file.uri))} AS ${alias} KEY "x'${hex}'";`;

/**
 * Copia o banco aberto em `conn` para `target`:
 *  - com SQLCipher: sqlcipher_export para um arquivo cifrado com `keyHex`
 *  - modo de teste (Expo Go): VACUUM INTO, arquivo sem criptografia (preserva user_version)
 */
export async function exportDatabaseTo(conn: SQLite.SQLiteDatabase, target: File, keyHex: string | null, userVersion: number) {
  if (DB_ENCRYPTED && keyHex) {
    await conn.execAsync(
      `${attachKeyed(target, 'export_target', keyHex)}
       SELECT sqlcipher_export('export_target');
       PRAGMA export_target.user_version = ${userVersion};
       DETACH DATABASE export_target;`,
    );
  } else {
    await conn.execAsync(`VACUUM INTO ${sqlString(toFsPath(target.uri))};`);
  }
}

export class DatabaseError extends Error {
  constructor(public code: 'not_sqlcipher' | 'bad_key') {
    super(code);
    this.name = 'DatabaseError';
  }
}

let db: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;
let leases = 0;
let closeDeferred = false;

/**
 * Operações longas (importação) seguram um lease: se o app travar no meio, o fechamento do banco
 * é adiado até o lease ser liberado, em vez de abortar a transação em andamento.
 */
export function acquireDbLease(): () => void {
  leases++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    leases--;
    if (leases === 0 && closeDeferred) {
      closeDeferred = false;
      void closeDatabase();
    }
  };
}

export const dbBusy = () => leases > 0;

export function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  closeDeferred = false;
  if (db) return Promise.resolve(db);
  opening ??= (async () => {
    const key = DB_ENCRYPTED ? await getOrCreateDbKey(dbFile().exists) : null;
    const conn = await SQLite.openDatabaseAsync(DB_NAME);
    try {
      if (key) {
        await conn.execAsync(keyPragma(key)); // precisa ser o 1º comando
        // Fail-closed: um build próprio sem SQLCipher gravaria em texto claro
        const ver = await conn.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
        if (!ver?.cipher_version) throw new DatabaseError('not_sqlcipher');
        try {
          await conn.getFirstAsync('SELECT count(*) FROM sqlite_master;');
        } catch {
          throw new DatabaseError('bad_key');
        }
        await conn.execAsync('PRAGMA cipher_memory_security = ON;');
      }
      await conn.execAsync(`
        PRAGMA foreign_keys = ON;
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA secure_delete = ON;
        PRAGMA temp_store = MEMORY;
      `);
      const { from, to } = await runMigrations(conn);
      bus.emit('db.opened', { schemaVersion: to, migratedFrom: from, encrypted: DB_ENCRYPTED });
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
  if (leases > 0) {
    closeDeferred = true;
    return;
  }
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
  if (dbBusy()) throw new Error('db_busy');
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
  if (dbBusy()) throw new Error('db_busy');
  await closeDatabase().catch(() => {});
  await SQLite.deleteDatabaseAsync(DB_NAME).catch(() => {});
  for (const s of ['', '-wal', '-shm', '-journal', '.rollback']) if (dbFile(s).exists) dbFile(s).delete();
}
