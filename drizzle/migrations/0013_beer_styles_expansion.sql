-- ============================================================
-- Sprint 6 Phase A3: Beer Styles Expansion (BJCP 2021 complete)
-- ============================================================

-- 1. New columns on beer_style_groups
ALTER TABLE beer_style_groups ADD COLUMN IF NOT EXISTS name_cz TEXT;
ALTER TABLE beer_style_groups ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. New columns on beer_styles
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS impression TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS mouthfeel TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS history TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS ingredients TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS style_comparison TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS commercial_examples TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS origin TEXT;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS srm_min DECIMAL;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS srm_max DECIMAL;
ALTER TABLE beer_styles ADD COLUMN IF NOT EXISTS style_family TEXT;
