import { M0001_CORE } from '../schema/0001_core.sql';
import { M0002_FINANCE } from '../schema/0002_finance.sql';
import { M0003_IMPORT_PIPELINE } from '../schema/0003_import_pipeline.sql';
import { M0004_BILLS } from '../schema/0004_bills.sql';

export type Migration = { version: number; name: string; sql: string };

/** Append-only. Nunca editar uma migração publicada (o checksum é verificado). */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'core', sql: M0001_CORE },
  { version: 2, name: 'finance', sql: M0002_FINANCE },
  { version: 3, name: 'import_pipeline', sql: M0003_IMPORT_PIPELINE },
  { version: 4, name: 'bills', sql: M0004_BILLS },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
export const MIN_RESTORABLE_SCHEMA = 1;
