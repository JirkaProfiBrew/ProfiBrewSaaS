-- ============================================================
-- SEED DATA — Plans (4 tiers with placeholder prices)
-- ============================================================
-- Prices are TBD — placeholders for development/testing.
-- Will be finalized based on CZ market analysis.

INSERT INTO plans (slug, name, description, base_price, currency, billing_period,
  included_hl, overage_per_hl, max_users, included_modules,
  api_access, integrations, priority_support,
  version, valid_from, is_active, is_public, sort_order)
VALUES
  -- FREE tier
  ('free', 'Free', 'Základní funkce pro začínající pivovary',
   0, 'CZK', 'monthly',
   NULL, NULL, 2, ARRAY['brewery'],
   false, false, false,
   1, '2026-01-01', true, true, 0),

  -- STARTER tier
  ('starter', 'Starter', 'Pro malé pivovary s rozšířenými potřebami',
   0, 'CZK', 'monthly',
   NULL, NULL, NULL, ARRAY['brewery', 'stock'],
   false, false, false,
   1, '2026-01-01', true, true, 1),

  -- PRO tier
  ('pro', 'Pro', 'Kompletní řešení pro rostoucí pivovary',
   0, 'CZK', 'monthly',
   NULL, NULL, NULL, ARRAY['brewery', 'stock', 'sales', 'finance', 'plan'],
   false, false, false,
   1, '2026-01-01', true, true, 2),

  -- BUSINESS tier
  ('business', 'Business', 'Plná výbava s API a integracemi',
   0, 'CZK', 'monthly',
   NULL, NULL, NULL, ARRAY['brewery', 'stock', 'sales', 'finance', 'plan'],
   true, true, true,
   1, '2026-01-01', true, true, 3);
