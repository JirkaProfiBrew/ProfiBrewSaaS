# SPRINT 9 — SAAS + DEPLOYMENT
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 06.03.2026

---

## CÍL SPRINTU

Zprovoznit produkční prostředí a kompletní onboarding flow pro nového tenanta.
Na konci sprintu musí být možné: zaregistrovat se na profibrew.com, projít seedingem
tenantu, přihlásit se a začít pracovat — se správně omezeným přístupem dle subscription
tier. Prvního beta zákazníka lze onboardovat.

**Stripe záměrně odložen na post-launch.** První platby = faktura bankovním převodem.
Stripe přijde v S12 až bude prvních 5 platících zákazníků.

**Časový odhad:** 1,5 týdne (9.–20.3.2026)

**Závisí na:** Sprint 0 (registrace, tenant schema, plans seed), všechny předchozí sprinty

---

## REFERENČNÍ DOKUMENTY

- `docs/SYSTEM-DESIGN.md` sekce 2 (Multi-tenant), sekce 10 (Environments)
- `docs/SYSTEM-DESIGN.md` sekce 3.1 (Auth flow — registration)
- `docs/PRODUCT-SPEC.md` sekce 9 (Module Access Control)
- `CLAUDE.md`

---

## ⚠️ SCOPE ROZHODNUTÍ

### Co je v S9
- Produkční Vercel + Supabase setup (3 prostředí)
- CI/CD pipeline — automatické migrace na deploy
- Kompletní tenant provisioning (registrace → funkční tenant se vším seed daty)
- Plans seed s MVP cenami
- Module gating (subscription → allowed modules, middleware, UI)
- Settings → Billing (read-only — aktuální plán, trial status)
- pg_cron job aktivace (bylo pending od S0)

### Co NENÍ v S9 (odkládáme)
- ~~Stripe~~ — post-launch, S12
- ~~Usage records / overage billing~~ — post-launch
- ~~Plan upgrade/downgrade flow~~ — post-launch (manual: email support)
- ~~Admin tenant management UI~~ — S11 (superadmin vidí data v DB přímo)
- ~~Onboarding wizard~~ — S10 (landing page sprint)

---

## FÁZE 9A: PRODUKČNÍ INFRASTRUKTURA

### 9A.1 Tři prostředí — přehled

| Prostředí | Hosting | DB | Branch | URL |
|-----------|---------|-----|--------|-----|
| **Local** | localhost:3000 | Supabase CLI (Docker) | any | http://localhost:3000 |
| **Staging** | Vercel Preview | Supabase staging project | feature/*, develop | auto per branch |
| **Production** | Vercel Production | Supabase production project | main | profibrew.com |

### 9A.2 Supabase produkční projekt

**Kroky pro Claude Code / ruční setup (dokumentovat v README):**

1. Vytvořit nový Supabase projekt na app.supabase.com (region: eu-central-1 — Frankfurt)
2. V projektu povolit rozšíření:
   ```sql
   CREATE EXTENSION IF NOT EXISTS "pg_cron";
   CREATE EXTENSION IF NOT EXISTS "pg_net";
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
3. Spustit všechny migrace: `npx supabase db push --db-url $PRODUCTION_DATABASE_URL`
4. Spustit seed data (plans, systémové role, beer styles, countries, units):
   ```bash
   npx tsx scripts/seed-production.ts
   ```
5. Nastavit email templates v Supabase Auth (confirm email, reset password)
6. Nastavit allowed redirect URLs v Supabase Auth:
   - `https://profibrew.com/**`
   - `https://*.vercel.app/**` (pro Preview)
   - `http://localhost:3000/**`

### 9A.3 Vercel setup

**Projekt:** `profibrew` na Vercel

**Produkční environment variables** (nastavit v Vercel → Settings → Environment Variables):

```bash
# Supabase Production
NEXT_PUBLIC_SUPABASE_URL=https://[prod-project-id].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[prod-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[prod-service-role-key]
DATABASE_URL=postgresql://postgres:[password]@db.[prod-project-id].supabase.co:5432/postgres

# App
NEXT_PUBLIC_APP_URL=https://profibrew.com
NODE_ENV=production

# Email
RESEND_API_KEY=re_[key]

# Cron security
CRON_SECRET=[generate: openssl rand -hex 32]
```

**Staging environment variables** — stejná struktura, jiné hodnoty (staging Supabase projekt).

**Preview deployments** — automaticky pro každý PR/branch push.

### 9A.4 Custom doména

1. V Vercel přidat doménu `profibrew.com` + `www.profibrew.com`
2. DNS záznamy u registrátora:
   ```
   A     @    76.76.19.61
   CNAME www  cns1.vercel-dns.com
   ```
3. Vercel automaticky vystaví SSL (Let's Encrypt)

### 9A.5 CI/CD — automatické migrace

**`.github/workflows/deploy.yml`:**

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  migrate-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run DB migrations (production)
        env:
          DATABASE_URL: ${{ secrets.PRODUCTION_DATABASE_URL }}
        run: npx drizzle-kit migrate

      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

**GitHub Secrets** (nastavit v repo → Settings → Secrets):
- `PRODUCTION_DATABASE_URL`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

**Pro staging** — analogický workflow pro větve `develop` + `feature/*`.

### 9A.6 pg_cron job aktivace

Toto bylo pending od S0 (CRON_SECRET byl vygenerován). Aktivovat po prvním produkčním deployi:

```sql
-- Spustit v Supabase SQL editoru (production):
-- Job: měsíční výpočet usage records (spouštět 1. každého měsíce v 2:00)
SELECT cron.schedule(
  'monthly-usage-calculation',
  '0 2 1 * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.app_url') || '/api/cron/monthly-usage',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.cron_secret') || '"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

-- Nastavit app settings v Supabase:
ALTER DATABASE postgres SET app.app_url = 'https://profibrew.com';
ALTER DATABASE postgres SET app.cron_secret = '[CRON_SECRET hodnota]';
```

**`src/app/api/cron/monthly-usage/route.ts`** — placeholder endpoint (logika přijde s Stripe):

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // TODO: S12 — usage calculation + Stripe overage billing
  console.log('[CRON] monthly-usage: placeholder — Stripe billing pending')
  return NextResponse.json({ ok: true, message: 'placeholder' })
}
```

---

## FÁZE 9B: TENANT PROVISIONING

### 9B.1 Problém se stávající registrací

Sprint 0 implementoval základní registraci, která vytváří `tenant` + `user_profiles` +
`tenant_users` + `subscription (Free)`. **Chybí kompletní seed nového tenantu:**

- Výchozí číslovací řady (faktury, objednávky, várky, doklady...)
- Výchozí provozovna
- Výchozí sklad
- Výchozí kategorie cash flow
- Tenant settings (currency, locale, timezone)
- Owner user profile se jménem

### 9B.2 createTenant() — kompletní provisioning funkce

**`src/lib/tenant/provision.ts`:**

```typescript
import { db } from '@/lib/db'
import { tenants, tenantUsers, userProfiles, subscriptions, plans } from '@/../drizzle/schema'
import { shops, equipment, warehouses } from '@/../drizzle/schema/shops'
import { counters } from '@/../drizzle/schema/system'
import { cashflowCategories } from '@/../drizzle/schema/cashflows'
import { createId } from '@/lib/utils'

interface ProvisionTenantParams {
  breweryName: string
  email: string
  userId: string       // Supabase auth.users.id
  fullName?: string
  trialDays?: number   // default 30
}

/**
 * Kompletní provisioning nového tenantu.
 * Volá se po Supabase signUp — uživatel existuje, tenant ještě ne.
 *
 * Atomická transakce: buď vše projde, nebo nic.
 */
export async function provisionNewTenant({
  breweryName,
  email,
  userId,
  fullName,
  trialDays = 30,
}: ProvisionTenantParams): Promise<{ tenantId: string }> {
  return await db.transaction(async (tx) => {

    // === 1. USER PROFILE ===
    await tx.insert(userProfiles).values({
      id: userId,
      fullName: fullName ?? breweryName,
    }).onConflictDoUpdate({
      target: userProfiles.id,
      set: { fullName: fullName ?? breweryName },
    })

    // === 2. TENANT ===
    const slug = await generateUniqueSlug(breweryName, tx)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays)

    const [tenant] = await tx.insert(tenants).values({
      name: breweryName,
      slug,
      status: 'trial',
      trialEndsAt,
      settings: {
        currency: 'CZK',
        locale: 'cs',
        timezone: 'Europe/Prague',
      },
    }).returning({ id: tenants.id })

    const tenantId = tenant.id

    // === 3. TENANT_USER (owner role) ===
    await tx.insert(tenantUsers).values({
      tenantId,
      userId,
      role: 'owner',
      isActive: true,
      joinedAt: new Date(),
    })

    // === 4. SUBSCRIPTION (trial — Pro plan, všechny moduly) ===
    // Trial = Pro plan zdarma na 30 dní
    const proPlan = await tx.query.plans.findFirst({
      where: (p, { eq, and, isNull }) => and(eq(p.slug, 'pro'), isNull(p.validTo)),
    })

    if (proPlan) {
      const now = new Date()
      const periodEnd = new Date(now)
      periodEnd.setMonth(periodEnd.getMonth() + 1)

      await tx.insert(subscriptions).values({
        tenantId,
        planId: proPlan.id,
        status: 'trialing',
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt,
        // Launch promo: overage waived po dobu trial
        overageWaivedUntil: trialEndsAt,
      })
    }

    // === 5. DEFAULT SHOP (provozovna) ===
    const [shop] = await tx.insert(shops).values({
      tenantId,
      name: breweryName,
      code: 'HQ',
      isDefault: true,
    }).returning({ id: shops.id })

    // === 6. DEFAULT WAREHOUSE (sklad) ===
    await tx.insert(warehouses).values({
      tenantId,
      shopId: shop.id,
      name: 'Hlavní sklad',
      code: 'HLS',
      categories: ['suroviny', 'pivo', 'obaly'],
      isDefault: true,
      isExciseRelevant: false,
    })

    // === 7. ČÍSLOVACÍ ŘADY (counters) ===
    const defaultCounters = [
      { entity: 'batch',         prefix: 'V',   paddingLength: 3 },
      { entity: 'stock_receipt', prefix: 'PRI', paddingLength: 4 },
      { entity: 'stock_issue',   prefix: 'VYD', paddingLength: 4 },
      { entity: 'order',         prefix: 'OBJ', paddingLength: 4 },
      { entity: 'cashflow',      prefix: 'CF',  paddingLength: 5 },
      { entity: 'recipe',        prefix: 'REC', paddingLength: 3 },
    ]

    await tx.insert(counters).values(
      defaultCounters.map(c => ({
        tenantId,
        entity: c.entity,
        prefix: c.prefix,
        separator: '-',
        paddingLength: c.paddingLength,
        includeYear: true,
        resetYearly: true,
        currentValue: 0,
      }))
    )

    // === 8. DEFAULT CASHFLOW CATEGORIES ===
    await seedDefaultCashflowCategories(tenantId, tx)

    // === 9. DEFAULT EXCISE SETTINGS ===
    // Přidat do tenant settings
    await tx.update(tenants)
      .set({
        settings: {
          currency: 'CZK',
          locale: 'cs',
          timezone: 'Europe/Prague',
          excise_enabled: false,  // Zapne si sám v nastavení
          excise_category: 'A',
          excise_tax_point_mode: 'production',
          excise_default_plato_source: 'measurement',
        },
      })
      .where(eq(tenants.id, tenantId))

    return { tenantId }
  })
}
```

### 9B.3 Seed cash flow kategorií

**`src/lib/tenant/seed-cashflow-categories.ts`:**

```typescript
// Systémové defaultní kategorie — idempotentní seed per tenant
// Hierarchie: příjmy / výdaje → podkategorie

const DEFAULT_CATEGORIES = [
  // PŘÍJMY
  { name: 'Příjmy', type: 'income', isSystem: true, children: [
    { name: 'Prodej piva', type: 'income', isSystem: true },
    { name: 'Tržby taproom', type: 'income', isSystem: true },
    { name: 'Ostatní příjmy', type: 'income', isSystem: true },
  ]},
  // VÝDAJE
  { name: 'Výdaje', type: 'expense', isSystem: true, children: [
    { name: 'Suroviny a materiál', type: 'expense', isSystem: true },
    { name: 'Energie', type: 'expense', isSystem: true },
    { name: 'Mzdové náklady', type: 'expense', isSystem: true },
    { name: 'Obaly a packaging', type: 'expense', isSystem: true },
    { name: 'Spotřební daň', type: 'expense', isSystem: true },
    { name: 'Ostatní výdaje', type: 'expense', isSystem: true },
  ]},
]
```

### 9B.4 Registrační flow — aktualizace

**`src/lib/auth/actions.ts`** — `signUp` akce:

```typescript
export async function signUp(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const breweryName = formData.get('breweryName') as string
  const fullName = formData.get('fullName') as string | undefined

  const supabase = await createServerSupabaseClient()

  // 1. Supabase Auth
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Registrace selhala')

  // 2. Provisioning — vytvoří vše potřebné
  await provisionNewTenant({
    breweryName,
    email,
    userId: data.user.id,
    fullName: fullName || breweryName,
    trialDays: 30,
  })

  // 3. Přesměrování — na onboarding wizard (S10) nebo rovnou na dashboard
  redirect('/cs/dashboard')
}
```

### 9B.5 Registrační formulář — aktualizace

**`src/app/[locale]/(auth)/register/page.tsx`** — přidat pole:

```
Jméno a příjmení   [input: fullName]       ← NOVÉ
Účel použití       [radio/select]           ← NOVÉ
  ○ Minipivovar / profesionální provoz  (→ Pro trial)
  ○ Domácí vaření pro vlastní spotřebu  (→ community_homebrewer)
Název              [input: breweryName]
  Label dle účelu: "Název pivovaru" vs. "Přezdívka / jméno"
Email              [input: email]
Heslo              [input: password]
Souhlas s podmínkami [checkbox]
```

**Logika provisioning dle účelu:**

```typescript
// src/lib/auth/actions.ts — signUp akce
const purpose = formData.get('purpose') // 'professional' | 'homebrewer'

await provisionNewTenant({
  breweryName,
  email,
  userId: data.user.id,
  fullName: fullName || breweryName,
  trialDays: purpose === 'homebrewer' ? 0 : 30,
  planSlug: purpose === 'homebrewer' ? 'community_homebrewer' : 'pro',
  // Homebrewer dostane community plán rovnou, bez trialu
  // Professional dostane Pro trial na 30 dní
})
```

**`provisionNewTenant()`** — přidat parametr `planSlug`:

```typescript
// Místo hardcoded 'pro' plan lookup:
const plan = await tx.query.plans.findFirst({
  where: (p, { eq, and, isNull }) =>
    and(eq(p.slug, planSlug ?? 'pro'), isNull(p.validTo)),
})
```

**Informace pod formulářem dle volby:**

Pro `professional`:
```
✓ 30 dní zdarma — bez zadávání platební karty
✓ Přístup ke všem modulům
✓ Neomezený počet uživatelů
```

Pro `homebrewer`:
```
✓ Zdarma bez omezení pro domácí vaření
✓ Limit 2 hl/měsíc (zákonný limit domácí výroby)
✓ Recepty, várky, sklad, ekonomika domácího vaření
```

**Školy** — samostatný kontaktní formulář (ne standardní registrace).
Odkaz "Pro školy a vzdělávací instituce" na registrační stránce → formulář
`/contact/school` → po manuálním schválení obdrží škola pozvánkový email.

---

## FÁZE 9C: PLANS SEED

### 9C.1 Cenový model — MVP

Finální ceny dle `docs/pricing-strategy.md` (verze 1.1). Plány jsou verzované
v DB — změna ceny = nový záznam, žádný kód se nemění.

| Tier | Cena/měs | Included hl | Overage/hl | Moduly | Users |
|------|----------|-------------|------------|--------|-------|
| Free | 0 Kč | 50 | — (hard stop) | Pivovar | 2 |
| Starter | 1 490 Kč | 200 | 15 Kč | Pivovar + Sklad | Unlimited |
| Pro | 3 490 Kč | 500 | 12 Kč | Pivovar + Sklad + Obchod + Finance | Unlimited |
| Business | 6 990 Kč | 2 000 | 8 Kč | Vše + Plán | Unlimited |
| Community: Domovarník | 0 Kč | 2 | — (hard stop) | Pivovar + Sklad + Finance | 1 |
| Community: Škola | 0 Kč | Unlimited | — | Pivovar + Sklad + Finance | Unlimited |

**Launch promo:** Prvních 6 měsíců bez hl limitu na komerčních plánech
(`overage_waived_until = registration_date + 6 měsíců`).
Community plány promo nepotřebují — jsou permanentně zdarma.

### 9C.2 Migrace — plans seed

**`drizzle/migrations/0027_plans_seed.sql`:**

```sql
-- Plans seed — idempotentní (ON CONFLICT DO NOTHING)
-- Datum platnosti: od 1.4.2026 (launch datum)
-- Ceny dle pricing-strategy.md (verze 1.1)

-- === SCHEMA ROZŠÍŘENÍ ===
-- Přidat sloupce pokud neexistují
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS watermark BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hard_hl_stop BOOLEAN DEFAULT false;
  -- is_hard_hl_stop = true → blok varky nad limitem (ne overage faktura)
  -- Používá community_homebrewer a free tier

-- === KOMERČNÍ PLÁNY ===
INSERT INTO plans (id, slug, name, description, base_price, currency,
  included_hl, overage_per_hl, max_users, included_modules,
  is_hard_hl_stop, watermark, version, valid_from, is_active, is_public, sort_order)
VALUES
  -- FREE tier
  (
    '10000000-0000-0000-0000-000000000001',
    'free', 'Zdarma', 'Základní evidence pivovarnictví',
    0, 'CZK',
    50, NULL,         -- 50 hl/měsíc hard stop
    2,                -- max 2 uživatelé
    ARRAY['brewery'],
    true, false,      -- hard stop, bez watermarku
    1, '2026-04-01', true, true, 0
  ),
  -- STARTER (Pivovar + Sklad)
  (
    '10000000-0000-0000-0000-000000000002',
    'starter', 'Starter', 'Pro pivovary do 200 hl/měsíc',
    1490, 'CZK',      -- 1 490 Kč/měsíc
    200, 15,          -- 200 hl included, 15 Kč/hl overage
    NULL,             -- neomezení uživatelé
    ARRAY['brewery', 'stock'],
    false, false,
    1, '2026-04-01', true, true, 1
  ),
  -- PRO (všechny moduly kromě Plán)
  (
    '10000000-0000-0000-0000-000000000003',
    'pro', 'Pro', 'Kompletní řešení pro provozní pivovary',
    3490, 'CZK',      -- 3 490 Kč/měsíc
    500, 12,          -- 500 hl included, 12 Kč/hl overage
    NULL,
    ARRAY['brewery', 'stock', 'sales', 'finance'],
    false, false,
    1, '2026-04-01', true, true, 2
  ),
  -- BUSINESS (vše + API + integrace — Phase 2)
  (
    '10000000-0000-0000-0000-000000000004',
    'business', 'Business', 'Pro větší pivovary s integrací',
    6990, 'CZK',      -- 6 990 Kč/měsíc
    2000, 8,          -- 2 000 hl included, 8 Kč/hl overage
    NULL,
    ARRAY['brewery', 'stock', 'sales', 'finance', 'plan'],
    false, false,
    1, '2026-04-01', true, true, 3
  )
ON CONFLICT (id) DO NOTHING;

-- === COMMUNITY PLÁNY (is_public = false — nezobrazují se na pricing page) ===
INSERT INTO plans (id, slug, name, description, base_price, currency,
  included_hl, overage_per_hl, max_users, included_modules,
  is_hard_hl_stop, watermark, version, valid_from, is_active, is_public, sort_order)
VALUES
  -- DOMOVARNÍK — zákonný limit 2 000 l/rok = 20 hl/rok = ~1,67 hl/měs → limit 2 hl
  (
    '10000000-0000-0000-0000-000000000005',
    'community_homebrewer', 'Domovarník',
    'Pro domácí výrobu piva — nekomerční použití',
    0, 'CZK',
    2, NULL,           -- 2 hl/měsíc hard stop (zákonný limit domácí výroby)
    1,                 -- max 1 uživatel
    ARRAY['brewery', 'stock', 'finance'],
    true, true,        -- hard stop + watermark na exportech
    1, '2026-04-01', true, false, 99
  ),
  -- ŠKOLA — neomezený výstav, neomezení uživatelé, manuální schválení
  (
    '10000000-0000-0000-0000-000000000006',
    'community_school', 'Škola',
    'Pro vzdělávací instituce — nekomerční použití',
    0, 'CZK',
    NULL, NULL,        -- neomezeno
    NULL,              -- neomezení uživatelé (celá třída)
    ARRAY['brewery', 'stock', 'finance'],
    false, true,       -- bez hl stopu, watermark na exportech
    1, '2026-04-01', true, false, 99
  )
ON CONFLICT (id) DO NOTHING;

-- === TABULKA PRO SCHVÁLENÍ ŠKOL ===
CREATE TABLE IF NOT EXISTS community_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  type          TEXT NOT NULL DEFAULT 'school' CHECK (type = 'school'),
  school_name   TEXT NOT NULL,
  ico           TEXT,              -- Ověřeno přes ARES
  contact_name  TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  description   TEXT,              -- Popis využití ve výuce
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID,              -- superadmin user_id
  reviewed_at   TIMESTAMPTZ,
  expires_at    DATE,              -- approved_at + 1 rok
  notes         TEXT,              -- Interní poznámka
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE community_applications ENABLE ROW LEVEL SECURITY;

-- Superadmin vidí vše, tenant vidí svou žádost
CREATE POLICY "community_applications_tenant" ON community_applications
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_superadmin = true)
  );

-- TRIAL: Pro plán na 30 dní zdarma — není samostatný plán,
-- jen subscription.status = 'trialing' + plan_id → Pro
```

### 9C.3 Drizzle schema update

**`drizzle/schema/subscriptions.ts`** — ověřit a doplnit chybějící sloupce:

```typescript
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  status: text("status").notNull().default('trialing'),
  // trialing | active | past_due | cancelled | paused
  startedAt: date("started_at").notNull(),
  currentPeriodStart: date("current_period_start").notNull(),
  currentPeriodEnd: date("current_period_end").notNull(),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  cancelledAt: date("cancelled_at"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
  promoCode: text("promo_code"),
  overageWaivedUntil: date("overage_waived_until"),
  priceOverride: decimal("price_override"),
  stripeSubscriptionId: text("stripe_subscription_id"),  // NULL do S12
  stripeCustomerId: text("stripe_customer_id"),          // NULL do S12
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})
```

---

## FÁZE 9D: MODULE GATING

### 9D.1 hasModuleAccess() helper

**`src/lib/module-access/check.ts`:**

```typescript
import { cache } from 'react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getTenantId } from '@/lib/auth/tenant'

export type AppModuleSlug = 'brewery' | 'stock' | 'sales' | 'finance' | 'plan'

export interface ModuleAccess {
  allowedModules: AppModuleSlug[]
  planSlug: string
  planName: string
  status: string
  trialEndsAt: Date | null
  isTrialing: boolean
  daysLeftInTrial: number | null
}

/**
 * Načte přístup k modulům pro aktuální tenant.
 * Cachováno per request (React cache).
 */
export const getModuleAccess = cache(async (): Promise<ModuleAccess | null> => {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const tenantId = await getTenantId()
  if (!tenantId) return null

  const { data } = await supabase
    .from('subscriptions')
    .select(`
      status, trial_ends_at, overage_waived_until,
      plans!inner(slug, name, included_modules)
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['trialing', 'active', 'past_due'])
    .single()

  if (!data) {
    // Fallback: Free tier (brewery only)
    return {
      allowedModules: ['brewery'],
      planSlug: 'free',
      planName: 'Zdarma',
      status: 'active',
      trialEndsAt: null,
      isTrialing: false,
      daysLeftInTrial: null,
    }
  }

  const plan = data.plans as { slug: string; name: string; included_modules: string[] }
  const trialEndsAt = data.trial_ends_at ? new Date(data.trial_ends_at) : null
  const now = new Date()
  const isTrialing = data.status === 'trialing' && trialEndsAt !== null && trialEndsAt > now

  return {
    allowedModules: plan.included_modules as AppModuleSlug[],
    planSlug: plan.slug,
    planName: plan.name,
    status: data.status,
    trialEndsAt,
    isTrialing,
    daysLeftInTrial: trialEndsAt
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / 86400000))
      : null,
  }
})

export async function hasModuleAccess(module: AppModuleSlug): Promise<boolean> {
  // brewery je vždy přístupný
  if (module === 'brewery') return true
  const access = await getModuleAccess()
  if (!access) return false
  return access.allowedModules.includes(module)
}
```

### 9D.2 Module routes config

**`src/config/module-routes.ts`** — aktualizovat/ověřit:

```typescript
export const MODULE_ROUTES: Record<string, AppModuleSlug | '_always'> = {
  '/brewery':  'brewery',
  '/stock':    'stock',
  '/sales':    'sales',
  '/finance':  'finance',
  '/plan':     'plan',
  '/settings': '_always',
  '/dashboard':'_always',
  '/upgrade':  '_always',
  '/admin':    '_always',  // Admin má vlastní auth check (is_superadmin)
}

export function getModuleForPath(pathname: string): AppModuleSlug | '_always' | null {
  for (const [prefix, module] of Object.entries(MODULE_ROUTES)) {
    if (pathname.startsWith(prefix)) return module
  }
  return null
}
```

### 9D.3 Middleware — module gating

**`src/middleware.ts`** — rozšířit stávající middleware o module check:

```typescript
// Po ověření přihlášení, pro (dashboard) routes:

const moduleSlug = getModuleForPath(pathname)

if (moduleSlug && moduleSlug !== '_always') {
  // Načíst allowed modules z DB (nebo JWT cache — viz 9D.4)
  const allowedModules = await getAllowedModulesFromCookie(req)

  if (!allowedModules.includes(moduleSlug)) {
    const upgradeUrl = new URL(`/${locale}/upgrade`, req.url)
    upgradeUrl.searchParams.set('module', moduleSlug)
    return NextResponse.redirect(upgradeUrl)
  }
}
```

### 9D.4 JWT custom claims — module access cache

Aby middleware nemusel hit DB při každém requestu, uložit allowed modules do JWT:

**Supabase Edge Function / DB trigger** — přidat custom claims při login:

```sql
-- Supabase hook: Auth → JWT enrichment
-- V Supabase Dashboard → Authentication → Hooks → Customize Access Token

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  claims jsonb;
  tenant_record record;
  allowed_modules text[];
BEGIN
  claims := event->'claims';

  -- Načíst tenant_id a allowed modules pro uživatele
  SELECT
    tu.tenant_id,
    p.included_modules
  INTO tenant_record
  FROM tenant_users tu
  JOIN subscriptions s ON s.tenant_id = tu.tenant_id
  JOIN plans p ON p.id = s.plan_id
  WHERE tu.user_id = (event->>'user_id')::uuid
    AND tu.is_active = true
    AND s.status IN ('trialing', 'active', 'past_due')
  LIMIT 1;

  IF tenant_record IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(tenant_record.tenant_id::text));
    claims := jsonb_set(claims, '{modules}', to_jsonb(tenant_record.included_modules));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
```

Pokud JWT hook není dostupný v aktuálním Supabase plánu → fallback na cookie:

```typescript
// Uložit modules do signed cookie po přihlášení:
// src/lib/module-access/cache.ts
export async function cacheModulesInCookie(modules: string[], response: NextResponse) {
  response.cookies.set('pb_modules', modules.join(','), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 3600, // 1 hodina — refresh při subscription změně
  })
}
```

### 9D.5 ModuleGuard — server component

**`src/components/layout/ModuleGuard.tsx`:**

```typescript
import { hasModuleAccess } from '@/lib/module-access/check'
import { UpgradePrompt } from './UpgradePrompt'
import type { AppModuleSlug } from '@/lib/module-access/check'

interface Props {
  module: AppModuleSlug
  children: React.ReactNode
}

export async function ModuleGuard({ module, children }: Props) {
  const hasAccess = await hasModuleAccess(module)
  if (!hasAccess) return <UpgradePrompt module={module} />
  return <>{children}</>
}
```

Integrovat do layout.tsx každého modulu kde není (`/stock/`, `/sales/`, `/finance/`):

```typescript
// src/app/[locale]/(dashboard)/stock/layout.tsx
export default function StockLayout({ children }) {
  return (
    <ModuleGuard module="stock">
      {children}
    </ModuleGuard>
  )
}
```

### 9D.6 TopBar — zamčené moduly

**`src/components/layout/TopBar.tsx`** — aktualizovat TopBar, aby zobrazoval 🔒 na modulech
bez přístupu. Module tabs přijmout `allowedModules` prop (z server dat):

```typescript
// Tab pro nepřístupný modul:
<Link href={`/${locale}/upgrade?module=${module.slug}`}>
  <span className="opacity-50 cursor-default">
    🔒 {module.name}
  </span>
</Link>
```

### 9D.7 /upgrade page

**`src/app/[locale]/(dashboard)/upgrade/page.tsx`:**

```
┌─────────────────────────────────────────────────────────┐
│  Upgrade na vyšší plán                                  │
│                                                         │
│  Aktuální plán: Starter                                 │
│  Pro přístup k modulu "Obchod" je potřeba plán Pro.     │
│                                                         │
│  ┌────────┐  ┌────────┐  ┌────────────┐  ┌──────────┐  │
│  │ Free   │  │Starter │  │   Pro ✓    │  │ Business │  │
│  │ 0 Kč   │  │od 500  │  │ od 500 Kč  │  │ od 500   │  │
│  │Pivovar │  │Pivovar │  │ + Obchod   │  │ + Plán   │  │
│  │        │  │+ Sklad │  │ + Finance  │  │ + API    │  │
│  └────────┘  └────────┘  └────────────┘  └──────────┘  │
│                                                         │
│  Přejít na Pro →                                        │
│  (V MVP: odešle email na support — Stripe přijde v S12) │
└─────────────────────────────────────────────────────────┘
```

**Upgrade akce v MVP:** Kliknutí na "Přejít na Pro" → zobrazí instrukce:
> "Pro upgrade napište na info@profibrew.com nebo nám zavolejte. Zpracujeme to do 24 hodin."

Není žádný Stripe flow — to přijde v S12.

---

## FÁZE 9E: SETTINGS → BILLING

**Route:** `/settings/billing`

Read-only přehled pro tenanta:

```
┌──────────────────────────────────────────────┐
│  Váš plán                                    │
│                                              │
│  Pro Trial                                   │
│  Přístup ke všem modulům                     │
│                                              │
│  Trial vyprší: 10. dubna 2026 (za 31 dní)    │
│  ████████████████░░ 70%                      │
│                                              │
│  Po vypršení trialu:                         │
│  Kontaktujte nás pro aktivaci: 📧 email      │
│                                              │
│  ─────────────────────────────────────────  │
│  Dostupné moduly:                            │
│  ✅ Pivovar   ✅ Sklad                        │
│  ✅ Obchod    ✅ Finance                      │
│  ❌ Plán (Business tier)                     │
└──────────────────────────────────────────────┘
```

**Implementace:**
- Server component, načte subscription + plan
- Trial progress bar
- Seznam allowed/locked modulů
- Kontakt pro upgrade (email + tel)

**`src/modules/billing/`** — nový modul, jednoduchá server component.

---

## FÁZE 9F: TRIAL EXPIRY HANDLING

### 9F.1 Trial banner

Zobrazit bannery pro uživatele, jejichž trial brzy vyprší nebo vypršel.

**`src/components/layout/TrialBanner.tsx`** — server component v dashboard layoutu:

```typescript
// Zobrazit pokud:
// - status === 'trialing' A daysLeftInTrial <= 7 → žlutý banner
// - status === 'trialing' A daysLeftInTrial <= 0 → červený banner
// - status === 'past_due' → červený banner

// Banner text:
// "Váš trial vyprší za X dní. Kontaktujte nás pro aktivaci plného přístupu."
// "Váš trial vypršel. Pro pokračování kontaktujte info@profibrew.com"
```

### 9F.2 Trial expiry check v middleware

```typescript
// Po načtení subscription v middleware:
if (subscription.status === 'trialing' && subscription.trialEndsAt < new Date()) {
  // Trial vypršel — downgrade na Free (v DB automaticky přes CRON, nebo lazy check)
  // MVP: nekontrolovat v middleware, jen zobrazit banner
  // Střežení přístupu = v Phase 2 po implementaci Stripe
}
```

**MVP pragmatismus:** Expired trial → zobrazit banner, ale přístup neodmítnout.
Je to startup, prvních zákazníků je málo — manuální follow-up.

---

## FÁZE 9G: SEED SCRIPTS

### 9G.1 Production seed

**`scripts/seed-production.ts`:**

```typescript
// Spouští se JEDNOU na nový produkční DB
// Idempotentní — lze spustit opakovaně

async function seedProduction() {
  await seedPlans()           // Plans z 9C.2
  await seedSystemRoles()     // Roles z S8 migrace
  await seedBeerStyles()      // Existující BJCP data
  await seedCountries()       // Existující countries
  await seedUnits()           // Existující units
  await seedFermentableTypes()// Existující fermentable types
  await seedMashingProfiles() // Systémové rmutovací profily

  console.log('✅ Production seed complete')
}
```

### 9G.2 Local/Staging seed

**`supabase/seed.sql`** (nebo `scripts/seed-development.ts`):

Rozšířit o demo tenant pro testování:

```typescript
// Demo tenant: "Pivovar Testovní"
// Admin user: test@profibrew.com / Test1234!
// Obsahuje: recepty, várky, sklady, objednávky (realistická data)
```

---

## FÁZE 9H: DOKUMENTACE

### 9H.1 CHANGELOG.md

```markdown
## [0.9.0] — Sprint 9: SaaS + Deployment
**Období:** T6–T7 (9.–20.3.2026)
**Status:** ✅ Done

### Přidáno
- [x] Produkční Vercel setup + custom doména profibrew.com
- [x] Tři oddělená prostředí: local / staging / production
- [x] CI/CD: GitHub Actions → automatické migrace + deploy
- [x] Kompletní tenant provisioning (provisionNewTenant)
- [x] Registrace: fullName pole, trial info, provisioning
- [x] Plans seed: Free/Starter/Pro/Business s finálními cenami (pricing-strategy.md v1.1)
- [x] Plans seed: Community plány (community_homebrewer 2 hl hard stop, community_school unlimited)
- [x] DB migrace: sloupce plans.watermark + plans.is_hard_hl_stop
- [x] DB migrace: tabulka community_applications (schválení škol)
- [x] Registrace: volba účelu (Minipivovar / Domovarník) → automatický výběr plánu
- [x] Module gating: hasModuleAccess(), getModuleAccess()
- [x] Module gating: middleware redirect → /upgrade
- [x] ModuleGuard server component na /stock, /sales, /finance, /plan
- [x] TopBar: zamčené moduly s 🔒 pro nepřístupné
- [x] /upgrade page s porovnáním plánů + kontakt na support
- [x] Settings → Billing: read-only plán + trial status + progress bar
- [x] Trial banner (≤7 dní, vypršený)
- [x] pg_cron job aktivace (monthly-usage placeholder)
- [x] Production seed script (plans, roles, codebooks)
```

### 9H.2 PRODUCT-SPEC.md

Aktualizovat sekce:
- 9.1 Module Access Control: 📋 → ✅
- 9.2 Subscription tiers: 📋 → ✅
- 8.5 Billing: 📋 → 🚧 (read-only, Stripe pending)

### 9H.3 SYSTEM-DESIGN.md sekce 10

Aktualizovat s reálnými URL, env var hodnotami (bez secrets), branch strategií.

---

## AKCEPTAČNÍ KRITÉRIA

### Infrastruktura
1. [ ] `https://profibrew.com` je dostupný a zobrazuje aplikaci
2. [ ] SSL certifikát platný
3. [ ] Push na `main` → automatický deploy do 5 minut
4. [ ] Migrace se spustí automaticky při deployi
5. [ ] Staging prostředí funkční na Vercel Preview URL

### Tenant provisioning
6. [ ] Registrace vytvoří: tenant + user_profile + tenant_user (owner) + subscription (Pro trial)
7. [ ] Registrace vytvoří: default shop, default warehouse, 6 číslovacích řad
8. [ ] Registrace vytvoří: default cashflow kategorie
9. [ ] Nový tenant má status 'trial', trial_ends_at = +30 dní
10. [ ] Po registraci lze ihned pracovat (recepty, várky, sklad)

### Plans
11. [ ] `plans` tabulka obsahuje 4 plány (Free/Starter/Pro/Business)
12. [ ] Pro plán má included_modules = ['brewery','stock','sales','finance']

### Module gating
13. [ ] Tenant na Free tieru nemůže přistoupit na /stock → redirect /upgrade
14. [ ] Tenant na Pro tieru může přistoupit na /stock, /sales, /finance
15. [ ] Trial tenant (Pro) má přístup ke všem modulům
16. [ ] TopBar zobrazuje 🔒 na nepřístupných modulech
17. [ ] /upgrade stránka zobrazuje porovnání plánů

### Billing
18. [ ] /settings/billing zobrazuje aktuální plán a trial status
19. [ ] Trial banner se zobrazí když zbývá ≤7 dní
20. [ ] Trial banner je červený po vypršení

### Obecné
21. [ ] `npm run build` bez chyb
22. [ ] TypeScript: zero errors, no `any`
23. [ ] Všechny existující testy procházejí
24. [ ] Dokumentace aktualizována

---

## CO NEIMPLEMENTOVAT V SPRINT 9

- **Stripe** — S12 (první platící zákazník)
- **Usage records / overage** — S12
- **Plan upgrade/downgrade flow** — S12
- **Admin tenant management UI** — S11
- **Onboarding wizard** — S10
- **Zapomenuté heslo** — S10
- **Magic link login** — S10
- **GDPR consent** — S11

---

## PRIORITA IMPLEMENTACE

1. **9A** — Produkční infrastruktura (Vercel + Supabase + CI/CD) — **DEN 1**
2. **9C** — Plans seed migrace — **DEN 1**
3. **9B** — Tenant provisioning + registrace update — **DEN 2–3**
4. **9D** — Module gating (middleware + guard + upgrade page) — **DEN 3–4**
5. **9E** — Settings → Billing — **DEN 5**
6. **9F** — Trial banner — **DEN 5**
7. **9G** — Seed scripts — **DEN 6**
8. **9H** — Docs + finalizace — **DEN 7**

---

## TECHNICKÉ POZNÁMKY

### JWT vs. cookie pro module cache
- JWT custom claims = ideální, ale závisí na Supabase Auth hooks (dostupné od Pro plánu)
- Cookie fallback = jednodušší, funguje vždy — doporučeno pro MVP
- Invalidace cookie: po každé změně subscription (nebo TTL 1h)

### Slug generation
```typescript
async function generateUniqueSlug(name: string, tx): Promise<string> {
  const base = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)

  let slug = base
  let suffix = 1
  while (await slugExists(slug, tx)) {
    slug = `${base}-${suffix++}`
  }
  return slug
}
```

### Produkční Supabase připojení
- Použít **connection pooling** (Supabase Pooler) pro Vercel serverless:
  `DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
- Direct connection (pro migrace): port 5432, bez pooleru

### Environment variables — lokální development
```bash
# .env.local (nikdy commitovat!)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=[local-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[local-service-key]
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_APP_URL=http://localhost:3000
RESEND_API_KEY=re_[key]
CRON_SECRET=[any-string-for-local]
```
