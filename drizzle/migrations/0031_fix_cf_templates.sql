-- Fix cashflow category templates: replace flat "Příjmy"/"Výdaje" meta-roots
-- with proper 2-level hierarchy matching tenant-level category structure.

-- 1. Soft-delete old templates (keep for FK integrity with existing tenant categories)
UPDATE cashflow_category_templates SET is_active = false WHERE is_active = true;

-- 2. Insert new 2-level templates matching the hardcoded seed structure

-- ===================== INCOME =====================
-- Root: Prodej piva
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000001', 'Prodej piva', 'income', 1)
ON CONFLICT DO NOTHING;

-- Children of Prodej piva
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000011', 'Prodej sudové',   'income', 'b0000001-0000-0000-0000-000000000001', 1),
  ('b0000001-0000-0000-0000-000000000012', 'Prodej lahvové',  'income', 'b0000001-0000-0000-0000-000000000001', 2),
  ('b0000001-0000-0000-0000-000000000013', 'Prodej taproom',  'income', 'b0000001-0000-0000-0000-000000000001', 3)
ON CONFLICT DO NOTHING;

-- Root: Zálohy přijaté (no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000002', 'Zálohy přijaté', 'income', 2)
ON CONFLICT DO NOTHING;

-- Root: Ostatní příjmy (no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000003', 'Ostatní příjmy', 'income', 3)
ON CONFLICT DO NOTHING;

-- ===================== EXPENSE =====================
-- Root: Nákup surovin
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000101', 'Nákup surovin', 'expense', 1)
ON CONFLICT DO NOTHING;

-- Children of Nákup surovin
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000111', 'Slad',              'expense', 'b0000001-0000-0000-0000-000000000101', 1),
  ('b0000001-0000-0000-0000-000000000112', 'Chmel',             'expense', 'b0000001-0000-0000-0000-000000000101', 2),
  ('b0000001-0000-0000-0000-000000000113', 'Kvasnice',          'expense', 'b0000001-0000-0000-0000-000000000101', 3),
  ('b0000001-0000-0000-0000-000000000114', 'Ostatní suroviny',  'expense', 'b0000001-0000-0000-0000-000000000101', 4)
ON CONFLICT DO NOTHING;

-- Root: Provozní náklady
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000102', 'Provozní náklady', 'expense', 2)
ON CONFLICT DO NOTHING;

-- Children of Provozní náklady
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000121', 'Energie',  'expense', 'b0000001-0000-0000-0000-000000000102', 1),
  ('b0000001-0000-0000-0000-000000000122', 'Nájemné',  'expense', 'b0000001-0000-0000-0000-000000000102', 2),
  ('b0000001-0000-0000-0000-000000000123', 'Pojistka', 'expense', 'b0000001-0000-0000-0000-000000000102', 3),
  ('b0000001-0000-0000-0000-000000000124', 'Údržba',   'expense', 'b0000001-0000-0000-0000-000000000102', 4)
ON CONFLICT DO NOTHING;

-- Root: Obaly a materiál (no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000103', 'Obaly a materiál', 'expense', 3)
ON CONFLICT DO NOTHING;

-- Root: Daně a poplatky
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000104', 'Daně a poplatky', 'expense', 4)
ON CONFLICT DO NOTHING;

-- Children of Daně a poplatky
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000141', 'Spotřební daň', 'expense', 'b0000001-0000-0000-0000-000000000104', 1),
  ('b0000001-0000-0000-0000-000000000142', 'DPH',           'expense', 'b0000001-0000-0000-0000-000000000104', 2)
ON CONFLICT DO NOTHING;

-- Root: Mzdy (no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000105', 'Mzdy', 'expense', 5)
ON CONFLICT DO NOTHING;

-- Root: Ostatní výdaje (no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000106', 'Ostatní výdaje', 'expense', 6)
ON CONFLICT DO NOTHING;
