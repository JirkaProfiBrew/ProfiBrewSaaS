-- Add excise-relevant columns to stock_issue_lines (receipt lines)
-- plato = °P snapshot from batch at receipt time
-- batch_id = source batch for this receipt line (denormalized from parent stock_issue)

ALTER TABLE stock_issue_lines
  ADD COLUMN IF NOT EXISTS plato DECIMAL,
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES batches(id);

-- Backfill batch_id from parent receipt header
UPDATE stock_issue_lines sil
SET batch_id = si.batch_id
FROM stock_issues si
WHERE sil.stock_issue_id = si.id
  AND si.movement_type = 'receipt'
  AND si.batch_id IS NOT NULL
  AND sil.batch_id IS NULL;

-- Backfill plato from batch.og_actual
UPDATE stock_issue_lines sil
SET plato = b.og_actual
FROM stock_issues si
JOIN batches b ON b.id = si.batch_id
WHERE sil.stock_issue_id = si.id
  AND si.movement_type = 'receipt'
  AND si.batch_id IS NOT NULL
  AND b.og_actual IS NOT NULL
  AND sil.plato IS NULL;
