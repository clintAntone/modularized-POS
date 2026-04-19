-- ============================================================
-- PORTAL USERS TABLE
-- Limited-access accounts created by superadmin.
-- Each account has tab-level permissions defined in a JSONB
-- column. Portal users log in via the "portal" node on the
-- login screen and are routed to a filtered superadmin view.
--
-- permissions shape:
--   { "tabs": { "sales_hub": true, "archive": false, ... } }
-- ============================================================

CREATE TABLE IF NOT EXISTS portal_users (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  display_name   TEXT        NOT NULL,               -- shown in the UI, e.g. "OWNER"
  username       TEXT        NOT NULL UNIQUE,         -- login username (lowercase)
  login_pin      TEXT        NOT NULL,               -- salted hash (same as employees)
  pin_salt       TEXT        NOT NULL,
  permissions    JSONB       NOT NULL DEFAULT '{"tabs":{}}',
  is_superadmin  BOOLEAN     NOT NULL DEFAULT FALSE,  -- full access (replaces hardcoded ADMIN)
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     TEXT,                               -- creator username
  updated_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_portal_users_username ON portal_users (username);
CREATE INDEX IF NOT EXISTS idx_portal_users_active   ON portal_users (is_active);
