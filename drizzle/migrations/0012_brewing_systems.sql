-- ============================================================
-- Sprint 6 Phase A1: Brewing Systems
-- ============================================================

-- 1. Create brewing_systems table
CREATE TABLE IF NOT EXISTS brewing_systems (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  shop_id               UUID REFERENCES shops(id),

  -- Header
  name                  TEXT NOT NULL,
  description           TEXT,
  is_primary            BOOLEAN DEFAULT false,
  batch_size_l          DECIMAL NOT NULL,
  efficiency_pct        DECIMAL NOT NULL DEFAULT 75,

  -- Hot zone — Kettle
  kettle_volume_l       DECIMAL,
  kettle_loss_pct       DECIMAL DEFAULT 10,

  -- Hot zone — Whirlpool
  whirlpool_loss_pct    DECIMAL DEFAULT 10,

  -- Cold zone — Fermenter (schematic)
  fermenter_volume_l    DECIMAL,
  fermentation_loss_pct DECIMAL DEFAULT 10,

  -- Constants
  extract_estimate      DECIMAL DEFAULT 0.80,
  water_per_kg_malt     DECIMAL DEFAULT 1.0,
  water_reserve_l       DECIMAL DEFAULT 0,

  -- Step times (minutes)
  time_preparation      INTEGER DEFAULT 30,
  time_lautering        INTEGER DEFAULT 60,
  time_whirlpool        INTEGER DEFAULT 90,
  time_transfer         INTEGER DEFAULT 15,
  time_cleanup          INTEGER DEFAULT 60,

  -- Meta
  notes                 TEXT,
  is_active             BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_brewing_systems_tenant
  ON brewing_systems(tenant_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brewing_systems_primary
  ON brewing_systems(tenant_id)
  WHERE is_primary = true AND is_active = true;

-- 3. RLS
ALTER TABLE brewing_systems ENABLE ROW LEVEL SECURITY;

CREATE POLICY brewing_systems_tenant_isolation ON brewing_systems
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY brewing_systems_tenant_insert ON brewing_systems
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- 4. FK: recipes.brewing_system_id
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS brewing_system_id UUID REFERENCES brewing_systems(id);

-- 5. FK: batches.brewing_system_id
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS brewing_system_id UUID REFERENCES brewing_systems(id);

-- 6. Equipment cleanup: remove brewhouse, bottling_line, keg_washer
-- First clear any batch FK references to these equipment types
UPDATE batches
SET equipment_id = NULL
WHERE equipment_id IN (
  SELECT id FROM equipment
  WHERE equipment_type IN ('brewhouse', 'bottling_line', 'keg_washer')
);

DELETE FROM equipment
WHERE equipment_type IN ('brewhouse', 'bottling_line', 'keg_washer');
