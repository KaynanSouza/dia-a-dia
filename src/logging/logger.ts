import { bytesToHex } from '@noble/hashes/utils.js';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { bus } from '@/events/bus';
import type { AppEvents } from '@/events/types';
import { rotateEventLog } from './rotation';
import { sanitize } from './sanitize';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Row = [ts: number, level: Level, event: string, ctx: string | null];

const LEVEL: Partial<Record<keyof AppEvents, Level>> = {
  'lock.pin_failed': 'warn',
  'backup.failed': 'error',
  'import.failed': 'warn',
  'db.error': 'error',
  error: 'error',
};

const SESSION = bytesToHex(getRandomBytes(8));
const APP_VERSION = (Constants.expoConfig?.version ?? '0').slice(0, 32);
const MAX_BUFFER = 500;
const FLUSH_MS = 2_000;
const ROTATE_EVERY = 200;

const buffer: Row[] = [];
let started = false;
let inserted = 0;

/** bus → buffer em memória → event_log. O buffer segura eventos enquanto o banco está fechado (app travado). */
export function startLogger(getDb: () => SQLiteDatabase | null) {
  if (started) return;
  started = true;

  bus.onAny((event, payload) => {
    if (buffer.length >= MAX_BUFFER) buffer.shift();
    const ctx = sanitize(payload);
    buffer.push([Date.now(), LEVEL[event] ?? 'info', String(event).slice(0, 64), ctx ? JSON.stringify(ctx) : null]);
  });

  setInterval(() => {
    const db = getDb();
    if (db) flush(db).catch(() => {});
  }, FLUSH_MS);
}

export async function flush(db: SQLiteDatabase) {
  if (!buffer.length) return;
  const batch = buffer.splice(0, buffer.length);
  try {
    await db.withTransactionAsync(async () => {
      for (const [ts, level, event, ctx] of batch) {
        await db.runAsync(
          'INSERT INTO event_log (ts, level, event, context, session_id, app_version) VALUES (?, ?, ?, ?, ?, ?);',
          ts, level, event, ctx, SESSION, APP_VERSION,
        );
      }
    });
  } catch {
    buffer.unshift(...batch.slice(-(MAX_BUFFER - buffer.length)));
    return;
  }
  inserted += batch.length;
  if (inserted >= ROTATE_EVERY) {
    inserted = 0;
    await rotateEventLog(db);
  }
}

/** Erro inesperado: só o nome da classe (mensagens podem conter dados). */
export const logError = (scope: string, err: unknown) =>
  bus.emit('error', { scope, code: err instanceof Error ? err.name.slice(0, 64) : typeof err });
