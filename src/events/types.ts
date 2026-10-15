export type BackupStage = 'kdf' | 'decrypt' | 'integrity' | 'schema' | 'swap' | 'io';

/** Payloads só com números, booleanos e códigos curtos: nunca dados financeiros. */
export type AppEvents = {
  'app.booted': { coldStart: boolean };
  'app.locked': { reason: 'manual' | 'background_timeout' };
  'app.unlocked': { method: 'pin' | 'biometric' };
  'lock.configured': { biometric: boolean };
  'lock.pin_failed': { attempts: number; lockoutMs: number };
  'db.opened': { schemaVersion: number; migratedFrom: number };
  'db.error': { code: string };
  'backup.exported': { bytes: number; kdf: string };
  'backup.restored': { schemaVersion: number };
  'backup.failed': { stage: BackupStage; code: string };
  'import.completed': { rows: number; duplicates: number; parser: string };
  'import.failed': { code: string };
  'import.purged': { files: number };
  'data.exported': { transactions: number };
  'data.wiped': Record<string, never>;
  error: { scope: string; code: string };
};
