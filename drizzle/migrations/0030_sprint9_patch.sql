-- Sprint 9 Patch (9.1 + 9.2) — Onboarding, Trial Conversion, Pilots

-- 1. Tenants — onboarding columns
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_skip_reminder_disabled BOOLEAN DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS conversion_modal_shown_at TIMESTAMPTZ;

-- 2. Warehouses — type column
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'other';
UPDATE warehouses SET type = 'other' WHERE type = 'other'; -- noop for safety

-- 3. Subscriptions — source, original plan, invite
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'self_service';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS original_trial_plan_slug TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS invite_id UUID;

-- 4. Cashflow categories — template reference
ALTER TABLE cashflow_categories ADD COLUMN IF NOT EXISTS template_id UUID;

-- 5. Cashflow Category Templates (global)
CREATE TABLE IF NOT EXISTS cashflow_category_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cashflow_type TEXT NOT NULL,
  parent_id UUID REFERENCES cashflow_category_templates(id),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Billing Events
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL,
  plan_slug TEXT,
  amount DECIMAL,
  notes TEXT,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant ON billing_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_events_processed ON billing_events(processed);

-- 7. Pilot Invitations
CREATE TABLE IF NOT EXISTS pilot_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  plan_slug TEXT NOT NULL DEFAULT 'pro',
  trial_days INTEGER NOT NULL DEFAULT 30,
  price_override DECIMAL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  registered_tenant_id UUID REFERENCES tenants(id),
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pilot_invitations_token ON pilot_invitations(token);
CREATE INDEX IF NOT EXISTS idx_pilot_invitations_email ON pilot_invitations(email);

-- 8. FK for subscriptions.invite_id (after pilot_invitations created)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'subscriptions_invite_id_fkey'
    AND table_name = 'subscriptions'
  ) THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_invite_id_fkey
      FOREIGN KEY (invite_id) REFERENCES pilot_invitations(id);
  END IF;
END $$;

-- 9. FK for cashflow_categories.template_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'cashflow_categories_template_id_fkey'
    AND table_name = 'cashflow_categories'
  ) THEN
    ALTER TABLE cashflow_categories ADD CONSTRAINT cashflow_categories_template_id_fkey
      FOREIGN KEY (template_id) REFERENCES cashflow_category_templates(id);
  END IF;
END $$;

-- 10. Seed cashflow category templates
INSERT INTO cashflow_category_templates (id, name, cashflow_type, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Příjmy',  'income',  0),
  ('a0000001-0000-0000-0000-000000000002', 'Výdaje',  'expense', 1)
ON CONFLICT DO NOTHING;

INSERT INTO cashflow_category_templates (id, name, cashflow_type, parent_id, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000011', 'Prodej piva',          'income',  'a0000001-0000-0000-0000-000000000001', 0),
  ('a0000001-0000-0000-0000-000000000012', 'Tržby taproom',        'income',  'a0000001-0000-0000-0000-000000000001', 1),
  ('a0000001-0000-0000-0000-000000000013', 'Ostatní příjmy',       'income',  'a0000001-0000-0000-0000-000000000001', 2),
  ('a0000001-0000-0000-0000-000000000021', 'Suroviny a materiál',  'expense', 'a0000001-0000-0000-0000-000000000002', 0),
  ('a0000001-0000-0000-0000-000000000022', 'Energie',              'expense', 'a0000001-0000-0000-0000-000000000002', 1),
  ('a0000001-0000-0000-0000-000000000023', 'Mzdové náklady',       'expense', 'a0000001-0000-0000-0000-000000000002', 2),
  ('a0000001-0000-0000-0000-000000000024', 'Obaly a packaging',    'expense', 'a0000001-0000-0000-0000-000000000002', 3),
  ('a0000001-0000-0000-0000-000000000025', 'Spotřební daň',        'expense', 'a0000001-0000-0000-0000-000000000002', 4),
  ('a0000001-0000-0000-0000-000000000026', 'Ostatní výdaje',       'expense', 'a0000001-0000-0000-0000-000000000002', 5)
ON CONFLICT DO NOTHING;
