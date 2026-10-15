import type { SQLiteDatabase } from 'expo-sqlite';

export type EventLogRow = {
  id: number;
  ts: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  event: string;
  context: string | null;
  session_id: string;
  app_version: string;
};

export const recentEvents = (db: SQLiteDatabase, limit = 200) =>
  db.getAllAsync<EventLogRow>('SELECT id, ts, level, event, context, session_id, app_version FROM event_log ORDER BY id DESC LIMIT ?;', limit);

export const eventLogStats = (db: SQLiteDatabase) =>
  db.getFirstAsync<{ rows: number; bytes: number }>('SELECT count(*) AS rows, coalesce(sum(size_bytes), 0) AS bytes FROM event_log;');
