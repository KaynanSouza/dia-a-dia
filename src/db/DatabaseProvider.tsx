import type { SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { Button, Loading, Muted, Screen, Title } from '@/components/ui';
import { runMaintenance } from '@/maintenance';
import { KeystoreError } from '@/security/keystore/db-key';
import { closeDatabase, DatabaseError, openDatabase } from './client';

type DbContextValue = { db: SQLiteDatabase; version: number; bump: () => void };

const DbContext = createContext<DbContextValue | null>(null);

/**
 * Montado só dentro de (app), ou seja, após o unlock. Ao travar, (app) desmonta e a conexão é fechada,
 * tirando a chave do SQLCipher da memória.
 */
export function DatabaseProvider({ children, onKeyLost }: { children: ReactNode; onKeyLost: () => void }) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    openDatabase()
      .then(async (conn) => {
        await runMaintenance(conn).catch(() => {});
        if (alive) setDb(conn);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof KeystoreError || e instanceof DatabaseError) setError(e.code);
        else setError('unknown');
      });
    return () => {
      alive = false;
      closeDatabase().catch(() => {});
    };
  }, []);

  const bump = useCallback(() => setVersion((v) => v + 1), []);

  if (error) {
    return (
      <Screen>
        <Title>Não foi possível abrir seus dados</Title>
        {error === 'key_lost' || error === 'bad_key' ? (
          <>
            <Muted>
              A chave de criptografia deste aparelho não está mais disponível (app reinstalado ou segurança do sistema
              redefinida). Os dados antigos não podem ser lidos sem ela.
            </Muted>
            <Muted>Comece do zero e, em seguida, restaure seu último backup em Ajustes › Backup.</Muted>
            <Button title="Começar do zero" variant="danger" onPress={onKeyLost} />
          </>
        ) : error === 'not_sqlcipher' ? (
          <Muted>Este build não tem criptografia de banco (SQLCipher) ativa. Por segurança, nada foi gravado.</Muted>
        ) : (
          <Muted>Erro inesperado ({error}). Tente abrir o app novamente.</Muted>
        )}
      </Screen>
    );
  }
  if (!db) return <Loading />;
  return <DbContext.Provider value={{ db, version, bump }}>{children}</DbContext.Provider>;
}

export function useDb() {
  const ctx = useContext(DbContext);
  if (!ctx) throw new Error('useDb fora do DatabaseProvider');
  return ctx;
}

/** Consulta simples que recarrega quando `bump()` é chamado (após escrita) ou quando deps mudam. */
export function useDbQuery<T>(fn: (db: SQLiteDatabase) => Promise<T>, deps: unknown[] = []) {
  const { db, version } = useDb();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn(db)
      .then((r) => alive && setData(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, ...deps]);
  return { data, loading };
}
