-- Add template link + recurring flag to cashflows
ALTER TABLE cashflows
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES cashflow_templates(id),
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cashflows_template ON cashflows(template_id);
