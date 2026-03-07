-- Reseed cashflow_category_templates with correct data from DEV.
-- Delete all existing rows and insert fresh data matching DEV database.

-- 1. Delete children first (FK constraint), then roots
DELETE FROM cashflow_category_templates WHERE parent_id IS NOT NULL;
DELETE FROM cashflow_category_templates;

-- 2. Insert roots and children

-- ===================== INCOME =====================

-- Prodej piva (root)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('a0000001-0000-0000-0000-000000000011', 'Prodej piva', 'income', NULL, 0, true);

-- Prodej piva → children
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active) VALUES
  ('6c1be07b-af47-4f4f-8363-575ac26ead00', 'Maloobchod',          'income', 'a0000001-0000-0000-0000-000000000011', 0, true),
  ('d3595e38-bf3f-49b6-b962-b5b3d6121010', 'Velkoobchod',         'income', 'a0000001-0000-0000-0000-000000000011', 1, true),
  ('6455ef79-bacd-4c24-b5db-381a783479c9', 'Eshop',               'income', 'a0000001-0000-0000-0000-000000000011', 2, true),
  ('ef58e357-7e1f-4906-aac1-6d0202b763e4', 'Restaurace (vlastní)','income', 'a0000001-0000-0000-0000-000000000011', 3, true);

-- Ostatní příjmy (root, no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('a0000001-0000-0000-0000-000000000013', 'Ostatní příjmy', 'income', NULL, 2, true);

-- ===================== EXPENSE =====================

-- Nákup surovin (root, no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('a0000001-0000-0000-0000-000000000021', 'Nákup surovin', 'expense', NULL, 0, true);

-- Obaly a materiál (root, no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('a0000001-0000-0000-0000-000000000024', 'Obaly a materiál', 'expense', NULL, 1, true);

-- Provozní náklady (root)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('a0000001-0000-0000-0000-000000000002', 'Provozní náklady', 'expense', NULL, 2, true);

-- Provozní náklady → children
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active) VALUES
  ('a0000001-0000-0000-0000-000000000022', 'Energie',    'expense', 'a0000001-0000-0000-0000-000000000002', 1, true),
  ('92ee2d4d-3725-44a4-b248-56ee682beeb5', 'Nájemné',    'expense', 'a0000001-0000-0000-0000-000000000002', 2, true),
  ('0faec2ed-04a3-443d-8a6f-ea294ab16988', 'Pojištění',  'expense', 'a0000001-0000-0000-0000-000000000002', 3, true),
  ('caef3dc2-2763-4686-bc01-83ace414ddab', 'Údržba',     'expense', 'a0000001-0000-0000-0000-000000000002', 4, true);

-- Daně a poplatky (root)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('384461d5-142b-44a2-8226-b17c5e7f2158', 'Daně a poplatky', 'expense', NULL, 3, true);

-- Daně a poplatky → children
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active) VALUES
  ('a0000001-0000-0000-0000-000000000025', 'Spotřební daň', 'expense', '384461d5-142b-44a2-8226-b17c5e7f2158', 1, true),
  ('fccc62c1-b55f-427a-8248-6edf2bfc46ec', 'DPH',           'expense', '384461d5-142b-44a2-8226-b17c5e7f2158', 2, true);

-- Mzdové náklady (root, no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('a0000001-0000-0000-0000-000000000023', 'Mzdové náklady', 'expense', NULL, 4, true);

-- Ostatní výdaje (root, no children)
INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order, is_active)
VALUES ('a0000001-0000-0000-0000-000000000026', 'Ostatní výdaje', 'expense', NULL, 5, true);
