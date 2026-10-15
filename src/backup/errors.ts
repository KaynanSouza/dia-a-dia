export type BackupErrorCode =
  | 'weak_password'
  | 'not_a_backup'
  | 'unsupported_format'
  | 'newer_schema'
  | 'old_schema'
  | 'bad_password_or_corrupted'
  | 'integrity'
  | 'too_large'
  | 'invalid_kdf'
  | 'swap_failed';

export class BackupError extends Error {
  constructor(public code: BackupErrorCode) {
    super(code);
    this.name = 'BackupError';
  }
}

export const BACKUP_ERROR_MESSAGE: Record<BackupErrorCode, string> = {
  weak_password: 'Use uma senha com pelo menos 12 caracteres.',
  not_a_backup: 'Este arquivo não é um backup do Dia a Dia.',
  unsupported_format: 'Formato de backup não suportado por esta versão do app.',
  newer_schema: 'Este backup foi criado por uma versão mais nova. Atualize o app para restaurá-lo.',
  old_schema: 'Este backup é antigo demais para ser restaurado.',
  bad_password_or_corrupted: 'Senha incorreta ou arquivo danificado.',
  integrity: 'O arquivo de backup está corrompido.',
  too_large: 'Arquivo grande demais.',
  invalid_kdf: 'Parâmetros de criptografia inválidos no arquivo.',
  swap_failed: 'Não foi possível concluir a restauração. Seus dados atuais foram mantidos.',
};
