-- Sprint 4 patch: Bottling lot number, expiry date, production price
-- Adds lot_number and bottled_date to batches, shelf_life_days to recipes

ALTER TABLE batches ADD COLUMN IF NOT EXISTS lot_number TEXT;
ALTER TABLE batches ADD COLUMN IF NOT EXISTS bottled_date DATE;
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;

-- Backfill lot_number from batch_number (remove dashes)
UPDATE batches SET lot_number = REPLACE(batch_number, '-', '') WHERE lot_number IS NULL;
