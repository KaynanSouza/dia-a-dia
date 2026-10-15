import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import { copyAsync } from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type PickedDocument = { uri: string; name: string; size: number | null; mimeType: string | null };

export class FileAccessError extends Error {
  constructor(public detail: string) {
    super('file_access');
    this.name = 'FileAccessError';
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super('too_large');
    this.name = 'FileTooLargeError';
  }
}

/**
 * Seletor do sistema (Downloads, Drive, WhatsApp, anexos de e-mail, cartão SD...).
 * Android: NÃO copia para o cache — devolve a URI content:// do documento. A cópia do
 * picker vai para o cache do app hospedeiro, que no Expo Go fica fora das pastas
 * liberadas para o app (leitura negada). iOS: a cópia é o caminho suportado.
 */
export async function pickDocument(type: string | string[] = '*/*'): Promise<PickedDocument | null> {
  const r = await DocumentPicker.getDocumentAsync({ type, multiple: false, copyToCacheDirectory: Platform.OS !== 'android' });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  return { uri: a.uri, name: a.name ?? 'arquivo', size: a.size ?? null, mimeType: a.mimeType ?? null };
}

const CHUNK = 256 * 1024;

/** Streaming via file descriptor: memória O(chunk). Funciona com documentos SAF e file://. */
function streamCopy(src: File, dest: File, maxBytes: number): number {
  const input = src.open(FileMode.ReadOnly);
  const output = dest.open(FileMode.Truncate);
  let total = 0;
  try {
    for (;;) {
      const chunk = input.readBytes(CHUNK);
      if (!chunk.length) break;
      total += chunk.length;
      if (total > maxBytes) throw new FileTooLargeError();
      output.writeBytes(chunk);
    }
  } finally {
    input.close();
    output.close();
  }
  return total;
}

/** InputStream inteiro: serve para provedores sem file descriptor (nuvem/streams). */
async function bufferCopy(src: File, dest: File, maxBytes: number): Promise<number> {
  const bytes = await src.bytes();
  if (bytes.length > maxBytes) throw new FileTooLargeError();
  dest.write(bytes);
  return bytes.length;
}

/** API legada: o módulo nativo antigo lê content:// pelo ContentResolver. */
async function legacyCopy(src: File, dest: File, maxBytes: number): Promise<number> {
  await copyAsync({ from: src.uri, to: dest.uri });
  const size = dest.size ?? 0;
  if (size > maxBytes) throw new FileTooLargeError();
  return size;
}

/**
 * Copia o documento escolhido para `dest` (pasta privada do app), tentando várias estratégias
 * até uma funcionar. Lança FileTooLargeError ou FileAccessError (com o detalhe de cada tentativa).
 */
export async function copyPickedTo(doc: PickedDocument, dest: File, maxBytes: number): Promise<number> {
  if (doc.size !== null && doc.size > maxBytes) throw new FileTooLargeError();
  const src = new File(doc.uri);
  const attempts: string[] = [];
  const strategies: [string, () => Promise<number> | number][] = [
    ['stream', () => streamCopy(src, dest, maxBytes)],
    ['buffer', () => bufferCopy(src, dest, maxBytes)],
    ['legacy', () => legacyCopy(src, dest, maxBytes)],
  ];

  let readEmpty = false;
  for (const [name, run] of strategies) {
    try {
      if (dest.exists) dest.delete();
      dest.create();
      const n = await run();
      if (n > 0) return n;
      // provedor sem tamanho pode devolver 0 bytes no streaming: confirma com a próxima estratégia
      readEmpty = true;
      attempts.push(`${name}: 0 bytes`);
    } catch (e) {
      if (e instanceof FileTooLargeError) {
        if (dest.exists) dest.delete();
        throw e;
      }
      attempts.push(`${name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120));
    }
  }
  if (readEmpty) return 0; // arquivo de fato vazio (o chamador decide a mensagem)
  if (dest.exists) dest.delete();
  throw new FileAccessError(attempts.join(' | '));
}

/** Apaga a cópia temporária que o seletor fez no cache (iOS). URIs content:// não são nossas. */
export function releasePicked(doc: PickedDocument) {
  try {
    if (doc.uri.startsWith(Paths.cache.uri)) {
      const f = new File(doc.uri);
      if (f.exists) f.delete();
    }
  } catch {}
}
