import type { SQLiteDatabase } from 'expo-sqlite';
import { AppState } from 'react-native';

import { acquireDbLease } from '@/db/client';
import { logError } from '@/logging/logger';
import { getNotifications } from '@/notifications/native';
import { analyze } from './analyze';
import { commitPlan } from './commit';
import { errorDetail, ImportError } from './limits';
import { importProgress } from './progress-store';
import { ImportCancelledError } from './scheduler';
import { finishSession, getSession } from './session';

/**
 * Ciclo de vida do job: lease no banco (travar o app não fecha a conexão no meio), progresso,
 * notificação local se terminar com o app em segundo plano, e erro → estado 'failed' com código.
 */
async function runJob<T>(phase: 'analyzing' | 'committing', work: () => Promise<T>, onDone: (r: T) => void, notify: (r: T | null, code?: string) => string | null) {
  const release = acquireDbLease();
  let wentBackground = AppState.currentState !== 'active';
  const sub = AppState.addEventListener('change', (s) => {
    if (s !== 'active') wentBackground = true;
  });
  importProgress.set({ phase, stage: null, ratio: 0, errorCode: null, errorDetail: null }, true);
  try {
    const r = await work();
    onDone(r);
    if (wentBackground || AppState.currentState !== 'active') await sendLocal(notify(r));
  } catch (e) {
    if (e instanceof ImportCancelledError) {
      importProgress.set({ phase: 'cancelled' }, true);
      return;
    }
    const code = e instanceof ImportError ? e.code : 'unknown';
    importProgress.set({ phase: 'failed', errorCode: code, errorDetail: code === 'unknown' ? errorDetail(e) : null }, true);
    if (code === 'unknown') logError(`import.${phase}`, e);
    if (wentBackground || AppState.currentState !== 'active') await sendLocal(notify(null, code));
  } finally {
    sub.remove();
    release();
  }
}

async function sendLocal(body: string | null) {
  const N = getNotifications();
  if (!N || !body) return;
  try {
    if (!(await N.getPermissionsAsync()).granted) return;
    // Só contagens: nada de valores ou estabelecimentos na tela bloqueada
    await N.scheduleNotificationAsync({ content: { title: 'Dia a Dia', body, data: { route: '/import' } }, trigger: null });
  } catch {}
}

export function runAnalyze(db: SQLiteDatabase) {
  const session = getSession();
  if (!session?.mapping) return Promise.resolve();
  return runJob(
    'analyzing',
    () => analyze(db, session),
    (plan) => {
      session.plan = plan;
      importProgress.set({ phase: 'ready', stage: null, ratio: 1, rows: plan.fresh.length }, true);
    },
    (plan, code) => (plan ? `Extrato analisado: ${plan.fresh.length} lançamentos novos prontos para importar.` : code ? 'A análise do extrato falhou.' : null),
  );
}

export function runCommit(db: SQLiteDatabase) {
  const session = getSession();
  if (!session?.plan) return Promise.resolve();
  const plan = session.plan;
  return runJob(
    'committing',
    () => commitPlan(db, session, plan),
    (result) => {
      finishSession(); // apaga o CSV original
      importProgress.set({ phase: 'done', stage: null, ratio: 1, rows: result.imported, result }, true);
    },
    (r, code) => (r ? `Importação concluída: ${r.imported} transações novas.` : `A importação falhou (${code}). Nada foi gravado.`),
  );
}

export function cancelImport() {
  getSession()?.abort.abort();
}
