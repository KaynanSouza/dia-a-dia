/**
 * Épico 3 — contas a pagar, lembretes locais e transações manuais.
 * Datas de vencimento são datas de CALENDÁRIO ('YYYY-MM-DD') no fuso do aparelho; horários de disparo
 * são epoch ms calculados no fuso do aparelho no momento do agendamento (reagendado se o fuso mudar).
 */
export const M0004_BILLS = /* sql */ `
-- ── Regras de conta (recorrente ou avulsa)
CREATE TABLE bill_templates (
  id              TEXT    PRIMARY KEY,
  name            TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  amount_kind     TEXT    NOT NULL DEFAULT 'fixed' CHECK (amount_kind IN ('fixed', 'variable')),
  amount_cents    INTEGER CHECK (amount_cents IS NULL OR amount_cents > 0),   -- valor positivo; NULL se variável
  category_id     TEXT    REFERENCES categories (id) ON DELETE SET NULL,
  account_id      TEXT    REFERENCES accounts (id) ON DELETE SET NULL,     -- conta de onde sai o pagamento
  payment_method  TEXT    CHECK (payment_method IS NULL OR payment_method IN ('boleto', 'pix', 'debito_automatico', 'cartao', 'dinheiro', 'transferencia', 'outro')),
  notes           TEXT    CHECK (notes IS NULL OR length(notes) <= 500),
  barcode         TEXT    CHECK (barcode IS NULL OR length(barcode) <= 60), -- código de barras / linha digitável (só dígitos)
  dtstart         TEXT    NOT NULL CHECK (dtstart GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  rrule           TEXT    CHECK (rrule IS NULL OR length(rrule) <= 200),   -- RFC 5545 (subconjunto); NULL = avulsa
  weekend_shift   TEXT    NOT NULL DEFAULT 'none' CHECK (weekend_shift IN ('none', 'next', 'previous')),
  reminders       TEXT,                                                     -- JSON [7,3,1,0] (dias antes); NULL = padrão global
  active          INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  generated_until TEXT,                                                     -- até onde as instâncias já foram geradas
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
) STRICT;

-- ── Ocorrências concretas (pré-geradas numa janela rolante de 90 dias)
CREATE TABLE bill_instances (
  id              TEXT    PRIMARY KEY,
  template_id     TEXT    NOT NULL REFERENCES bill_templates (id) ON DELETE CASCADE,
  original_due    TEXT    NOT NULL,                                         -- data da regra (chave de idempotência)
  due_on          TEXT    NOT NULL CHECK (due_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'), -- após ajuste de fim de semana/edição
  amount_cents    INTEGER CHECK (amount_cents IS NULL OR amount_cents > 0),
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'skipped')),
  paid_on         TEXT    CHECK (paid_on IS NULL OR paid_on GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  paid_amount_cents INTEGER CHECK (paid_amount_cents IS NULL OR paid_amount_cents > 0),
  paid_tx_id      TEXT,                                                     -- transação vinculada (sem FK: evita ciclo; ver trigger)
  snoozed_until   INTEGER,                                                  -- "Lembrar amanhã" (epoch ms)
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  CHECK ((status = 'paid') = (paid_on IS NOT NULL))
) STRICT;

CREATE UNIQUE INDEX ux_bill_instance_rule ON bill_instances (template_id, original_due);
-- vencimentos pendentes por data (lista "A pagar", motor de lembretes, vínculo automático)
CREATE INDEX idx_bills_status_date ON bill_instances (status, due_on);
CREATE INDEX idx_bill_paid_tx ON bill_instances (paid_tx_id) WHERE paid_tx_id IS NOT NULL;

-- ── Espelho determinístico do que está agendado no SO
CREATE TABLE notification_schedule (
  id              TEXT    PRIMARY KEY,                                      -- hash(instance_id + rule_id): idempotente
  instance_id     TEXT    REFERENCES bill_instances (id) ON DELETE CASCADE,
  kind            TEXT    NOT NULL CHECK (kind IN ('bill_due', 'bill_overdue', 'bill_snooze', 'backup', 'test')),
  rule_id         TEXT    NOT NULL,                                         -- 'd7', 'd3', 'd1', 'd0', 'late1'..'late3', 'snooze'
  fire_at         INTEGER NOT NULL,                                         -- epoch ms (fuso do aparelho no agendamento)
  content_hash    TEXT    NOT NULL DEFAULT '',                              -- muda se nome/valor/privacidade mudarem → reagenda
  channel         TEXT    NOT NULL CHECK (channel IN ('bills', 'backup', 'subscriptions', 'general')),
  status          TEXT    NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'fired')),
  scheduled_at    INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_notif_fire_at ON notification_schedule (status, fire_at);
CREATE INDEX idx_notif_instance ON notification_schedule (instance_id);

-- ── Transações: origem e vínculo com conta paga
ALTER TABLE transactions ADD COLUMN origin TEXT NOT NULL DEFAULT 'csv' CHECK (origin IN ('csv', 'manual'));
ALTER TABLE transactions ADD COLUMN bill_instance_id TEXT REFERENCES bill_instances (id) ON DELETE SET NULL;
CREATE UNIQUE INDEX ux_tx_bill_instance ON transactions (bill_instance_id) WHERE bill_instance_id IS NOT NULL;
CREATE INDEX idx_tx_origin ON transactions (origin, posted_on);

-- Remover a transação que pagou uma conta (manual, "desfazer importação"...) reativa a conta.
CREATE TRIGGER trg_tx_delete_reopen_bill AFTER DELETE ON transactions
WHEN OLD.bill_instance_id IS NOT NULL
BEGIN
  UPDATE bill_instances
     SET status = 'pending', paid_on = NULL, paid_amount_cents = NULL, paid_tx_id = NULL,
         updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = OLD.bill_instance_id AND paid_tx_id = OLD.id;
END;

-- Desvincular (bill_instance_id → NULL) também reabre a conta paga por essa transação.
CREATE TRIGGER trg_tx_unlink_reopen_bill AFTER UPDATE OF bill_instance_id ON transactions
WHEN OLD.bill_instance_id IS NOT NULL AND (NEW.bill_instance_id IS NULL OR NEW.bill_instance_id <> OLD.bill_instance_id)
BEGIN
  UPDATE bill_instances
     SET status = 'pending', paid_on = NULL, paid_amount_cents = NULL, paid_tx_id = NULL,
         updated_at = CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
   WHERE id = OLD.bill_instance_id AND paid_tx_id = OLD.id;
END;
`;
