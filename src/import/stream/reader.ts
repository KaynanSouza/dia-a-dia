import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { FileMode, type File } from 'expo-file-system';

import { decodeCp1252, Utf8StreamDecoder } from '@/lib/text';
import type { Encoding } from '../profiles/types';

export const CHUNK_BYTES = 64 * 1024;

/** Lê só o começo do arquivo (sniffing de encoding/delimitador/cabeçalho). */
export function readHead(file: File, maxBytes = CHUNK_BYTES): Uint8Array {
  const h = file.open(FileMode.ReadOnly);
  try {
    return h.readBytes(maxBytes);
  } finally {
    h.close();
  }
}

/**
 * Leitura em streaming: chunks de 64 KB decodificados incrementalmente; o sha256 do arquivo é
 * calculado no mesmo passe (disponível em `digest` ao final). Memória O(chunk).
 * Lança InvalidUtf8Error se um arquivo tratado como UTF-8 tiver bytes inválidos.
 */
export class FileTextStream {
  digest: string | null = null;

  constructor(
    private file: File,
    private encoding: Encoding,
    private onBytes?: (read: number, total: number) => void,
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<string> {
    const total = this.file.size ?? 0;
    const hash = sha256.create();
    const decoder = new Utf8StreamDecoder();
    const h = this.file.open(FileMode.ReadOnly);
    let read = 0;
    try {
      for (;;) {
        const chunk = h.readBytes(CHUNK_BYTES);
        if (!chunk.length) break;
        read += chunk.length;
        hash.update(chunk);
        this.onBytes?.(read, total);
        yield this.encoding === 'utf-8' ? decoder.decode(chunk, false) : decodeCp1252(chunk);
      }
      if (this.encoding === 'utf-8') {
        const tail = decoder.decode(new Uint8Array(0), true);
        if (tail) yield tail;
      }
      this.digest = bytesToHex(hash.digest());
    } finally {
      h.close();
    }
  }
}
