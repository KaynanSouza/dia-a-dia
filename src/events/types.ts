export type BackupStage = 'kdf' | 'decrypt' | 'integrity' | 'schema' | 'swap' | 'io';

/** Payloads só com números, booleanos e códigos curtos: nunca dados financeiros. */
export type AppEvents = {
  'app.booted': { coldStart: boolean };
  'app.locked': { reason: 'manual' | 'background_timeout' };
  'app.unlocked': { method: 'pin' | 'biometric' };
  'lock.configured': { biometric: boolean };
  'lock.pin_failed': { attempts: number; lockoutMs: number };
  'db.opened': { schemaVersion: number; migratedFrom: number; encrypted: boolean };
  'db.error': { code: string };
  'backup.exported': { bytes: number; kdf: string };
  'backup.restored': { schemaVersion: number };
  'backup.failed': { stage: BackupStage; code: string };
  'import.committed': { rows: number; duplicates: number; errors: number; coverage_pct: number; transfers: number; ms: number };
  'import.failed': { code: string };
  'import.undone': { rows: number };
  'import.purged': { files: number };
  'categorize.learned': { affected: number; similar: boolean };
  'ml.trained': { samples: number; features: number; ms: number };
  'data.exported': { transactions: number };
  'data.wiped': Record<string, never>;
  error: { scope: string; code: string };
};
