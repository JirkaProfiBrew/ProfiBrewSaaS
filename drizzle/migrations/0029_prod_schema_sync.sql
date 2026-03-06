-- ============================================================
-- 0029_prod_schema_sync.sql
-- Comprehensive idempotent migration to bring production DB
-- in sync with dev schema (post-0000 + all patches through 0028).
-- Safe to run multiple times — uses IF NOT EXISTS throughout.
-- ============================================================


-- ############################################################
-- SECTION 1: SYSTEM CODEBOOK TABLES (no tenant_id)
-- ############################################################

-- 1a. hop_forms
CREATE TABLE IF NOT EXISTS hop_forms (
  id                  TEXT PRIMARY KEY,
  name_cs             TEXT NOT NULL,
  name_en             TEXT NOT NULL,
  utilization_factor  NUMERIC NOT NULL DEFAULT 1.0,
  sort_order          INTEGER DEFAULT 0
);

INSERT INTO hop_forms (id, name_cs, name_en, utilization_factor, sort_order)
VALUES
  ('pellet', 'Pelety',      'Pellet',     1.10, 1),
  ('leaf',   'Celé šišky',  'Whole leaf', 1.00, 2),
  ('plug',   'Plug',        'Plug',       1.02, 3),
  ('cryo',   'Cryo',        'Cryo',       1.10, 4)
ON CONFLICT (id) DO NOTHING;

-- 1b. yeast_forms
CREATE TABLE IF NOT EXISTS yeast_forms (
  id           TEXT PRIMARY KEY,
  name_cs      TEXT NOT NULL,
  name_en      TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  sort_order   INTEGER DEFAULT 0
);

INSERT INTO yeast_forms (id, name_cs, name_en, default_unit, sort_order)
VALUES
  ('dry',    'Sušené', 'Dry',    'g',  1),
  ('liquid', 'Tekuté', 'Liquid', 'ml', 2)
ON CONFLICT (id) DO NOTHING;

-- 1c. fermentable_types
CREATE TABLE IF NOT EXISTS fermentable_types (
  id              TEXT PRIMARY KEY,
  name_cs         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  default_extract NUMERIC NOT NULL DEFAULT 80,
  sort_order      INTEGER DEFAULT 0
);

INSERT INTO fermentable_types (id, name_cs, name_en, default_extract, sort_order)
VALUES
  ('grain',          'Slad',             'Grain',          80,  1),
  ('adjunct_grain',  'Nesladovaný zrnový', 'Adjunct grain', 70,  2),
  ('sugar',          'Cukr',             'Sugar',         100,  3),
  ('honey',          'Med',              'Honey',          95,  4),
  ('dry_extract',    'Suchý extrakt',    'Dry extract',    96,  5),
  ('liquid_extract', 'Tekutý extrakt',   'Liquid extract', 80,  6)
ON CONFLICT (id) DO NOTHING;


-- ############################################################
-- SECTION 2: NEW TENANT-SCOPED TABLES
-- ############################################################

-- 2a. warehouses
CREATE TABLE IF NOT EXISTS warehouses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  shop_id             UUID REFERENCES shops(id),
  code                TEXT NOT NULL,
  name                TEXT NOT NULL,
  is_excise_relevant  BOOLEAN DEFAULT false,
  categories          TEXT[],
  is_default          BOOLEAN DEFAULT false,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT warehouses_tenant_code UNIQUE (tenant_id, code)
);

-- 2b. deposits
CREATE TABLE IF NOT EXISTS deposits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  deposit_amount  NUMERIC NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposits_tenant ON deposits(tenant_id);

-- 2c. stock_issues
CREATE TABLE IF NOT EXISTS stock_issues (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  code              TEXT NOT NULL,
  code_number       INTEGER,
  code_prefix       TEXT,
  counter_id        UUID REFERENCES counters(id),
  movement_type     TEXT NOT NULL,
  movement_purpose  TEXT NOT NULL,
  date              DATE NOT NULL,
  status            TEXT DEFAULT 'draft',
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  partner_id        UUID REFERENCES partners(id),
  order_id          UUID,
  cashflow_id       UUID,
  batch_id          UUID REFERENCES batches(id),
  season            TEXT,
  additional_cost   NUMERIC DEFAULT 0,
  total_cost        NUMERIC DEFAULT 0,
  notes             TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_issues_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_stock_issues_tenant_status ON stock_issues(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_issues_tenant_date   ON stock_issues(tenant_id, date);

-- 2d. stock_issue_lines
CREATE TABLE IF NOT EXISTS stock_issue_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  stock_issue_id        UUID NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
  item_id               UUID NOT NULL REFERENCES items(id),
  line_no               INTEGER,
  requested_qty         NUMERIC NOT NULL,
  issued_qty            NUMERIC,
  missing_qty           NUMERIC,
  unit_price            NUMERIC,
  total_cost            NUMERIC,
  issue_mode_snapshot   TEXT,
  notes                 TEXT,
  sort_order            INTEGER DEFAULT 0,
  recipe_item_id        UUID REFERENCES recipe_items(id) ON DELETE SET NULL,
  order_item_id         UUID,
  manual_allocations    JSONB,
  lot_number            TEXT,
  expiry_date           DATE,
  lot_attributes        JSONB DEFAULT '{}',
  remaining_qty         NUMERIC,
  plato                 NUMERIC,
  batch_id              UUID REFERENCES batches(id),
  overhead_per_unit     NUMERIC DEFAULT 0,
  full_unit_price       NUMERIC,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_issue_lines_issue ON stock_issue_lines(stock_issue_id);

-- 2e. receipt_costs
CREATE TABLE IF NOT EXISTS receipt_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  stock_issue_id  UUID NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  amount          NUMERIC NOT NULL DEFAULT 0,
  allocation      TEXT NOT NULL DEFAULT 'by_value',
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_costs_issue ON receipt_costs(stock_issue_id);

-- 2f. stock_movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  item_id             UUID NOT NULL REFERENCES items(id),
  warehouse_id        UUID NOT NULL REFERENCES warehouses(id),
  movement_type       TEXT NOT NULL,
  quantity            NUMERIC NOT NULL,
  unit_price          NUMERIC,
  stock_issue_id      UUID REFERENCES stock_issues(id),
  stock_issue_line_id UUID REFERENCES stock_issue_lines(id),
  order_id            UUID,
  batch_id            UUID REFERENCES batches(id),
  lot_id              UUID,
  receipt_line_id     UUID REFERENCES stock_issue_lines(id),
  is_closed           BOOLEAN DEFAULT false,
  date                DATE NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item_warehouse ON stock_movements(tenant_id, item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date           ON stock_movements(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_movements_receipt_line          ON stock_movements(receipt_line_id);

-- 2g. stock_issue_allocations
CREATE TABLE IF NOT EXISTS stock_issue_allocations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  stock_issue_line_id UUID NOT NULL REFERENCES stock_issue_lines(id),
  source_movement_id  UUID NOT NULL REFERENCES stock_movements(id),
  quantity            NUMERIC NOT NULL,
  unit_price          NUMERIC NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_issue_allocations_line ON stock_issue_allocations(stock_issue_line_id);

-- 2h. stock_status
CREATE TABLE IF NOT EXISTS stock_status (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  item_id       UUID NOT NULL REFERENCES items(id),
  warehouse_id  UUID NOT NULL REFERENCES warehouses(id),
  quantity      NUMERIC DEFAULT 0,
  reserved_qty  NUMERIC DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_status_tenant_item_warehouse UNIQUE (tenant_id, item_id, warehouse_id)
);

-- 2i. material_lots
CREATE TABLE IF NOT EXISTS material_lots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  item_id             UUID NOT NULL REFERENCES items(id),
  lot_number          TEXT NOT NULL,
  supplier_id         UUID REFERENCES partners(id),
  received_date       DATE,
  expiry_date         DATE,
  quantity_initial    NUMERIC,
  quantity_remaining  NUMERIC,
  unit_price          NUMERIC,
  properties          JSONB DEFAULT '{}',
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_lots_item ON material_lots(tenant_id, item_id);

-- 2j. orders
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  order_number     TEXT NOT NULL,
  partner_id       UUID NOT NULL REFERENCES partners(id),
  contact_id       UUID REFERENCES contacts(id),
  status           TEXT NOT NULL DEFAULT 'draft',
  order_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date    DATE,
  shipped_date     DATE,
  delivered_date   DATE,
  closed_date      DATE,
  shop_id          UUID REFERENCES shops(id),
  warehouse_id     UUID REFERENCES warehouses(id),
  total_excl_vat   NUMERIC DEFAULT 0,
  total_vat        NUMERIC DEFAULT 0,
  total_incl_vat   NUMERIC DEFAULT 0,
  total_deposit    NUMERIC DEFAULT 0,
  currency         TEXT DEFAULT 'CZK',
  stock_issue_id   UUID REFERENCES stock_issues(id),
  cashflow_id      UUID,
  notes            TEXT,
  internal_notes   TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT orders_tenant_order_number UNIQUE (tenant_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_id);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_date    ON orders(tenant_id, order_date);

-- 2k. order_items
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  quantity        NUMERIC NOT NULL,
  unit_id         UUID REFERENCES units(id),
  unit_price      NUMERIC NOT NULL,
  vat_rate        NUMERIC DEFAULT 21,
  discount_pct    NUMERIC DEFAULT 0,
  total_excl_vat  NUMERIC,
  total_vat       NUMERIC,
  total_incl_vat  NUMERIC,
  deposit_id      UUID,
  deposit_qty     NUMERIC DEFAULT 0,
  deposit_total   NUMERIC DEFAULT 0,
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  reserved_qty    NUMERIC DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item  ON order_items(item_id);

-- 2l. cashflow_categories
CREATE TABLE IF NOT EXISTS cashflow_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  name          TEXT NOT NULL,
  parent_id     UUID,
  cashflow_type TEXT NOT NULL,
  is_system     BOOLEAN DEFAULT false,
  sort_order    INTEGER DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Self-referential FK (only add if not exists — wrapped in DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_cf_categories_parent'
  ) THEN
    ALTER TABLE cashflow_categories
      ADD CONSTRAINT fk_cf_categories_parent
      FOREIGN KEY (parent_id) REFERENCES cashflow_categories(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cf_categories_tenant ON cashflow_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cf_categories_parent ON cashflow_categories(parent_id);

-- 2m. cashflow_templates
CREATE TABLE IF NOT EXISTS cashflow_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  cashflow_type   TEXT NOT NULL,
  category_id     UUID REFERENCES cashflow_categories(id),
  amount          NUMERIC NOT NULL,
  description     TEXT,
  partner_id      UUID REFERENCES partners(id),
  frequency       TEXT NOT NULL,
  day_of_month    INTEGER,
  start_date      DATE NOT NULL,
  end_date        DATE,
  next_date       DATE NOT NULL,
  is_active       BOOLEAN DEFAULT true,
  auto_generate   BOOLEAN DEFAULT false,
  last_generated  DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cf_templates_tenant ON cashflow_templates(tenant_id);

-- 2n. cash_desks
CREATE TABLE IF NOT EXISTS cash_desks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  shop_id         UUID NOT NULL REFERENCES shops(id),
  current_balance NUMERIC DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_desks_tenant ON cash_desks(tenant_id);

-- 2o. cashflows
CREATE TABLE IF NOT EXISTS cashflows (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  code          TEXT,
  cashflow_type TEXT NOT NULL,
  category_id   UUID REFERENCES cashflow_categories(id),
  amount        NUMERIC NOT NULL,
  currency      TEXT DEFAULT 'CZK',
  date          DATE NOT NULL,
  due_date      DATE,
  paid_date     DATE,
  status        TEXT DEFAULT 'planned',
  partner_id    UUID REFERENCES partners(id),
  order_id      UUID,
  stock_issue_id UUID,
  shop_id       UUID REFERENCES shops(id),
  description   TEXT,
  notes         TEXT,
  is_cash       BOOLEAN DEFAULT false,
  cash_desk_id  UUID REFERENCES cash_desks(id),
  template_id   UUID REFERENCES cashflow_templates(id),
  is_recurring  BOOLEAN DEFAULT false,
  created_by    UUID,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cashflows_tenant   ON cashflows(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashflows_type     ON cashflows(tenant_id, cashflow_type);
CREATE INDEX IF NOT EXISTS idx_cashflows_status   ON cashflows(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_cashflows_date     ON cashflows(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_cashflows_partner  ON cashflows(partner_id);
CREATE INDEX IF NOT EXISTS idx_cashflows_template ON cashflows(template_id);

-- 2p. cf_auto_generation_log
CREATE TABLE IF NOT EXISTS cf_auto_generation_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  run_date   DATE NOT NULL,
  generated  INTEGER NOT NULL DEFAULT 0,
  details    JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_cf_auto_gen_tenant_date UNIQUE (tenant_id, run_date)
);

CREATE INDEX IF NOT EXISTS idx_cf_auto_gen_tenant_date ON cf_auto_generation_log(tenant_id, run_date);

-- 2q. brewing_systems
CREATE TABLE IF NOT EXISTS brewing_systems (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                     UUID NOT NULL REFERENCES tenants(id),
  shop_id                       UUID REFERENCES shops(id),
  name                          TEXT NOT NULL,
  description                   TEXT,
  is_primary                    BOOLEAN DEFAULT false,
  batch_size_l                  NUMERIC NOT NULL,
  efficiency_pct                NUMERIC NOT NULL DEFAULT 75,
  kettle_volume_l               NUMERIC,
  evaporation_rate_pct_per_hour NUMERIC DEFAULT 8,
  whirlpool_loss_pct            NUMERIC DEFAULT 10,
  whirlpool_temperature_c       NUMERIC DEFAULT 85,
  fermenter_volume_l            NUMERIC,
  fermentation_loss_pct         NUMERIC DEFAULT 10,
  extract_estimate              NUMERIC DEFAULT 0.80,
  water_per_kg_malt             NUMERIC DEFAULT 1.0,
  grain_absorption_l_per_kg     NUMERIC DEFAULT 0.8,
  water_reserve_l               NUMERIC DEFAULT 0,
  time_preparation              INTEGER DEFAULT 30,
  time_lautering                INTEGER DEFAULT 60,
  time_whirlpool                INTEGER DEFAULT 90,
  time_transfer                 INTEGER DEFAULT 15,
  time_cleanup                  INTEGER DEFAULT 60,
  notes                         TEXT,
  is_active                     BOOLEAN DEFAULT true,
  created_at                    TIMESTAMPTZ DEFAULT now(),
  updated_at                    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brewing_systems_tenant ON brewing_systems(tenant_id, is_active);

-- Partial unique index: only one primary brewing system per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_brewing_systems_primary
  ON brewing_systems(tenant_id)
  WHERE is_primary = true AND is_active = true;

-- 2r. batch_lot_tracking
CREATE TABLE IF NOT EXISTS batch_lot_tracking (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  batch_id    UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  direction   TEXT NOT NULL,
  item_id     UUID REFERENCES items(id),
  item_name   TEXT NOT NULL,
  lot_number  TEXT,
  amount      NUMERIC NOT NULL,
  unit        TEXT NOT NULL,
  receipt_id  UUID,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_lot_tenant ON batch_lot_tracking(tenant_id, batch_id);

-- 2s. community_applications
CREATE TABLE IF NOT EXISTS community_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'school' CHECK (type = 'school'),
  school_name   TEXT NOT NULL,
  ico           TEXT,
  contact_name  TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  expires_at    DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2t. excise_rates
CREATE TABLE IF NOT EXISTS excise_rates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id),
  category         TEXT NOT NULL,
  rate_per_plato_hl NUMERIC NOT NULL,
  valid_from       DATE NOT NULL,
  is_active        BOOLEAN DEFAULT true,
  valid_to         DATE,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_excise_rates_category ON excise_rates(category, valid_from);

-- 2u. excise_movements
CREATE TABLE IF NOT EXISTS excise_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID REFERENCES batches(id),
  stock_issue_id  UUID REFERENCES stock_issues(id),
  warehouse_id    UUID REFERENCES warehouses(id),
  movement_type   TEXT NOT NULL,
  volume_hl       NUMERIC NOT NULL,
  direction       TEXT NOT NULL,
  plato           NUMERIC,
  plato_source    TEXT,
  tax_rate        NUMERIC,
  tax_amount      NUMERIC,
  date            DATE NOT NULL,
  period          TEXT NOT NULL,
  status          TEXT DEFAULT 'draft',
  description     TEXT,
  notes           TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_excise_movements_tenant_period ON excise_movements(tenant_id, period);
CREATE INDEX IF NOT EXISTS idx_excise_movements_batch         ON excise_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_excise_movements_issue         ON excise_movements(stock_issue_id);

-- 2v. excise_monthly_reports
CREATE TABLE IF NOT EXISTS excise_monthly_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  period              TEXT NOT NULL,
  opening_balance_hl  NUMERIC DEFAULT 0,
  production_hl       NUMERIC DEFAULT 0,
  transfer_in_hl      NUMERIC DEFAULT 0,
  release_hl          NUMERIC DEFAULT 0,
  transfer_out_hl     NUMERIC DEFAULT 0,
  loss_hl             NUMERIC DEFAULT 0,
  destruction_hl      NUMERIC DEFAULT 0,
  adjustment_hl       NUMERIC DEFAULT 0,
  closing_balance_hl  NUMERIC DEFAULT 0,
  total_tax           NUMERIC DEFAULT 0,
  tax_details         JSONB,
  status              TEXT DEFAULT 'draft',
  submitted_at        TIMESTAMPTZ,
  submitted_by        UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT excise_monthly_reports_tenant_period UNIQUE (tenant_id, period)
);


-- ############################################################
-- SECTION 3: ALTER EXISTING TABLES — ADD COLUMNS
-- ############################################################

-- -----------------------------------------------------------
-- 3a. counters — add warehouse_id, replace unique constraint
-- -----------------------------------------------------------
ALTER TABLE counters ADD COLUMN IF NOT EXISTS warehouse_id UUID;

-- Drop the old 2-column unique constraint if it exists, replace with 3-column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counters_tenant_entity'
  ) THEN
    ALTER TABLE counters DROP CONSTRAINT counters_tenant_entity;
  END IF;
END $$;

-- Add the new 3-column unique constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'counters_tenant_entity_warehouse'
  ) THEN
    ALTER TABLE counters
      ADD CONSTRAINT counters_tenant_entity_warehouse
      UNIQUE (tenant_id, entity, warehouse_id);
  END IF;
END $$;

-- -----------------------------------------------------------
-- 3b. items — new columns
-- -----------------------------------------------------------
ALTER TABLE items ADD COLUMN IF NOT EXISTS base_item_id         UUID;
ALTER TABLE items ADD COLUMN IF NOT EXISTS base_item_quantity    NUMERIC;
ALTER TABLE items ADD COLUMN IF NOT EXISTS hop_form             TEXT REFERENCES hop_forms(id);
ALTER TABLE items ADD COLUMN IF NOT EXISTS yeast_form           TEXT REFERENCES yeast_forms(id);
ALTER TABLE items ADD COLUMN IF NOT EXISTS fermentable_type     TEXT REFERENCES fermentable_types(id);
ALTER TABLE items ADD COLUMN IF NOT EXISTS recipe_unit_id       UUID;
ALTER TABLE items ADD COLUMN IF NOT EXISTS packaging_cost       NUMERIC;
ALTER TABLE items ADD COLUMN IF NOT EXISTS filling_cost         NUMERIC;

-- -----------------------------------------------------------
-- 3c. recipes — new columns
-- -----------------------------------------------------------
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS brewing_system_id    UUID REFERENCES brewing_systems(id);
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source_recipe_id     UUID;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shelf_life_days      INTEGER;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS constants_override   JSONB;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS target_ibu           NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS target_ebc           NUMERIC;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS malt_input_mode      TEXT DEFAULT 'percent';
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS item_id              UUID REFERENCES items(id);

-- -----------------------------------------------------------
-- 3d. recipe_items — new columns
-- -----------------------------------------------------------
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS reserved_qty    NUMERIC DEFAULT 0;
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS temperature_c   NUMERIC;
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS percent         NUMERIC;
ALTER TABLE recipe_items ADD COLUMN IF NOT EXISTS unit_id         UUID REFERENCES units(id);

-- -----------------------------------------------------------
-- 3e. batches — new columns (brew lifecycle management)
-- -----------------------------------------------------------
ALTER TABLE batches ADD COLUMN IF NOT EXISTS brewing_system_id          UUID REFERENCES brewing_systems(id);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS lot_number                 TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS bottled_date               DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_phase              TEXT DEFAULT 'plan';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS phase_history              JSONB DEFAULT '{}';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS brew_mode                  TEXT DEFAULT 'sheet';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS fermentation_days          INTEGER;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS conditioning_days          INTEGER;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS fermentation_start         DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS conditioning_start         DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS estimated_end              DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS conditioning_equipment_id  UUID REFERENCES equipment(id);
ALTER TABLE batches ADD COLUMN IF NOT EXISTS ingredient_additions       JSONB DEFAULT '{}';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS packaging_loss_l           NUMERIC;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS item_id                    UUID REFERENCES items(id);

-- Backfill current_phase from status (only where current_phase is still default 'plan' and status is set)
UPDATE batches
SET current_phase = CASE status
  WHEN 'planned'      THEN 'plan'
  WHEN 'brewing'      THEN 'brewing'
  WHEN 'fermenting'   THEN 'fermentation'
  WHEN 'conditioning'  THEN 'conditioning'
  WHEN 'carbonating'   THEN 'conditioning'
  WHEN 'packaging'     THEN 'packaging'
  WHEN 'completed'     THEN 'completed'
  WHEN 'dumped'        THEN 'dumped'
  ELSE COALESCE(current_phase, 'plan')
END
WHERE current_phase IS NULL
   OR (current_phase = 'plan' AND status IS NOT NULL AND status NOT IN ('planned'));

-- Ensure no NULLs remain
UPDATE batches SET current_phase = 'plan' WHERE current_phase IS NULL;

-- Make status nullable (deprecated), make current_phase NOT NULL
ALTER TABLE batches ALTER COLUMN status DROP NOT NULL;
DO $$
BEGIN
  ALTER TABLE batches ALTER COLUMN status DROP DEFAULT;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE batches ALTER COLUMN current_phase SET NOT NULL;
ALTER TABLE batches ALTER COLUMN current_phase SET DEFAULT 'plan';

-- Replace index
DROP INDEX IF EXISTS idx_batches_tenant_status;
CREATE INDEX IF NOT EXISTS idx_batches_tenant_phase ON batches(tenant_id, current_phase);

-- -----------------------------------------------------------
-- 3f. batch_steps — new columns
-- -----------------------------------------------------------
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS step_source        TEXT DEFAULT 'recipe';
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS ramp_time_min      INTEGER;
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS hop_additions      JSONB;
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS actual_duration_min INTEGER;
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS notes              TEXT;

-- -----------------------------------------------------------
-- 3g. batch_measurements — new columns
-- -----------------------------------------------------------
ALTER TABLE batch_measurements ADD COLUMN IF NOT EXISTS phase    TEXT;
ALTER TABLE batch_measurements ADD COLUMN IF NOT EXISTS volume_l NUMERIC;

-- -----------------------------------------------------------
-- 3h. mashing_profiles — new columns
-- -----------------------------------------------------------
ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS mashing_type TEXT;
ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS is_active    BOOLEAN DEFAULT true;
ALTER TABLE mashing_profiles ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ;

-- -----------------------------------------------------------
-- 3i. beer_style_groups — new columns
-- -----------------------------------------------------------
ALTER TABLE beer_style_groups ADD COLUMN IF NOT EXISTS name_cz   TEXT;
ALTER TABLE beer_style_groups ADD COLUMN IF NOT EXISTS image_url TEXT;

-- -----------------------------------------------------------
-- 3j. beer_styles — new columns
-- -----------------------------------------------------------
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS impression          TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS mouthfeel           TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS history             TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS ingredients         TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS style_comparison    TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS commercial_examples TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS origin              TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS srm_min             NUMERIC;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS srm_max             NUMERIC;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS style_family        TEXT;

-- -----------------------------------------------------------
-- 3k. plans — new columns (may already exist from manual patches)
-- -----------------------------------------------------------
ALTER TABLE plans ADD COLUMN IF NOT EXISTS watermark       BOOLEAN DEFAULT false;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_hard_hl_stop BOOLEAN DEFAULT false;

-- -----------------------------------------------------------
-- 3l. subscriptions — new columns (may already exist from manual patches)
-- -----------------------------------------------------------
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;


-- ############################################################
-- SECTION 4: RLS POLICIES (idempotent — create if not exists)
-- ############################################################

-- Enable RLS on all new tables (safe to call multiple times)
ALTER TABLE warehouses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits             ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_issues         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_issue_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_costs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_issue_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_status         ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_lots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders               ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflow_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_desks           ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashflows            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cf_auto_generation_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE brewing_systems      ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_lot_tracking   ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE excise_rates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE excise_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE excise_monthly_reports ENABLE ROW LEVEL SECURITY;


-- ############################################################
-- SECTION 5: SEED DATA
-- ############################################################

-- 5a. Excise rates (Czech system defaults — categories A-E, 2024 rates)
INSERT INTO excise_rates (tenant_id, category, rate_per_plato_hl, valid_from, is_active)
VALUES
  (NULL, 'A', 16.00, '2024-01-01', true),
  (NULL, 'B', 19.20, '2024-01-01', true),
  (NULL, 'C', 24.00, '2024-01-01', true),
  (NULL, 'D', 28.80, '2024-01-01', true),
  (NULL, 'E', 32.00, '2024-01-01', true)
ON CONFLICT DO NOTHING;

-- 5b. Plans update — community plans (safe: ON CONFLICT DO NOTHING)
INSERT INTO plans (slug, name, description, base_price, currency, billing_period,
  included_hl, overage_per_hl, max_users, included_modules,
  api_access, integrations, priority_support,
  is_hard_hl_stop, watermark,
  version, valid_from, is_active, is_public, sort_order)
VALUES
  ('community_homebrewer', 'Domovarník',
   'Pro domácí výrobu piva — nekomerční použití',
   0, 'CZK', 'monthly',
   2, NULL, 1, ARRAY['brewery', 'stock', 'finance'],
   false, false, false,
   true, true,
   1, '2026-04-01', true, false, 99),
  ('community_school', 'Škola',
   'Pro vzdělávací instituce — nekomerční použití',
   0, 'CZK', 'monthly',
   NULL, NULL, NULL, ARRAY['brewery', 'stock', 'finance'],
   false, false, false,
   false, true,
   1, '2026-04-01', true, false, 99)
ON CONFLICT DO NOTHING;


-- ############################################################
-- SECTION 6: DONE
-- ############################################################
-- This migration is idempotent. Safe to run on both fresh and
-- partially-migrated production databases.
