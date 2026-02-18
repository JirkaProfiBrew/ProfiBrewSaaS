# PROFIBREW.COM — SYSTEM DESIGN DOCUMENT
## Architektonický blueprint pro vývoj SaaS ERP
### Verze: 2.0 | Datum: 17.02.2026

---

## ZMĚNOVÝ LOG

| Verze | Datum | Změny |
|-------|-------|-------|
| 2.1 | 17.02.2026 | Pricing model: tier-based + add-on moduly + overage per hl. Temporální plans/subscriptions v DB. Subscription decoupled z tenants tabulky. Usage records pro billing. |
| 2.0 | 17.02.2026 | Hybrid items model, unified Partner, excise/equipment/shop/cashflow do MVP, card view, lot tracking, i18n, Drizzle ORM, konfigurovatelné číslovací řady, rozšířený datový model na základě Bubble auditu |
| 1.0 | 17.02.2026 | Iniciální draft |

---

## 1. PŘEHLED SYSTÉMU

### 1.1 Co stavíme

ProfiBrew je **multi-tenant SaaS aplikace** — informační systém pro minipivovary. Každý pivovar (tenant) má vlastní izolovaná data, uživatele a konfiguraci, ale sdílí jednu aplikaci a databázi.

### 1.2 Architektonická rozhodnutí

| Oblast | Rozhodnutí | Důvod |
|--------|-----------|-------|
| **Multi-tenancy** | Shared DB + tenant_id | Jednoduchá správa, levný provoz, dostatečné pro 500+ tenantů |
| **Frontend** | Next.js 14+ (App Router) | SSR/SSG, API routes, Claude Code to umí nejlépe |
| **UI knihovna** | shadcn/ui + Tailwind CSS | Konzistentní design, reusable komponenty, rychlý vývoj |
| **Backend/DB** | Supabase (PostgreSQL) | Auth, RLS, realtime, storage — vše z krabice |
| **ORM** | **Drizzle** | Type-safe, SQL-blízký, lehký, dobrý na edge |
| **Hosting** | Vercel | Zero-config deploy, edge functions, preview deploys |
| **Jazyk** | TypeScript strict | Typová bezpečnost, lepší AI code generation |
| **i18n** | **next-intl od začátku** | Plánovaná expanze mimo ČR (SK, PL…) |
| **Měrné jednotky** | **Base unit v DB** | Vždy litry/gramy, konverze v UI. Definice jednotek + vztahů later. |
| **Číslovací řady** | **Konfigurovatelné per tenant** | Přednastavené defaulty, tenant si mění prefix/formát |
| **Item model** | **Hybrid (unified items + views)** | Jedna tabulka s flagy, filtrované pohledy pro suroviny/produkty |
| **Partner model** | **Unified Partner** | Jeden partner = zákazník i dodavatel (flagy) |

### 1.3 High-Level architektura

```
┌─────────────────────────────────────────────────────┐
│                    VERCEL (Hosting)                  │
│  ┌───────────────────────────────────────────────┐  │
│  │              NEXT.JS APLIKACE                  │  │
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
              │  - Účetní systémy   │
              │  - Email (Resend)   │
              │  - Platby (Stripe)  │
              │  - ARES (IČO)       │
              │  - Monitoring       │
              └─────────────────────┘
```

---

## 2. MULTI-TENANT ARCHITEKTURA

### 2.1 Tenant izolace

**Model: Shared Database, Shared Schema, Tenant ID Isolation**

Každá tabulka obsahující tenant-specifická data má sloupec `tenant_id`. Přístup k datům je vynucen na třech úrovních:

```
Úroveň 1: Supabase RLS (Row Level Security)
  → Databáze NIKDY nevrátí data jiného tenanta
  → Nejsilnější ochrana — funguje i při chybě v kódu

Úroveň 2: API middleware
  → Každý API request ověří tenant_id z JWT tokenu
  → Automatické filtrování v query builderu

Úroveň 3: Frontend context
  → TenantProvider obaluje celou aplikaci
  → Komponenty mají přístup k tenant_id přes hook
```

### 2.2 Tenant datový model

```sql
-- ============================================================
-- TENANTS
-- ============================================================
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,                    -- Název pivovaru
  slug            TEXT UNIQUE NOT NULL,             -- URL-friendly identifikátor
  status          TEXT NOT NULL DEFAULT 'trial',    -- trial | active | suspended | cancelled
  trial_ends_at   TIMESTAMPTZ,                     -- Konec trial období
  settings        JSONB DEFAULT '{}',              -- Tenant-specific konfigurace
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- POZNÁMKA: Plán NENÍ atribut tenantu. Tenant má subscription (viz 2.3),
-- která odkazuje na konkrétní verzi plánu. Důvod: plány se mění v čase,
-- tenant musí být svázán s konkrétní verzí podmínek.

-- settings JSONB struktura:
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

#### Princip

Tier-based pricing s modulární flexibilitou a usage-based overage. Klíčové vlastnosti:

- **Tier = balíček modulů** s included hektolitry/měsíc
- **Add-on moduly** dokupitelné na nižších tierech za flat fee
- **Overage billing** za hl nad included limit (Kč/hl/měsíc)
- **Neomezení uživatelé** od Starter tieru
- **Vše konfigurovatelné v DB** — plány, limity, ceny mají časovou platnost (valid_from/valid_to)

```
                    FREE          STARTER        PRO            BUSINESS
────────────────────────────────────────────────────────────────────────
Cena/měsíc          0 Kč          TBD            TBD            TBD
Included hl/měs     TBD           TBD            TBD            TBD
Overage Kč/hl       —             TBD            TBD            TBD
────────────────────────────────────────────────────────────────────────
Moduly              Pivovar       Pivovar        Všechny        Všechny
                                  Sklad                         + API
                                                                + integrace
────────────────────────────────────────────────────────────────────────
Add-on moduly       +flat/měs     +flat/měs      —              —
Uživatelé           2             Unlimited      Unlimited      Unlimited
────────────────────────────────────────────────────────────────────────

TBD = Bude stanoveno na základě samostatné analýzy CZ trhu a konkurence.

Launch promo: "Prvních X měsíců bez omezení hektolitrů na všech plánech"
```

#### Proč temporální data

Plány se budou měnit — ceny, limity, included moduly. Tenant, který začal na "Starter v1" za 1 490 Kč, musí zůstat na těchto podmínkách, dokud aktivně nepřejde na novou verzi. Proto:

- **Plán** má `valid_from` / `valid_to` — verze plánu v čase
- **Subscription** tenantu odkazuje na **konkrétní verzi** plánu
- Nová verze plánu = nový záznam, starý dostane `valid_to`
- Migrace tenantu na nový plán = nová subscription s vazbou na novou verzi

#### DB schema: Subscription & Billing

```sql
-- ============================================================
-- PLANS (definice tarifních plánů — verzované v čase)
-- ============================================================
CREATE TABLE plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL,              -- 'free' | 'starter' | 'pro' | 'business'
  name            TEXT NOT NULL,              -- 'Starter'
  description     TEXT,
  
  -- === PRICING ===
  base_price      DECIMAL NOT NULL DEFAULT 0, -- Měsíční cena (Kč)
  currency        TEXT NOT NULL DEFAULT 'CZK',
  billing_period  TEXT DEFAULT 'monthly',     -- 'monthly' | 'yearly'
  
  -- === LIMITS ===
  included_hl     DECIMAL,                    -- Included hl/měsíc (NULL = unlimited)
  overage_per_hl  DECIMAL,                    -- Kč za hl nad limit (NULL = no overage, hard stop)
  max_users       INTEGER,                    -- Max uživatelů (NULL = unlimited)
  
  -- === FEATURES ===
  included_modules TEXT[] NOT NULL,           -- {'brewery'} | {'brewery','stock'} | {'brewery','stock','sales','finance','plan'}
  api_access      BOOLEAN DEFAULT false,
  integrations    BOOLEAN DEFAULT false,
  priority_support BOOLEAN DEFAULT false,
  
  -- === VERSIONING ===
  version         INTEGER NOT NULL DEFAULT 1, -- Verze plánu
  valid_from      DATE NOT NULL,              -- Platnost od
  valid_to        DATE,                       -- Platnost do (NULL = aktuálně platný)
  is_active       BOOLEAN DEFAULT true,       -- Lze na tento plán přejít
  is_public       BOOLEAN DEFAULT true,       -- Zobrazit na pricing page
  
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Index pro rychlé nalezení aktuálně platné verze plánu
CREATE INDEX idx_plans_active ON plans(slug, valid_from) WHERE valid_to IS NULL;

-- ============================================================
-- PLAN ADD-ONS (dokupitelné moduly k nižším tierům)
-- ============================================================
CREATE TABLE plan_addons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL,              -- 'module_sales' | 'module_finance' | 'module_plan'
  name            TEXT NOT NULL,              -- 'Obchod modul'
  module          TEXT NOT NULL,              -- 'sales' | 'finance' | 'plan'
  price           DECIMAL NOT NULL,           -- Flat fee Kč/měsíc
  currency        TEXT NOT NULL DEFAULT 'CZK',
  
  -- === COMPATIBILITY ===
  available_on_plans TEXT[] NOT NULL,         -- {'free','starter'} — na kterých plánech lze přidat
  
  -- === VERSIONING ===
  valid_from      DATE NOT NULL,
  valid_to        DATE,
  is_active       BOOLEAN DEFAULT true,
  
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SUBSCRIPTIONS (tenant ↔ plan — co tenant aktuálně platí)
-- ============================================================
CREATE TABLE subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  plan_id         UUID NOT NULL REFERENCES plans(id),  -- Konkrétní VERZE plánu
  status          TEXT NOT NULL DEFAULT 'active',
    -- 'trialing' | 'active' | 'past_due' | 'cancelled' | 'paused'
  
  -- === OBDOBÍ ===
  started_at      DATE NOT NULL,
  current_period_start DATE NOT NULL,
  current_period_end   DATE NOT NULL,
  cancelled_at    DATE,
  cancel_at_period_end BOOLEAN DEFAULT false,  -- Zruší se na konci období
  
  -- === PROMO / OVERRIDE ===
  promo_code      TEXT,
  overage_waived_until DATE,                  -- Launch promo: hl neomezeno do tohoto data
  price_override  DECIMAL,                    -- Individuální cena (NULL = dle plánu)
  
  -- === STRIPE ===
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,
  
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Tenant má vždy max 1 aktivní subscription
CREATE UNIQUE INDEX idx_subscriptions_active 
  ON subscriptions(tenant_id) 
  WHERE status IN ('trialing', 'active', 'past_due');

-- ============================================================
-- SUBSCRIPTION ADD-ONS (aktivní add-ony tenantu)
-- ============================================================
CREATE TABLE subscription_addons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  addon_id        UUID NOT NULL REFERENCES plan_addons(id),  -- Konkrétní verze add-onu
  started_at      DATE NOT NULL,
  cancelled_at    DATE,
  price_override  DECIMAL,                    -- Individuální cena (NULL = dle add-onu)
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(subscription_id, addon_id)
);

-- ============================================================
-- USAGE RECORDS (měsíční záznamy o spotřebě hl)
-- ============================================================
CREATE TABLE usage_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period_start    DATE NOT NULL,              -- První den měsíce
  period_end      DATE NOT NULL,              -- Poslední den měsíce
  
  -- === MĚŘENÍ ===
  total_hl        DECIMAL NOT NULL DEFAULT 0, -- Celkem evidovaných hl za období
  included_hl     DECIMAL NOT NULL,           -- Kolik hl bylo v ceně (snapshot z plánu)
  overage_hl      DECIMAL GENERATED ALWAYS AS (GREATEST(total_hl - included_hl, 0)) STORED,
  overage_rate    DECIMAL,                    -- Sazba Kč/hl (snapshot z plánu)
  overage_amount  DECIMAL GENERATED ALWAYS AS (GREATEST(total_hl - included_hl, 0) * COALESCE(overage_rate, 0)) STORED,
  overage_waived  BOOLEAN DEFAULT false,      -- Promo: overage odpuštěn
  
  -- === ZDROJ DAT ===
  batch_ids       UUID[],                     -- Šarže zahrnuté do výpočtu
  calculated_at   TIMESTAMPTZ,                -- Kdy byl výpočet proveden
  
  -- === BILLING ===
  invoiced        BOOLEAN DEFAULT false,
  stripe_invoice_item_id TEXT,
  
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, period_start)
);

-- ============================================================
-- SUBSCRIPTION HISTORY (log všech změn — audit trail)
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
  metadata        JSONB DEFAULT '{}',         -- Detaily události
  created_by      UUID REFERENCES auth.users(id),  -- NULL = systém
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

#### Jak systém funguje za běhu

```
Kontrola přístupu k modulu:
  1. Najdi aktivní subscription tenantu
  2. Z plan_id získej included_modules
  3. Z subscription_addons získej extra moduly
  4. Sjednoť → výsledná množina povolených modulů
  5. Kešuj v JWT / session (invalidate při změně subscription)

Měsíční billing cycle (CRON / Supabase Edge Function):
  1. Pro každého tenanta spočítej hl z batches za období
  2. Vytvoř/updatuj usage_record
  3. Pokud overage_waived (promo) → skip
  4. Pokud overage_hl > 0 → vytvoř Stripe invoice item
  5. Stripe vygeneruje fakturu: base fee + overage

Změna plánu:
  1. Nová subscription s novým plan_id
  2. Stará subscription status → 'cancelled'
  3. Zápis do subscription_events (upgrade/downgrade)
  4. Prorate přes Stripe (automaticky)
```

#### Otevřené pricing otázky (→ samostatná analýza)

| # | Otázka | Status |
|---|--------|--------|
| P1 | Konkrétní ceny tierů (Kč/měsíc) | 🔜 Analýza CZ trhu |
| P2 | Included hl limity per tier | 🔜 Analýza CZ trhu |
| P3 | Overage sazby (Kč/hl) | 🔜 Analýza CZ trhu |
| P4 | Add-on ceny per modul | 🔜 Analýza CZ trhu |
| P5 | Free tier limity (users, hl) | 🔜 Analýza CZ trhu |
| P6 | Délka launch promo (měsíce bez overage) | 🔜 Business decision |
| P7 | Roční vs měsíční billing (sleva za roční?) | 🔜 Business decision |

---

## 3. AUTENTIZACE A ŘÍZENÍ PŘÍSTUPU (RBAC)

### 3.1 Auth flow

```
Registrace nového pivovaru:
  1. Uživatel vyplní registrační formulář
  2. Systém vytvoří tenant + user + přiřadí roli "owner"
  3. Supabase Auth vytvoří session
  4. Redirect do onboarding wizard
  5. Wizard: základní info o pivovaru, první provozovna, výrobní zařízení

Přihlášení existujícího uživatele:
  1. Email + heslo (nebo magic link)
  2. Supabase Auth ověří credentials
  3. Middleware načte tenant_id + role z DB
  4. JWT token obsahuje: user_id, tenant_id, role
```

### 3.2 Role a oprávnění

| Role | Popis | Typický uživatel |
|------|-------|------------------|
| **owner** | Plný přístup + správa tenantu, billing | Majitel pivovaru |
| **admin** | Plný přístup k datům, správa uživatelů | Provozní manažer |
| **brewer** | Výroba, receptury, šarže, inventory | Sládek |
| **sales** | Prodej, zákazníci, objednávky | Obchodník |
| **viewer** | Pouze čtení | Externí konzultant, účetní |

### 3.3 Permission matice

```
┌──────────────────┬────────┬────────┬────────┬────────┬──────────┐
│ Modul            │ owner  │ admin  │ brewer │ sales  │ viewer   │
├──────────────────┼────────┼────────┼────────┼────────┼──────────┤
│ Položky/Suroviny │ CRUD   │ CRUD   │ CRU    │ R      │ R        │
│ Receptury        │ CRUD   │ CRUD   │ CRUD   │ R      │ R        │
│ Šarže/Výroba     │ CRUD   │ CRUD   │ CRUD   │ R      │ R        │
│ Equipment        │ CRUD   │ CRUD   │ CRU    │ R      │ R        │
│ Sklad            │ CRUD   │ CRUD   │ CRU    │ R      │ R        │
│ Partneři         │ CRUD   │ CRUD   │ R      │ CRUD   │ R        │
│ Objednávky       │ CRUD   │ CRUD   │ R      │ CRUD   │ R        │
│ Ekonomika        │ CRUD   │ CRUD   │ -      │ R      │ R        │
│ Spotřební daň    │ CRUD   │ CRUD   │ R      │ -      │ R        │
│ Reporty          │ R      │ R      │ R*     │ R*     │ R*       │
│ Provozovny       │ CRUD   │ CRU    │ R      │ R      │ R        │
│ Uživatelé        │ CRUD   │ CRU    │ -      │ -      │ -        │
│ Nastavení        │ CRUD   │ R      │ -      │ -      │ -        │
│ Billing          │ CRUD   │ -      │ -      │ -      │ -        │
├──────────────────┴────────┴────────┴────────┴────────┴──────────┤
│ CRUD = Create, Read, Update, Delete | R = Read only             │
│ R* = Read, omezeno na relevantní data pro roli | - = Bez přístupu│
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 DB struktura pro Auth + RBAC

```sql
-- ============================================================
-- USERS (rozšíření Supabase auth.users)
-- ============================================================
CREATE TABLE user_profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name       TEXT,
  avatar_url      TEXT,
  phone           TEXT,
  is_superadmin   BOOLEAN DEFAULT false,   -- Systémový flag, přístup k admin panelu
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
-- TENANT ↔ USER VZTAH
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
-- ROLE PERMISSIONS (systémové + custom per tenant)
-- ============================================================
CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),    -- NULL = systémová role
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
  conditions      JSONB,              -- Volitelná row-level omezení
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MODULE + AGENDA RIGHTS (granulární per user)
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

### 4.1 Filozofie

Každá agenda v ProfiBrew používá **stejné stavební bloky**. Cíl: definovat jednou, použít všude. Claude Code dostane specifikaci komponent a generuje moduly jako skládanku z konfigurace.

### 4.2 DataBrowser — hlavní browsovací komponenta

Podporuje dva režimy zobrazení: **List View** (tabulka) a **Card View** (dlaždice).

```
┌─────────────────────────────────────────────────────────────────┐
│ DataBrowser                                                      │
│                                                                  │
│ ┌─ Toolbar ────────────────────────────────────────────────────┐ │
│ │ [+ Nový záznam]  [≡ List] [⊞ Cards]  [Filtry ▾]             │ │
│ │ [Uložené pohledy ▾]  🔍 Hledat      [Řazení ▾] [↕ A-Z]     │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Quick Filters (tab-style) ──────────────────────────────────┐ │
│ │ [Vše] [Slady a přísady] [Chmel] [Kvasnice] [···▾]           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Active Filters (chips — pokud nějaké aktivní) ──────────────┐ │
│ │ Status: Aktivní ✕ │ Výrobce: Malina ✕ │ Vymazat vše         │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ═══════════════════════════════════════════════════════════════  │
│                                                                  │
│ LIST VIEW:                          CARD VIEW:                   │
│ ┌─────────────────────────────┐     ┌──────┐ ┌──────┐ ┌──────┐ │
│ │ ☐│Kód  │Název    │Cena│... │     │ img  │ │ img  │ │ img  │ │
│ │ ☐│it001│Apollo   │990 │... │     │ Slad │ │ Chmel│ │ Slad │ │
│ │ ☐│it002│Aromatic.│   -│... │     │Apollo│ │Citra │ │Aroma │ │
│ │ ☐│it003│Cara Aro.│  50│... │     │990Kč │ │13,8α │ │50 Kč │ │
│ └─────────────────────────────┘     │ 🗑📋↗│ │ 🗑📋↗│ │ 🗑📋↗│ │
│                                      └──────┘ └──────┘ └──────┘ │
│                                                                  │
│ ┌─ Parametric Filter Panel (vysuvný z levé strany) ────────────┐ │
│ │ Název:     [____________]                                    │ │
│ │ Značka:    [Vyber ▾      ]                                   │ │
│ │ ☐ Prodejní položka                                           │ │
│ │ ☐ Zpřístupněno na pokladně                                   │ │
│ │ Typ suroviny: [Vyber ▾  ]                                    │ │
│ │ ☐ Základní vyráběná položka                                  │ │
│ │ Kategorie: [Vyber ▾     ]                                    │ │
│ │ [Použít filtr]  [Vymazat]                                    │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Pagination ─────────────────────────────────────────────────┐ │
│ │ celkem položek: 29 │ 15 ▾ položek na stránku │ ‹‹ ‹ 1 of 2 › ››│
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Bulk Actions (pokud vybrány záznamy) ───────────────────────┐ │
│ │ Vybráno: 3  │  [Exportovat]  [Smazat]  [Změnit status]      │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Konfigurace DataBrowseru (per agenda):**

```typescript
// Příklad konfigurace pro agendu Položky (Items) — pohled "Suroviny"
const materialsBrowserConfig: DataBrowserConfig = {
  entity: "items",
  title: "Suroviny",
  baseFilter: { is_brew_material: true }, // Filtr pro tento pohled

  // === VIEW MODES ===
  views: {
    list: { enabled: true, default: true },
    card: {
      enabled: true,
      imageField: "image_url",
      titleField: "name",
      subtitleField: "material_type",  // "Slad", "Chmel"...
      badgeFields: ["is_brew_material", "is_sale_item"],
      metricFields: [
        { key: "cost_price", label: "Cena", format: "currency" },
        { key: "alpha", label: "Alpha", format: "0.0", showIf: "material_type=hop" },
      ],
      actions: ["delete", "duplicate", "detail"],
    }
  },

  // === LIST COLUMNS ===
  columns: [
    { key: "code",           label: "Kód",           type: "text",    sortable: true, width: 100 },
    { key: "name",           label: "Název",          type: "link",    sortable: true },
    { key: "cost_price",     label: "Cena",           type: "number",  sortable: true, format: "currency" },
    { key: "is_brew_material", label: "Surovina",     type: "boolean", sortable: false },
    { key: "is_sale_item",   label: "Prodejní",       type: "boolean", sortable: false },
    { key: "alpha",          label: "Alpha",          type: "number",  sortable: true, format: "0.00" },
    { key: "brand",          label: "Výrobce",        type: "text",    sortable: true },
    { key: "from_library",   label: "Z knihovny",     type: "icon",    sortable: false },
  ],

  // === QUICK FILTERS (tabs v toolbaru) ===
  quickFilters: [
    { label: "Vše",              filter: {} },
    { label: "Slady a přísady", filter: { material_type: ["malt", "adjunct"] } },
    { label: "Chmel",           filter: { material_type: "hop" } },
    { label: "Kvasnice",        filter: { material_type: "yeast" } },
  ],

  // === PARAMETRIC FILTERS (vysuvný panel) ===
  filters: [
    { key: "name",              label: "Název",            type: "text" },
    { key: "brand",             label: "Značka/výrobce",   type: "select", optionsFrom: "items.brand" },
    { key: "is_sale_item",      label: "Prodejní položka", type: "boolean" },
    { key: "pos_available",     label: "Na pokladně",      type: "boolean" },
    { key: "material_type",     label: "Typ suroviny",     type: "multiselect",
      options: ["malt", "hop", "yeast", "adjunct", "other"] },
    { key: "is_base_product",   label: "Zákl. vyráběná",   type: "boolean" },
    { key: "stock_category",    label: "Kategorie skladu",  type: "select", optionsFrom: "categories" },
  ],

  defaultSort: { key: "name", direction: "asc" },
  pageSize: 15,
  pageSizeOptions: [15, 25, 50, 100],

  actions: {
    create: { label: "Surovina", enabled: true },
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

### 4.3 Saved Views (Uložené pohledy)

```sql
CREATE TABLE saved_views (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  user_id         UUID REFERENCES auth.users(id),   -- NULL = sdílený pohled
  entity          TEXT NOT NULL,                     -- 'items', 'batches', 'orders'...
  name            TEXT NOT NULL,                     -- 'Aktivní ležáky'
  is_default      BOOLEAN DEFAULT false,
  is_shared       BOOLEAN DEFAULT false,
  view_mode       TEXT DEFAULT 'list',               -- 'list' | 'card'
  config          JSONB NOT NULL,                    -- Kompletní stav browseru
  -- config: { filters, quickFilter, sort, columns, pageSize, viewMode }
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4.4 DetailView (Detailní pohled záznamu)

```
┌─────────────────────────────────────────────────────────────────┐
│ DetailView                                                       │
│                                                                  │
│ ┌─ Header ─────────────────────────────────────────────────────┐ │
│ │ ◄ Zpět na seznam │ Editace položky        [🌐][🗑][📋][↗][💾][✕]│
│ │                   │ [Právnická osoba ▾]    [Aktualizovat z ARES]│
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Tabs ───────────────────────────────────────────────────────┐ │
│ │ [Základní info] [Kontakty] [Bank.účty] [Adresy]             │ │
│ │ [Obch.podmínky] [Doklady] [Logo, přílohy]                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Content Area ───────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │  FormSection / vnořený DataBrowser / custom komponenta       │ │
│ │                                                              │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Footer ─────────────────────────────────────────────────────┐ │
│ │                                    [Storno]  [Uložit]        │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.5 FormSection (Formulářová sekce)

```
Reusable formulářová komponenta:
- Automaticky generovaná z field definice
- Inline validace (Zod schema)
- Podporované typy polí:
    text, textarea, number, decimal, date, datetime,
    select, multiselect, toggle/checkbox, file_upload,
    relation (lookup do jiné entity s vyhledáváním),
    computed (read-only kalkulované pole),
    color (barva položky),
    currency (částka s měnou)
- Responzivní grid layout (1-4 sloupce)
- Režimy: create | edit | readonly
- Conditional visibility (pole viditelné jen při splnění podmínky)
```

### 4.6 Layout a navigace

```
┌──────────────────────────────────────────────────────────────────┐
│ TopBar: [Pivovar Pancíř]  Pivovar│Sklad│Obchod│Finance│Plán     │
│                                    [📋][🔔][❗][👤 Giorgina ▾]   │
├──────────┬───────────────────────────────────────────────────────┤
│ Sidebar  │  Main Content Area                                    │
│ «        │                                                       │
│ ★ Přehled│  ┌─ Breadcrumb ─────────────────────────────────┐    │
│          │  │ Pivovar > Suroviny > Apollo                   │    │
│ PIVOVAR  │  └───────────────────────────────────────────────┘    │
│ 👥Partner│                                                       │
│ 📇Kontakt│  ┌─ Page Content ────────────────────────────────┐    │
│ 🧪Surovin│  │                                                │    │
│ 📜Recept.│  │  DataBrowser / DetailView / Dashboard          │    │
│ 🍺Vary   │  │                                                │    │
│ 🫙Spilka │  └────────────────────────────────────────────────┘    │
│ 🏪Sklep  │                                                       │
│ 🍶Stáčírn│                                                       │
│          │                                                       │
│ SKLAD    │                                                       │
│ 📦Položky│                                                       │
│ 📊Pohyby │                                                       │
│ 📍Trackin│                                                       │
│ 🏷️ Daň.p│                                                       │
│ 📑Měs.pod│                                                       │
│          │                                                       │
│ OBCHOD   │                                                       │
│ 📋Objedn.│                                                       │
│ (ceníky) │                                                       │
│          │                                                       │
│ FINANCE  │                                                       │
│ 💰CashFl.│                                                       │
│          │                                                       │
│ ──────── │                                                       │
│ ⚙️Nastav.│                                                       │
│ General  │                                                       │
├──────────┴───────────────────────────────────────────────────────┤
│ Sidebar je collapsible (« ikony only)                            │
└──────────────────────────────────────────────────────────────────┘

Navigační logika:
- TopBar: Moduly jako hlavní sekce (Pivovar, Sklad, Obchod, Finance, Plán)
- Sidebar: Agendy v rámci aktivního modulu
- Sidebar se pamatuje stav (collapsed/expanded) per user
- Aktivní modul/agenda zvýrazněn
```

---

## 5. DATOVÝ MODEL — KOMPLETNÍ ENTITY

### 5.1 Konvence

**Každá tenant-scoped tabulka obsahuje:**

| Sloupec | Typ | Popis |
|---------|-----|-------|
| `id` | UUID PK | gen_random_uuid() |
| `tenant_id` | UUID FK NOT NULL | Vazba na tenanta |
| `created_at` | TIMESTAMPTZ | DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | Trigger on update |
| `created_by` | UUID FK | Kdo vytvořil (kde relevantní) |

**Pojmenování:**
- Tabulky: snake_case, plurál (`items`, `batches`, `recipe_items`)
- Sloupce: snake_case (`batch_number`, `created_at`)
- Enum/status hodnoty: snake_case (`in_preparation`, `dry_hop`)
- Soft delete: `is_active BOOLEAN` nebo `status = 'archived'`

**Base units pro ukládání:**
- Objem: litry (l)
- Hmotnost: gramy (g)
- Teplota: °C
- Čas: minuty

### 5.2 Číslovací řady

```sql
-- ============================================================
-- COUNTERS (konfigurovatelné číslovací řady)
-- ============================================================
CREATE TABLE counters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity          TEXT NOT NULL,          -- 'batch', 'order', 'stock_issue', 'item'...
  prefix          TEXT NOT NULL,          -- 'V', 'OBJ', 'PR', 'VD'...
  include_year    BOOLEAN DEFAULT true,   -- Zda prefix obsahuje rok (V-2026-xxx)
  current_number  INTEGER DEFAULT 0,      -- Poslední použité číslo
  padding         INTEGER DEFAULT 3,      -- Počet cifer (001, 0001...)
  separator       TEXT DEFAULT '-',       -- Oddělovač (V-2026-001 vs V/2026/001)
  reset_yearly    BOOLEAN DEFAULT true,   -- Reset na 0 na začátku roku
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, entity)
);

-- Defaultní řady při vytvoření tenantu:
-- batch:       V-{YYYY}-{NNN}       → V-2026-001
-- order:       OBJ-{YYYY}-{NNNN}    → OBJ-2026-0001
-- stock_issue: PR-{YYYY}-{NNN}      → PR-2026-001 (příjemka)
--              VD-{YYYY}-{NNN}       → VD-2026-001 (výdejka)
-- item:        it{NNNNN}             → it00001
```

### 5.3 Provozovny a zařízení

```sql
-- ============================================================
-- SHOPS (Provozovny — pivovar, taproom, výčep, sklad)
-- ============================================================
CREATE TABLE shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,             -- "Pivovar Pancíř", "Taproom Žižkov"
  shop_type       TEXT NOT NULL,             -- 'brewery' | 'taproom' | 'warehouse' | 'office'
  address         JSONB,                     -- { street, city, zip, country }
  is_default      BOOLEAN DEFAULT false,     -- Výchozí provozovna
  is_active       BOOLEAN DEFAULT true,
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- EQUIPMENT (Výrobní zařízení — tanky, varny, stáčecí linky)
-- ============================================================
CREATE TABLE equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id), -- V které provozovně
  name            TEXT NOT NULL,              -- "Varna 500l", "CKT #1"
  equipment_type  TEXT NOT NULL,              -- 'brewhouse' | 'fermenter' | 'brite_tank' |
                                              -- 'conditioning' | 'bottling_line' | 'keg_washer'
  volume_l        DECIMAL,                   -- Kapacita v litrech (base unit)
  status          TEXT DEFAULT 'available',   -- 'available' | 'in_use' | 'maintenance' | 'retired'
  current_batch_id UUID REFERENCES batches(id), -- Aktuálně obsazující šarže
  properties      JSONB DEFAULT '{}',        -- Specifické vlastnosti dle typu
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- properties příklady:
-- Fermenter: { "material": "stainless", "cooling": true, "pressure_rated": true }
-- Brewhouse: { "mash_tun_volume_l": 600, "kettle_volume_l": 500 }
```

### 5.4 Položky (Hybrid Items)

```sql
-- ============================================================
-- ITEMS (Unified — suroviny, produkty, vše v jednom)
-- ============================================================
CREATE TABLE items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  code              TEXT NOT NULL,              -- it00001 (z counteru)
  name              TEXT NOT NULL,              -- "Apollo", "Bomba 13 ležák"
  brand             TEXT,                       -- Značka / výrobce

  -- === FLAGS (co tato položka je) ===
  is_brew_material  BOOLEAN DEFAULT false,      -- Surovina pro výrobu piva
  is_production_item BOOLEAN DEFAULT false,     -- Položka pro evidenci výroby (pivo)
  is_sale_item      BOOLEAN DEFAULT false,      -- Prodejní položka
  is_excise_relevant BOOLEAN DEFAULT false,     -- Podléhá spotřební dani

  -- === STOCK ===
  stock_category    TEXT,                       -- 'raw_material' | 'finished_product' | 'packaging' | 'other'
  issue_mode        TEXT DEFAULT 'fifo',        -- 'fifo' | 'lifo' | 'average'
  unit_id           UUID REFERENCES units(id),  -- Měrná jednotka
  base_unit_amount  DECIMAL,                   -- Přepočet na základní jednotku

  -- === MATERIAL-SPECIFIC ===
  material_type     TEXT,                       -- 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  alpha             DECIMAL,                   -- Alfa kyseliny (chmel)
  ebc               DECIMAL,                   -- Barva EBC (slad)
  extract_percent   DECIMAL,                   -- Výtěžnost % (slad)

  -- === PRODUCT-SPECIFIC ===
  packaging_type    TEXT,                       -- 'keg_30' | 'keg_50' | 'bottle_500' | 'can_330'...
  volume_l          DECIMAL,                   -- Objem balení (l)
  abv               DECIMAL,                   -- ABV %
  plato             DECIMAL,                   -- Stupňovitost (°P)
  ean               TEXT,                       -- EAN kód

  -- === PRICING ===
  cost_price        DECIMAL,                   -- Kalkulační (nákupní) cena
  avg_price         DECIMAL,                   -- Průměrná skladová cena
  sale_price        DECIMAL,                   -- Prodejní cena
  overhead_manual   BOOLEAN DEFAULT false,     -- Režie nastavená ručně
  overhead_price    DECIMAL,                   -- Režijní cena pro prodej

  -- === POS / WEB ===
  pos_available     BOOLEAN DEFAULT false,     -- Zpřístupnit na pokladně
  web_available     BOOLEAN DEFAULT false,     -- Nabízet na webu
  color             TEXT,                       -- Barva položky (hex)

  -- === META ===
  image_url         TEXT,
  notes             TEXT,
  is_active         BOOLEAN DEFAULT true,
  is_from_library   BOOLEAN DEFAULT false,     -- Importováno z veřejné knihovny
  source_library_id UUID,                      -- Odkaz na záznam v knihovně

  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX idx_items_tenant_material ON items(tenant_id, material_type) WHERE is_brew_material;
CREATE INDEX idx_items_tenant_product ON items(tenant_id) WHERE is_sale_item;
CREATE INDEX idx_items_tenant_active ON items(tenant_id, is_active);

-- ============================================================
-- ITEM CATEGORIES (systém kategorií)
-- ============================================================
CREATE TABLE categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),  -- NULL = globální/systémová
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
-- UNITS (měrné jednotky)
-- ============================================================
CREATE TABLE units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),  -- NULL = systémová
  name            TEXT NOT NULL,                 -- "kg", "l", "ks"
  base_unit       TEXT,                         -- Pro konverze: 'g', 'ml' (base units)
  conversion_factor DECIMAL,                    -- 1 kg = 1000 g → factor = 1000
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.5 Partneři (Unified)

```sql
-- ============================================================
-- PARTNERS (zákazníci + dodavatelé v jednom)
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
  dic_validated   BOOLEAN DEFAULT false,        -- Ověřeno přes ARES
  legal_form_code TEXT,                         -- Kód právní formy z ARES

  -- === CONTACT ===
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  web             TEXT,

  -- === ADDRESS (primární) ===
  address_street  TEXT,
  address_city    TEXT,
  address_zip     TEXT,
  country_id      UUID REFERENCES countries(id),

  -- === COMMERCIAL ===
  payment_terms   INTEGER DEFAULT 14,           -- Splatnost ve dnech
  price_list_id   UUID,                         -- FK na ceník (Fáze 2)
  credit_limit    DECIMAL,

  -- === META ===
  logo_url        TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  last_sync_at    TIMESTAMPTZ,                  -- Poslední sync z ARES

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === KONTAKTY (více kontaktů na partnera) ===
CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id),
  name            TEXT NOT NULL,
  position        TEXT,                         -- "ředitel", "nákupčí"
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  is_primary      BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === ADRESY (více adres na partnera) ===
CREATE TABLE addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id),
  address_type    TEXT NOT NULL,                -- 'billing' | 'delivery' | 'other'
  label           TEXT,                         -- "Hlavní sklad", "Provozovna Vinohrady"
  street          TEXT,
  city            TEXT,
  zip             TEXT,
  country_id      UUID REFERENCES countries(id),
  is_default      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BANKOVNÍ ÚČTY ===
CREATE TABLE partner_bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id),
  bank_name       TEXT,
  account_number  TEXT,                         -- Číslo účtu
  iban            TEXT,
  swift           TEXT,
  is_default      BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === PŘÍLOHY (generické — použitelné pro partnery i jiné entity) ===
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity_type     TEXT NOT NULL,                -- 'partner', 'item', 'batch', 'order'...
  entity_id       UUID NOT NULL,                -- ID záznamu
  file_name       TEXT NOT NULL,
  file_url        TEXT NOT NULL,                -- Supabase Storage URL
  file_size       INTEGER,
  mime_type       TEXT,
  uploaded_by     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_attachments_entity ON attachments(tenant_id, entity_type, entity_id);

-- === COUNTRIES (systémový číselník) ===
CREATE TABLE countries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,         -- 'CZ', 'SK', 'PL'
  name_cs         TEXT NOT NULL,                -- 'Česko'
  name_en         TEXT NOT NULL,                -- 'Czech Republic'
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.6 Receptury

```sql
-- ============================================================
-- RECIPES
-- ============================================================
CREATE TABLE recipes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  code                  TEXT,                     -- Interní kód
  name                  TEXT NOT NULL,
  beer_style_id         UUID REFERENCES beer_styles(id),
  status                TEXT DEFAULT 'draft',     -- 'draft' | 'active' | 'archived'

  -- === PARAMETRY ===
  batch_size_l          DECIMAL,                 -- Cílový objem (litry, net)
  batch_size_bruto_l    DECIMAL,                 -- Bruto objem
  beer_volume_l         DECIMAL,                 -- Objem hotového piva
  og                    DECIMAL,                 -- Original gravity (Plato)
  fg                    DECIMAL,                 -- Final gravity
  abv                   DECIMAL,                 -- Alkohol %
  ibu                   DECIMAL,                 -- Hořkost
  ebc                   DECIMAL,                 -- Barva
  boil_time_min         INTEGER,                 -- Délka chmelovaru
  cost_price            DECIMAL,                 -- Kalkulovaná cena várky

  -- === FERMENTACE ===
  duration_fermentation_days INTEGER,             -- Doba hlavního kvašení
  duration_conditioning_days INTEGER,             -- Doba dokvašování

  -- === META ===
  notes                 TEXT,
  is_from_library       BOOLEAN DEFAULT false,
  source_library_id     UUID,

  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- === RECIPE ITEMS (suroviny v receptuře) ===
CREATE TABLE recipe_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  category        TEXT NOT NULL,               -- 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  amount_g        DECIMAL NOT NULL,            -- Množství v gramech (base unit)
  use_stage       TEXT,                        -- 'mash' | 'boil' | 'whirlpool' | 'fermentation' | 'dry_hop'
  use_time_min    INTEGER,                     -- Čas přidání (min)
  hop_phase       TEXT,                        -- Fáze chmelení (pro chmely)
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === RECIPE STEPS (rmutovací / výrobní kroky) ===
CREATE TABLE recipe_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  recipe_id       UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  mash_profile_id UUID REFERENCES mashing_profiles(id),
  step_type       TEXT NOT NULL,               -- 'mash_in' | 'rest' | 'decoction' | 'mash_out' |
                                                -- 'boil' | 'whirlpool' | 'cooling'
  name            TEXT NOT NULL,
  temperature_c   DECIMAL,                     -- Cílová teplota (°C)
  time_min        INTEGER,                     -- Délka kroku (min)
  ramp_time_min   INTEGER,                     -- Čas ohřevu na cílovou teplotu
  temp_gradient   DECIMAL,                     -- Teplotní gradient
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === MASHING PROFILES (znovupoužitelné rmutovací profily) ===
CREATE TABLE mashing_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),  -- NULL = systémový/knihovna
  name            TEXT NOT NULL,
  steps           JSONB NOT NULL,               -- Array kroků { name, temp, time, ramp_time }
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === RECIPE CALCULATION (snapshot kalkulace) ===
CREATE TABLE recipe_calculations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  recipe_id       UUID NOT NULL REFERENCES recipes(id),
  calculated_at   TIMESTAMPTZ DEFAULT now(),
  data            JSONB NOT NULL,              -- Kompletní kalkulace (cena, OG, IBU...)
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BEER STYLES (systémový číselník — BJCP) ===
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

### 5.7 Výroba (Šarže / Várky)

```sql
-- ============================================================
-- BATCHES (Šarže / Várky)
-- ============================================================
CREATE TABLE batches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  batch_number      TEXT NOT NULL,              -- V-2026-001 (z counteru)
  batch_seq         INTEGER,                    -- Pořadové číslo várky
  recipe_id         UUID REFERENCES recipes(id),
  item_id           UUID REFERENCES items(id),  -- Výrobní položka (pivo)
  status            TEXT DEFAULT 'planned',
    -- 'planned' | 'brewing' | 'fermenting' | 'conditioning' |
    -- 'carbonating' | 'packaging' | 'completed' | 'dumped'
  brew_status       TEXT,                       -- Detailnější status vaření

  -- === DATES ===
  planned_date      DATE,                       -- Plánovaný den vaření
  brew_date         DATE,                       -- Skutečný den vaření
  end_brew_date     DATE,                       -- Konec výroby

  -- === ACTUAL VALUES ===
  actual_volume_l   DECIMAL,                    -- Skutečný objem
  og_actual         DECIMAL,                    -- Skutečná OG (Plato)
  fg_actual         DECIMAL,
  abv_actual        DECIMAL,

  -- === EQUIPMENT ===
  equipment_id      UUID REFERENCES equipment(id),  -- Primární tank

  -- === BATCH LINKING ===
  primary_batch_id  UUID REFERENCES batches(id),  -- Pro split/blend: odkaz na primární šarži

  -- === EXCISE ===
  excise_relevant_hl  DECIMAL,                  -- Objem podléhající spotřební dani (hl)
  excise_reported_hl  DECIMAL,                  -- Objem nahlášený celní správě
  excise_status       TEXT,                     -- 'pending' | 'reported' | 'paid'

  -- === META ===
  is_paused         BOOLEAN DEFAULT false,      -- Pozastaveno
  notes             TEXT,
  brewer_id         UUID REFERENCES auth.users(id),
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, batch_number)
);

CREATE INDEX idx_batches_tenant_status ON batches(tenant_id, status);
CREATE INDEX idx_batches_tenant_date ON batches(tenant_id, brew_date);

-- === BATCH STEPS (kroky vaření — instance z recipe_steps) ===
CREATE TABLE batch_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  step_type       TEXT NOT NULL,                -- Typ kroku (z recipe)
  brew_phase      TEXT NOT NULL,                -- 'mashing' | 'boiling' | 'fermentation' | 'conditioning'
  name            TEXT NOT NULL,
  temperature_c   DECIMAL,
  time_min        INTEGER,                      -- Plánovaný čas
  pause_min       INTEGER,                      -- Pauza
  auto_switch     BOOLEAN DEFAULT false,        -- Automatický přechod na další krok
  equipment_id    UUID REFERENCES equipment(id),

  -- === ACTUAL ===
  start_time_plan TIMESTAMPTZ,                  -- Plánovaný start
  start_time_real TIMESTAMPTZ,                  -- Skutečný start
  end_time_real   TIMESTAMPTZ,                  -- Skutečný konec

  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BATCH MEASUREMENTS (měření během výroby) ===
CREATE TABLE batch_measurements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  measurement_type TEXT NOT NULL,               -- 'gravity' | 'temperature' | 'ph' | 'volume' | 'pressure'
  value           DECIMAL,                      -- Hlavní hodnota
  value_plato     DECIMAL,                      -- Stupňovitost (°P)
  value_sg        DECIMAL,                      -- Specific gravity
  temperature_c   DECIMAL,                      -- Teplota při měření
  is_start        BOOLEAN DEFAULT false,        -- Počáteční měření
  is_end          BOOLEAN DEFAULT false,        -- Koncové měření
  notes           TEXT,
  measured_at     TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BATCH NOTES (poznámky ke krokům / šarži) ===
CREATE TABLE batch_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  batch_step_id   UUID REFERENCES batch_steps(id),  -- NULL = poznámka k celé šarži
  text            TEXT NOT NULL,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === BOTTLING ITEMS (stáčení) ===
CREATE TABLE bottling_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id),
  item_id         UUID NOT NULL REFERENCES items(id),    -- Produkt (lahev, sud...)
  quantity        DECIMAL NOT NULL,                      -- Počet kusů
  base_units      DECIMAL,                               -- Celkový objem v base unit (l)
  bottled_at      DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.8 Skladové hospodářství

```sql
-- ============================================================
-- WAREHOUSES (Sklady)
-- ============================================================
CREATE TABLE warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id),
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,                   -- "Hlavní sklad", "Sklad surovin"
  is_excise_relevant BOOLEAN DEFAULT false,        -- Sklad podléhá daňové evidenci
  categories      TEXT[],                          -- Povolené kategorie v tomto skladu
  is_default      BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- ============================================================
-- STOCK ISSUES (Skladové doklady — příjemky + výdejky)
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
  partner_id      UUID REFERENCES partners(id),     -- Dodavatel/odběratel
  order_id        UUID REFERENCES orders(id),       -- Obchodní objednávka
  batch_id        UUID REFERENCES batches(id),      -- Výrobní šarže
  season          TEXT,                             -- Sezóna

  additional_cost DECIMAL DEFAULT 0,                -- Vedlejší pořizovací náklady
  total_cost      DECIMAL DEFAULT 0,                -- Celková hodnota dokladu

  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

-- === STOCK ISSUE LINES (řádky dokladu) ===
CREATE TABLE stock_issue_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  stock_issue_id  UUID NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  line_no         INTEGER,
  requested_qty   DECIMAL NOT NULL,                -- Požadované množství
  issued_qty      DECIMAL,                         -- Skutečně vydané/přijaté
  missing_qty     DECIMAL,                         -- Chybějící
  unit_price      DECIMAL,                         -- Jednotková cena
  total_cost      DECIMAL,                         -- Řádek celkem
  issue_mode_snapshot TEXT,                        -- Snapshot FIFO/LIFO z item
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === STOCK ISSUE ALLOCATIONS (FIFO/LIFO alokace) ===
CREATE TABLE stock_issue_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  stock_issue_line_id UUID NOT NULL REFERENCES stock_issue_lines(id),
  source_movement_id  UUID NOT NULL REFERENCES stock_movements(id),  -- Z jakého příjmu
  quantity        DECIMAL NOT NULL,
  unit_price      DECIMAL NOT NULL,                -- Cena z příjmu
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === STOCK MOVEMENTS (atomické pohyby) ===
CREATE TABLE stock_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  movement_type   TEXT NOT NULL,                    -- 'in' | 'out'
  quantity        DECIMAL NOT NULL,                 -- Kladné = příjem, záporné = výdej
  unit_price      DECIMAL,                         -- Cena za jednotku

  -- === REFERENCES ===
  stock_issue_id  UUID REFERENCES stock_issues(id),
  stock_issue_line_id UUID REFERENCES stock_issue_lines(id),
  order_id        UUID REFERENCES orders(id),
  batch_id        UUID REFERENCES batches(id),
  lot_id          UUID REFERENCES material_lots(id),  -- Lot tracking

  is_closed       BOOLEAN DEFAULT false,            -- Uzavřeno (plně alokováno)
  date            DATE NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_movements_tenant_item ON stock_movements(tenant_id, item_id, date);
CREATE INDEX idx_movements_tenant_warehouse ON stock_movements(tenant_id, warehouse_id, date);

-- === STOCK STATUS (materializovaný stav skladu — per item, per warehouse) ===
CREATE TABLE stock_status (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  quantity        DECIMAL DEFAULT 0,               -- Aktuální stav
  reserved_qty    DECIMAL DEFAULT 0,               -- Rezervováno (naplánované výdeje)
  available_qty   DECIMAL GENERATED ALWAYS AS (quantity - reserved_qty) STORED,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, item_id, warehouse_id)
);

-- ============================================================
-- MATERIAL LOTS (Lot tracking surovin)
-- ============================================================
CREATE TABLE material_lots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  item_id         UUID NOT NULL REFERENCES items(id),
  lot_number      TEXT NOT NULL,                    -- Číslo šarže dodavatele
  supplier_id     UUID REFERENCES partners(id),     -- Dodavatel
  received_date   DATE,                             -- Datum příjmu
  expiry_date     DATE,                             -- Datum expirace
  quantity_initial DECIMAL,                         -- Původní množství
  quantity_remaining DECIMAL,                       -- Zbývající množství
  unit_price      DECIMAL,                         -- Nákupní cena
  properties      JSONB DEFAULT '{}',              -- Certifikát, analýza...
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === LOT ↔ BATCH vazba (jaké loty surovin šly do které šarže) ===
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

### 5.9 Objednávky

```sql
-- ============================================================
-- ORDERS (Obchodní objednávky)
-- ============================================================
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_number    TEXT NOT NULL,                    -- OBJ-2026-0001
  order_no        INTEGER,                         -- Pořadové číslo
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
  cashflow_id     UUID REFERENCES cashflows(id),    -- Vazba na cash flow

  -- === META ===
  notes           TEXT,
  internal_notes  TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, order_number)
);

-- === ORDER ITEMS (řádky objednávky) ===
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
  deposit_id      UUID REFERENCES deposits(id),     -- Záloha (sudy)
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === DEPOSITS (zálohy za obaly — sudy, přepravky) ===
CREATE TABLE deposits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Sud 30l", "Přepravka"
  deposit_amount  DECIMAL NOT NULL,                -- Výše zálohy
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.10 Ekonomika (CashFlow)

```sql
-- ============================================================
-- CASHFLOWS (Příjmy a výdaje)
-- ============================================================
CREATE TABLE cashflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            TEXT,                             -- CF-2026-001
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  category_id     UUID REFERENCES categories(id),   -- Kategorie příjmu/výdaje
  amount          DECIMAL NOT NULL,
  currency        TEXT DEFAULT 'CZK',
  date            DATE NOT NULL,
  due_date        DATE,                             -- Splatnost
  paid_date       DATE,                             -- Datum zaplacení
  status          TEXT DEFAULT 'planned',            -- 'planned' | 'pending' | 'paid' | 'cancelled'

  -- === REFERENCES ===
  partner_id      UUID REFERENCES partners(id),
  order_id        UUID REFERENCES orders(id),
  stock_issue_id  UUID REFERENCES stock_issues(id),

  -- === RECURRING ===
  template_id     UUID REFERENCES cashflow_templates(id),  -- Z jaké šablony generováno
  is_recurring    BOOLEAN DEFAULT false,

  description     TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === CASHFLOW TEMPLATES (šablony pro opakované příjmy/výdaje) ===
CREATE TABLE cashflow_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Nájem provozovny", "Pojištění"
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  category_id     UUID REFERENCES categories(id),
  amount          DECIMAL NOT NULL,
  currency        TEXT DEFAULT 'CZK',

  -- === RECURRENCE ===
  frequency       TEXT NOT NULL,                    -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  day_of_month    INTEGER,                         -- Den v měsíci (pro monthly)
  start_date      DATE NOT NULL,
  end_date        DATE,                             -- NULL = neomezeně
  next_date       DATE,                             -- Další plánované generování

  partner_id      UUID REFERENCES partners(id),
  description     TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- === CASH DESK (Pokladna — pro taproom/výčep) ===
CREATE TABLE cash_desks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id),
  name            TEXT NOT NULL,                    -- "Pokladna taproom"
  balance         DECIMAL DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE cash_desk_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  cash_desk_id    UUID NOT NULL REFERENCES cash_desks(id),
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  amount          DECIMAL NOT NULL,
  description     TEXT,
  date            TIMESTAMPTZ DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 5.11 Spotřební daň (Excise)

```sql
-- ============================================================
-- EXCISE TAX (Spotřební daň z piva)
-- ============================================================
-- Poznámka: Spotřební daň je povinná pro české pivovary.
-- Podléhá jí pivo nad 0.5% ABV, sazba závisí na kategorii
-- pivovaru (roční výstav) a stupňovitosti.

-- Konfigurace je v tenants.settings:
-- excise_enabled, excise_tax_point_mode, excise_default_plato_source

-- === EXCISE MOVEMENTS (daňové pohyby) ===
CREATE TABLE excise_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID REFERENCES batches(id),
  movement_type   TEXT NOT NULL,                    -- 'production' | 'release' | 'export' | 'destruction' | 'adjustment'
  volume_hl       DECIMAL NOT NULL,                -- Objem v hl
  plato           DECIMAL,                         -- Stupňovitost
  plato_source    TEXT,                            -- 'recipe' | 'measurement'
  tax_amount      DECIMAL,                         -- Vypočtená daň
  date            DATE NOT NULL,
  period          TEXT,                             -- '2026-01' (rok-měsíc)
  status          TEXT DEFAULT 'draft',             -- 'draft' | 'confirmed' | 'reported'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- === MONTHLY SUBMISSIONS (měsíční podání celní správě) ===
CREATE TABLE excise_monthly_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period          TEXT NOT NULL,                    -- '2026-01'
  status          TEXT DEFAULT 'draft',             -- 'draft' | 'submitted' | 'accepted'
  total_volume_hl DECIMAL,
  total_tax       DECIMAL,
  submitted_at    TIMESTAMPTZ,
  data            JSONB,                            -- Kompletní data podání
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, period)
);
```

### 5.12 Veřejné knihovny (read-only číselníky)

```sql
-- Tyto tabulky jsou globální (bez tenant_id), read-only pro uživatele.
-- Pivovar si z nich může importovat do svých items/recipes.

-- beer_styles          — BJCP styly piva (viz 5.6)
-- beer_style_groups    — Skupiny stylů
-- beer_colors          — EBC/SRM barvy
-- beer_hop_phases      — Fáze chmelení (číselník)
-- countries            — Státy
-- Budoucí: veřejná knihovna surovin, receptur (marketplace)
```

---

## 6. ENTITY RELATIONSHIP OVERVIEW

```
tenants
  ├── subscriptions → plans (verzované v čase)
  │     ├── subscription_addons → plan_addons
  │     └── subscription_events (audit trail)
  │
  ├── usage_records (měsíční hl spotřeba)
  │
  ├── shops (provozovny)
  │     └── equipment (zařízení)
  │     └── warehouses (sklady)
  │     └── cash_desks (pokladny)
  │
  ├── tenant_users → user_profiles
  │     ├── user_module_rights
  │     └── user_agenda_rights
  │
  ├── items (unified: suroviny + produkty)
  │     ├── item_categories → categories
  │     ├── material_lots (lot tracking)
  │     └── stock_status (per warehouse)
  │
  ├── partners (zákazníci + dodavatelé)
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
  │     └── → cashflow_templates
  │
  ├── excise_monthly_reports
  │
  ├── counters (číslovací řady)
  ├── saved_views
  ├── attachments (generické přílohy)
  ├── categories (hierarchické kategorie)
  └── units (měrné jednotky)

plans (globální — bez tenant_id, verzované)
  └── plan_addons (globální — bez tenant_id, verzované)
```

---

## 7. MODULOVÁ MAPA A PRIORITY

### 7.1 MVP (Fáze 1) — rozšířený scope

```
┌─────────────────────────────────────────────────────────────────┐
│              FÁZE 1 — MVP (týdny 1-14)                          │
│              "Pivovar umí vařit, prodávat a evidovat"           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SPRINT 0 (T1-T2): INFRASTRUKTURA                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Auth, Multi-tenant, Layout, Sidebar/TopBar, i18n,          │ │
│  │ DataBrowser framework (list + card view), FormSection,     │ │
│  │ SavedViews, Counters, Supabase + Drizzle setup, Deploy     │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  SPRINT 1 (T3-T4): ZÁKLADY                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PROVOZOVNY   │  │  EQUIPMENT   │  │  POLOŽKY (Items)     │  │
│  │ (shops)      │  │  (tanky...)  │  │  unified + views     │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐                             │
│  │  PARTNEŘI    │  │  KONTAKTY,   │                             │
│  │  (unified)   │  │  ADRESY, BÚ  │                             │
│  └──────────────┘  └──────────────┘                             │
│                                                                  │
│  SPRINT 2 (T5-T7): VÝROBA                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  RECEPTURY   │  │    ŠARŽE     │  │  KROKY + MĚŘENÍ      │  │
│  │  + suroviny  │  │  + workflow  │  │  + stáčení           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 3 (T8-T9): SKLAD                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  WAREHOUSE   │  │  PŘÍJEMKY/   │  │  LOT TRACKING        │  │
│  │  MGMT        │  │  VÝDEJKY     │  │  (surovin)           │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 4 (T10-T11): PRODEJ + FINANCE                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  OBJEDNÁVKY  │  │  CASHFLOW    │  │  ŠABLONY + RECURRING │  │
│  │  + zálohy    │  │  + pokladna  │  │  generování          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 5 (T12-T13): EXCISE + DASHBOARD                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  SPOTŘEBNÍ   │  │  DASHBOARD   │  │  ONBOARDING WIZARD   │  │
│  │  DAŇ         │  │  (KPI panel) │  │  + settings          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│                                                                  │
│  SPRINT 6 (T14): POLISH + LAUNCH                                │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Bug fixes, UX polish, RBAC finalizace, dokumentace,        │ │
│  │ tenant onboarding flow, monitoring, BETA LAUNCH             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│              FÁZE 2 — GROWTH (měsíce 5-7)                       │
├─────────────────────────────────────────────────────────────────┤
│  Ceníky + slevy, Plánování výroby (kalendář), Dodavatelé +      │
│  nákup, Pokročilé reporty, Fakturační integrace, Custom role    │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│              FÁZE 3 — ECOSYSTEM (měsíce 8-12)                   │
├─────────────────────────────────────────────────────────────────┤
│  API pro partnery, B2B portál, Integrace účetních systémů,      │
│  Kvalita (QC), Veřejná knihovna (marketplace), Offline/PWA      │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Sprint dependencies

```
Sprint 0: Infrastruktura
  │  (žádné závislosti — vše se staví od nuly)
  │
  ├→ Sprint 1: Základy
  │    │  (závisí na: DataBrowser, FormSection, Auth)
  │    │
  │    ├→ Sprint 2: Výroba
  │    │    (závisí na: Items, Equipment)
  │    │
  │    ├→ Sprint 3: Sklad
  │    │    (závisí na: Items, Partners, Warehouses)
  │    │
  │    └→ Sprint 4: Prodej + Finance
  │         (závisí na: Items, Partners, Orders)
  │
  └→ Sprint 5: Excise + Dashboard
       (závisí na: Batches, Stock Movements)
```

---

## 8. PROJEKT STRUKTURA — Feature-Module Pattern

Každý business modul je **self-contained složka** v `src/modules/`. Page soubory jsou tenké (import + render). Sdílené komponenty žijí v `src/components/`.

```
profibrew/
├── CLAUDE.md                          # Claude Code instructions
├── docs/                              # Dokumentace
│
├── src/
│   ├── app/[locale]/                  # ROUTES ONLY — tenké page soubory
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
│   │   ├── cs/                        # České překlady — SPLIT PER MODUL
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
│   ├── schema/                        # DB schema (centrální — Drizzle requirement)
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

### Pravidla Feature-Module Pattern

1. **Page soubory jsou tenké** — max 10–15 řádků, jen import z `modules/` a render
2. **Modul je self-contained** — components/, config.ts, actions.ts, hooks.ts, types.ts, schema.ts, index.ts
3. **Cross-module imports pouze přes index.ts** (public API)
4. **Drizzle schema centrálně** v `drizzle/schema/` (Drizzle requirement pro migrace)
5. **i18n per modul** — překlady v `src/i18n/messages/{locale}/{modul}.json`

---

## 9. CODING STANDARDS PRO CLAUDE CODE

```
1.  TypeScript strict mode, NO `any` types
2.  React Server Components kde možné, 'use client' jen kde nutné
3.  Tailwind CSS + shadcn/ui ONLY, žádné CSS moduly
4.  Drizzle ORM pro všechny DB operace
5.  Zod schema pro validaci na API i frontend
6.  SWR pro client-side data fetching
7.  next-intl pro všechny user-facing texty
8.  KAŽDÝ DB dotaz MUSÍ filtrovat přes tenant_id
9.  KAŽDÝ API route MUSÍ kontrolovat oprávnění
10. Všechny číselné hodnoty v DB v base units (l, g, °C, min)
11. Naming: PascalCase komponenty, camelCase utility, snake_case DB
12. Error handling: try/catch na každém API route, user-friendly chybové hlášky
13. Logování: strukturované logy (JSON) pro debugging
```

---

## 10. OTEVŘENÉ OTÁZKY

| # | Otázka | Status |
|---|--------|--------|
| 1 | ORM: Prisma vs Drizzle | ✅ **Drizzle** |
| 2 | i18n od začátku? | ✅ **Ano, next-intl** |
| 3 | Číslovací řady | ✅ **Konfigurovatelné + defaulty** |
| 4 | Lot tracking | ✅ **V MVP, po šaržích surovin** |
| 5 | Offline/PWA | 🔜 Fáze 3 |
| 6 | Měrné jednotky | ✅ **Base unit v DB, konverze v UI** |
| 7 | Items model | ✅ **Hybrid (unified + views)** |
| 8 | Partner model | ✅ **Unified (customer + supplier)** |
| 9 | Card view | ✅ **Od začátku (list + card)** |
| 10 | Excise v MVP | ✅ **Ano** |
| 11 | Equipment v MVP | ✅ **Ano** |
| 12 | Shops v MVP | ✅ **Ano** |
| 13 | CashFlow v MVP | ✅ **Ano (příjmy, výdaje, šablony, recurring)** |
| 14 | Pricing model | ✅ **Tier-based + add-on moduly + overage per hl** |
| 15 | Pricing v DB | ✅ **Temporální data (valid_from/to), subscription per tenant** |
| 16 | Konkrétní ceny a limity tierů | 🔜 **Samostatná analýza CZ trhu** |
| 17 | Launch promo parametry | 🔜 **Business decision** |
| 18 | Roční vs měsíční billing (sleva?) | 🔜 **Business decision** |

---

**Připravil:** Claude AI Agent
**Pro:** ProfiBrew.com
**Verze:** 2.1
**Datum:** 17.02.2026
**Status:** DRAFT — připraveno k finálnímu review
