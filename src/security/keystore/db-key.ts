import { bytesToHex } from '@noble/hashes/utils.js';
import { getRandomBytes } from 'expo-crypto';

import { secureKv } from './secure-kv';

const DB_KEY = 'db.sqlcipher.key.v1';
const HEX64 = /^[0-9a-f]{64}$/;

export class KeystoreError extends Error {
  constructor(public code: 'key_lost' | 'key_corrupt' | 'key_write_failed') {
    super(code);
    this.name = 'KeystoreError';
  }
}

/**
 * Chave AES-256 bruta (32 bytes) do SQLCipher, gerada no primeiro uso.
 * Se o banco existe mas a chave sumiu (reinstalação, Keystore resetado), NUNCA gera outra:
 * a UI oferece "Restaurar backup" ou "Começar do zero".
 */
export async function getOrCreateDbKey(dbExists: boolean): Promise<string> {
  const existing = await secureKv.get(DB_KEY);
  if (existing) {
    if (!HEX64.test(existing)) throw new KeystoreError('key_corrupt');
    return existing;
  }
  if (dbExists) throw new KeystoreError('key_lost');

  const key = bytesToHex(getRandomBytes(32));
  await secureKv.set(DB_KEY, key);
  if ((await secureKv.get(DB_KEY)) !== key) throw new KeystoreError('key_write_failed');
  return key;
}

export const deleteDbKey = () => secureKv.del(DB_KEY);
