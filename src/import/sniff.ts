import { decodeCp1252, isValidUtf8, utf8Decode } from '@/lib/text';
import { ImportError } from './limits';
import { findHeaderRow } from './profiles/detect';
import type { Delimiter, Encoding } from './profiles/types';
import { CsvTokenizer, detectDelimiter } from './stream/csv-tokenizer';

export type Sniffed = {
  encoding: Encoding;
  delimiter: Delimiter;
  /** -1 quando nenhum cabeçalho conhecido foi encontrado (mapeamento manual) */
  detectedHeaderRow: number;
  headerRow: number;
  headers: string[];
  /** primeiras linhas do arquivo (inclui cabeçalho) */
  rows: string[][];
};

/** Assinaturas de formatos que não são CSV, para dar uma mensagem útil. */
function rejectNonCsv(head: Uint8Array) {
  const starts = (...sig: number[]) => sig.every((b, i) => head[i] === b);
  if (starts(0x50, 0x4b, 0x03, 0x04)) throw new ImportError('xlsx'); // ZIP (.xlsx/.ods)
  if (starts(0xd0, 0xcf, 0x11, 0xe0)) throw new ImportError('xlsx'); // .xls antigo
  if (starts(0x25, 0x50, 0x44, 0x46)) throw new ImportError('pdf'); // %PDF
  const text = decodeCp1252(head.subarray(0, 512)).trimStart().toUpperCase();
  if (text.startsWith('OFXHEADER') || text.startsWith('<OFX')) throw new ImportError('ofx');
  // binário qualquer: muitos bytes NUL (UTF-16 também cai aqui)
  let nul = 0;
  for (let i = 0; i < Math.min(head.length, 4096); i++) if (head[i] === 0) nul++;
  if (nul > 8) throw new ImportError('not_csv');
}

function decodeHead(head: Uint8Array): { encoding: Encoding; text: string } {
  if (!isValidUtf8(head)) return { encoding: 'windows-1252', text: decodeCp1252(head) };
  // o bloco pode terminar no meio de um caractere multibyte
  for (let cut = 0; cut < 4; cut++) {
    try {
      return { encoding: 'utf-8', text: utf8Decode(head.subarray(0, head.length - cut)) };
    } catch {}
  }
  return { encoding: 'windows-1252', text: decodeCp1252(head) };
}

/**
 * Sniffing do começo do arquivo: encoding, delimitador, linha de cabeçalho e amostra.
 * `complete` = o bloco contém o arquivo inteiro (senão a última linha pode estar cortada).
 */
export function sniffHead(head: Uint8Array, complete: boolean, maxRows = 40): Sniffed {
  if (!head.length) throw new ImportError('empty');
  rejectNonCsv(head);

  const decoded = decodeHead(head);
  let text = decoded.text.replace(/^﻿/, '');
  if (!complete) text = text.slice(0, Math.max(text.lastIndexOf('\n'), 0));
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  const tok = new CsvTokenizer(delimiter);
  const push = (r: string[]) => rows.length < maxRows && rows.push(r);
  tok.push(text, push);
  tok.end(push);
  if (!rows.length) throw new ImportError('empty');

  const detectedHeaderRow = findHeaderRow(rows);
  const headerRow = detectedHeaderRow >= 0 ? detectedHeaderRow : 0;
  return { encoding: decoded.encoding, delimiter, detectedHeaderRow, headerRow, headers: rows[headerRow], rows };
}
