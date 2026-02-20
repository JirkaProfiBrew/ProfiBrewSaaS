-- Sprint 4: Orders & Finance — DB Schema Migration
-- Creates: deposits, orders, order_items, cashflow_categories, cashflows, cashflow_templates, cash_desks
-- Alters: stock_issues (is_reserved), stock_issue_lines (recipe_item_id)

-- ============================================================
-- DEPOSITS
-- ============================================================
CREATE TABLE IF NOT EXISTS deposits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  deposit_amount  DECIMAL NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposits_tenant ON deposits(tenant_id);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_number    TEXT NOT NULL,
  partner_id      UUID NOT NULL REFERENCES partners(id),
  contact_id      UUID REFERENCES contacts(id),
  status          TEXT NOT NULL DEFAULT 'draft',
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date   DATE,
  shipped_date    DATE,
  delivered_date  DATE,
  closed_date     DATE,
  shop_id         UUID REFERENCES shops(id),
  warehouse_id    UUID REFERENCES warehouses(id),
  total_excl_vat  DECIMAL DEFAULT 0,
  total_vat       DECIMAL DEFAULT 0,
  total_incl_vat  DECIMAL DEFAULT 0,
  total_deposit   DECIMAL DEFAULT 0,
  currency        TEXT DEFAULT 'CZK',
  stock_issue_id  UUID REFERENCES stock_issues(id),
  cashflow_id     UUID,
  notes           TEXT,
  internal_notes  TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(tenant_id, order_date);

-- ============================================================
-- ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  quantity        DECIMAL NOT NULL,
  unit_id         UUID REFERENCES units(id),
  unit_price      DECIMAL NOT NULL,
  vat_rate        DECIMAL DEFAULT 21,
  discount_pct    DECIMAL DEFAULT 0,
  total_excl_vat  DECIMAL,
  total_vat       DECIMAL,
  total_incl_vat  DECIMAL,
  deposit_id      UUID REFERENCES deposits(id),
  deposit_qty     DECIMAL DEFAULT 0,
  deposit_total   DECIMAL DEFAULT 0,
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item ON order_items(item_id);

-- ============================================================
-- CASHFLOW CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS cashflow_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  parent_id       UUID REFERENCES cashflow_categories(id),
  cashflow_type   TEXT NOT NULL,
  is_system       BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cf_categories_tenant ON cashflow_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cf_categories_parent ON cashflow_categories(parent_id);

-- ============================================================
-- CASHFLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS cashflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            TEXT,
  cashflow_type   TEXT NOT NULL,
  category_id     UUID REFERENCES cashflow_categories(id),
  amount          DECIMAL NOT NULL,
  currency        TEXT DEFAULT 'CZK',
  date            DATE NOT NULL,
  due_date        DATE,
  paid_date       DATE,
  status          TEXT DEFAULT 'planned',
  partner_id      UUID REFERENCES partners(id),
  order_id        UUID,
  stock_issue_id  UUID,
  shop_id         UUID REFERENCES shops(id),
  description     TEXT,
  notes           TEXT,
  is_cash         BOOLEAN DEFAULT false,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashflows_tenant ON cashflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashflows_type ON cashflows(tenant_id, cashflow_type);
CREATE INDEX IF NOT EXISTS idx_cashflows_status ON cashflows(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cashflows_date ON cashflows(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_cashflows_partner ON cashflows(partner_id);

-- ============================================================
-- CASHFLOW TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS cashflow_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  cashflow_type   TEXT NOT NULL,
  category_id     UUID REFERENCES cashflow_categories(id),
  amount          DECIMAL NOT NULL,
  description     TEXT,
  partner_id      UUID REFERENCES partners(id),
  frequency       TEXT NOT NULL,
  day_of_month    INTEGER,
  start_date      DATE NOT NULL,
  end_date        DATE,
  next_date       DATE NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  last_generated  DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cf_templates_tenant ON cashflow_templates(tenant_id);

-- ============================================================
-- CASH DESKS
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_desks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  shop_id         UUID NOT NULL REFERENCES shops(id),
  current_balance DECIMAL DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_desks_tenant ON cash_desks(tenant_id);

-- ============================================================
-- ALTER existing tables
-- ============================================================

-- stock_issues: flag for active reservation on draft issue
ALTER TABLE stock_issues
  ADD COLUMN IF NOT EXISTS is_reserved BOOLEAN DEFAULT false;

-- stock_issue_lines: link to recipe ingredient for production issues
ALTER TABLE stock_issue_lines
  ADD COLUMN IF NOT EXISTS recipe_item_id UUID REFERENCES recipe_items(id);

-- cashflows.order_id FK (deferred — orders table now exists)
-- Note: Not adding FK constraint on cashflows.order_id and cashflows.stock_issue_id
-- to avoid circular dependency issues. App-level integrity is enforced.

-- orders.cashflow_id FK (deferred — cashflows table now exists)
-- Same reasoning — no DB-level FK to avoid circular dependency.

-- ============================================================
-- COUNTER SEED: cashflow counter for existing tenants
-- ============================================================
-- This inserts a cashflow counter for every tenant that doesn't have one yet
INSERT INTO counters (tenant_id, entity, prefix, include_year, padding, separator, reset_yearly)
SELECT t.id, 'cashflow', 'CF', true, 4, '-', true
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM counters c
  WHERE c.tenant_id = t.id AND c.entity = 'cashflow' AND c.warehouse_id IS NULL
);
