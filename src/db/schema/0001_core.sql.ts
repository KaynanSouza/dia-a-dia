// Append-only: nunca editar depois de publicado (o runner verifica o checksum).
export const M0001_CORE = /* sql */ `
-- Configurações não sensíveis. As de segurança (PIN, timeout, biometria) ficam no SecureStore.
CREATE TABLE app_settings (
  key         TEXT    PRIMARY KEY CHECK (length(key) BETWEEN 1 AND 64),
  value       TEXT    NOT NULL CHECK (json_valid(value)),
  updated_at  INTEGER NOT NULL DEFAULT (CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))
) STRICT, WITHOUT ROWID;

INSERT INTO app_settings (key, value) VALUES
  ('backup.reminder_enabled',   'true'),
  ('backup.last_at',            'null'),
  ('import.csv_retention_days', '30'),
  ('log.max_age_days',          '7'),
  ('log.max_bytes',             '1048576'),
  ('ui.mask_sensitive',         'true');

-- F-05: diagnóstico local. Sem dados financeiros (sanitize.ts + limites de tamanho).
CREATE TABLE event_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  level       TEXT    NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  event       TEXT    NOT NULL CHECK (length(event) BETWEEN 1 AND 64),
  context     TEXT    CHECK (context IS NULL OR (json_valid(context) AND length(context) <= 2048)),
  session_id  TEXT    NOT NULL CHECK (length(session_id) = 16),
  app_version TEXT    NOT NULL CHECK (length(app_version) <= 32),
  size_bytes  INTEGER GENERATED ALWAYS AS (48 + length(event) + length(app_version) + coalesce(length(context), 0)) STORED
) STRICT;

CREATE INDEX idx_event_log_ts    ON event_log (ts);
CREATE INDEX idx_event_log_level ON event_log (level, ts);
`;
