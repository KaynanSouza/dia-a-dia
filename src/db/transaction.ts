import type { SQLiteDatabase } from 'expo-sqlite';

let chain: Promise<unknown> = Promise.resolve();

/**
 * Transação na MESMA conexão (a que recebeu o PRAGMA key), serializada por uma fila em memória.
 *
 * Não use db.withExclusiveTransactionAsync: o expo-sqlite abre uma segunda conexão nativa
 * (useNewConnection) sem a chave do SQLCipher, e todo comando nela falha com "file is not a database".
 * Também evita db.withTransactionAsync concorrentes, que colidem ("cannot start a transaction within a transaction").
 *
 * Não aninhar: chamar withTransaction dentro de `task` trava a fila.
 */
export function withTransaction<T>(db: SQLiteDatabase, task: (tx: SQLiteDatabase) => Promise<T>): Promise<T> {
  const run = async () => {
    await db.execAsync('BEGIN IMMEDIATE;');
    try {
      const result = await task(db);
      await db.execAsync('COMMIT;');
      return result;
    } catch (e) {
      await db.execAsync('ROLLBACK;').catch(() => {});
      throw e;
    }
  };
  const p = chain.then(run, run);
  chain = p.catch(() => {});
  return p;
}
