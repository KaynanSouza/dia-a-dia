import { argon2idAsync } from '@noble/hashes/argon2.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

import { BackupError } from './errors';

export type KdfParams =
  | { alg: 'argon2id'; m: number; t: number; p: number; salt: string }
  | { alg: 'pbkdf2-sha256'; c: number; salt: string };

/** OWASP (mínimo recomendado para Argon2id): 19 MiB, 2 passes, 1 lane. */
export const DEFAULT_KDF = { alg: 'argon2id', m: 19_456, t: 2, p: 1 } as const;

export const MIN_PASSWORD = 12;

/** Limites contra arquivo malicioso que tente travar o aparelho (DoS de memória/CPU). */
function assertSane(k: KdfParams) {
  const okSalt = /^[0-9a-f]{32,64}$/.test(k.salt);
  const ok =
    k.alg === 'argon2id'
      ? k.m >= 8_192 && k.m <= 131_072 && k.t >= 1 && k.t <= 10 && k.p >= 1 && k.p <= 4
      : k.alg === 'pbkdf2-sha256' && k.c >= 100_000 && k.c <= 5_000_000;
  if (!ok || !okSalt) throw new BackupError('invalid_kdf');
}

export async function deriveKey(password: string, k: KdfParams, onProgress?: (p: number) => void): Promise<Uint8Array> {
  assertSane(k);
  const pw = utf8ToBytes(password.normalize('NFKC'));
  const salt = hexToBytes(k.salt);
  try {
    return k.alg === 'argon2id'
      ? await argon2idAsync(pw, salt, { m: k.m, t: k.t, p: k.p, dkLen: 32, asyncTick: 10, onProgress })
      : await pbkdf2Async(sha256, pw, salt, { c: k.c, dkLen: 32, asyncTick: 10 });
  } finally {
    pw.fill(0);
  }
}

export function assertPasswordPolicy(pw: string) {
  if (pw.normalize('NFKC').length < MIN_PASSWORD) throw new BackupError('weak_password');
}
