import type { Delimiter } from '../profiles/types';

/**
 * Tokenizer CSV RFC 4180 incremental: recebe texto em pedaços arbitrários (inclusive cortando
 * aspas escapadas ou CRLF ao meio) e emite linhas completas. Memória O(maior linha).
 */
export class CsvTokenizer {
  private field = '';
  private row: string[] = [];
  private quoted = false;
  private quotePending = false; // viu '"' dentro de campo entre aspas; decide no próximo char
  private fieldStarted = false;
  private skipLf = false;

  constructor(private delimiter: Delimiter) {}

  push(text: string, onRow: (row: string[]) => void) {
    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (this.skipLf) {
        this.skipLf = false;
        if (c === '\n') continue;
      }

      if (this.quoted) {
        if (this.quotePending) {
          this.quotePending = false;
          if (c === '"') {
            this.field += '"';
            continue;
          }
          this.quoted = false; // fechou as aspas; processa c fora delas
        } else if (c === '"') {
          this.quotePending = true;
          continue;
        } else {
          this.field += c;
          continue;
        }
      }

      if (c === '"' && !this.fieldStarted) {
        this.quoted = true;
        this.fieldStarted = true;
      } else if (c === this.delimiter) {
        this.endField();
      } else if (c === '\n' || c === '\r') {
        this.endField();
        this.endRow(onRow);
        if (c === '\r') this.skipLf = true;
      } else {
        this.field += c;
        this.fieldStarted = true;
      }
    }
  }

  end(onRow: (row: string[]) => void) {
    if (this.quotePending) {
      this.quotePending = false;
      this.quoted = false;
    }
    if (this.fieldStarted || this.row.length) {
      this.endField();
      this.endRow(onRow);
    }
  }

  private endField() {
    this.row.push(this.field);
    this.field = '';
    this.fieldStarted = false;
  }

  private endRow(onRow: (row: string[]) => void) {
    const row = this.row;
    this.row = [];
    if (row.some((f) => f.trim() !== '')) onRow(row);
  }
}

export function detectDelimiter(sample: string): Delimiter {
  // conteúdo entre aspas não conta (descrições com vírgula, ex.: "LOJA X, SAO PAULO")
  const lines = sample.replace(/"(?:[^"]|"")*"/g, '""').split(/\r?\n/).slice(0, 15);
  const score = (d: string) => {
    const counts = lines.map((l) => l.split(d).length - 1).filter((n) => n > 0);
    if (!counts.length) return 0;
    // consistência entre linhas pesa mais que o total
    const mode = counts.sort((a, b) => counts.filter((x) => x === b).length - counts.filter((x) => x === a).length)[0];
    return counts.filter((n) => n === mode).length * 100 + mode;
  };
  const candidates: Delimiter[] = [';', ',', '\t'];
  return candidates.reduce((best, d) => (score(d) > score(best) ? d : best), candidates[0]);
}
