import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting } from '@/db/repositories/settings.repo';
import { bus } from '@/events/bus';
import { dirs, purgeOlderThan } from '@/lib/files';

const DAY = 86_400_000;

/** F-03: CSVs não confirmados ficam no máximo 30 dias na pasta privada. */
export async function purgeExpiredImports(db: SQLiteDatabase) {
  const days = Math.min(30, await getSetting<number>(db, 'import.csv_retention_days', 30));
  const files = purgeOlderThan(dirs.imports(), days * DAY);
  if (files) bus.emit('import.purged', { files });
}
