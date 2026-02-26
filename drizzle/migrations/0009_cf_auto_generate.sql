-- Add auto_generate flag to cashflow_templates
ALTER TABLE cashflow_templates
  ADD COLUMN IF NOT EXISTS auto_generate BOOLEAN DEFAULT false;

-- Create cf_auto_generation_log table
CREATE TABLE IF NOT EXISTS cf_auto_generation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  run_date    DATE NOT NULL,
  generated   INTEGER NOT NULL DEFAULT 0,
  details     JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_cf_auto_gen_tenant_date UNIQUE (tenant_id, run_date)
);

CREATE INDEX IF NOT EXISTS idx_cf_auto_gen_tenant_date
  ON cf_auto_generation_log(tenant_id, run_date);
