export const IMPORT_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxRows: 50_000,
  undoDays: 30,
  /** linhas por INSERT multi-VALUES (14 colunas × 150 = 2100 parâmetros) */
  insertBatch: 150,
} as const;

export class ImportError extends Error {
  constructor(
    public code:
      | 'too_large'
      | 'too_many_rows'
      | 'empty'
      | 'not_csv'
      | 'xlsx'
      | 'pdf'
      | 'ofx'
      | 'file_access'
      | 'no_header'
      | 'no_rows'
      | 'already_imported'
      | 'encoding'
      | 'mapping'
      | 'db_busy'
      | 'commit_failed',
    /** detalhe técnico (ex.: por que o arquivo não pôde ser lido) — só exibido na tela */
    public detail?: string,
  ) {
    super(code);
    this.name = 'ImportError';
  }
}

/** Detalhe técnico curto de um erro inesperado (fica só na tela; não vai para o event_log). */
export const errorDetail = (e: unknown) =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(/\s+/g, ' ').slice(0, 200);

export const IMPORT_ERROR_MESSAGE: Record<ImportError['code'], string> = {
  too_large: 'Arquivo grande demais (máximo 10 MB).',
  too_many_rows: 'O arquivo tem mais de 50 mil linhas. Divida o período em arquivos menores.',
  empty: 'O arquivo está vazio.',
  not_csv: 'Este arquivo não parece ser um CSV. Exporte o extrato do banco no formato CSV.',
  xlsx: 'Este arquivo é uma planilha Excel. Abra-o e salve como CSV, ou exporte o extrato do banco em CSV.',
  pdf: 'Este arquivo é um PDF. O app importa apenas extratos em CSV (no Nubank: "Exportar extrato" → CSV).',
  ofx: 'Este arquivo é OFX. Por enquanto o app importa apenas CSV.',
  file_access: 'Não foi possível ler o arquivo escolhido. Se ele está só na nuvem (Drive/OneDrive), abra-o uma vez para baixar e tente de novo.',
  no_header: 'Não encontramos o cabeçalho do extrato. Verifique se é um CSV exportado pelo banco.',
  no_rows: 'Nenhum lançamento válido encontrado com esse mapeamento.',
  already_imported: 'Este arquivo já foi importado nesta conta.',
  encoding: 'Não foi possível ler o arquivo (codificação desconhecida).',
  mapping: 'Escolha as colunas de data, descrição e valor.',
  db_busy: 'Outra operação está usando o banco. Tente novamente.',
  commit_failed: 'Falha ao gravar. Nenhuma transação foi importada.',
};
