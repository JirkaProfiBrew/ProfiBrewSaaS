-- Sprint 3 Patch v2: Cancel Allocations
-- Adds receipt_line_id FK on stock_movements (links issue movement → receipt line it draws from)
-- Adds manual_allocations JSONB on stock_issue_lines (stores manual lot pre-selection)

-- Add receipt_line_id to stock_movements
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS receipt_line_id UUID REFERENCES stock_issue_lines(id);

CREATE INDEX IF NOT EXISTS idx_movements_receipt_line
  ON stock_movements(receipt_line_id);

-- Add manual_allocations JSONB to stock_issue_lines
ALTER TABLE stock_issue_lines
  ADD COLUMN IF NOT EXISTS manual_allocations JSONB;
