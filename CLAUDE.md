# CLAUDE.md — ProfiBrew Project Instructions

## Co je ProfiBrew

SaaS ERP systém pro české minipivovary. Multi-tenant aplikace s modulární architekturou.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **UI:** shadcn/ui + Tailwind CSS (NIKDY jiné CSS řešení)
- **DB:** Supabase (PostgreSQL s RLS)
- **ORM:** Drizzle ORM (NIKDY Prisma)
- **Auth:** Supabase Auth
- **i18n:** next-intl (čeština default, angličtina secondary)
- **Validace:** Zod
- **Data fetching (client):** SWR
- **Hosting:** Vercel
- **Jazyk:** TypeScript strict mode

## Dokumentace projektu

- `docs/PRD.md` — product requirements, business context, user stories (stabilní, mění se zřídka)
- `docs/SYSTEM-DESIGN.md` — architektura, datový model, komponenty, technická rozhodnutí
- `docs/PRODUCT-SPEC.md` — **ŽIVÝ DOKUMENT** — jak systém funguje, byznys pravidla, aktualizováno per sprint
- `docs/CHANGELOG.md` — co je hotové, co se změnilo, per sprint
- `docs/sprints/sprint-X-spec.md` — detailní zadání per sprint

**Před implementací čehokoli si VŽDY přečti relevantní dokumentaci.**
- Řešíš DataBrowser → sekce 4.2 v SYSTEM-DESIGN.md + sekce 3 v PRODUCT-SPEC.md
- Řešíš DB schema → sekce 5 v SYSTEM-DESIGN.md
- Řešíš byznys logiku → PRODUCT-SPEC.md (pravidla a workflow)
- Potřebuješ kontext proč něco děláme → PRD.md

### POVINNÁ DOKUMENTAČNÍ PRAVIDLA

**Po každé dokončené fázi nebo významné změně MUSÍŠ aktualizovat dokumentaci:**

#### CHANGELOG.md
- Odškrtni hotové položky (`- [ ]` → `- [x]`)
- Přidej nové položky pokud jsi implementoval něco nad rámec spec
- Zapiš breaking changes nebo odchylky od spec
- Formát: pod aktuální sprint sekci

#### PRODUCT-SPEC.md
- Změň status entity/funkce: `📋` → `✅` když je implementováno, `📋` → `🚧` když je rozpracováno
- Pokud se implementace liší od spec (jiný UX, jiná byznys pravidla, přidané pole) → **AKTUALIZUJ SPEC** tak aby odpovídal realitě. PRODUCT-SPEC.md vždy popisuje skutečný stav, ne plán.
- Přidej nové sekce pokud jsi implementoval něco co v spec chybí
- Aktualizuj "Aktualizováno" datum a "Poslední sprint" v hlavičce

#### SYSTEM-DESIGN.md
- Aktualizuj POUZE pokud se změní architektura, datový model nebo technické rozhodnutí
- Nové tabulky → přidej do sekce 5 (Datový model) a sekce 6 (ER overview)
- Nová rozhodnutí → přidej do příslušné sekce a tabulky rozhodnutí

#### Kdy dokumentovat
- **Na konci každé fáze** (0A, 0B, 0C...) — minimálně CHANGELOG
- **Při odchylce od spec** — okamžitě PRODUCT-SPEC.md
- **Při novém DB schema** — okamžitě SYSTEM-DESIGN.md
- **NIKDY** necommituj kód bez odpovídající aktualizace dokumentace

#### Commit pravidla pro docs
- Dokumentační změny mohou být v kódovém commitu (`feat: implement partners CRUD + update docs`)
- Nebo samostatný commit (`docs: update PRODUCT-SPEC after Sprint 1`)
- CHANGELOG se aktualizuje průběžně, ne jednorázově na konci sprintu

## Coding Standards (STRIKTNÍ)

### TypeScript
- `strict: true` — žádné výjimky
- **ZAKÁZÁNO:** `any` typ, `as` cast bez komentáře proč, `@ts-ignore`
- Preferuj `unknown` + type guard místo `any`
- Všechny funkce mají explicitní return type

### React / Next.js
- **Server Components defaultně** — `'use client'` JEN kde je interaktivita (useState, onClick, hooks)
- Stránky (`page.tsx`) jsou VŽDY Server Components
- Client komponenty extrahuj do samostatných souborů v `components/`
- Používej `async` Server Components pro data fetching

### Styling
- **Tailwind CSS ONLY** — žádné CSS moduly, styled-components, inline styles
- **shadcn/ui** pro všechny UI primitiva — NEVYMÝŠLEJ vlastní buttony, inputy, dialogy
- `cn()` helper pro conditional classes (z `@/lib/utils`)

### Naming
- **Soubory komponent:** PascalCase (`DataBrowser.tsx`, `FilterBar.tsx`)
- **Soubory utility/hooks:** camelCase (`useTenant.ts`, `withTenant.ts`)
- **DB tabulky a sloupce:** snake_case (`tenant_users`, `batch_number`)
- **TypeScript typy/interfaces:** PascalCase (`TenantContext`, `DataBrowserConfig`)
- **Env proměnné:** SCREAMING_SNAKE (`NEXT_PUBLIC_SUPABASE_URL`)

### Databáze
- **KAŽDÝ dotaz MUSÍ filtrovat přes `tenant_id`** — bez výjimky (kromě admin/ a globálních tabulek jako plans)
- Používej helper `withTenant()` pro automatické filtrování
- Číselné hodnoty v DB vždy v base units: litry (objem), gramy (hmotnost), °C (teplota), minuty (čas)
- Konverze na display units (kg, hl, °F) POUZE v UI vrstvě
- Soft delete: `is_active = false` nebo `status = 'archived'`, nikdy fyzický DELETE
- Všechny tenant-scoped tabulky: `id` (UUID PK), `tenant_id` (UUID FK NOT NULL), `created_at`, `updated_at`

### i18n
- **ŽÁDNÉ hardcoded české stringy v komponentách** — vše přes `useTranslations()` nebo `getTranslations()`
- Překlady v `src/i18n/messages/{locale}/{modul}.json` — split per modul
- Klíče: hierarchické, tečkou oddělené (`dataBrowser.noResults`, `auth.login`)

### Error Handling
- Každý `async` server action / API route v `try/catch`
- User-facing chyby: `toast` (sonner) s českou hláškou
- Technické chyby: `console.error` se strukturovaným logem
- NIKDY nezobrazuj stack trace uživateli

### Git
- Commit messages v angličtině
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Jeden commit = jedna logická změna

## Architektonická pravidla

### Multi-tenant izolace (3 vrstvy)
1. **Supabase RLS** — DB nikdy nevrátí data jiného tenantu
2. **API middleware** — každý request ověří tenant_id z JWT
3. **Frontend TenantProvider** — kontext s tenant_id pro komponenty

### Module Access Control (4 vrstvy)

Přístup k business modulům (Sklad, Obchod, Finance, Plán) se řídí subscription tenantu. Kontrola na **4 úrovních** — žádnou nelze vynechat:

```
Vrstva 1: Next.js Middleware (src/middleware.ts)
  → Mapuje URL path → required module (config/module-routes.ts)
  → Kontroluje subscription z JWT/session
  → Pokud modul není v plánu → redirect na /upgrade

Vrstva 2: Dashboard Layout (ModuleGuard component)
  → Server component wrapper v (dashboard)/layout.tsx
  → Dvojitá pojistka — pokud middleware propustí, layout zachytí
  → Zobrazí upgrade prompt místo obsahu

Vrstva 3: TopBar UI
  → Moduly mimo plán: šedé s 🔒 ikonou
  → Klik na zamčený modul → redirect na /upgrade (ne jen vizuální blok)

Vrstva 4: API / Server Actions
  → withModuleAccess() wrapper na každé server action
  → Vrací 403 pokud modul není v subscription
  → NELZE obejít přes přímý API call
```

**Route → Module mapping** (`src/config/module-routes.ts`):
```typescript
export const moduleRoutes: Record<string, string> = {
  '/brewery':  'brewery',   // Vždy dostupný (i Free tier)
  '/stock':    'stock',     // Subscription-gated
  '/sales':    'sales',     // Subscription-gated
  '/finance':  'finance',   // Subscription-gated
  '/plan':     'plan',      // Subscription-gated
  '/settings': '_always',   // Vždy dostupný
  '/dashboard':'_always',   // Vždy dostupný
  '/upgrade':  '_always',   // Vždy dostupný
}
```

**Access check** (`src/lib/module-access/check.ts`):
```typescript
async function hasModuleAccess(tenantId: string, moduleSlug: string): Promise<boolean> {
  if (moduleSlug === '_always' || moduleSlug === 'brewery') return true
  // 1. Načti aktivní subscription + plan
  // 2. Zkontroluj plan.included_modules
  // 3. Zkontroluj subscription_addons
  // 4. Vrať true/false
}
```

### Reusable komponenty
- **DataBrowser** — univerzální browsovací komponenta (list + card view), konfigurovaná per agenda
- **FormSection** — formulářová sekce generovaná z field definice
- **DetailView** — detail záznamu s taby a FormSections
- Konfigurace komponent v `src/modules/{modul}/config.ts`

## Struktura projektu — Feature-Module Pattern

### 4 Route Groups

Aplikace má **4 route groups** — každá s vlastním layoutem, auth požadavky a účelem:

| Route Group | Auth | Layout | Účel |
|-------------|------|--------|------|
| `(marketing)` | Public | MarketingLayout (header + footer) | Homepage, pricing, features, blog |
| `(auth)` | Public | Minimal (centered card) | Login, register |
| `(dashboard)` | Protected + tenant | DashboardLayout (TopBar + Sidebar) + ModuleGuard | Hlavní ERP aplikace |
| `(admin)` | Protected + superadmin | AdminLayout (admin sidebar) | SaaS management |

### Kompletní adresářová struktura

```
profibrew/
├── CLAUDE.md
├── docs/
│   ├── PRD.md
│   ├── SYSTEM-DESIGN.md
│   ├── PRODUCT-SPEC.md
│   ├── CHANGELOG.md
│   └── sprints/
│
├── drizzle/
│   ├── schema/                        # DB schema (centrální — Drizzle requirement)
│   │   ├── tenants.ts
│   │   ├── auth.ts
│   │   ├── subscriptions.ts
│   │   ├── system.ts
│   │   └── ...
│   └── migrations/
│
├── src/
│   ├── app/[locale]/
│   │   │
│   │   ├── (marketing)/               # ★ PUBLIC — marketing pages
│   │   │   ├── layout.tsx             # MarketingLayout (header, footer, CTA)
│   │   │   ├── page.tsx               # Homepage (/)
│   │   │   ├── pricing/page.tsx
│   │   │   ├── features/page.tsx
│   │   │   ├── blog/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [slug]/page.tsx
│   │   │   └── contact/page.tsx
│   │   │
│   │   ├── (auth)/                    # PUBLIC — auth pages
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   │
│   │   ├── (dashboard)/               # ★ PROTECTED — tenant ERP app
│   │   │   ├── layout.tsx             # DashboardLayout + ModuleGuard
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── brewery/               # Module: brewery (vždy dostupný)
│   │   │   ├── stock/                 # Module: stock (subscription-gated)
│   │   │   ├── sales/                 # Module: sales (subscription-gated)
│   │   │   ├── finance/               # Module: finance (subscription-gated)
│   │   │   ├── plan/                  # Module: plan (Fáze 2, subscription-gated)
│   │   │   ├── settings/              # Vždy dostupný
│   │   │   └── upgrade/page.tsx       # Upsell/paywall page
│   │   │
│   │   ├── (admin)/                   # ★ PROTECTED — superadmin only
│   │   │   ├── layout.tsx             # AdminLayout (vlastní sidebar, BEZ tenant contextu)
│   │   │   ├── admin/page.tsx         # Admin dashboard (MRR, active tenants, KPI)
│   │   │   ├── admin/tenants/
│   │   │   │   ├── page.tsx           # Tenant list
│   │   │   │   └── [id]/page.tsx      # Tenant detail
│   │   │   ├── admin/plans/page.tsx   # Plan version management
│   │   │   ├── admin/subscriptions/page.tsx
│   │   │   ├── admin/monitoring/page.tsx
│   │   │   └── admin/users/page.tsx
│   │   │
│   │   └── layout.tsx
│   │
│   ├── modules/                       # ★ TENANT BUSINESS LOGIC
│   │   ├── partners/
│   │   │   ├── components/
│   │   │   │   ├── PartnerBrowser.tsx
│   │   │   │   ├── PartnerDetail.tsx
│   │   │   │   └── PartnerForm.tsx
│   │   │   ├── config.ts
│   │   │   ├── actions.ts
│   │   │   ├── hooks.ts
│   │   │   ├── types.ts
│   │   │   ├── schema.ts
│   │   │   └── index.ts
│   │   ├── items/
│   │   ├── recipes/
│   │   ├── batches/
│   │   ├── equipment/
│   │   ├── stock/
│   │   ├── orders/
│   │   ├── cashflow/
│   │   ├── excise/
│   │   └── settings/
│   │
│   ├── admin/                         # ★ ADMIN LOGIC (SaaS management)
│   │   ├── tenants/
│   │   │   ├── components/
│   │   │   ├── actions.ts
│   │   │   └── index.ts
│   │   ├── plans/
│   │   ├── subscriptions/
│   │   ├── monitoring/
│   │   └── users/
│   │
│   ├── marketing/                     # ★ MARKETING LOGIC (public pages)
│   │   ├── home/
│   │   │   ├── components/            # Hero, Features, Testimonials, CTA
│   │   │   └── index.ts
│   │   ├── pricing/
│   │   │   ├── components/            # PricingTable, PlanCard, FAQ
│   │   │   └── index.ts
│   │   └── blog/
│   │
│   ├── components/                    # SHARED FRAMEWORK
│   │   ├── ui/                        # shadcn/ui
│   │   ├── data-browser/
│   │   ├── detail-view/
│   │   ├── forms/
│   │   ├── layout/
│   │   │   ├── TopBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ModuleGuard.tsx        # ★ Module access check
│   │   │   ├── MarketingHeader.tsx
│   │   │   ├── MarketingFooter.tsx
│   │   │   └── AdminSidebar.tsx
│   │   ├── providers/
│   │   └── shared/                    # StatusBadge, EmptyState, UpgradePrompt
│   │
│   ├── lib/
│   │   ├── db/
│   │   ├── supabase/
│   │   ├── auth/                      # + superadmin check
│   │   ├── rbac/
│   │   ├── module-access/             # ★ Module access control
│   │   │   ├── check.ts              # hasModuleAccess()
│   │   │   ├── middleware.ts          # withModuleAccess() for server actions
│   │   │   └── types.ts
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── types/
│   │
│   ├── config/
│   │   ├── navigation.ts
│   │   ├── permissions.ts
│   │   └── module-routes.ts           # ★ URL path → required module
│   │
│   ├── i18n/messages/
│   │   ├── cs/
│   │   │   ├── common.json
│   │   │   ├── auth.json
│   │   │   ├── nav.json
│   │   │   ├── dataBrowser.json
│   │   │   ├── marketing.json
│   │   │   ├── admin.json
│   │   │   ├── partners.json
│   │   │   └── ...
│   │   └── en/
│   └── styles/
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
└── public/
```

### Pravidla pro moduly

**Page je tenký** — max 10-15 řádků:
```typescript
// (dashboard) page → imports from modules/
import { PartnerBrowser } from '@/modules/partners'
export default function PartnersPage() { return <PartnerBrowser /> }

// (admin) page → imports from admin/
import { TenantBrowser } from '@/admin/tenants'
export default function AdminTenantsPage() { return <TenantBrowser /> }

// (marketing) page → imports from marketing/
import { PricingPage } from '@/marketing/pricing'
export default function Pricing() { return <PricingPage /> }
```

**3 logic složky, 3 účely:**
- `src/modules/` — tenant business logika (partners, batches, orders...)
- `src/admin/` — SaaS admin logika (tenant management, billing, monitoring)
- `src/marketing/` — public page logika (homepage, pricing, blog)

**Modul je self-contained:** components/, config.ts, actions.ts, hooks.ts, types.ts, schema.ts, index.ts

**Cross-module imports POUZE přes index.ts**

**Drizzle schema centrálně** v `drizzle/schema/` (Drizzle requirement)

**i18n per modul** — překlady v `src/i18n/messages/{locale}/{module}.json`

## Auth & Access Control Summary

```
Route              Auth Required    Additional Check           Tenant Context
──────────────────────────────────────────────────────────────────────────────
(marketing)/*      ❌               —                          ❌
(auth)/*           ❌               Redirect if logged in      ❌
(dashboard)/*      ✅ Supabase      + module access guard      ✅ Required
(admin)/*          ✅ Supabase      + superadmin check         ❌ Cross-tenant
```

**Superadmin** = flag `user_profiles.is_superadmin` (Boolean). Není tenant role — systémový příznak. Superadmin vidí data napříč tenanty v admin panelu. V MVP ruční nastavení v DB.

## Co NEDĚLAT

- NEVYMÝŠLEJ vlastní UI komponenty kde existuje shadcn/ui alternativa
- NEPOUŽÍVEJ `any` typ — radši se zeptej na správný typ
- NEPIŠ CSS moduly ani styled-components
- NEDÁVEJ business logiku do page souborů — vše do `modules/`, `admin/`, nebo `marketing/`
- NEDÁVEJ DataBrowser config do page souborů — patří do `modules/{modul}/config.ts`
- NEIMPORTUJ přímo interní soubory jiného modulu — jen přes `index.ts`
- NEUKLÁDEJ tenant_id v localStorage — vždy z JWT/session
- NEVYNECHÁVEJ tenant_id filtr v DB dotazech — ani "dočasně"
- NEVYNECHÁVEJ module access check — ani na frontend, ani na API
- NECOMMITUJ .env soubory
- NEPIŠ české stringy přímo do JSX — vždy přes i18n
- NEZAPOMEŇ aktualizovat dokumentaci (viz Povinná dokumentační pravidla výše)
