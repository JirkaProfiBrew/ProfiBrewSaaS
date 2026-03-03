-- Hop form factor for IBU calculation.
-- System codebook (no tenant_id) with utilization multipliers.
-- Pellet hops have ~10% higher utilization than leaf/whole hops.

CREATE TABLE hop_forms (
  id              TEXT PRIMARY KEY,
  name_cs         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  utilization_factor DECIMAL NOT NULL DEFAULT 1.0,
  sort_order      INTEGER DEFAULT 0
);

INSERT INTO hop_forms (id, name_cs, name_en, utilization_factor, sort_order) VALUES
  ('pellet', 'Granule (pelety)', 'Pellet',     1.10, 1),
  ('leaf',   'Hlávkový',         'Leaf/Whole', 1.00, 2),
  ('plug',   'Plug',             'Plug',       1.02, 3),
  ('cryo',   'Cryo Hops',        'Cryo Hops',  1.10, 4);

-- Add hop_form column to items (only relevant for hops)
ALTER TABLE items ADD COLUMN hop_form TEXT REFERENCES hop_forms(id);
