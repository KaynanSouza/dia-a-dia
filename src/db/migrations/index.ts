import { M0001_CORE } from '../schema/0001_core.sql';
import { M0002_FINANCE } from '../schema/0002_finance.sql';

export type Migration = { version: number; name: string; sql: string };

/** Append-only. Nunca editar uma migração publicada (o checksum é verificado). */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'core', sql: M0001_CORE },
  { version: 2, name: 'finance', sql: M0002_FINANCE },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
export const MIN_RESTORABLE_SCHEMA = 1;
