-- Sprint 3 Patch: Lots = Receipt Lines
-- Merge lot tracking into stock_issue_lines, simplify issue modes.

-- 1. Add lot columns to stock_issue_lines
ALTER TABLE stock_issue_lines
  ADD COLUMN IF NOT EXISTS lot_number TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS lot_attributes JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS remaining_qty DECIMAL;

-- 2. Migrate issue_mode values on items
UPDATE items SET issue_mode = 'fifo' WHERE issue_mode = 'lifo';
UPDATE items SET issue_mode = 'manual_lot' WHERE issue_mode = 'average';

-- 3. Backfill remaining_qty for confirmed receipt lines
--    remaining_qty = issuedQty - SUM(allocations against this line's movement)
UPDATE stock_issue_lines sil
SET remaining_qty = COALESCE(sil.issued_qty, sil.requested_qty)::decimal - COALESCE(
  (SELECT SUM(a.quantity::decimal)
   FROM stock_issue_allocations a
   JOIN stock_movements sm ON sm.id = a.source_movement_id
   WHERE sm.stock_issue_line_id = sil.id
  ), 0
)
FROM stock_issues si
WHERE si.id = sil.stock_issue_id
  AND si.movement_type = 'receipt'
  AND si.status = 'confirmed';

-- 4. Draft/cancelled receipt lines: remaining_qty = 0
UPDATE stock_issue_lines sil
SET remaining_qty = 0
FROM stock_issues si
WHERE si.id = sil.stock_issue_id
  AND si.movement_type = 'receipt'
  AND si.status IN ('draft', 'cancelled')
  AND sil.remaining_qty IS NULL;

-- 5. Issue lines don't use remaining_qty — leave NULL
