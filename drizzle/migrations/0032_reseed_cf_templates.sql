-- Reseed cashflow_category_templates with correct 2-level hierarchy.
-- Delete all existing rows and insert fresh data.

-- 1. Delete children first (FK constraint), then roots
DELETE FROM cashflow_category_templates WHERE parent_id IS NOT NULL;
DELETE FROM cashflow_category_templates;

-- 2. Insert roots and children

-- ===================== INCOME =====================
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000001', 'Prodej piva', 'income', 1);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000011', 'Prodej sudové',   'income', 'b0000001-0000-0000-0000-000000000001', 1),
  ('b0000001-0000-0000-0000-000000000012', 'Prodej lahvové',  'income', 'b0000001-0000-0000-0000-000000000001', 2),
  ('b0000001-0000-0000-0000-000000000013', 'Prodej taproom',  'income', 'b0000001-0000-0000-0000-000000000001', 3);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000002', 'Zálohy přijaté', 'income', 2);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000003', 'Ostatní příjmy', 'income', 3);

-- ===================== EXPENSE =====================
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000101', 'Nákup surovin', 'expense', 1);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000111', 'Slad',              'expense', 'b0000001-0000-0000-0000-000000000101', 1),
  ('b0000001-0000-0000-0000-000000000112', 'Chmel',             'expense', 'b0000001-0000-0000-0000-000000000101', 2),
  ('b0000001-0000-0000-0000-000000000113', 'Kvasnice',          'expense', 'b0000001-0000-0000-0000-000000000101', 3),
  ('b0000001-0000-0000-0000-000000000114', 'Ostatní suroviny',  'expense', 'b0000001-0000-0000-0000-000000000101', 4);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000102', 'Provozní náklady', 'expense', 2);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000121', 'Energie',  'expense', 'b0000001-0000-0000-0000-000000000102', 1),
  ('b0000001-0000-0000-0000-000000000122', 'Nájemné',  'expense', 'b0000001-0000-0000-0000-000000000102', 2),
  ('b0000001-0000-0000-0000-000000000123', 'Pojistka', 'expense', 'b0000001-0000-0000-0000-000000000102', 3),
  ('b0000001-0000-0000-0000-000000000124', 'Údržba',   'expense', 'b0000001-0000-0000-0000-000000000102', 4);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000103', 'Obaly a materiál', 'expense', 3);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000104', 'Daně a poplatky', 'expense', 4);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('b0000001-0000-0000-0000-000000000141', 'Spotřební daň', 'expense', 'b0000001-0000-0000-0000-000000000104', 1),
  ('b0000001-0000-0000-0000-000000000142', 'DPH',           'expense', 'b0000001-0000-0000-0000-000000000104', 2);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000105', 'Mzdy', 'expense', 5);

INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order)
VALUES ('b0000001-0000-0000-0000-000000000106', 'Ostatní výdaje', 'expense', 6);
