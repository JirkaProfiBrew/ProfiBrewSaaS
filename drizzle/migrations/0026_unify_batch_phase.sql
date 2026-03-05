-- 0026: Unify batch lifecycle — use only current_phase, deprecate status
-- Back-fill current_phase from status where they diverge

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
   OR (current_phase = 'plan' AND status NOT IN ('planned'));

-- Make status nullable (deprecated, kept for rollback safety)
ALTER TABLE batches ALTER COLUMN status DROP NOT NULL;
ALTER TABLE batches ALTER COLUMN status DROP DEFAULT;

-- Make current_phase non-nullable
UPDATE batches SET current_phase = 'plan' WHERE current_phase IS NULL;
ALTER TABLE batches ALTER COLUMN current_phase SET NOT NULL;
ALTER TABLE batches ALTER COLUMN current_phase SET DEFAULT 'plan';

-- Replace index
DROP INDEX IF EXISTS idx_batches_tenant_status;
CREATE INDEX IF NOT EXISTS idx_batches_tenant_phase ON batches(tenant_id, current_phase);
