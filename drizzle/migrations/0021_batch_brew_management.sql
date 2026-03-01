-- Migration: 0021_batch_brew_management
-- Phase A: Batch Brew Management — schema extensions

-- A1: Extend batches table with brew lifecycle columns
ALTER TABLE batches ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'plan';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS phase_history JSONB DEFAULT '{}';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS brew_mode TEXT DEFAULT 'sheet';
ALTER TABLE batches ADD COLUMN IF NOT EXISTS fermentation_days INTEGER;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS conditioning_days INTEGER;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS fermentation_start DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS conditioning_start DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS estimated_end DATE;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS conditioning_equipment_id UUID REFERENCES equipment(id);

-- A2: Extend batch_steps table
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS step_source TEXT DEFAULT 'recipe';
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS ramp_time_min INTEGER;
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS hop_additions JSONB;
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS actual_duration_min INTEGER;
ALTER TABLE batch_steps ADD COLUMN IF NOT EXISTS notes TEXT;

-- A3: Extend batch_measurements table
ALTER TABLE batch_measurements ADD COLUMN IF NOT EXISTS phase TEXT;
ALTER TABLE batch_measurements ADD COLUMN IF NOT EXISTS volume_l DECIMAL;

-- A4: Create batch_lot_tracking table
CREATE TABLE IF NOT EXISTS batch_lot_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  item_id UUID REFERENCES items(id),
  item_name TEXT NOT NULL,
  lot_number TEXT,
  amount DECIMAL NOT NULL,
  unit TEXT NOT NULL,
  receipt_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_batch_lot_tenant ON batch_lot_tracking(tenant_id, batch_id);
