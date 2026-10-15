import { useSyncExternalStore } from 'react';

export type ImportStage = 'reading' | 'deduplicating' | 'categorizing' | 'committing' | 'matching_transfers';
export type ImportPhase = 'idle' | 'analyzing' | 'ready' | 'committing' | 'done' | 'failed' | 'cancelled';

export type ImportProgress = {
  phase: ImportPhase;
  stage: ImportStage | null;
  /** 0..1 dentro do estágio */
  ratio: number;
  rows: number;
  errorCode: string | null;
  /** erro inesperado: mensagem técnica para o usuário relatar */
  errorDetail: string | null;
  result: { importLogId: string; imported: number; duplicates: number; categorized: number; transfers: number } | null;
};

const INITIAL: ImportProgress = { phase: 'idle', stage: null, ratio: 0, rows: 0, errorCode: null, errorDetail: null, result: null };

let state = INITIAL;
const listeners = new Set<() => void>();
let lastEmit = 0;

/** Progresso fica FORA do barramento de eventos (não polui o event_log) e é limitado a ~10 Hz. */
export const importProgress = {
  get: () => state,
  set(patch: Partial<ImportProgress>, force = false) {
    state = { ...state, ...patch };
    const now = Date.now();
    if (!force && now - lastEmit < 100 && patch.phase === undefined) return;
    lastEmit = now;
    listeners.forEach((l) => l());
  },
  reset() {
    state = INITIAL;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export const useImportProgress = () => useSyncExternalStore(importProgress.subscribe, importProgress.get);
