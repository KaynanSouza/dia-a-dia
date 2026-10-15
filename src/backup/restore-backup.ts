import { gcm } from '@noble/ciphers/aes.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';

import { attachKeyed, dbFile, getDatabase, keyPragma, swapDatabase } from '@/db/client';
import { MIN_RESTORABLE_SCHEMA, SCHEMA_VERSION } from '@/db/migrations';
import { bus } from '@/events/bus';
import type { BackupStage } from '@/events/types';
import { toFsPath } from '@/lib/bytes';
import { dirs, freshFile, removeDir } from '@/lib/files';
import { rescheduleAllNotifications } from '@/notifications/scheduler';
import { getOrCreateDbKey } from '@/security/keystore/db-key';
import { BackupError, type BackupErrorCode } from './errors';
import { decodeEnvelope, unpackPayload } from './format';
import { deriveKey } from './kdf';

export async function pickBackupFile(): Promise<File | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  return r.canceled ? null : new File(r.assets[0].uri);
}

/** Leitura barata para a UI mostrar data/versão ANTES de pedir a senha. */
export async function inspectBackup(file: File) {
  const { header } = decodeEnvelope(await file.bytes());
  return {
    createdAt: header.createdAt,
    schemaVersion: header.schemaVersion,
    appVersion: header.appVersion,
    compatible: header.schemaVersion <= SCHEMA_VERSION && header.schemaVersion >= MIN_RESTORABLE_SCHEMA,
  };
}

const fail = (stage: BackupStage, code: BackupErrorCode) => {
  bus.emit('backup.failed', { stage, code });
  return new BackupError(code);
};

/** Pré-condição: confirmIdentity() + confirmação de que os dados atuais serão substituídos. */
export async function restoreBackup(file: File, password: string, onProgress?: (kdf: number) => void): Promise<void> {
  const work = dirs.restoreWork();
  try {
    // 1. Envelope e versão do schema
    const { header, aad, ciphertext } = decodeEnvelope(await file.bytes());
    if (header.schemaVersion > SCHEMA_VERSION) throw fail('schema', 'newer_schema');
    if (header.schemaVersion < MIN_RESTORABLE_SCHEMA) throw fail('schema', 'old_schema');

    // 2. KDF + GCM: tag inválida = senha errada OU arquivo adulterado (indistinguíveis de propósito)
    const key = await deriveKey(password, header.kdf, onProgress);
    let plaintext: Uint8Array;
    try {
      plaintext = gcm(key, hexToBytes(header.cipher.iv), aad).decrypt(ciphertext);
    } catch {
      throw fail('decrypt', 'bad_password_or_corrupted');
    } finally {
      key.fill(0);
    }

    // 3. Integridade do snapshot
    const { manifest, db: dbBytes } = unpackPayload(plaintext);
    if (dbBytes.length !== manifest.dbBytes || bytesToHex(sha256(dbBytes)) !== manifest.dbSha256) {
      throw fail('integrity', 'integrity');
    }

    removeDir(work);
    const incoming = freshFile(work, 'incoming.db'); // ainda cifrado com a chave efêmera
    incoming.write(dbBytes);
    plaintext.fill(0);
    const staged = new File(work, 'staged.db'); // será re-cifrado com a chave do aparelho

    // 4. Valida o snapshot e re-cifra com a chave do Keystore
    const tmp = await SQLite.openDatabaseAsync('incoming.db', {}, toFsPath(work.uri));
    try {
      await tmp.execAsync(keyPragma(manifest.dbKey));
      let integrity: { integrity_check: string }[];
      try {
        integrity = await tmp.getAllAsync<{ integrity_check: string }>('PRAGMA integrity_check;');
      } catch {
        throw fail('integrity', 'integrity');
      }
      if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw fail('integrity', 'integrity');
      const uv = await tmp.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
      if (uv?.user_version !== header.schemaVersion) throw fail('schema', 'integrity');

      const deviceKey = await getOrCreateDbKey(dbFile().exists);
      await tmp.execAsync(
        `${attachKeyed(staged, 'staged', deviceKey)}
         SELECT sqlcipher_export('staged');
         PRAGMA staged.user_version = ${header.schemaVersion};
         DETACH DATABASE staged;`,
      );
    } finally {
      await tmp.closeAsync();
    }

    // 5. Troca atômica + migração até SCHEMA_VERSION (rollback automático se falhar)
    try {
      await swapDatabase(staged);
    } catch {
      throw fail('swap', 'swap_failed');
    }

    // 6. Notificações refletem os dados restaurados
    await rescheduleAllNotifications(getDatabase());
    bus.emit('backup.restored', { schemaVersion: header.schemaVersion });
  } catch (e) {
    if (e instanceof BackupError) throw e;
    bus.emit('backup.failed', { stage: 'io', code: e instanceof Error ? e.name : 'unknown' });
    throw e;
  } finally {
    removeDir(work);
    if (file.exists && file.uri.startsWith(Paths.cache.uri)) file.delete(); // cópia feita pelo DocumentPicker
  }
}
