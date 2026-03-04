-- ============================================================
-- fermentable_types: system codebook for fermentable ingredient types
-- + items.fermentable_type column
-- + adjunct → fermentable / other category split
-- ============================================================

-- 1. Create fermentable_types table
CREATE TABLE IF NOT EXISTS fermentable_types (
  id                TEXT PRIMARY KEY,
  name_cs           TEXT NOT NULL,
  name_en           TEXT NOT NULL,
  default_extract   DECIMAL NOT NULL DEFAULT 80,
  sort_order        INTEGER DEFAULT 0
);

INSERT INTO fermentable_types (id, name_cs, name_en, default_extract, sort_order) VALUES
  ('grain',          'Slad',                     'Grain',              80, 1),
  ('adjunct_grain',  'Doplněk (obilný)',         'Adjunct Grain',      70, 2),
  ('sugar',          'Cukr',                     'Sugar',             100, 3),
  ('honey',          'Med',                      'Honey',              95, 4),
  ('dry_extract',    'Sušený výtažek (DME)',     'Dry Malt Extract',   96, 5),
  ('liquid_extract', 'Tekutý výtažek (LME)',     'Liquid Malt Extract', 80, 6)
ON CONFLICT (id) DO NOTHING;

-- 2. Add fermentable_type column to items
ALTER TABLE items ADD COLUMN IF NOT EXISTS fermentable_type TEXT REFERENCES fermentable_types(id);

-- 3a. Reclassify adjunct items: fermentable vs other
-- Zkvasitelné adjuncts (mají extract nebo EBC) → fermentable
UPDATE items
SET material_type = 'fermentable'
WHERE material_type = 'adjunct'
  AND (extract_percent > 0 OR ebc > 0);

-- Nezkvasitelné adjuncts → other
UPDATE items
SET material_type = 'other'
WHERE material_type = 'adjunct';

-- 3b. Reclassify recipe_items categories
UPDATE recipe_items
SET category = 'fermentable'
WHERE category = 'adjunct'
  AND item_id IN (SELECT id FROM items WHERE material_type = 'fermentable');

UPDATE recipe_items
SET category = 'other'
WHERE category = 'adjunct';

-- 3c. Backfill fermentable_type on existing items
UPDATE items SET fermentable_type = 'grain'
WHERE material_type = 'malt' AND fermentable_type IS NULL;

UPDATE items SET fermentable_type = 'sugar'
WHERE material_type = 'fermentable' AND fermentable_type IS NULL;
