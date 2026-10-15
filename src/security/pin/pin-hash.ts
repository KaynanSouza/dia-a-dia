import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { getRandomBytes } from 'expo-crypto';

import { ctEqual } from '@/lib/bytes';

export type PinRecord = { v: 1; alg: 'pbkdf2-sha256'; c: number; salt: string; hash: string };

const ITERATIONS = 150_000; // ~1 s no Hermes; versionado em `c` para upgrade transparente
const WEAK = new Set(['123123', '121212', '112233', '102030', '000001', '696969', '131313']);

export type PinValidation = 'ok' | 'format' | 'weak';

export function validatePin(pin: string): PinValidation {
  if (!/^\d{6}$/.test(pin)) return 'format';
  if (WEAK.has(pin) || /^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'weak';
  return 'ok';
}

const derive = (pin: string, salt: Uint8Array, c: number) =>
  pbkdf2Async(sha256, utf8ToBytes(pin), salt, { c, dkLen: 32, asyncTick: 10 });

/** PIN nunca é salvo: só PBKDF2(pin, sal aleatório). */
export async function hashPin(pin: string): Promise<PinRecord> {
  const salt = getRandomBytes(16);
  const hash = await derive(pin, salt, ITERATIONS);
  const rec: PinRecord = { v: 1, alg: 'pbkdf2-sha256', c: ITERATIONS, salt: bytesToHex(salt), hash: bytesToHex(hash) };
  hash.fill(0);
  return rec;
}

export async function verifyPin(pin: string, rec: PinRecord): Promise<boolean> {
  const d = await derive(pin, hexToBytes(rec.salt), rec.c);
  const ok = ctEqual(d, hexToBytes(rec.hash));
  d.fill(0);
  return ok;
}

export const needsRehash = (rec: PinRecord) => rec.c < ITERATIONS;
