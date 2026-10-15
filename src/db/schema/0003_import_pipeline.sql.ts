// Épico 2: ledger, import_logs, perfis, árvore de categorias, regras, dicionário e cache do modelo.
// Reconstrói as tabelas do 0002 (SQLite não altera constraints) preservando os dados existentes.
// Roda dentro da transação do runner: defer_foreign_keys adia a checagem de FKs até o COMMIT.
export const M0003_IMPORT_PIPELINE = /* sql */ `
PRAGMA defer_foreign_keys = ON;

ALTER TABLE transactions   RENAME TO _v2_transactions;
ALTER TABLE imports        RENAME TO _v2_imports;
ALTER TABLE category_rules RENAME TO _v2_category_rules;
ALTER TABLE categories     RENAME TO _v2_categories;

-- Índices acompanham a tabela renomeada e manteriam o nome: libera os nomes para o novo schema
DROP INDEX ux_tx_fingerprint;
DROP INDEX idx_tx_account_date;
DROP INDEX idx_tx_date;
DROP INDEX idx_tx_category;
DROP INDEX ux_imports_file;
DROP INDEX idx_rules_priority;

-- ───────────── Árvore de categorias (padrão + customizável) ─────────────
-- kind define o tipo do lançamento: transfer/card_payment ficam FORA do dashboard (evita contagem dupla).
CREATE TABLE categories (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 40),
  parent_id    TEXT    REFERENCES categories (id) ON DELETE RESTRICT,
  kind         TEXT    NOT NULL CHECK (kind IN ('expense', 'income', 'transfer', 'card_payment')),
  color        TEXT    CHECK (color IS NULL OR color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
  is_system    INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  archived_at  INTEGER,
  created_at   INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_categories_name ON categories (coalesce(parent_id, ''), name);
CREATE INDEX idx_categories_parent ON categories (parent_id);

-- ───────────── Perfis de importação customizados (os padrão vêm no bundle) ─────────────
CREATE TABLE import_profiles (
  id           TEXT    PRIMARY KEY,
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  bank         TEXT    NOT NULL CHECK (length(bank) BETWEEN 1 AND 40),
  kind         TEXT    NOT NULL CHECK (kind IN ('checking', 'credit_card')),
  config       TEXT    NOT NULL CHECK (json_valid(config)),   -- ProfileConfig (colunas, sinal, delimitador…)
  signature    TEXT    NOT NULL,                              -- cabeçalhos normalizados para auto-detecção
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_import_profiles_signature ON import_profiles (signature, kind);

-- ───────────── Log de importação (unidade de desfazimento, 30 dias) ─────────────
CREATE TABLE import_logs (
  id              TEXT    PRIMARY KEY,
  account_id      TEXT    NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  profile_id      TEXT    NOT NULL,                           -- id de perfil embutido ou de import_profiles
  file_sha256     TEXT    NOT NULL CHECK (length(file_sha256) = 64),
  file_bytes      INTEGER NOT NULL CHECK (file_bytes >= 0),
  status          TEXT    NOT NULL CHECK (status IN ('committed', 'failed', 'undone')),
  rows_total      INTEGER NOT NULL DEFAULT 0,
  rows_imported   INTEGER NOT NULL DEFAULT 0,
  rows_duplicate  INTEGER NOT NULL DEFAULT 0,
  rows_error      INTEGER NOT NULL DEFAULT 0,
  rows_categorized INTEGER NOT NULL DEFAULT 0,
  error_code      TEXT    CHECK (length(error_code) <= 64),
  started_at      INTEGER NOT NULL,
  finished_at     INTEGER NOT NULL,
  undo_until      INTEGER,                                    -- finished_at + 30 dias (NULL se não desfazível)
  undone_at       INTEGER
) STRICT;
-- Reimportar o mesmo arquivo na mesma conta enquanto estiver ativo → bloqueado
CREATE UNIQUE INDEX ux_import_logs_active_file ON import_logs (account_id, file_sha256) WHERE status = 'committed';
CREATE INDEX idx_import_logs_finished ON import_logs (finished_at DESC);

-- ───────────── Ledger ─────────────
CREATE TABLE transactions (
  id                   TEXT    PRIMARY KEY,
  account_id           TEXT    NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  import_log_id        TEXT    REFERENCES import_logs (id) ON DELETE SET NULL,
  posted_on            TEXT    NOT NULL CHECK (posted_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'), -- data local America/Sao_Paulo
  amount_cents         INTEGER NOT NULL,                      -- negativo = saída
  type                 TEXT    NOT NULL CHECK (type IN ('expense', 'income', 'transfer', 'card_payment')),
  description_raw      TEXT    NOT NULL CHECK (length(description_raw) <= 200),
  description_norm     TEXT    NOT NULL,                      -- normalização ESTÁVEL do hash (não mudar)
  merchant_key         TEXT    NOT NULL DEFAULT '',            -- normalização de categorização (camada 2)
  category_id          TEXT    REFERENCES categories (id) ON DELETE SET NULL,
  category_source      TEXT    NOT NULL DEFAULT 'none'
                       CHECK (category_source IN ('none', 'user_rule', 'dictionary', 'fuzzy', 'ml', 'manual', 'transfer_match')),
  category_confidence  REAL    CHECK (category_confidence IS NULL OR category_confidence BETWEEN 0 AND 1),
  installment_n        INTEGER CHECK (installment_n IS NULL OR installment_n BETWEEN 1 AND 99),
  installment_total    INTEGER CHECK (installment_total IS NULL OR installment_total BETWEEN 1 AND 99),
  occurrence_n         INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_n >= 1),
  dedup_hash           TEXT    NOT NULL CHECK (length(dedup_hash) = 64),
  transfer_peer_id     TEXT    REFERENCES transactions (id) ON DELETE SET NULL,
  notes                TEXT    CHECK (length(notes) <= 500),
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
) STRICT;

-- Idempotência: sha256(v1|conta|data|centavos|descrição_norm|ocorrência)
CREATE UNIQUE INDEX ux_tx_dedup ON transactions (dedup_hash);
-- Dashboard: range por data + filtro de tipo + agrupamento por categoria, coberto (sem lookup na tabela)
CREATE INDEX idx_tx_dashboard ON transactions (posted_on, type, category_id, amount_cents);
CREATE INDEX idx_tx_account_date ON transactions (account_id, posted_on DESC);
CREATE INDEX idx_tx_merchant ON transactions (merchant_key, category_source);
CREATE INDEX idx_tx_import ON transactions (import_log_id);
CREATE INDEX idx_tx_category ON transactions (category_id, posted_on);

-- ───────────── Regras do usuário (camada 1) ─────────────
CREATE TABLE categorization_rules (
  id           TEXT    PRIMARY KEY,
  category_id  TEXT    NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  match_type   TEXT    NOT NULL CHECK (match_type IN ('merchant', 'contains', 'starts_with', 'equals', 'regex')),
  pattern      TEXT    NOT NULL CHECK (length(pattern) BETWEEN 1 AND 120),
  account_id   TEXT    REFERENCES accounts (id) ON DELETE CASCADE, -- NULL = todas as contas
  priority     INTEGER NOT NULL DEFAULT 100,
  source       TEXT    NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'apply_similar')),
  hits         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_rules_pattern ON categorization_rules (match_type, pattern, coalesce(account_id, ''));
CREATE INDEX idx_rules_priority ON categorization_rules (priority, created_at);

-- ───────────── Dicionário de estabelecimentos (camada 3/4) ─────────────
CREATE TABLE merchant_dictionary (
  key           TEXT    PRIMARY KEY CHECK (length(key) BETWEEN 2 AND 60),  -- tokens normalizados
  display_name  TEXT    NOT NULL,
  category_id   TEXT    NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  source        TEXT    NOT NULL CHECK (source IN ('builtin', 'user')),
  version       INTEGER NOT NULL DEFAULT 1,
  updated_at    INTEGER NOT NULL
) STRICT, WITHOUT ROWID;
CREATE INDEX idx_dictionary_category ON merchant_dictionary (category_id);

-- ───────────── Cache do classificador local (camada 5) ─────────────
CREATE TABLE ml_model_cache (
  id              TEXT    PRIMARY KEY,                        -- ex.: 'tfidf-nb'
  model_version   INTEGER NOT NULL,
  training_hash   TEXT    NOT NULL CHECK (length(training_hash) = 64),
  n_samples       INTEGER NOT NULL,
  n_features      INTEGER NOT NULL,
  n_classes       INTEGER NOT NULL,
  payload         TEXT    NOT NULL CHECK (json_valid(payload)),
  trained_at      INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

-- ───────────── Migração de dados do Épico 1 ─────────────
INSERT INTO categories (id, name, parent_id, kind, is_system, created_at)
  SELECT id, name, NULL, kind, CASE WHEN id GLOB 'cat_*' THEN 1 ELSE 0 END, created_at FROM _v2_categories;

INSERT INTO import_logs (id, account_id, profile_id, file_sha256, file_bytes, status, rows_total, rows_imported,
                         rows_duplicate, started_at, finished_at, undo_until)
  SELECT id, account_id, 'legacy:' || parser, file_sha256, 0, 'committed', rows_total, rows_imported, rows_duplicate,
         imported_at, imported_at, imported_at + 2592000000
  FROM _v2_imports WHERE account_id IS NOT NULL;

INSERT INTO transactions (id, account_id, import_log_id, posted_on, amount_cents, type, description_raw, description_norm,
                          category_id, category_source, occurrence_n, dedup_hash, notes, created_at, updated_at)
  SELECT t.id, t.account_id, t.import_id, t.posted_on, t.amount_cents,
         CASE WHEN c.kind IS NOT NULL THEN c.kind WHEN t.amount_cents < 0 THEN 'expense' ELSE 'income' END,
         t.description, t.description_norm, t.category_id,
         CASE t.categorized_by WHEN 'user' THEN 'manual' WHEN 'rule' THEN 'dictionary' ELSE 'none' END,
         1, t.fingerprint, t.notes, t.created_at, t.updated_at
  FROM _v2_transactions t LEFT JOIN _v2_categories c ON c.id = t.category_id;

-- Regras do usuário (as 'rule_*' eram padrões e passam a viver no dicionário)
INSERT INTO categorization_rules (id, category_id, match_type, pattern, priority, source, created_at)
  SELECT id, category_id, match_type, lower(pattern), priority, 'user', created_at
  FROM _v2_category_rules WHERE id NOT GLOB 'rule_*';

DROP TABLE _v2_transactions;
DROP TABLE _v2_category_rules;
DROP TABLE _v2_imports;
DROP TABLE _v2_categories;

INSERT INTO app_settings (key, value) VALUES
  ('import.max_bytes',      '10485760'),
  ('import.max_rows',       '50000'),
  ('import.undo_days',      '30'),
  ('dictionary.version',    '0'),
  ('ml.min_confidence',     '0.6')
ON CONFLICT (key) DO NOTHING;
`;
