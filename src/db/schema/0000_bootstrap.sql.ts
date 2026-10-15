export const BOOTSTRAP_SQL = /* sql */ `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  checksum    TEXT    NOT NULL CHECK (length(checksum) = 64),
  applied_at  INTEGER NOT NULL
) STRICT;
`;
