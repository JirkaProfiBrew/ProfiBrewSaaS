-- Sprint 7 Patch: Yeast Forms
-- System codebook for yeast form (dry/liquid) with default unit mapping.

CREATE TABLE IF NOT EXISTS yeast_forms (
  id          TEXT PRIMARY KEY,
  name_cs     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  default_unit TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0
);

INSERT INTO yeast_forms (id, name_cs, name_en, default_unit, sort_order) VALUES
  ('dry',    'Sušené',  'Dry',    'g',  1),
  ('liquid', 'Tekuté',  'Liquid', 'ml', 2)
ON CONFLICT DO NOTHING;

ALTER TABLE items ADD COLUMN IF NOT EXISTS yeast_form TEXT REFERENCES yeast_forms(id);

-- Backfill existing yeast items with default 'dry'
UPDATE items SET yeast_form = 'dry'
WHERE material_type = 'yeast' AND yeast_form IS NULL;
