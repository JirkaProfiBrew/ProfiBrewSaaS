# PROFIBREW.COM — SYSTEM DESIGN DOCUMENT
## Architectural Blueprint for SaaS ERP Development
### Version: 2.0 | Date: 17.02.2026

---

## CHANGE LOG

| Version | Date | Changes |
|---------|------|---------|
| 2.2 | 20.02.2026 | Sprint 4: Orders, deposits, cashflows, cashflow_categories, cashflow_templates, cash_desks tables. Reserved qty on stock_status. Production issues with recipe_item_id. Auto-receipts on batch completion. |
| 2.1 | 17.02.2026 | Pricing model: tier-based + add-on modules + overage per hl. Temporal plans/subscriptions in DB. Subscription decoupled from tenants table. Usage records for billing. |
| 2.0 | 17.02.2026 | Hybrid items model, unified Partner, excise/equipment/shop/cashflow into MVP, card view, lot tracking, i18n, Drizzle ORM, configurable numbering sequences, extended data model based on Bubble audit |
| 1.0 | 17.02.2026 | Initial draft |

---

## 1. SYSTEM OVERVIEW

### 1.1 What We Are Building

ProfiBrew is a **multi-tenant SaaS application** — an information system for microbreweries. Each brewery (tenant) has its own isolated data, users, and configuration, but shares a single application and database.

### 1.2 Architectural Decisions

| Area | Decision | Reason |
|------|----------|--------|
| **Multi-tenancy** | Shared DB + tenant_id | Simple management, low operating costs, sufficient for 500+ tenants |
| **Frontend** | Next.js 14+ (App Router) | SSR/SSG, API routes, Claude Code handles it best |
| **UI Library** | shadcn/ui + Tailwind CSS | Consistent design, reusable components, rapid development |
| **Backend/DB** | Supabase (PostgreSQL) | Auth, RLS, realtime, storage — all out of the box |
| **ORM** | **Drizzle** | Type-safe, SQL-close, lightweight, good for edge |
| **Hosting** | Vercel | Zero-config deploy, edge functions, preview deploys |
| **Language** | TypeScript strict | Type safety, better AI code generation |
| **i18n** | **next-intl from the start** | Planned expansion beyond CZ (SK, PL…) |
| **Units of measure** | **Base unit in DB** | Always liters/grams, conversion in UI. Unit definitions + relationships later. |
| **Numbering sequences** | **Configurable per tenant** | Preset defaults, tenant can change prefix/format |
| **Item model** | **Hybrid (unified items + views)** | Single table with flags, filtered views for materials/products |
| **Partner model** | **Unified Partner** | One partner = customer and supplier (flags) |

### 1.3 High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    VERCEL (Hosting)                  │
│  ┌───────────────────────────────────────────────┐  │
│  │              NEXT.JS APPLICATION               │  │
│  │                                                │  │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────────┐ │  │
│  │  │  Pages   │  │   API    │  │  Middleware   │ │  │
│  │  │  (UI)    │  │  Routes  │  │  (Auth+RBAC) │ │  │
│  │  └────┬─────┘  └────┬─────┘  └──────┬───────┘ │  │
│  │       │              │               │         │  │
│  │  ┌────┴──────────────┴───────────────┴──────┐  │  │
│  │  │         REUSABLE COMPONENT LIBRARY        │  │  │
│  │  │  DataBrowser | Forms | Navigation | Layout│  │  │
│  │  └──────────────────┬────────────────────────┘  │  │
│  └─────────────────────┼────────────────────────┘  │
│                        │                            │
└────────────────────────┼────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │     SUPABASE        │
              │  ┌───────────────┐  │
              │  │  PostgreSQL   │  │
              │  │  + RLS        │  │
              │  ├───────────────┤  │
              │  │  Auth         │  │
              │  ├───────────────┤  │
              │  │  Storage      │  │
              │  ├───────────────┤  │
              │  │  Edge Funcs   │  │
              │  └───────────────┘  │
              └─────────────────────┘
                         │
              ┌──────────┴──────────┐
              │  EXTERNAL SERVICES  │
              │  - Accounting sys.  │
              │  - Email (Resend)   │
              │  - Payments (Stripe)│
              │  - ARES (ICO)       │
              │  - Monitoring       │
              └─────────────────────┘
```

---

## 2. MULTI-TENANT ARCHITECTURE

### 2.1 Tenant Isolation

**Model: Shared Database, Shared Schema, Tenant ID Isolation**

Every table containing tenant-specific data has a `tenant_id` column. Data access is enforced at three levels:

```
Level 1: Supabase RLS (Row Level Security)
  → Database NEVER returns data from another tenant
  → Strongest protection — works even if there is a bug in the code

Level 2: API middleware
  → Every API request verifies tenant_id from the JWT token
  → Automatic filtering in the query builder

Level 3: Frontend context
  → TenantProvider wraps the entire application
  → Components have access to tenant_id via hook
```

### 2.2 Tenant Data Model

```sql
-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                    -- Brewery name
  slug            TEXT UNIQUE NOT NULL,             -- URL-friendly identifier
  status          TEXT NOT NULL DEFAULT 'trial',    -- trial | active | suspended | cancelled
  trial_ends_at   TIMESTAMPTZ,                     -- End of trial period
  settings        JSONB DEFAULT '{}',              -- Tenant-specific configuration
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- NOTE: Plan is NOT an attribute of the tenant. Tenant has a subscription (see 2.3),
-- which references a specific plan version. Reason: plans change over time,
-- tenant must be bound to a specific version of terms.

-- settings JSONB structure:
-- {
--   "currency": "CZK",
--   "locale": "cs",
--   "timezone": "Europe/Prague",
--   "brewery_type": "production" | "brewpub" | "contract",
--   "annual_output_hl": 950,
--   "logo_url": "...",
--   "excise_enabled": true,
--   "excise_tax_point_mode": "production" | "release",
--   "excise_default_plato_source": "recipe" | "measurement"
-- }
```

### 2.3 Subscription & Pricing Model

#### Principle

Tier-based pricing with modular flexibility and usage-based overage. Key properties:

- **Tier = module bundle** with included hectoliters/month
- **Add-on modules** purchasable on lower tiers for a flat fee
- **Overage billing** per hl above included limit (CZK/hl/month)
- **Unlimited users** from the Starter tier
- **Everything configurable in DB** — plans, limits, prices have temporal validity (valid_from/valid_to)

```
                    FREE          STARTER        PRO            BUSINESS
────────────────────────────────────────────────────────────────────────
Price/month         0 CZK         TBD            TBD            TBD
Included hl/mo      TBD           TBD            TBD            TBD
Overage CZK/hl      —             TBD            TBD            TBD
────────────────────────────────────────────────────────────────────────
Modules             Brewery       Brewery        All            All
                                  Stock                         + API
                                                                + integrations
────────────────────────────────────────────────────────────────────────
Add-on modules      +flat/mo      +flat/mo       —              —
Users               2             Unlimited      Unlimited      Unlimited
────────────────────────────────────────────────────────────────────────

TBD = To be determined based on a separate CZ market and competition analysis.

Launch promo: "First X months without hectoliter limits on all plans"
```

#### Why Temporal Data

Plans will change — prices, limits, included modules. A tenant who started on "Starter v1" for 1,490 CZK must stay on those terms until they actively switch to a new version. Therefore:

- **Plan** has `valid_from` / `valid_to` — plan version over time
- **Subscription** of a tenant references a **specific version** of a plan
- New plan version = new record, old one gets `valid_to`
- Migrating a tenant to a new plan = new subscription with a reference to the new version

#### DB Schema: Subscription & Billing

```sql
-- ============================================================
-- PLANS (tariff plan definitions — versioned over time)
-- ============================================================
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL,              -- 'free' | 'starter' | 'pro' | 'business'
  name            TEXT NOT NULL,              -- 'Starter'
  description     TEXT,

  -- === PRICING ===
  base_price      DECIMAL NOT NULL DEFAULT 0, -- Monthly price (CZK)
  currency        TEXT NOT NULL DEFAULT 'CZK',
  billing_period  TEXT DEFAULT 'monthly',     -- 'monthly' | 'yearly'

  -- === LIMITS ===
  included_hl     DECIMAL,                    -- Included hl/month (NULL = unlimited)
  overage_per_hl  DECIMAL,                    -- CZK per hl above limit (NULL = no overage, hard stop)
  max_users       INTEGER,                    -- Max users (NULL = unlimited)

  -- === FEATURES ===
  included_modules TEXT[] NOT NULL,           -- {'brewery'} | {'brewery','stock'} | {'brewery','stock','sales','finance','plan'}
  api_access      BOOLEAN DEFAULT false,
  integrations    BOOLEAN DEFAULT false,
  priority_support BOOLEAN DEFAULT false,

  -- === VERSIONING ===
  version         INTEGER NOT NULL DEFAULT 1, -- Plan version
  valid_from      DATE NOT NULL,              -- Valid from
  valid_to        DATE,                       -- Valid to (NULL = currently active)
  is_active       BOOLEAN DEFAULT true,       -- Can be switched to
  is_public       BOOLEAN DEFAULT true,       -- Show on pricing page

  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookup of the currently valid plan version
CREATE INDEX idx_plans_active ON plans(slug, valid_from) WHERE valid_to IS NULL;

-- ============================================================
-- PLAN ADD-ONS (purchasable modules for lower tiers)
-- ============================================================
CREATE TABLE plan_addons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL,              -- 'module_sales' | 'module_finance' | 'module_plan'
  name            TEXT NOT NULL,              -- 'Sales module'
  module          TEXT NOT NULL,              -- 'sales' | 'finance' | 'plan'
  price           DECIMAL NOT NULL,           -- Flat fee CZK/month
  currency        TEXT NOT NULL DEFAULT 'CZK',

  -- === COMPATIBILITY ===
  available_on_plans TEXT[] NOT NULL,         -- {'free','starter'} — which plans allow this add-on

  -- === VERSIONING ===
  valid_from      DATE NOT NULL,
  valid_to        DATE,
  is_active       BOOLEAN DEFAULT true,

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SUBSCRIPTIONS (tenant ↔ plan — what the tenant currently pays)
-- ============================================================
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  plan_id         UUID NOT NULL REFERENCES plans(id),  -- Specific plan VERSION
  status          TEXT NOT NULL DEFAULT 'active',
    -- 'trialing' | 'active' | 'past_due' | 'cancelled' | 'paused'

  -- === PERIOD ===
  started_at      DATE NOT NULL,
  current_period_start DATE NOT NULL,
  current_period_end   DATE NOT NULL,
  cancelled_at    DATE,
  cancel_at_period_end BOOLEAN DEFAULT false,  -- Cancel at end of period

  -- === PROMO / OVERRIDE ===
  promo_code      TEXT,
  overage_waived_until DATE,                  -- Launch promo: unlimited hl until this date
  price_override  DECIMAL,                    -- Individual price (NULL = per plan)

  -- === STRIPE ===
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Tenant always has at most 1 active subscription
CREATE UNIQUE INDEX idx_subscriptions_active
  ON subscriptions(tenant_id)
  WHERE status IN ('trialing', 'active', 'past_due');

-- ============================================================
-- SUBSCRIPTION ADD-ONS (tenant's active add-ons)
-- ============================================================
CREATE TABLE subscription_addons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  addon_id        UUID NOT NULL REFERENCES plan_addons(id),  -- Specific add-on version
  started_at      DATE NOT NULL,
  cancelled_at    DATE,
  price_override  DECIMAL,                    -- Individual price (NULL = per add-on)
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(subscription_id, addon_id)
);

-- ============================================================
-- USAGE RECORDS (monthly hl consumption records)
-- ============================================================
CREATE TABLE usage_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period_start    DATE NOT NULL,              -- First day of month
  period_end      DATE NOT NULL,              -- Last day of month

  -- === MEASUREMENT ===
  total_hl        DECIMAL NOT NULL DEFAULT 0, -- Total recorded hl for the period
  included_hl     DECIMAL NOT NULL,           -- How many hl were included in price (snapshot from plan)
  overage_hl      DECIMAL GENERATED ALWAYS AS (GREATEST(total_hl - included_hl, 0)) STORED,
  overage_rate    DECIMAL,                    -- Rate CZK/hl (snapshot from plan)
  overage_amount  DECIMAL GENERATED ALWAYS AS (GREATEST(total_hl - included_hl, 0) * COALESCE(overage_rate, 0)) STORED,
  overage_waived  BOOLEAN DEFAULT false,      -- Promo: overage waived

  -- === DATA SOURCE ===
  batch_ids       UUID[],                     -- Batches included in the calculation
  calculated_at   TIMESTAMPTZ,                -- When the calculation was performed

  -- === BILLING ===
  invoiced        BOOLEAN DEFAULT false,
  stripe_invoice_item_id TEXT,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, period_start)
);

-- ============================================================
-- SUBSCRIPTION HISTORY (log of all changes — audit trail)
-- ============================================================
CREATE TABLE subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  subscription_id UUID REFERENCES subscriptions(id),
  event_type      TEXT NOT NULL,
    -- 'created' | 'upgraded' | 'downgraded' | 'addon_added' | 'addon_removed' |
    -- 'cancelled' | 'reactivated' | 'price_changed' | 'plan_migrated' |
    -- 'promo_applied' | 'overage_invoiced' | 'payment_failed' | 'payment_succeeded'
  old_plan_id     UUID REFERENCES plans(id),
  new_plan_id     UUID REFERENCES plans(id),
  metadata        JSONB DEFAULT '{}',         -- Event details
  created_by      UUID REFERENCES auth.users(id),  -- NULL = system
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### How the System Works at Runtime

```
Module access check:
  1. Find the tenant's active subscription
  2. Get included_modules from plan_id
  3. Get extra modules from subscription_addons
  4. Merge → resulting set of allowed modules
  5. Cache in JWT / session (invalidate on subscription change)

Monthly billing cycle (CRON / Supabase Edge Function):
  1. For each tenant, calculate hl from batches for the period
  2. Create/update usage_record
  3. If overage_waived (promo) → skip
  4. If overage_hl > 0 → create Stripe invoice item
  5. Stripe generates invoice: base fee + overage

Plan change:
  1. New subscription with new plan_id
  2. Old subscription status → 'cancelled'
  3. Write to subscription_events (upgrade/downgrade)
  4. Prorate via Stripe (automatically)
```

#### Open Pricing Questions (→ separate analysis)

| # | Question | Status |
|---|----------|--------|
| P1 | Specific tier prices (CZK/month) | 🔜 CZ market analysis |
| P2 | Included hl limits per tier | 🔜 CZ market analysis |
| P3 | Overage rates (CZK/hl) | 🔜 CZ market analysis |
| P4 | Add-on prices per module | 🔜 CZ market analysis |
| P5 | Free tier limits (users, hl) | 🔜 CZ market analysis |
| P6 | Launch promo duration (months without overage) | 🔜 Business decision |
| P7 | Annual vs monthly billing (discount for annual?) | 🔜 Business decision |

---

## 3. AUTHENTICATION AND ACCESS CONTROL (RBAC)

### 3.1 Auth Flow

```
New brewery registration:
  1. User fills in the registration form
  2. System creates tenant + user + assigns "owner" role
  3. Supabase Auth creates session
  4. Redirect to onboarding wizard
  5. Wizard: basic brewery info, first shop, production equipment

Existing user login:
  1. Email + password (or magic link)
  2. Supabase Auth verifies credentials
  3. Middleware loads tenant_id + role from DB
  4. JWT token contains: user_id, tenant_id, role
```

### 3.2 Roles and Permissions

| Role | Description | Typical User |
|------|-------------|--------------|
| **owner** | Full access + tenant management, billing | Brewery owner |
| **admin** | Full data access, user management | Operations manager |
| **brewer** | Production, recipes, batches, inventory | Brewmaster |
| **sales** | Sales, customers, orders | Sales representative |
| **viewer** | Read only | External consultant, accountant |

### 3.3 Permission Matrix

```
┌──────────────────┬────────┬────────┬────────┬────────┬──────────┐
│ Module           │ owner  │ admin  │ brewer │ sales  │ viewer   │
├──────────────────┼────────┼────────┼────────┼────────┼──────────┤
│ Items/Materials  │ CRUD   │ CRUD   │ CRU    │ R      │ R        │
│ Recipes          │ CRUD   │ CRUD   │ CRUD   │ R      │ R        │
│ Batches/Brewing  │ CRUD   │ CRUD   │ CRUD   │ R      │ R        │
│ Equipment        │ CRUD   │ CRUD   │ CRU    │ R      │ R        │
│ Stock            │ CRUD   │ CRUD   │ CRU    │ R      │ R        │
│ Partners         │ CRUD   │ CRUD   │ R      │ CRUD   │ R        │
│ Orders           │ CRUD   │ CRUD   │ R      │ CRUD   │ R        │
│ Finance          │ CRUD   │ CRUD   │ -      │ R      │ R        │
│ Excise Tax       │ CRUD   │ CRUD   │ R      │ -      │ R        │
│ Reports          │ R      │ R      │ R*     │ R*     │ R*       │
│ Shops            │ CRUD   │ CRU    │ R      │ R      │ R        │
│ Users            │ CRUD   │ CRU    │ -      │ -      │ -        │
│ Settings         │ CRUD   │ R      │ -      │ -      │ -        │
│ Billing          │ CRUD   │ -      │ -      │ -      │ -        │
├──────────────────┴────────┴────────┴────────┴────────┴──────────┤
│ CRUD = Create, Read, Update, Delete | R = Read only              │
│ R* = Read, limited to role-relevant data | - = No access         │
└──────────────────────────────────────────────────────────────────┘
```

### 3.4 DB Structure for Auth + RBAC

```sql
-- ============================================================
-- USERS (extension of Supabase auth.users)
-- ============================================================
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name       TEXT,
  avatar_url      TEXT,
  phone           TEXT,
  is_superadmin   BOOLEAN DEFAULT false,   -- System flag, access to admin panel
  preferences     JSONB DEFAULT '{}',     -- UI preferences (menu state, preferred module, etc.)
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- preferences JSONB:
-- {
--   "sidebar_collapsed": false,
--   "preferred_module": "brewery",
--   "preferred_agenda": "batches",
--   "default_shop_id": "uuid..."
-- }

-- ============================================================
-- TENANT ↔ USER RELATIONSHIP
-- ============================================================
CREATE TABLE tenant_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  role            TEXT NOT NULL DEFAULT 'viewer',  -- owner | admin | brewer | sales | viewer
  is_active       BOOLEAN DEFAULT true,
  invited_at      TIMESTAMPTZ,
  joined_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

-- ============================================================
-- ROLE PERMISSIONS (system + custom per tenant)
-- ============================================================
CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),    -- NULL = system role
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  is_system       BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE role_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         UUID NOT NULL REFERENCES roles(id),
  module          TEXT NOT NULL,       -- 'items', 'recipes', 'batches', 'orders'...
  action          TEXT NOT NULL,       -- 'create', 'read', 'update', 'delete'
  conditions      JSONB,              -- Optional row-level restrictions
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MODULE + AGENDA RIGHTS (granular per user)
-- ============================================================
CREATE TABLE user_module_rights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  module          TEXT NOT NULL,       -- 'brewery', 'stock', 'sales', 'finance', 'plan'
  has_access      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id, module)
);

CREATE TABLE user_agenda_rights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  agenda          TEXT NOT NULL,       -- 'recipes', 'batches', 'items', 'orders'...
  can_create      BOOLEAN DEFAULT false,
  can_read        BOOLEAN DEFAULT true,
  can_update      BOOLEAN DEFAULT false,
  can_delete      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id, agenda)
);
```

---

## 4. REUSABLE COMPONENT LIBRARY

### 4.1 Philosophy

Every agenda in ProfiBrew uses the **same building blocks**. Goal: define once, use everywhere. Claude Code receives the component specification and generates modules as a puzzle from configuration.

### 4.2 DataBrowser — Main Browsing Component

Supports two display modes: **List View** (table) and **Card View** (tiles).

```
┌─────────────────────────────────────────────────────────────────┐
│ DataBrowser                                                      │
│                                                                  │
│ ┌─ Toolbar ────────────────────────────────────────────────────┐ │
│ │ [+ New record]  [≡ List] [⊞ Cards]  [Filters ▾]             │ │
│ │ [Saved views ▾]  🔍 Search          [Sort ▾] [↕ A-Z]        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Quick Filters (tab-style) ──────────────────────────────────┐ │
│ │ [All] [Malts & adjuncts] [Hops] [Yeast] [···▾]              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Active Filters (chips — if any active) ─────────────────────┐ │
│ │ Status: Active ✕ │ Manufacturer: Malina ✕ │ Clear all        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ═══════════════════════════════════════════════════════════════  │
│                                                                  │
│ LIST VIEW:                          CARD VIEW:                   │
│ ┌─────────────────────────────┐     ┌──────┐ ┌──────┐ ┌──────┐ │
│ │ ☐│Code │Name     │Price│...│     │ img  │ │ img  │ │ img  │ │
│ │ ☐│it001│Apollo   │990  │...│     │ Malt │ │ Hop  │ │ Malt │ │
│ │ ☐│it002│Aromatic.│   - │...│     │Apollo│ │Citra │ │Aroma │ │
│ │ ☐│it003│Cara Aro.│  50 │...│     │990CZK│ │13.8α │ │50 CZK│ │
│ └─────────────────────────────┘     │ 🗑📋↗│ │ 🗑📋↗│ │ 🗑📋↗│ │
│                                      └──────┘ └──────┘ └──────┘ │
│                                                                  │
│ ┌─ Parametric Filter Panel (slide-out from left) ─────────────┐ │
│ │ Name:      [____________]                                    │ │
│ │ Brand:     [Select ▾     ]                                   │ │
│ │ ☐ Sale item                                                  │ │
│ │ ☐ Available at POS                                           │ │
│ │ Material type: [Select ▾ ]                                   │ │
│ │ ☐ Base production item                                       │ │
│ │ Category:  [Select ▾     ]                                   │ │
│ │ [Apply filter]  [Clear]                                      │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Pagination ─────────────────────────────────────────────────┐ │
│ │ total items: 29 │ 15 ▾ items per page │ ‹‹ ‹ 1 of 2 › ››   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Bulk Actions (if records selected) ─────────────────────────┐ │
│ │ Selected: 3  │  [Export]  [Delete]  [Change status]          │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**DataBrowser Configuration (per agenda):**

```typescript
// Example configuration for the Items agenda — "Materials" view
const materialsBrowserConfig: DataBrowserConfig = {
  entity: "items",
  title: "Materials",
  baseFilter: { is_brew_material: true }, // Filter for this view

  // === VIEW MODES ===
  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      imageField: "image_url",
      titleField: "name",
      subtitleField: "material_type",  // "Malt", "Hop"...
      badgeFields: ["is_brew_material", "is_sale_item"],
      metricFields: [
        { key: "cost_price", label: "Price", format: "currency" },
        { key: "alpha", label: "Alpha", format: "0.0", showIf: "material_type=hop" },
      ],
      actions: ["delete", "duplicate", "detail"],
    }
  },

  // === LIST COLUMNS ===
  columns: [
    { key: "code",           label: "Code",           type: "text",    sortable: true, width: 100 },
    { key: "name",           label: "Name",           type: "link",    sortable: true },
    { key: "cost_price",     label: "Price",          type: "number",  sortable: true, format: "currency" },
    { key: "is_brew_material", label: "Material",     type: "boolean", sortable: false },
    { key: "is_sale_item",   label: "Sale item",      type: "boolean", sortable: false },
    { key: "alpha",          label: "Alpha",          type: "number",  sortable: true, format: "0.00" },
    { key: "brand",          label: "Manufacturer",   type: "text",    sortable: true },
    { key: "from_library",   label: "From library",   type: "icon",    sortable: false },
  ],

  // === QUICK FILTERS (tabs in toolbar) ===
  quickFilters: [
    { label: "All",                filter: {} },
    { label: "Malts & adjuncts",  filter: { material_type: ["malt", "adjunct"] } },
    { label: "Hops",              filter: { material_type: "hop" } },
    { label: "Yeast",             filter: { material_type: "yeast" } },
  ],

  // === PARAMETRIC FILTERS (slide-out panel) ===
  filters: [
    { key: "name",              label: "Name",              type: "text" },
    { key: "brand",             label: "Brand/manufacturer",type: "select", optionsFrom: "items.brand" },
    { key: "is_sale_item",      label: "Sale item",         type: "boolean" },
    { key: "pos_available",     label: "At POS",            type: "boolean" },
    { key: "material_type",     label: "Material type",     type: "multiselect",
      options: ["malt", "hop", "yeast", "adjunct", "other"] },
    { key: "is_base_product",   label: "Base production",   type: "boolean" },
    { key: "stock_category",    label: "Stock category",    type: "select", optionsFrom: "categories" },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50, 100],

  actions: {
    create: { label: "Material", enabled: true },
    bulkDelete: true,
    bulkExport: true,
    rowClick: "detail",
  },

  permissions: {
    create: ["owner", "admin", "brewer"],
    read:   ["owner", "admin", "brewer", "sales", "viewer"],
    update: ["owner", "admin", "brewer"],
    delete: ["owner", "admin"],
  }
};
```

### 4.3 Saved Views

```sql
CREATE TABLE saved_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID REFERENCES auth.users(id),   -- NULL = shared view
  entity          TEXT NOT NULL,                     -- 'items', 'batches', 'orders'...
  name            TEXT NOT NULL,                     -- 'Active lagers'
  is_default      BOOLEAN DEFAULT false,
  is_shared       BOOLEAN DEFAULT false,
  view_mode       TEXT DEFAULT 'list',               -- 'list' | 'card'
  config          JSONB NOT NULL,                    -- Complete browser state
  -- config: { filters, quickFilter, sort, columns, pageSize, viewMode }
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4.4 DetailView (Record Detail View)

```
┌─────────────────────────────────────────────────────────────────┐
│ DetailView                                                       │
│                                                                  │
│ ┌─ Header ─────────────────────────────────────────────────────┐ │
│ │ ◄ Back to list │ Edit item               [🌐][🗑][📋][↗][💾][✕]│
│ │                │ [Legal entity ▾]         [Update from ARES]  │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Tabs ───────────────────────────────────────────────────────┐ │
│ │ [Basic info] [Contacts] [Bank accts] [Addresses]             │ │
│ │ [Trade terms] [Documents] [Logo, attachments]                │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Content Area ───────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │  FormSection / nested DataBrowser / custom component         │ │
│ │                                                              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Footer ─────────────────────────────────────────────────────┐ │
│ │                                    [Cancel]  [Save]          │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.5 FormSection

```
Reusable form component:
- Automatically generated from field definitions
- Inline validation (Zod schema)
- Supported field types:
    text, textarea, number, decimal, date, datetime,
    select, multiselect, toggle/checkbox, file_upload,
    relation (lookup to another entity with search),
    computed (read-only calculated field),
    color (item color),
    currency (amount with currency)
- Responsive grid layout (1-4 columns)
- Modes: create | edit | readonly
- Conditional visibility (field visible only when condition is met)
```

### 4.6 Layout and Navigation

```
┌──────────────────────────────────────────────────────────────────┐
│ TopBar: [Pivovar Pancíř]  Brewery│Stock│Sales│Finance│Plan       │
│                                    [📋][🔔][❗][👤 Giorgina ▾]   │
├──────────┬───────────────────────────────────────────────────────┤
│ Sidebar  │  Main Content Area                                    │
│ «        │                                                       │
│ ★ Overview│  ┌─ Breadcrumb ─────────────────────────────────┐    │
│          │  │ Brewery > Materials > Apollo                   │    │
│ BREWERY  │  └───────────────────────────────────────────────┘    │
│ 👥Partner│                                                       │
│ 📇Contact│  ┌─ Page Content ────────────────────────────────┐    │
│ 🧪Materi.│  │                                                │    │
│ 📜Recipe │  │  DataBrowser / DetailView / Dashboard          │    │
│ 🍺Batches│  │                                                │    │
│ 🫙Fermen.│  └────────────────────────────────────────────────┘    │
│ 🏪Cellar │                                                       │
│ 🍶Packag.│                                                       │
│          │                                                       │
│ STOCK    │                                                       │
│ 📦Items  │                                                       │
│ 📊Movem. │                                                       │
│ 📍Tracki.│                                                       │
│ 🏷️ Exc.t│                                                       │
│ 📑Mo.rep.│                                                       │
│          │                                                       │
│ SALES    │                                                       │
│ 📋Orders │                                                       │
│ (pricelst)│                                                       │
│          │                                                       │
│ FINANCE  │                                                       │
│ 💰CashFl.│                                                       │
│          │                                                       │
│ ──────── │                                                       │
│ ⚙️Settin.│                                                       │
│ General  │                                                       │
├──────────┴───────────────────────────────────────────────────────┤
│ Sidebar is collapsible (« icons only)                            │
└──────────────────────────────────────────────────────────────────┘

Navigation logic:
- TopBar: Modules as main sections (Brewery, Stock, Sales, Finance, Plan)
- Sidebar: Agendas within the active module
- Sidebar remembers state (collapsed/expanded) per user
- Active module/agenda is highlighted
```

---

## 5. DATA MODEL — COMPLETE ENTITIES

### 5.1 Conventions

**Every tenant-scoped table contains:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | gen_random_uuid() |
| `tenant_id` | UUID FK NOT NULL | Reference to tenant |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | Trigger on update |
| `created_by` | UUID FK | Who created (where relevant) |

**Naming:**
- Tables: snake_case, plural (`items`, `batches`, `recipe_items`)
- Columns: snake_case (`batch_number`, `created_at`)
- Enum/status values: snake_case (`in_preparation`, `dry_hop`)
- Soft delete: `is_active BOOLEAN` or `status = 'archived'`

**Base units for storage:**
- Volume: liters (l)
- Weight: grams (g)
- Temperature: °C
- Time: minutes

### 5.2 Numbering Sequences

```sql
-- ============================================================
-- COUNTERS (configurable numbering sequences)
-- ============================================================
CREATE TABLE counters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity          TEXT NOT NULL,          -- 'batch', 'order', 'stock_issue', 'item'...
  prefix          TEXT NOT NULL,          -- 'V', 'OBJ', 'PR', 'VD'...
  include_year    BOOLEAN DEFAULT true,   -- Whether prefix includes year (V-2026-xxx)
  current_number  INTEGER DEFAULT 0,      -- Last used number
  padding         INTEGER DEFAULT 3,      -- Number of digits (001, 0001...)
  separator       TEXT DEFAULT '-',       -- Separator (V-2026-001 vs V/2026/001)
  reset_yearly    BOOLEAN DEFAULT true,   -- Reset to 0 at the beginning of each year
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, entity)
);

-- Default sequences when creating a tenant:
-- batch:       V-{YYYY}-{NNN}       → V-2026-001
-- order:       OBJ-{YYYY}-{NNNN}    → OBJ-2026-0001
-- stock_issue: PR-{YYYY}-{NNN}      → PR-2026-001 (receipt, "příjemka")
--              VD-{YYYY}-{NNN}      → VD-2026-001 (issue, "výdejka")
-- item:        it{NNNNN}             → it00001
```

### 5.3 Shops and Equipment

```sql
-- ============================================================
-- SHOPS (Locations — brewery, taproom, bar, warehouse)
-- ============================================================
CREATE TABLE shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,             -- "Pivovar Pancíř", "Taproom Žižkov"
  shop_type       TEXT NOT NULL,             -- 'brewery' | 'taproom' | 'warehouse' | 'office'
  address         JSONB,                     -- { street, city, zip, country }
  is_default      BOOLEAN DEFAULT false,     -- Default location
  is_active       BOOLEAN DEFAULT true,
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- EQUIPMENT (Production equipment — tanks, brewhouses, packaging lines)
-- ============================================================
CREATE TABLE equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id), -- At which location
  name            TEXT NOT NULL,              -- "Brewhouse 500l", "CKT #1"
  equipment_type  TEXT NOT NULL,              -- 'brewhouse' | 'fermenter' | 'brite_tank' |
                                              -- 'conditioning' | 'bottling_line' | 'keg_washer'
  volume_l        DECIMAL,                   -- Capacity in liters (base unit)
  status          TEXT DEFAULT 'available',   -- 'available' | 'in_use' | 'maintenance' | 'retired'
  current_batch_id UUID REFERENCES batches(id), -- Currently occupying batch
  properties      JSONB DEFAULT '{}',        -- Type-specific properties
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- properties examples:
-- Fermenter: { "material": "stainless", "cooling": true, "pressure_rated": true }
-- Brewhouse: { "mash_tun_volume_l": 600, "kettle_volume_l": 500 }
```

### 5.4 Items (Hybrid Items)

```sql
-- ============================================================
-- ITEMS (Unified — materials, products, everything in one)
-- ============================================================
CREATE TABLE items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  code              TEXT NOT NULL,              -- it00001 (from counter)
  name              TEXT NOT NULL,              -- "Apollo", "Bomba 13 ležák"
  brand             TEXT,                       -- Brand / manufacturer

  -- === FLAGS (what this item is) ===
  is_brew_material  BOOLEAN DEFAULT false,      -- Material for beer production
  is_production_item BOOLEAN DEFAULT false,     -- Item for production tracking (beer)
  is_sale_item      BOOLEAN DEFAULT false,      -- Sale item
  is_excise_relevant BOOLEAN DEFAULT false,     -- Subject to excise tax ("spotřební daň")

  -- === STOCK ===
  stock_category    TEXT,                       -- 'raw_material' | 'finished_product' | 'packaging' | 'other'
  issue_mode        TEXT DEFAULT 'fifo',        -- 'fifo' | 'lifo' | 'average'
  unit_id           UUID REFERENCES units(id),  -- Stock unit of measure
  recipe_unit_id    UUID REFERENCES units(id),  -- Recipe unit (hops: g vs stock kg)
  base_unit_amount  DECIMAL,                   -- Conversion to base unit

  -- === MATERIAL-SPECIFIC ===
  material_type     TEXT,                       -- 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  alpha             DECIMAL,                   -- Alpha acids (hops)
  ebc               DECIMAL,                   -- Color EBC (malt)
  extract_percent   DECIMAL,                   -- Yield % (malt)

  -- === PRODUCT-SPECIFIC ===
  packaging_type    TEXT,                       -- 'keg_30' | 'keg_50' | 'bottle_500' | 'can_330'...
  volume_l          DECIMAL,                   -- Package volume (l)
  abv               DECIMAL,                   -- ABV %
  plato             DECIMAL,                   -- Original gravity (°P)
  ean               TEXT,                       -- EAN code

  -- === PRICING ===
  cost_price        DECIMAL,                   -- Cost (purchase) price
  avg_price         DECIMAL,                   -- Average stock price
  sale_price        DECIMAL,                   -- Sale price
  overhead_manual   BOOLEAN DEFAULT false,     -- Overhead set manually
  overhead_price    DECIMAL,                   -- Overhead price for sales

  -- === POS / WEB ===
  pos_available     BOOLEAN DEFAULT false,     -- Available at POS
  web_available     BOOLEAN DEFAULT false,     -- Offer on web
  color             TEXT,                       -- Item color (hex)

  -- === META ===
  image_url         TEXT,
  notes             TEXT,
  is_active         BOOLEAN DEFAULT true,
  is_from_library   BOOLEAN DEFAULT false,     -- Imported from public library
  source_library_id UUID,                      -- Reference to library record

  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX idx_items_tenant_material ON items(tenant_id, material_type) WHERE is_brew_material;
CREATE INDEX idx_items_tenant_product ON items(tenant_id) WHERE is_sale_item;
CREATE INDEX idx_items_tenant_active ON items(tenant_id, is_active);

-- ============================================================
-- ITEM CATEGORIES (category system)
-- ============================================================
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),  -- NULL = global/system
  name            TEXT NOT NULL,
  category_type   TEXT NOT NULL,          -- 'stock' | 'cashflow' | 'product'
  parent_id       UUID REFERENCES categories(id),
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE item_categories (
  item_id         UUID NOT NULL REFERENCES items(id),
  category_id     UUID NOT NULL REFERENCES categories(id),
  PRIMARY KEY (item_id, category_id)
);

-- ============================================================
-- UNITS (units of measure — upgraded Sprint 2 Patch)
-- ============================================================
CREATE TABLE units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,          -- 'kg', 'g', 'l', 'ml', 'hl', 'ks', 'bal'
  name_cs         TEXT NOT NULL,                 -- Czech name: 'kilogram'
  name_en         TEXT NOT NULL,                 -- English name: 'kilogram'
  symbol          TEXT NOT NULL,                 -- Display symbol: 'kg'
  category        TEXT NOT NULL,                 -- 'weight' | 'volume' | 'count'
  base_unit_code  TEXT,                          -- NULL = is base unit; 'kg' for g
  to_base_factor  DECIMAL,                       -- g→kg = 0.001, ml→l = 0.001
  is_system       BOOLEAN DEFAULT true,
  tenant_id       UUID REFERENCES tenants(id),   -- NULL = system unit
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.5 Partners (Unified)

```sql
-- ============================================================
-- PARTNERS (customers + suppliers in one)
-- ============================================================
CREATE TABLE partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                -- "Restaurace U Fleků"

  -- === FLAGS ===
  is_customer     BOOLEAN DEFAULT false,
  is_supplier     BOOLEAN DEFAULT false,

  -- === LEGAL ===
  legal_form      TEXT,                         -- 'individual' | 'legal_entity'
  ico             TEXT,
  dic             TEXT,
  dic_validated   BOOLEAN DEFAULT false,        -- Verified via ARES
  legal_form_code TEXT,                         -- Legal form code from ARES

  -- === CONTACT ===
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  web             TEXT,

  -- === ADDRESS (primary) ===
  address_street  TEXT,
  address_city    TEXT,
  address_zip     TEXT,
  country_id      UUID REFERENCES countries(id),

  -- === COMMERCIAL ===
  payment_terms   INTEGER DEFAULT 14,           -- Payment due in days
  price_list_id   UUID,                         -- FK to price list (Phase 2)
  credit_limit    DECIMAL,

  -- === META ===
  logo_url        TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  last_sync_at    TIMESTAMPTZ,                  -- Last sync from ARES

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === CONTACTS (multiple contacts per partner) ===
CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id),
  name            TEXT NOT NULL,
  position        TEXT,                         -- "director", "buyer"
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  is_primary      BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === ADDRESSES (multiple addresses per partner) ===
CREATE TABLE addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id),
  address_type    TEXT NOT NULL,                -- 'billing' | 'delivery' | 'other'
  label           TEXT,                         -- "Main warehouse", "Vinohrady location"
  street          TEXT,
  city            TEXT,
  zip             TEXT,
  country_id      UUID REFERENCES countries(id),
  is_default      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BANK ACCOUNTS ===
CREATE TABLE partner_bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id),
  bank_name       TEXT,
  account_number  TEXT,                         -- Account number
  iban            TEXT,
  swift           TEXT,
  is_default      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === ATTACHMENTS (generic — usable for partners and other entities) ===
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity_type     TEXT NOT NULL,                -- 'partner', 'item', 'batch', 'order'...
  entity_id       UUID NOT NULL,                -- Record ID
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,                -- Supabase Storage URL
  file_size       INTEGER,
  mime_type       TEXT,
  uploaded_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_attachments_entity ON attachments(tenant_id, entity_type, entity_id);

-- === COUNTRIES (system codebook) ===
CREATE TABLE countries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,         -- 'CZ', 'SK', 'PL'
  name_cs         TEXT NOT NULL,                -- 'Česko'
  name_en         TEXT NOT NULL,                -- 'Czech Republic'
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.6 Recipes

```sql
-- ============================================================
-- RECIPES
-- ============================================================
CREATE TABLE recipes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  code                  TEXT,                     -- Internal code
  name                  TEXT NOT NULL,
  beer_style_id         UUID REFERENCES beer_styles(id),
  status                TEXT DEFAULT 'draft',     -- 'draft' | 'active' | 'archived'

  -- === PARAMETERS ===
  batch_size_l          DECIMAL,                 -- Target volume (liters, net)
  batch_size_bruto_l    DECIMAL,                 -- Gross volume
  beer_volume_l         DECIMAL,                 -- Finished beer volume
  og                    DECIMAL,                 -- Original gravity (Plato)
  fg                    DECIMAL,                 -- Final gravity
  abv                   DECIMAL,                 -- Alcohol %
  ibu                   DECIMAL,                 -- Bitterness
  ebc                   DECIMAL,                 -- Color
  boil_time_min         INTEGER,                 -- Boil duration
  cost_price            DECIMAL,                 -- Calculated batch cost

  -- === FERMENTATION ===
  duration_fermentation_days INTEGER,             -- Primary fermentation duration
  duration_conditioning_days INTEGER,             -- Conditioning duration

  -- === META ===
  notes                 TEXT,
  is_from_library       BOOLEAN DEFAULT false,
  source_library_id     UUID,

  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- === RECIPE ITEMS (ingredients in recipe) ===
CREATE TABLE recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  category        TEXT NOT NULL,               -- 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  amount_g        DECIMAL NOT NULL,            -- Amount in recipe unit (column name legacy)
  unit_id         UUID REFERENCES units(id),   -- Recipe unit of measure
  use_stage       TEXT,                        -- 'mash' | 'boil' | 'whirlpool' | 'fermentation' | 'dry_hop'
  use_time_min    INTEGER,                     -- Addition time (min)
  hop_phase       TEXT,                        -- Hop addition phase (for hops)
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === RECIPE STEPS (mashing / production steps) ===
CREATE TABLE recipe_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  mash_profile_id UUID REFERENCES mashing_profiles(id),
  step_type       TEXT NOT NULL,               -- 'mash_in' | 'rest' | 'decoction' | 'mash_out' |
                                                -- 'boil' | 'whirlpool' | 'cooling'
  name            TEXT NOT NULL,
  temperature_c   DECIMAL,                     -- Target temperature (°C)
  time_min        INTEGER,                     -- Step duration (min)
  ramp_time_min   INTEGER,                     -- Ramp time to target temperature
  temp_gradient   DECIMAL,                     -- Temperature gradient
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === MASHING PROFILES (reusable mashing profiles) ===
CREATE TABLE mashing_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),  -- NULL = system/library
  name            TEXT NOT NULL,
  steps           JSONB NOT NULL,               -- Array of steps { name, temp, time, ramp_time }
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === RECIPE CALCULATION (calculation snapshot) ===
CREATE TABLE recipe_calculations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  recipe_id       UUID NOT NULL REFERENCES recipes(id),
  calculated_at   TIMESTAMPTZ DEFAULT now(),
  data            JSONB NOT NULL,              -- Complete calculation (cost, OG, IBU...)
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BEER STYLES (system codebook — BJCP) ===
CREATE TABLE beer_styles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bjcp_number     TEXT,                         -- "2A"
  bjcp_category   TEXT,                         -- "International Lager"
  name            TEXT NOT NULL,                -- "Czech Premium Pale Lager"
  abv_min         DECIMAL,
  abv_max         DECIMAL,
  ibu_min         DECIMAL,
  ibu_max         DECIMAL,
  ebc_min         DECIMAL,
  ebc_max         DECIMAL,
  og_min          DECIMAL,
  og_max          DECIMAL,
  fg_min          DECIMAL,
  fg_max          DECIMAL,
  appearance      TEXT,
  aroma           TEXT,
  flavor          TEXT,
  comments        TEXT,
  style_group_id  UUID REFERENCES beer_style_groups(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE beer_style_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,               -- "Czech Lager", "IPA", "Stout"
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.7 Production (Batches / Brews)

```sql
-- ============================================================
-- BATCHES (Batches / Brews)
-- ============================================================
CREATE TABLE batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  batch_number      TEXT NOT NULL,              -- V-2026-001 (from counter)
  batch_seq         INTEGER,                    -- Sequential batch number
  recipe_id         UUID REFERENCES recipes(id),
  item_id           UUID REFERENCES items(id),  -- Production item (beer)
  status            TEXT DEFAULT 'planned',
    -- 'planned' | 'brewing' | 'fermenting' | 'conditioning' |
    -- 'carbonating' | 'packaging' | 'completed' | 'dumped'
  brew_status       TEXT,                       -- More detailed brewing status

  -- === DATES ===
  planned_date      DATE,                       -- Planned brewing day
  brew_date         DATE,                       -- Actual brewing day
  end_brew_date     DATE,                       -- End of production

  -- === ACTUAL VALUES ===
  actual_volume_l   DECIMAL,                    -- Actual volume
  og_actual         DECIMAL,                    -- Actual OG (Plato)
  fg_actual         DECIMAL,
  abv_actual        DECIMAL,

  -- === EQUIPMENT ===
  equipment_id      UUID REFERENCES equipment(id),  -- Primary tank

  -- === BATCH LINKING ===
  primary_batch_id  UUID REFERENCES batches(id),  -- For split/blend: reference to primary batch

  -- === EXCISE ===
  excise_relevant_hl  DECIMAL,                  -- Volume subject to excise tax (hl)
  excise_reported_hl  DECIMAL,                  -- Volume reported to customs authority
  excise_status       TEXT,                     -- 'pending' | 'reported' | 'paid'

  -- === META ===
  is_paused         BOOLEAN DEFAULT false,      -- Paused
  notes             TEXT,
  brewer_id         UUID REFERENCES auth.users(id),
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, batch_number)
);

CREATE INDEX idx_batches_tenant_status ON batches(tenant_id, status);
CREATE INDEX idx_batches_tenant_date ON batches(tenant_id, brew_date);

-- === BATCH STEPS (brewing steps — instances from recipe_steps) ===
CREATE TABLE batch_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  step_type       TEXT NOT NULL,                -- Step type (from recipe)
  brew_phase      TEXT NOT NULL,                -- 'mashing' | 'boiling' | 'fermentation' | 'conditioning'
  name            TEXT NOT NULL,
  temperature_c   DECIMAL,
  time_min        INTEGER,                      -- Planned time
  pause_min       INTEGER,                      -- Pause
  auto_switch     BOOLEAN DEFAULT false,        -- Automatic transition to next step
  equipment_id    UUID REFERENCES equipment(id),

  -- === ACTUAL ===
  start_time_plan TIMESTAMPTZ,                  -- Planned start
  start_time_real TIMESTAMPTZ,                  -- Actual start
  end_time_real   TIMESTAMPTZ,                  -- Actual end

  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BATCH MEASUREMENTS (measurements during production) ===
CREATE TABLE batch_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  measurement_type TEXT NOT NULL,               -- 'gravity' | 'temperature' | 'ph' | 'volume' | 'pressure'
  value           DECIMAL,                      -- Main value
  value_plato     DECIMAL,                      -- Gravity (°P)
  value_sg        DECIMAL,                      -- Specific gravity
  temperature_c   DECIMAL,                      -- Temperature at measurement
  is_start        BOOLEAN DEFAULT false,        -- Starting measurement
  is_end          BOOLEAN DEFAULT false,        -- Ending measurement
  notes           TEXT,
  measured_at     TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BATCH NOTES (notes on steps / batch) ===
CREATE TABLE batch_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  batch_step_id   UUID REFERENCES batch_steps(id),  -- NULL = note for the entire batch
  text            TEXT NOT NULL,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BOTTLING ITEMS (packaging) ===
CREATE TABLE bottling_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  item_id         UUID NOT NULL REFERENCES items(id),    -- Product (bottle, keg...)
  quantity        DECIMAL NOT NULL,                      -- Number of units
  base_units      DECIMAL,                               -- Total volume in base unit (l)
  bottled_at      DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.8 Inventory Management

```sql
-- ============================================================
-- WAREHOUSES
-- ============================================================
CREATE TABLE warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,                   -- "Main warehouse", "Raw materials warehouse"
  is_excise_relevant BOOLEAN DEFAULT false,        -- Warehouse subject to tax records
  categories      TEXT[],                          -- Allowed categories in this warehouse
  is_default      BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- ============================================================
-- STOCK ISSUES (Stock documents — receipts + issues)
-- ============================================================
CREATE TABLE stock_issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            TEXT NOT NULL,                    -- PR-2026-001 / VD-2026-001
  code_number     INTEGER,
  code_prefix     TEXT,
  counter_id      UUID REFERENCES counters(id),

  movement_type   TEXT NOT NULL,                    -- 'receipt' | 'issue'
  movement_purpose TEXT NOT NULL,                   -- 'purchase' | 'production_in' | 'production_out' |
                                                    -- 'sale' | 'transfer' | 'inventory' | 'waste' | 'other'
  date            DATE NOT NULL,
  status          TEXT DEFAULT 'draft',             -- 'draft' | 'confirmed' | 'cancelled'

  -- === REFERENCES ===
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  partner_id      UUID REFERENCES partners(id),     -- Supplier/customer
  order_id        UUID REFERENCES orders(id),       -- Sales order
  batch_id        UUID REFERENCES batches(id),      -- Production batch
  season          TEXT,                             -- Season

  additional_cost DECIMAL DEFAULT 0,                -- Additional acquisition costs
  total_cost      DECIMAL DEFAULT 0,                -- Total document value

  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- === STOCK ISSUE LINES (document lines) ===
CREATE TABLE stock_issue_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  stock_issue_id  UUID NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  line_no         INTEGER,
  requested_qty   DECIMAL NOT NULL,                -- Requested quantity
  issued_qty      DECIMAL,                         -- Actually issued/received
  missing_qty     DECIMAL,                         -- Missing
  unit_price      DECIMAL,                         -- Unit price
  total_cost      DECIMAL,                         -- Line total
  issue_mode_snapshot TEXT,                        -- Snapshot of FIFO/LIFO from item
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === STOCK ISSUE ALLOCATIONS (FIFO/LIFO allocations) ===
CREATE TABLE stock_issue_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  stock_issue_line_id UUID NOT NULL REFERENCES stock_issue_lines(id),
  source_movement_id  UUID NOT NULL REFERENCES stock_movements(id),  -- From which receipt
  quantity        DECIMAL NOT NULL,
  unit_price      DECIMAL NOT NULL,                -- Price from receipt
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === STOCK MOVEMENTS (atomic movements) ===
CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  movement_type   TEXT NOT NULL,                    -- 'in' | 'out'
  quantity        DECIMAL NOT NULL,                 -- Positive = receipt, negative = issue
  unit_price      DECIMAL,                         -- Price per unit

  -- === REFERENCES ===
  stock_issue_id  UUID REFERENCES stock_issues(id),
  stock_issue_line_id UUID REFERENCES stock_issue_lines(id),
  order_id        UUID REFERENCES orders(id),
  batch_id        UUID REFERENCES batches(id),
  lot_id          UUID REFERENCES material_lots(id),  -- Lot tracking

  is_closed       BOOLEAN DEFAULT false,            -- Closed (fully allocated)
  date            DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_movements_tenant_item ON stock_movements(tenant_id, item_id, date);
CREATE INDEX idx_movements_tenant_warehouse ON stock_movements(tenant_id, warehouse_id, date);

-- === STOCK STATUS (materialized stock state — per item, per warehouse) ===
CREATE TABLE stock_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  quantity        DECIMAL DEFAULT 0,               -- Current stock
  reserved_qty    DECIMAL DEFAULT 0,               -- Reserved (planned issues)
  available_qty   DECIMAL GENERATED ALWAYS AS (quantity - reserved_qty) STORED,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, item_id, warehouse_id)
);

-- ============================================================
-- MATERIAL LOTS (Lot tracking of materials)
-- ============================================================
CREATE TABLE material_lots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  lot_number      TEXT NOT NULL,                    -- Supplier's lot number
  supplier_id     UUID REFERENCES partners(id),     -- Supplier
  received_date   DATE,                             -- Receipt date
  expiry_date     DATE,                             -- Expiration date
  quantity_initial DECIMAL,                         -- Initial quantity
  quantity_remaining DECIMAL,                       -- Remaining quantity
  unit_price      DECIMAL,                         -- Purchase price
  properties      JSONB DEFAULT '{}',              -- Certificate, analysis...
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === LOT ↔ BATCH link (which material lots went into which batch) ===
CREATE TABLE batch_material_lots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  lot_id          UUID NOT NULL REFERENCES material_lots(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  quantity_used   DECIMAL NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.9 Orders

```sql
-- ============================================================
-- ORDERS (Sales orders)
-- ============================================================
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_number    TEXT NOT NULL,                    -- OBJ-2026-0001
  order_no        INTEGER,                         -- Sequential number
  partner_id      UUID NOT NULL REFERENCES partners(id),
  status          TEXT DEFAULT 'draft',
    -- 'draft' | 'confirmed' | 'in_preparation' | 'shipped' |
    -- 'delivered' | 'invoiced' | 'cancelled'

  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date   DATE,
  closed_date     DATE,

  -- === FINANCIALS ===
  total_excl_vat  DECIMAL DEFAULT 0,
  total_vat       DECIMAL DEFAULT 0,
  total_incl_vat  DECIMAL DEFAULT 0,
  cashflow_id     UUID REFERENCES cashflows(id),    -- Link to cash flow

  -- === META ===
  notes           TEXT,
  internal_notes  TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, order_number)
);

-- === ORDER ITEMS (order lines) ===
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  quantity        DECIMAL NOT NULL,
  unit_price      DECIMAL NOT NULL,
  vat_rate        DECIMAL DEFAULT 21,
  discount_pct    DECIMAL DEFAULT 0,
  total_excl_vat  DECIMAL,
  deposit_id      UUID REFERENCES deposits(id),     -- Deposit (kegs)
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === DEPOSITS (container deposits — kegs, crates) ===
CREATE TABLE deposits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Keg 30l", "Crate"
  deposit_amount  DECIMAL NOT NULL,                -- Deposit amount
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.10 Finance (CashFlow)

```sql
-- ============================================================
-- CASHFLOWS (Income and expenses)
-- ============================================================
CREATE TABLE cashflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            TEXT,                             -- CF-2026-001
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  category_id     UUID REFERENCES categories(id),   -- Income/expense category
  amount          DECIMAL NOT NULL,
  currency        TEXT DEFAULT 'CZK',
  date            DATE NOT NULL,
  due_date        DATE,                             -- Due date
  paid_date       DATE,                             -- Payment date
  status          TEXT DEFAULT 'planned',            -- 'planned' | 'pending' | 'paid' | 'cancelled'

  -- === REFERENCES ===
  partner_id      UUID REFERENCES partners(id),
  order_id        UUID REFERENCES orders(id),
  stock_issue_id  UUID REFERENCES stock_issues(id),
  shop_id         UUID REFERENCES shops(id),
  is_cash         BOOLEAN DEFAULT false,

  -- === RECURRING ===
  template_id     UUID REFERENCES cashflow_templates(id),  -- From which template generated
  is_recurring    BOOLEAN DEFAULT false,

  description     TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === CASHFLOW CATEGORIES (hierarchical categories) ===
CREATE TABLE cashflow_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  parent_id       UUID REFERENCES cashflow_categories(id),
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  is_system       BOOLEAN DEFAULT false,
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === CASHFLOW TEMPLATES (templates for recurring income/expenses) ===
CREATE TABLE cashflow_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Premises rent", "Insurance"
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  category_id     UUID REFERENCES categories(id),
  amount          DECIMAL NOT NULL,
  currency        TEXT DEFAULT 'CZK',

  -- === RECURRENCE ===
  frequency       TEXT NOT NULL,                    -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  day_of_month    INTEGER,                         -- Day of month (for monthly)
  start_date      DATE NOT NULL,
  end_date        DATE,                             -- NULL = indefinite
  next_date       DATE,                             -- Next planned generation

  partner_id      UUID REFERENCES partners(id),
  description     TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === CASH DESK (Cash register — for taproom/bar) ===
CREATE TABLE cash_desks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id),
  name            TEXT NOT NULL,                    -- "Taproom cash register"
  balance         DECIMAL DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- NOTE: Cash desk transactions are stored as cashflow records with is_cash = true.
-- No separate cash_desk_items table — cash desk operations create cashflows
-- and atomically update cash_desks.current_balance in the same transaction.
```

### 5.11 Excise Tax

```sql
-- ============================================================
-- EXCISE TAX ("spotřební daň" = excise tax on beer)
-- ============================================================
-- Note: Excise tax is mandatory for Czech breweries.
-- Beer above 0.5% ABV is subject to it, the rate depends on
-- the brewery category (annual output) and original gravity.

-- Configuration is in tenants.settings:
-- excise_enabled, excise_tax_point_mode, excise_default_plato_source

-- === EXCISE MOVEMENTS (tax movements) ===
CREATE TABLE excise_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID REFERENCES batches(id),
  movement_type   TEXT NOT NULL,                    -- 'production' | 'release' | 'export' | 'destruction' | 'adjustment'
  volume_hl       DECIMAL NOT NULL,                -- Volume in hl
  plato           DECIMAL,                         -- Original gravity
  plato_source    TEXT,                            -- 'recipe' | 'measurement'
  tax_amount      DECIMAL,                         -- Calculated tax
  date            DATE NOT NULL,
  period          TEXT,                             -- '2026-01' (year-month)
  status          TEXT DEFAULT 'draft',             -- 'draft' | 'confirmed' | 'reported'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === MONTHLY SUBMISSIONS (monthly submissions to customs authority) ===
CREATE TABLE excise_monthly_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period          TEXT NOT NULL,                    -- '2026-01'
  status          TEXT DEFAULT 'draft',             -- 'draft' | 'submitted' | 'accepted'
  total_volume_hl DECIMAL,
  total_tax       DECIMAL,
  submitted_at    TIMESTAMPTZ,
  data            JSONB,                            -- Complete submission data
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, period)
);
```

### 5.12 Public Libraries (read-only codebooks)

```sql
-- These tables are global (without tenant_id), read-only for users.
-- Brewery can import from them into its own items/recipes.

-- beer_styles          — BJCP beer styles (see 5.6)
-- beer_style_groups    — Style groups
-- beer_colors          — EBC/SRM colors
-- beer_hop_phases      — Hop addition phases (codebook)
-- countries            — Countries
-- Future: public ingredient library, recipe library (marketplace)
```

---

## 6. ENTITY RELATIONSHIP OVERVIEW

```
tenants
  ├── subscriptions → plans (versioned over time)
  │     ├── subscription_addons → plan_addons
  │     └── subscription_events (audit trail)
  │
  ├── usage_records (monthly hl consumption)
  │
  ├── shops (locations)
  │     └── equipment
  │     └── warehouses
  │     └── cash_desks (cash registers)
  │
  ├── tenant_users → user_profiles
  │     ├── user_module_rights
  │     └── user_agenda_rights
  │
  ├── items (unified: materials + products)
  │     ├── item_categories → categories
  │     ├── material_lots (lot tracking)
  │     └── stock_status (per warehouse)
  │
  ├── partners (customers + suppliers)
  │     ├── contacts
  │     ├── addresses
  │     └── partner_bank_accounts
  │
  ├── recipes
  │     ├── recipe_items → items
  │     ├── recipe_steps
  │     └── recipe_calculations
  │
  ├── batches → recipes, items, equipment
  │     ├── batch_steps
  │     ├── batch_measurements
  │     ├── batch_notes
  │     ├── batch_material_lots → material_lots
  │     ├── bottling_items → items
  │     └── excise_movements
  │
  ├── stock_issues → warehouses, partners, orders, batches
  │     ├── stock_issue_lines → items
  │     └── stock_issue_allocations → stock_movements
  │
  ├── stock_movements → items, warehouses, material_lots
  │
  ├── orders → partners
  │     ├── order_items → items, deposits
  │     └── → cashflows
  │
  ├── cashflows → partners, orders, categories
  │     ├── cashflow_categories (hierarchical)
  │     └── → cashflow_templates
  │
  ├── excise_monthly_reports
  │
  ├── counters (numbering sequences)
  ├── saved_views
  ├── attachments (generic attachments)
  ├── categories (hierarchical categories)
  └── units (units of measure)

plans (global — without tenant_id, versioned)
  └── plan_addons (global — without tenant_id, versioned)
```

---

## 7. MODULE MAP AND PRIORITIES

### 7.1 MVP (Phase 1) — Extended Scope

```
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 1 — MVP (weeks 1-14)                          │
│              "Brewery can brew, sell, and track"                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SPRINT 0 (W1-W2): INFRASTRUCTURE                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Auth, Multi-tenant, Layout, Sidebar/TopBar, i18n,          │ │
│  │ DataBrowser framework (list + card view), FormSection,     │ │
│  │ SavedViews, Counters, Supabase + Drizzle setup, Deploy     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  SPRINT 1 (W3-W4): FOUNDATIONS                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ SHOPS        │  │  EQUIPMENT   │  │  ITEMS               │  │
│  │ (locations)  │  │  (tanks...)  │  │  unified + views     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │  PARTNERS    │  │  CONTACTS,   │                             │
│  │  (unified)   │  │  ADDRESSES,  │                             │
│  │              │  │  BANK ACCTS  │                             │
│  └──────────────┘  └──────────────┘                             │
│                                                                  │
│  SPRINT 2 (W5-W7): PRODUCTION                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  RECIPES     │  │   BATCHES    │  │  STEPS + MEASUREMENTS│  │
│  │  + materials │  │  + workflow  │  │  + packaging         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 3 (W8-W9): STOCK                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  WAREHOUSE   │  │  RECEIPTS/   │  │  LOT TRACKING        │  │
│  │  MGMT        │  │  ISSUES      │  │  (materials)         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 4 (W10-W11): SALES + FINANCE                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  ORDERS      │  │  CASHFLOW    │  │  TEMPLATES +RECURRING│  │
│  │  + deposits  │  │  + cash desk │  │  generation          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 5 (W12-W13): EXCISE + DASHBOARD                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  EXCISE      │  │  DASHBOARD   │  │  ONBOARDING WIZARD   │  │
│  │  TAX         │  │  (KPI panel) │  │  + settings          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 6 (W14): POLISH + LAUNCH                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Bug fixes, UX polish, RBAC finalization, documentation,    │ │
│  │ tenant onboarding flow, monitoring, BETA LAUNCH            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│              PHASE 2 — GROWTH (months 5-7)                       │
├─────────────────────────────────────────────────────────────────┤
│  Price lists + discounts, Production planning (calendar),        │
│  Suppliers + purchasing, Advanced reports, Invoicing integration, │
│  Custom roles                                                    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│              PHASE 3 — ECOSYSTEM (months 8-12)                   │
├─────────────────────────────────────────────────────────────────┤
│  API for partners, B2B portal, Accounting system integration,    │
│  Quality (QC), Public library (marketplace), Offline/PWA         │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Sprint Dependencies

```
Sprint 0: Infrastructure
  │  (no dependencies — everything built from scratch)
  │
  ├→ Sprint 1: Foundations
  │    │  (depends on: DataBrowser, FormSection, Auth)
  │    │
  │    ├→ Sprint 2: Production
  │    │    (depends on: Items, Equipment)
  │    │
  │    ├→ Sprint 3: Stock
  │    │    (depends on: Items, Partners, Warehouses)
  │    │
  │    └→ Sprint 4: Sales + Finance
  │         (depends on: Items, Partners, Orders)
  │
  └→ Sprint 5: Excise + Dashboard
       (depends on: Batches, Stock Movements)
```

---

## 8. PROJECT STRUCTURE — Feature-Module Pattern

Each business module is a **self-contained folder** in `src/modules/`. Page files are thin (import + render). Shared components live in `src/components/`.

```
profibrew/
├── CLAUDE.md                          # Claude Code instructions
├── docs/                              # Documentation
│
├── src/
│   ├── app/[locale]/                  # ROUTES ONLY — thin page files
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── onboarding/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx             # Sidebar + TopBar
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── brewery/
│   │   │   │   ├── overview/page.tsx
│   │   │   │   ├── partners/page.tsx          # → <PartnerBrowser />
│   │   │   │   ├── partners/[id]/page.tsx     # → <PartnerDetail />
│   │   │   │   ├── contacts/page.tsx
│   │   │   │   ├── materials/page.tsx
│   │   │   │   ├── recipes/page.tsx
│   │   │   │   ├── recipes/[id]/page.tsx
│   │   │   │   ├── batches/page.tsx
│   │   │   │   ├── batches/[id]/page.tsx
│   │   │   │   └── equipment/page.tsx
│   │   │   ├── stock/
│   │   │   │   ├── items/page.tsx
│   │   │   │   ├── movements/page.tsx
│   │   │   │   ├── movements/[id]/page.tsx
│   │   │   │   ├── tracking/page.tsx
│   │   │   │   ├── excise/page.tsx
│   │   │   │   └── monthly-report/page.tsx
│   │   │   ├── sales/
│   │   │   │   ├── orders/page.tsx
│   │   │   │   └── orders/[id]/page.tsx
│   │   │   ├── finance/
│   │   │   │   ├── cashflow/page.tsx
│   │   │   │   └── cashdesk/page.tsx
│   │   │   └── settings/
│   │   │       ├── general/page.tsx
│   │   │       ├── shops/page.tsx
│   │   │       ├── users/page.tsx
│   │   │       ├── counters/page.tsx
│   │   │       └── billing/page.tsx
│   │   ├── api/v1/
│   │   └── layout.tsx
│   │
│   ├── modules/                       # ★ BUSINESS LOGIC — self-contained per feature
│   │   ├── partners/
│   │   │   ├── components/            # Partner-specific UI
│   │   │   │   ├── PartnerBrowser.tsx
│   │   │   │   ├── PartnerDetail.tsx
│   │   │   │   └── PartnerForm.tsx
│   │   │   ├── config.ts             # DataBrowser columns, filters, card layout
│   │   │   ├── actions.ts            # Server actions (CRUD)
│   │   │   ├── hooks.ts              # usePartners, usePartnerDetail
│   │   │   ├── types.ts              # TypeScript interfaces
│   │   │   ├── schema.ts             # Zod validation
│   │   │   └── index.ts              # Public API (re-exports)
│   │   ├── items/                     # Same structure
│   │   ├── recipes/
│   │   ├── batches/
│   │   ├── equipment/
│   │   ├── stock/
│   │   ├── orders/
│   │   ├── cashflow/
│   │   ├── excise/
│   │   └── settings/
│   │
│   ├── components/                    # SHARED FRAMEWORK — reusable, module-agnostic
│   │   ├── ui/                        # shadcn/ui base
│   │   ├── data-browser/
│   │   │   ├── DataBrowser.tsx
│   │   │   ├── ListView.tsx
│   │   │   ├── CardView.tsx
│   │   │   ├── FilterBar.tsx
│   │   │   ├── ParametricFilterPanel.tsx
│   │   │   ├── QuickFilters.tsx
│   │   │   ├── SavedViews.tsx
│   │   │   ├── ColumnHeader.tsx
│   │   │   ├── Pagination.tsx
│   │   │   └── BulkActions.tsx
│   │   ├── detail-view/
│   │   ├── forms/
│   │   ├── layout/                    # TopBar, Sidebar, Breadcrumb
│   │   ├── providers/                 # TenantProvider, AuthProvider
│   │   └── shared/                    # StatusBadge, EmptyState, LoadingState
│   │
│   ├── lib/
│   │   ├── db/                        # Drizzle client, withTenant helper
│   │   ├── supabase/                  # Browser, server, middleware clients
│   │   ├── auth/
│   │   ├── rbac/
│   │   ├── hooks/                     # Shared hooks (useTenant, useDebounce)
│   │   ├── utils/
│   │   └── types/                     # Global shared types
│   │
│   ├── config/
│   │   ├── navigation.ts
│   │   └── permissions.ts
│   │
│   ├── i18n/messages/
│   │   ├── cs/                        # Czech translations — SPLIT PER MODULE
│   │   │   ├── common.json
│   │   │   ├── auth.json
│   │   │   ├── nav.json
│   │   │   ├── dataBrowser.json
│   │   │   ├── partners.json
│   │   │   ├── items.json
│   │   │   └── ...
│   │   └── en/
│   │
│   └── styles/
│
├── drizzle/
│   ├── schema/                        # DB schema (central — Drizzle requirement)
│   │   ├── tenants.ts
│   │   ├── auth.ts
│   │   ├── items.ts
│   │   ├── partners.ts
│   │   ├── recipes.ts
│   │   ├── batches.ts
│   │   ├── stock.ts
│   │   ├── orders.ts
│   │   ├── cashflow.ts
│   │   ├── excise.ts
│   │   ├── subscriptions.ts
│   │   └── system.ts
│   └── migrations/
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
│
├── public/
├── .env.local
├── next.config.js
├── tailwind.config.js
├── drizzle.config.ts
├── tsconfig.json
└── package.json
```

### Feature-Module Pattern Rules

1. **Page files are thin** — max 10-15 lines, just import from `modules/` and render
2. **Module is self-contained** — components/, config.ts, actions.ts, hooks.ts, types.ts, schema.ts, index.ts
3. **Cross-module imports only through index.ts** (public API)
4. **Drizzle schema centrally** in `drizzle/schema/` (Drizzle requirement for migrations)
5. **i18n per module** — translations in `src/i18n/messages/{locale}/{module}.json`

---

## 9. CODING STANDARDS FOR CLAUDE CODE

```
1.  TypeScript strict mode, NO `any` types
2.  React Server Components where possible, 'use client' only where necessary
3.  Tailwind CSS + shadcn/ui ONLY, no CSS modules
4.  Drizzle ORM for all DB operations
5.  Zod schema for validation on both API and frontend
6.  SWR for client-side data fetching
7.  next-intl for all user-facing texts
8.  EVERY DB query MUST filter by tenant_id
9.  EVERY API route MUST check permissions
10. All numeric values in DB in base units (l, g, °C, min)
11. Naming: PascalCase components, camelCase utilities, snake_case DB
12. Error handling: try/catch on every API route, user-friendly error messages
13. Logging: structured logs (JSON) for debugging
```

---

## 10. ENVIRONMENTS & DEPLOYMENT

Three environments with fully separate databases. Never share a database between environments.

### 10.1 Environment Overview

| Environment | Purpose | Database | Hosting | Branch | URL |
|---|---|---|---|---|---|
| Local | Development | Supabase CLI (local Docker) | localhost:3000 | any | http://localhost:3000 |
| Preview/Staging | Review, QA, testing | Supabase staging project | Vercel Preview (auto per branch) | feature/*, develop | auto-generated per branch |
| Production | Live customers | Supabase production project | Vercel Production | main | profibrew.com |

### 10.2 Supabase Projects

Three separate Supabase projects — each with its own PostgreSQL instance, RLS policies, auth configuration, and storage:

1. **Local** — Supabase CLI (`supabase start`) runs local PostgreSQL in Docker. Free, no cloud dependency. Used by Claude Code for development and migration testing.
2. **Staging** — Supabase cloud project (free tier). Shared test environment for PR reviews and manual QA. Seed data: test brewery with realistic sample data.
3. **Production** — Supabase cloud project (free tier initially, Pro when needed). Real customer data. No test/seed data ever. Migrations only via CI/CD.

### 10.3 Environment Variables

Each environment has its own set of credentials. Never mix them.

**Local development** (`.env.local` — never committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-key>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Staging** credentials — set in Vercel Preview environment variables.
**Production** credentials — set in Vercel Production environment variables.

### 10.4 Migration Flow

1. Developer creates migration locally: `npx drizzle-kit generate`
2. Test locally: `supabase db reset` (applies all migrations + seed), then `npm run dev` (verify app works)
3. Push to branch — Vercel Preview deploys automatically, staging DB migration applied manually or via CI script
4. QA on Preview URL (manual testing)
5. Merge to main — Vercel Production deploys, production DB migration applied via CI/CD pipeline

### 10.5 Seed Data Strategy

| Environment | Seed Data | Purpose |
|---|---|---|
| Local | Full seed (`supabase/seed.sql`) | 1 test tenant, 30 partners, 10 items, 5 recipes, 3 batches, sample orders, equipment. Realistic Czech data. |
| Staging | Same seed as local | QA testing with known data set |
| Production | Minimal seed only | Default plans (Free/Starter/Pro/Business), BJCP beer styles, default categories. NO test tenants or users. |

**Seed files:**
- `supabase/seed.sql` — full development seed (local + staging)
- `supabase/seed-production.sql` — production-only seed (plans, reference data)

### 10.6 Branch Strategy

```
main              — production (protected, merge via PR only)
develop           — integration branch (optional, for multi-sprint coordination)
feature/sprint-X  — sprint work branch
feature/*         — individual feature branches
hotfix/*          — production hotfixes
```

### 10.7 CI/CD Pipeline

For MVP, deployments are manual (push to branch, merge to main). Full CI/CD pipeline planned for Sprint 6:

- GitHub Actions on PR: lint, type-check, build, run tests
- GitHub Actions on merge to main: deploy to production, apply migrations
- Database backup before production migration (Supabase automatic daily + pre-migration snapshot)

### 10.8 Key Rules

1. **NEVER** run `seed.sql` on production — only `seed-production.sql`
2. **NEVER** use production credentials in local or staging
3. **ALWAYS** test migrations locally before pushing
4. **ALWAYS** verify Preview deployment works before merging to main
5. Production migrations are irreversible — plan carefully, test on staging first
6. Supabase RLS policies must be included in migrations, not applied manually

---

## 11. OPEN QUESTIONS

| # | Question | Status |
|---|----------|--------|
| 1 | ORM: Prisma vs Drizzle | ✅ **Drizzle** |
| 2 | i18n from the start? | ✅ **Yes, next-intl** |
| 3 | Numbering sequences | ✅ **Configurable + defaults** |
| 4 | Lot tracking | ✅ **In MVP, by material batches** |
| 5 | Offline/PWA | 🔜 Phase 3 |
| 6 | Units of measure | ✅ **Base unit in DB, conversion in UI** |
| 7 | Items model | ✅ **Hybrid (unified + views)** |
| 8 | Partner model | ✅ **Unified (customer + supplier)** |
| 9 | Card view | ✅ **From the start (list + card)** |
| 10 | Excise in MVP | ✅ **Yes** |
| 11 | Equipment in MVP | ✅ **Yes** |
| 12 | Shops in MVP | ✅ **Yes** |
| 13 | CashFlow in MVP | ✅ **Yes (income, expenses, templates, recurring)** |
| 14 | Pricing model | ✅ **Tier-based + add-on modules + overage per hl** |
| 15 | Pricing in DB | ✅ **Temporal data (valid_from/to), subscription per tenant** |
| 16 | Specific tier prices and limits | 🔜 **Separate CZ market analysis** |
| 17 | Launch promo parameters | 🔜 **Business decision** |
| 18 | Annual vs monthly billing (discount?) | 🔜 **Business decision** |

---

**Prepared by:** Claude AI Agent
**For:** ProfiBrew.com
**Version:** 2.1
**Date:** 17.02.2026
**Status:** DRAFT — ready for final review
