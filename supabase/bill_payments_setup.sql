-- ============================================================
-- BILL PAYMENTS TABLE
-- Records actual payments made against branch bills.
-- period_covered is a 'YYYY-MM' string manually chosen
-- by the branch manager at the time of recording.
-- ============================================================

DROP TABLE IF EXISTS bill_payments;

CREATE TABLE bill_payments (
  id              TEXT          PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  branch_id       TEXT          NOT NULL,
  bill_id         TEXT          NOT NULL REFERENCES branch_bills(id) ON DELETE CASCADE,
  period_covered  TEXT          NOT NULL,         -- 'YYYY-MM'
  amount_paid     NUMERIC(12,2) NOT NULL,
  paid_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  notes           TEXT,
  receipt_image   TEXT,
  recorded_by     TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bill_payments_branch_id ON bill_payments (branch_id);
CREATE INDEX idx_bill_payments_bill_id   ON bill_payments (bill_id);
CREATE INDEX idx_bill_payments_period    ON bill_payments (branch_id, period_covered);
CREATE INDEX idx_bill_payments_paid_at   ON bill_payments (paid_at DESC);
