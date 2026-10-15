// F-07: equivalente local do schema financeiro (sem auth/RLS/household).
export const M0002_FINANCE = /* sql */ `
CREATE TABLE accounts (
  id            TEXT    PRIMARY KEY,
  name          TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  kind          TEXT    NOT NULL CHECK (kind IN ('checking', 'savings', 'credit_card', 'cash', 'investment')),
  institution   TEXT    CHECK (length(institution) <= 60),
  number_last4  TEXT    CHECK (number_last4 IS NULL OR number_last4 GLOB '[0-9][0-9][0-9][0-9]'), -- só os 4 últimos
  currency      TEXT    NOT NULL DEFAULT 'BRL' CHECK (length(currency) = 3),
  created_at    INTEGER NOT NULL,
  archived_at   INTEGER
) STRICT;

CREATE TABLE categories (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 40),
  kind        TEXT    NOT NULL CHECK (kind IN ('expense', 'income', 'transfer')),
  parent_id   TEXT    REFERENCES categories (id) ON DELETE SET NULL,
  created_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE category_rules (
  id           TEXT    PRIMARY KEY,
  category_id  TEXT    NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
  match_type   TEXT    NOT NULL CHECK (match_type IN ('contains', 'starts_with', 'equals', 'regex')),
  pattern      TEXT    NOT NULL CHECK (length(pattern) BETWEEN 1 AND 120),
  priority     INTEGER NOT NULL DEFAULT 100,
  created_at   INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_rules_priority ON category_rules (priority);

CREATE TABLE imports (
  id              TEXT    PRIMARY KEY,
  account_id      TEXT    REFERENCES accounts (id) ON DELETE CASCADE,
  source          TEXT    NOT NULL CHECK (source IN ('csv', 'manual')),
  parser          TEXT    NOT NULL,
  file_sha256     TEXT    NOT NULL CHECK (length(file_sha256) = 64),
  rows_total      INTEGER NOT NULL,
  rows_imported   INTEGER NOT NULL,
  rows_duplicate  INTEGER NOT NULL,
  imported_at     INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_imports_file ON imports (account_id, file_sha256);

CREATE TABLE transactions (
  id                TEXT    PRIMARY KEY,
  account_id        TEXT    NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  posted_on         TEXT    NOT NULL CHECK (posted_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  amount_cents      INTEGER NOT NULL,
  description       TEXT    NOT NULL CHECK (length(description) <= 200),
  description_norm  TEXT    NOT NULL,
  category_id       TEXT    REFERENCES categories (id) ON DELETE SET NULL,
  categorized_by    TEXT    NOT NULL DEFAULT 'none' CHECK (categorized_by IN ('none', 'rule', 'user')),
  fingerprint       TEXT    NOT NULL CHECK (length(fingerprint) = 64),
  import_id         TEXT    REFERENCES imports (id) ON DELETE SET NULL,
  notes             TEXT    CHECK (length(notes) <= 500),
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
) STRICT;
CREATE UNIQUE INDEX ux_tx_fingerprint  ON transactions (account_id, fingerprint);
CREATE INDEX idx_tx_account_date       ON transactions (account_id, posted_on DESC);
CREATE INDEX idx_tx_date               ON transactions (posted_on DESC);
CREATE INDEX idx_tx_category           ON transactions (category_id);

INSERT INTO categories (id, name, kind, created_at) VALUES
  ('cat_alimentacao',   'Alimentação',   'expense',  0),
  ('cat_mercado',       'Mercado',       'expense',  0),
  ('cat_moradia',       'Moradia',       'expense',  0),
  ('cat_transporte',    'Transporte',    'expense',  0),
  ('cat_saude',         'Saúde',         'expense',  0),
  ('cat_lazer',         'Lazer',         'expense',  0),
  ('cat_assinaturas',   'Assinaturas',   'expense',  0),
  ('cat_outros',        'Outros',        'expense',  0),
  ('cat_salario',       'Salário',       'income',   0),
  ('cat_transferencia', 'Transferência', 'transfer', 0);

INSERT INTO category_rules (id, category_id, match_type, pattern, priority, created_at) VALUES
  ('rule_ifood',   'cat_alimentacao',   'contains', 'ifood',    10, 0),
  ('rule_uber',    'cat_transporte',    'contains', 'uber',     10, 0),
  ('rule_99',      'cat_transporte',    'contains', '99app',    10, 0),
  ('rule_netflix', 'cat_assinaturas',   'contains', 'netflix',  10, 0),
  ('rule_spotify', 'cat_assinaturas',   'contains', 'spotify',  10, 0),
  ('rule_farm',    'cat_saude',         'contains', 'drogaria', 20, 0),
  ('rule_pix',     'cat_transferencia', 'contains', 'pix',      90, 0),
  ('rule_ted',     'cat_transferencia', 'contains', 'ted ',     90, 0);
`;
