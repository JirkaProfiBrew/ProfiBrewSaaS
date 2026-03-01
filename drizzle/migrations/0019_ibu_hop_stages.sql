-- ================================================
-- Migration: 0019_ibu_hop_stages
-- Add whirlpool temperature to brewing systems,
-- temperature_c to recipe_items, and migrate hop stages.
-- ================================================

-- 1. Add whirlpool temperature to brewing_systems
ALTER TABLE brewing_systems ADD COLUMN whirlpool_temperature_c NUMERIC DEFAULT 85;

-- 2. Add temperature to recipe_items
ALTER TABLE recipe_items ADD COLUMN temperature_c NUMERIC;

-- 3. Migrate hop stages: fermentation → dry_hop_cold for hops only
UPDATE recipe_items SET use_stage = 'dry_hop_cold' WHERE category = 'hop' AND use_stage = 'fermentation';

-- 4. Migrate hop stages: dry_hop → dry_hop_cold for hops only
UPDATE recipe_items SET use_stage = 'dry_hop_cold' WHERE category = 'hop' AND use_stage = 'dry_hop';

-- 5. Set default temperatures for existing hop records
UPDATE recipe_items SET temperature_c = 4 WHERE category = 'hop' AND use_stage = 'dry_hop_cold' AND temperature_c IS NULL;
UPDATE recipe_items SET temperature_c = 85 WHERE category = 'hop' AND use_stage = 'whirlpool' AND temperature_c IS NULL;
