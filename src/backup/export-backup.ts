import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import Constants from 'expo-constants';
import { getRandomBytes } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportDatabaseTo, getDatabase } from '@/db/client';
import { SCHEMA_VERSION } from '@/db/migrations';
import { setSetting } from '@/db/repositories/settings.repo';
import { bus } from '@/events/bus';
import { dirs, ensureDir, freshFile, purgeOlderThan, removeDir } from '@/lib/files';
import { DB_ENCRYPTED } from '@/lib/runtime';
import { scheduleBackupReminder } from '@/services/notifications/backup-reminder';
import { encodePrefix, packPayload, PLAIN_SNAPSHOT_KEY, type BackupHeader } from './format';
import { assertPasswordPolicy, DEFAULT_KDF, deriveKey } from './kdf';

export type BackupProgress = { stage: 'snapshot' | 'kdf' | 'encrypt' | 'share'; kdf?: number };

/** Pré-condição: a UI já chamou useAppLock().confirmIdentity(). */
export async function exportBackup(password: string, onProgress?: (p: BackupProgress) => void): Promise<void> {
  assertPasswordPolicy(password);
  const db = getDatabase();
  const snap = new File(ensureDir(dirs.backupWork()), `snap-${Date.now()}.db`);
  const ephKey = getRandomBytes(32);
  const ephHex = bytesToHex(ephKey);

  try {
    // 1. Snapshot consistente, cifrado com chave efêmera
    onProgress?.({ stage: 'snapshot' });
    await exportDatabaseTo(db, snap, DB_ENCRYPTED ? ephHex : null, SCHEMA_VERSION);
    const dbBytes = await snap.bytes();
    const snapshotKey = DB_ENCRYPTED ? ephHex : PLAIN_SNAPSHOT_KEY;

    // 2. Envelope AES-256-GCM, com o header autenticado como AAD
    const header: BackupHeader = {
      format: 1,
      app: 'dia-a-dia',
      appVersion: Constants.expoConfig?.version ?? '0',
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      kdf: { ...DEFAULT_KDF, salt: bytesToHex(getRandomBytes(16)) },
      cipher: { alg: 'aes-256-gcm', iv: bytesToHex(getRandomBytes(12)) },
    };
    const plaintext = packPayload({ dbKey: snapshotKey, dbSha256: bytesToHex(sha256(dbBytes)), dbBytes: dbBytes.length }, dbBytes);
    const aad = encodePrefix(header);

    onProgress?.({ stage: 'kdf', kdf: 0 });
    const key = await deriveKey(password, header.kdf, (kdf) => onProgress?.({ stage: 'kdf', kdf }));
    onProgress?.({ stage: 'encrypt' });
    const ct = gcm(key, hexToBytes(header.cipher.iv), aad).encrypt(plaintext);
    key.fill(0);
    plaintext.fill(0);

    // 3. Grava e abre o seletor nativo
    const out = freshFile(dirs.backupOut(), `dia-a-dia-backup-${header.createdAt.slice(0, 10)}.diabkp`);
    const envelope = concatBytes(aad, ct);
    out.write(envelope);
    onProgress?.({ stage: 'share' });
    await Sharing.shareAsync(out.uri, { mimeType: 'application/octet-stream', UTI: 'public.data', dialogTitle: 'Salvar backup' });
    // Não apagar já: no Android o app de destino lê o arquivo depois. purgeBackupTemp() roda na manutenção.

    await setSetting(db, 'backup.last_at', Date.now());
    await scheduleBackupReminder(db);
    bus.emit('backup.exported', { bytes: envelope.length, kdf: header.kdf.alg });
  } catch (e) {
    bus.emit('backup.failed', { stage: 'io', code: e instanceof Error ? e.name : 'unknown' });
    throw e;
  } finally {
    ephKey.fill(0);
    if (snap.exists) snap.delete();
  }
}

/** Remove snapshots órfãos e backups exportados há mais de 1 h. */
export function purgeBackupTemp(maxAgeMs = 3_600_000) {
  removeDir(dirs.backupWork());
  removeDir(dirs.restoreWork());
  purgeOlderThan(dirs.backupOut(), maxAgeMs);
}
