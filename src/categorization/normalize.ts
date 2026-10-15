/**
 * Camada 2: normalização para CATEGORIZAÇÃO (agressiva, pode evoluir).
 * Não confundir com normalizeDescription() do hash de deduplicação, que é estável por contrato.
 */
export type Installment = { n: number; total: number };

export type NormalizedDescription = {
  /** texto limpo: sem acentos, prefixos bancários, datas, parcelas, máscaras de cartão e números longos */
  clean: string;
  tokens: string[];
  /** até 3 tokens significativos: chave de agrupamento do estabelecimento ("Aplicar a todas as parecidas") */
  merchantKey: string;
  installment: Installment | null;
  flags: { pix: boolean; transfer: boolean; cardPayment: boolean; withdrawal: boolean; refund: boolean };
};

const STOP = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'no', 'na', 'para', 'por', 'com', 'a', 'o', 'ltda', 'me', 'sa', 'eireli', 'epp', 'cia',
  'br', 'bra', 'brasil', 'com', 'www',
]);

// Prefixos de meio de pagamento / tipo de lançamento: dizem COMO pagou, não ONDE
const NOISE_PHRASES = [
  'compra com cartao de debito', 'compra com cartao de credito', 'compra no debito', 'compra no credito', 'compra cartao debito',
  'compra cartao credito', 'compra com cartao', 'compra cartao', 'compra debito', 'compra credito', 'compra aprovada', 'compra',
  'pix enviado', 'pix recebido', 'pix transf', 'pix qrs', 'pix qr code', 'transferencia enviada pelo pix', 'transferencia recebida pelo pix',
  'transferencia enviada', 'transferencia recebida', 'transferencia pix', 'deb automatico', 'debito automatico', 'deb aut', 'db aut',
  // bandeira abreviada só junto do tipo ("DEB MC"), para não comer o "MC" de "MC DONALDS"
  'debito mc', 'credito mc', 'deb mc', 'cred mc', 'deb vs', 'cred vs', 'deb el', 'cred el',
  'pagamento de boleto', 'pagto boleto', 'pag boleto', 'boleto', 'pagamento', 'pagto', 'pgto', 'pag', 'elo', 'visa', 'mastercard',
  'maestro', 'master', 'contactless', 'aproximacao', 'internacional', 'nacional', 'rec', 'env', 'deb', 'cred', 'debito', 'credito', 'pix',
];
const NOISE_RE = new RegExp(`\\b(?:${NOISE_PHRASES.map((p) => p.replace(/ /g, '\\s+')).join('|')})\\b`, 'g');

// Facilitadores antes de "*": "MP *LOJA", "PAG*JOAO", "SUMUP *PADARIA" → mantém só o estabelecimento
const FACILITATOR_RE = /\b(?:mp|mercadopago|mercado pago|pg|pag|pags|pagseguro|sumup|paypal|stone|cielo|getnet|rede|ec|dl|ppro|zp|ebanx|iz|pay)\s*\*\s*/g;

const INSTALLMENT_RES = [
  /\bparc(?:ela)?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\b/,
  /\b(\d{1,2})\s*\/\s*(\d{1,2})\s*$/,
  /\b(\d{1,2})\s+de\s+(\d{1,2})\s*$/,
];

/** Mesma filtragem de tokens das descrições, para chaves do dicionário e regras. */
export const significantTokens = (text: string) => text.split(' ').filter((t) => t && !STOP.has(t));

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalizeForCategorization(raw: string): NormalizedDescription {
  let s = stripAccents(raw).toLowerCase();

  const flags = {
    pix: /\bpix\b/.test(s),
    transfer: /\b(transf|transferencia|ted|doc|tev|transf\.?\s*entre)\b/.test(s),
    cardPayment: /\b(pagamento|pagto|pgto|pag)\s*(de\s*)?(da\s*)?(fatura|fat)\b|\bpagamento (recebido|efetuado)\b|\bfatura cartao\b/.test(s),
    withdrawal: /\bsaque\b/.test(s),
    refund: /\b(estorno|reembolso|devolucao|cancelamento)\b/.test(s),
  };

  let installment: Installment | null = null;
  for (const re of INSTALLMENT_RES) {
    const m = re.exec(s);
    if (m) {
      const n = Number(m[1]);
      const total = Number(m[2]);
      if (n >= 1 && total >= 2 && n <= total && total <= 48) {
        installment = { n, total };
        s = s.replace(re, ' ');
        break;
      }
    }
  }

  s = s
    .replace(/\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/g, ' ') // datas
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ') // horas
    .replace(/(?:\*{2,}|x{2,})\s*\d{4}\b/g, ' ') // máscara de cartão
    .replace(/\b\d{2,3}\.?\d{3}\.?\d{3}[/-]?\d{0,4}-?\d{0,2}\b/g, ' ') // CPF/CNPJ
    .replace(FACILITATOR_RE, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ') // "*", "&", ".", "-"…
    .replace(/\b\d{4,}\b/g, ' ') // documentos, ids, agências
    .replace(/\s+/g, ' ')
    .trim();

  const cleaned = s.replace(NOISE_RE, ' ').replace(/\s+/g, ' ').trim();
  const clean = cleaned || s; // se só sobrou ruído ("PIX"), mantém o texto antes da limpeza
  const tokens = significantTokens(clean);
  const merchantKey = tokens.filter((t) => !/^\d+$/.test(t)).slice(0, 3).join(' ');

  return { clean, tokens, merchantKey, installment, flags };
}
