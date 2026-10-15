/**
 * Arquivo .diabkp
 *
 *  offset  tam.  campo
 *  0       8     MAGIC "DIABKP01"
 *  8       4     headerLen (u32 BE, ≤ 4096)
 *  12      N     header JSON (UTF-8)       ─┐ AAD do GCM = bytes[0 .. 12+N)
 *  12+N    …     ciphertext ‖ tag(16)      ─┘ AES-256-GCM(KDF(senha, salt), iv 12 bytes)
 *
 *  plaintext = u32be(manifestLen) ‖ manifest JSON ‖ dbBytes
 *  dbBytes   = snapshot via sqlcipher_export cifrado com chave EFÊMERA (manifest.dbKey):
 *              nenhum byte em texto claro toca o disco, nem no export nem no restore.
 */
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';

import { readU32be, u32be } from '@/lib/bytes';
import { utf8Decode } from '@/lib/text';
import { BackupError } from './errors';
import type { KdfParams } from './kdf';

export const MAGIC = utf8ToBytes('DIABKP01');
export const FORMAT_VERSION = 1;
export const MAX_BACKUP_BYTES = 150 * 1024 * 1024;
const MAX_HEADER = 4096;
const TAG_BYTES = 16;

export type BackupHeader = {
  format: 1;
  app: 'dia-a-dia';
  appVersion: string;
  schemaVersion: number;
  createdAt: string;
  kdf: KdfParams;
  cipher: { alg: 'aes-256-gcm'; iv: string };
};

export type Manifest = { dbKey: string; dbSha256: string; dbBytes: number };

/** dbKey sentinela: snapshot sem SQLCipher (gerado no modo de teste do Expo Go). */
export const PLAIN_SNAPSHOT_KEY = '0'.repeat(64);

/** MAGIC ‖ len ‖ header — também usado como AAD. */
export function encodePrefix(header: BackupHeader): Uint8Array {
  const h = utf8ToBytes(JSON.stringify(header));
  return concatBytes(MAGIC, u32be(h.length), h);
}

export function decodeEnvelope(bytes: Uint8Array) {
  if (bytes.length > MAX_BACKUP_BYTES) throw new BackupError('too_large');
  if (bytes.length < 12 + 2 + TAG_BYTES || !MAGIC.every((b, i) => bytes[i] === b)) throw new BackupError('not_a_backup');
  const hLen = readU32be(bytes, 8);
  if (hLen === 0 || hLen > MAX_HEADER || 12 + hLen + TAG_BYTES > bytes.length) throw new BackupError('not_a_backup');

  let header: BackupHeader;
  try {
    header = JSON.parse(utf8Decode(bytes.subarray(12, 12 + hLen))) as BackupHeader;
  } catch {
    throw new BackupError('not_a_backup');
  }
  if (
    header.app !== 'dia-a-dia' ||
    header.format !== FORMAT_VERSION ||
    header.cipher?.alg !== 'aes-256-gcm' ||
    !/^[0-9a-f]{24}$/.test(header.cipher.iv) ||
    !Number.isInteger(header.schemaVersion) ||
    !header.kdf
  ) {
    throw new BackupError('unsupported_format');
  }
  return { header, aad: bytes.subarray(0, 12 + hLen), ciphertext: bytes.subarray(12 + hLen) };
}

export function packPayload(manifest: Manifest, db: Uint8Array) {
  const m = utf8ToBytes(JSON.stringify(manifest));
  return concatBytes(u32be(m.length), m, db);
}

export function unpackPayload(p: Uint8Array): { manifest: Manifest; db: Uint8Array } {
  if (p.length < 4) throw new BackupError('integrity');
  const mLen = readU32be(p, 0);
  if (mLen > 1024 || 4 + mLen > p.length) throw new BackupError('integrity');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(utf8Decode(p.subarray(4, 4 + mLen))) as Manifest;
  } catch {
    throw new BackupError('integrity');
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.dbKey) || !/^[0-9a-f]{64}$/.test(manifest.dbSha256)) throw new BackupError('integrity');
  return { manifest, db: p.subarray(4 + mLen) };
}
