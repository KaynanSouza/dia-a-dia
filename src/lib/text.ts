/**
 * Decodificadores próprios (não dependem de TextDecoder, ausente/limitado em algumas versões do Hermes).
 * Utf8StreamDecoder aceita chunks com sequências multibyte cortadas na fronteira.
 */
export class InvalidUtf8Error extends Error {
  constructor() {
    super('invalid_utf8');
    this.name = 'InvalidUtf8Error';
  }
}

const flush = (codes: number[], out: string[]) => {
  if (codes.length) {
    out.push(String.fromCharCode.apply(null, codes));
    codes.length = 0;
  }
};

export class Utf8StreamDecoder {
  private carry: number[] = [];

  decode(chunk: Uint8Array, final = false): string {
    const bytes = this.carry.length ? Uint8Array.from([...this.carry, ...chunk]) : chunk;
    this.carry = [];
    const out: string[] = [];
    const codes: number[] = [];
    let i = 0;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) i = 3; // BOM

    while (i < bytes.length) {
      const b = bytes[i];
      let need = 0;
      let cp = 0;
      if (b < 0x80) {
        codes.push(b);
        i++;
        if (codes.length >= 8192) flush(codes, out);
        continue;
      } else if (b >= 0xc2 && b <= 0xdf) [need, cp] = [1, b & 0x1f];
      else if (b >= 0xe0 && b <= 0xef) [need, cp] = [2, b & 0x0f];
      else if (b >= 0xf0 && b <= 0xf4) [need, cp] = [3, b & 0x07];
      else throw new InvalidUtf8Error();

      if (i + need >= bytes.length) {
        // sequência cortada no fim do chunk: guarda para o próximo (ou erro se for o último)
        if (final) throw new InvalidUtf8Error();
        this.carry = Array.from(bytes.subarray(i));
        break;
      }
      for (let k = 1; k <= need; k++) {
        const c = bytes[i + k];
        if ((c & 0xc0) !== 0x80) throw new InvalidUtf8Error();
        cp = (cp << 6) | (c & 0x3f);
      }
      if ((need === 2 && cp < 0x800) || (need === 3 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) {
        throw new InvalidUtf8Error();
      }
      if (cp > 0xffff) {
        cp -= 0x10000;
        codes.push(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
      } else codes.push(cp);
      i += need + 1;
      if (codes.length >= 8192) flush(codes, out);
    }
    flush(codes, out);
    if (final && this.carry.length) throw new InvalidUtf8Error();
    return out.join('');
  }
}

// 0x80–0x9F do Windows-1252 (0xA0–0xFF coincidem com Latin-1)
const CP1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
];

export function decodeCp1252(bytes: Uint8Array): string {
  const out: string[] = [];
  const codes: number[] = [];
  for (const b of bytes) {
    codes.push(b >= 0x80 && b <= 0x9f ? CP1252_HIGH[b - 0x80] : b);
    if (codes.length >= 8192) flush(codes, out);
  }
  flush(codes, out);
  return out.join('');
}

export const utf8Decode = (bytes: Uint8Array) => new Utf8StreamDecoder().decode(bytes, true);

export function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    // o último chunk pode cortar um caractere: não é inválido por isso
    new Utf8StreamDecoder().decode(bytes, false);
    return true;
  } catch {
    return false;
  }
}

/** UTF-16 (Excel "Texto Unicode", alguns exports Windows): por BOM ou por bytes NUL alternados. */
export function detectUtf16(head: Uint8Array): 'le' | 'be' | null {
  if (head[0] === 0xff && head[1] === 0xfe) return 'le';
  if (head[0] === 0xfe && head[1] === 0xff) return 'be';
  const n = Math.min(head.length, 4096) & ~1;
  if (n < 8) return null;
  let evenNul = 0;
  let oddNul = 0;
  for (let i = 0; i < n; i += 2) {
    if (head[i] === 0) evenNul++;
    if (head[i + 1] === 0) oddNul++;
  }
  const half = n / 2;
  if (oddNul > half * 0.4 && evenNul < half * 0.05) return 'le';
  if (evenNul > half * 0.4 && oddNul < half * 0.05) return 'be';
  return null;
}

/** `atStart`: o bloco é o começo do arquivo (descarta o BOM). */
export function decodeUtf16(bytes: Uint8Array, order: 'le' | 'be', atStart = true): string {
  const out: string[] = [];
  const codes: number[] = [];
  const bom = (order === 'le' && bytes[0] === 0xff && bytes[1] === 0xfe) || (order === 'be' && bytes[0] === 0xfe && bytes[1] === 0xff);
  const start = atStart && bom ? 2 : 0;
  for (let i = start; i + 1 < bytes.length; i += 2) {
    codes.push(order === 'le' ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
    if (codes.length >= 8192) flush(codes, out);
  }
  flush(codes, out);
  return out.join('');
}

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
        i++;
      }
    }
    if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd; // surrogate solto
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return Uint8Array.from(out);
}
