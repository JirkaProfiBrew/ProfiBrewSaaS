-- Seed system-level excise rates for Czech Republic (2024+).
-- tenant_id IS NULL = system defaults available to all tenants.
-- Categories A-E per Czech Excise Tax Act (§ 85).
-- Rate = CZK per degree Plato per hectoliter.

INSERT INTO excise_rates (id, tenant_id, category, rate_per_plato_hl, valid_from, valid_to, created_at, updated_at)
VALUES
  (gen_random_uuid(), NULL, 'A', '16.00', '2024-01-01', NULL, now(), now()),
  (gen_random_uuid(), NULL, 'B', '19.20', '2024-01-01', NULL, now(), now()),
  (gen_random_uuid(), NULL, 'C', '22.40', '2024-01-01', NULL, now(), now()),
  (gen_random_uuid(), NULL, 'D', '25.60', '2024-01-01', NULL, now(), now()),
  (gen_random_uuid(), NULL, 'E', '32.00', '2024-01-01', NULL, now(), now())
ON CONFLICT DO NOTHING;
