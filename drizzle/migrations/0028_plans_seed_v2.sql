-- ============================================================
-- Sprint 9: Plans v2 — real pricing, community plans, schema extensions
-- ============================================================

-- === 1. SCHEMA EXTENSIONS ===

-- Plans: watermark flag (community plans show watermark on exports)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS watermark BOOLEAN DEFAULT false;

-- Plans: hard HL stop (block batches over limit, not overage billing)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_hard_hl_stop BOOLEAN DEFAULT false;

-- Subscriptions: trial end date
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- === 2. UPDATE EXISTING PLANS WITH REAL PRICING ===
-- Prices per pricing-strategy.md v1.1, valid from 2026-04-01

UPDATE plans SET
  base_price = 0,
  included_hl = 50,
  overage_per_hl = NULL,
  max_users = 2,
  included_modules = ARRAY['brewery'],
  is_hard_hl_stop = true,
  watermark = false,
  valid_from = '2026-04-01'
WHERE slug = 'free' AND valid_to IS NULL;

UPDATE plans SET
  base_price = 1490,
  included_hl = 200,
  overage_per_hl = 15,
  max_users = NULL,
  included_modules = ARRAY['brewery', 'stock'],
  is_hard_hl_stop = false,
  watermark = false,
  valid_from = '2026-04-01'
WHERE slug = 'starter' AND valid_to IS NULL;

UPDATE plans SET
  base_price = 3490,
  included_hl = 500,
  overage_per_hl = 12,
  max_users = NULL,
  included_modules = ARRAY['brewery', 'stock', 'sales', 'finance'],
  is_hard_hl_stop = false,
  watermark = false,
  valid_from = '2026-04-01'
WHERE slug = 'pro' AND valid_to IS NULL;

UPDATE plans SET
  base_price = 6990,
  included_hl = 2000,
  overage_per_hl = 8,
  max_users = NULL,
  included_modules = ARRAY['brewery', 'stock', 'sales', 'finance', 'plan'],
  is_hard_hl_stop = false,
  watermark = false,
  valid_from = '2026-04-01'
WHERE slug = 'business' AND valid_to IS NULL;

-- === 3. COMMUNITY PLANS (is_public = false) ===

INSERT INTO plans (slug, name, description, base_price, currency, billing_period,
  included_hl, overage_per_hl, max_users, included_modules,
  api_access, integrations, priority_support,
  is_hard_hl_stop, watermark,
  version, valid_from, is_active, is_public, sort_order)
VALUES
  -- DOMOVARNÍK — zákonný limit 2 000 l/rok ≈ 2 hl/měsíc
  ('community_homebrewer', 'Domovarník',
   'Pro domácí výrobu piva — nekomerční použití',
   0, 'CZK', 'monthly',
   2, NULL, 1, ARRAY['brewery', 'stock', 'finance'],
   false, false, false,
   true, true,
   1, '2026-04-01', true, false, 99),

  -- ŠKOLA — neomezený výstav, neomezení uživatelé
  ('community_school', 'Škola',
   'Pro vzdělávací instituce — nekomerční použití',
   0, 'CZK', 'monthly',
   NULL, NULL, NULL, ARRAY['brewery', 'stock', 'finance'],
   false, false, false,
   false, true,
   1, '2026-04-01', true, false, 99)
ON CONFLICT DO NOTHING;

-- === 4. COMMUNITY APPLICATIONS TABLE ===

CREATE TABLE IF NOT EXISTS community_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'school' CHECK (type = 'school'),
  school_name   TEXT NOT NULL,
  ico           TEXT,
  contact_name  TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID,
  reviewed_at   TIMESTAMPTZ,
  expires_at    DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_applications_tenant" ON community_applications
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_superadmin = true)
  );
