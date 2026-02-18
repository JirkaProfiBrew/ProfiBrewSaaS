<!-- Language: English. Czech documents: docs/PRD.md, docs/PRODUCT-SPEC.md, docs/CHANGELOG.md -->

# CLAUDE.md — ProfiBrew Project Instructions

## What is ProfiBrew

SaaS ERP system for Czech craft breweries. Multi-tenant application with modular architecture.

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **UI:** shadcn/ui + Tailwind CSS (NEVER any other CSS solution)
- **DB:** Supabase (PostgreSQL with RLS)
- **ORM:** Drizzle ORM (NEVER Prisma)
- **Auth:** Supabase Auth
- **i18n:** next-intl (Czech default, English secondary)
- **Validation:** Zod
- **Data fetching (client):** SWR
- **Hosting:** Vercel
- **Language:** TypeScript strict mode

## Project Documentation

- `docs/PRD.md` — product requirements, business context, user stories (stable, rarely changes)
- `docs/SYSTEM-DESIGN.md` — architecture, data model, components, technical decisions
- `docs/PRODUCT-SPEC.md` — **LIVING DOCUMENT** — how the system works, business rules, updated per sprint
- `docs/CHANGELOG.md` — what's done, what changed, per sprint
- `docs/sprints/sprint-X-spec.md` — detailed specification per sprint

**Before implementing anything, ALWAYS read the relevant documentation.**
- Working on DataBrowser → section 4.2 in SYSTEM-DESIGN.md + section 3 in PRODUCT-SPEC.md
- Working on DB schema → section 5 in SYSTEM-DESIGN.md
- Working on business logic → PRODUCT-SPEC.md (rules and workflows)
- Need context on why we're doing something → PRD.md

### MANDATORY DOCUMENTATION RULES

**After every completed phase or significant change, you MUST update the documentation:**

#### CHANGELOG.md
- Check off completed items (`- [ ]` → `- [x]`)
- Add new items if you implemented something beyond the spec
- Record breaking changes or deviations from spec
- Format: under the current sprint section

#### PRODUCT-SPEC.md
- Change entity/feature status: `📋` → `✅` when implemented, `📋` → `🚧` when in progress
- If the implementation differs from the spec (different UX, different business rules, added fields) → **UPDATE THE SPEC** so it matches reality. PRODUCT-SPEC.md always describes the actual state, not the plan.
- Add new sections if you implemented something missing from the spec
- Update the "Updated" date and "Last sprint" in the header

#### SYSTEM-DESIGN.md
- Update ONLY if the architecture, data model, or technical decisions change
- New tables → add to section 5 (Data model) and section 6 (ER overview)
- New decisions → add to the appropriate section and decisions table

#### When to Document
- **At the end of every phase** (0A, 0B, 0C...) — at minimum CHANGELOG
- **When deviating from spec** — immediately PRODUCT-SPEC.md
- **When adding new DB schema** — immediately SYSTEM-DESIGN.md
- **NEVER** commit code without a corresponding documentation update

#### Commit Rules for Docs
- Documentation changes can be in a code commit (`feat: implement partners CRUD + update docs`)
- Or a separate commit (`docs: update PRODUCT-SPEC after Sprint 1`)
- CHANGELOG is updated continuously, not all at once at the end of a sprint

## Coding Standards (STRICT)

### TypeScript
- `strict: true` — no exceptions
- **FORBIDDEN:** `any` type, `as` cast without a comment explaining why, `@ts-ignore`
- Prefer `unknown` + type guard instead of `any`
- All functions have explicit return types

### React / Next.js
- **Server Components by default** — `'use client'` ONLY where interactivity is needed (useState, onClick, hooks)
- Pages (`page.tsx`) are ALWAYS Server Components
- Extract client components into separate files in `components/`
- Use `async` Server Components for data fetching

### Styling
- **Tailwind CSS ONLY** — no CSS modules, styled-components, inline styles
- **shadcn/ui** for all UI primitives — DO NOT invent your own buttons, inputs, dialogs
- `cn()` helper for conditional classes (from `@/lib/utils`)

### Naming
- **Component files:** PascalCase (`DataBrowser.tsx`, `FilterBar.tsx`)
- **Utility/hooks files:** camelCase (`useTenant.ts`, `withTenant.ts`)
- **DB tables and columns:** snake_case (`tenant_users`, `batch_number`)
- **TypeScript types/interfaces:** PascalCase (`TenantContext`, `DataBrowserConfig`)
- **Env variables:** SCREAMING_SNAKE (`NEXT_PUBLIC_SUPABASE_URL`)

### Database
- **EVERY query MUST filter by `tenant_id`** — no exceptions (except admin/ and global tables like plans)
- Use the `withTenant()` helper for automatic filtering
- Numeric values in DB always in base units: liters (volume), grams (weight), °C (temperature), minutes (time)
- Conversion to display units (kg, hl, °F) ONLY in the UI layer
- Soft delete: `is_active = false` or `status = 'archived'`, never physical DELETE
- All tenant-scoped tables: `id` (UUID PK), `tenant_id` (UUID FK NOT NULL), `created_at`, `updated_at`

### i18n
- **NO hardcoded Czech strings in components** — everything via `useTranslations()` or `getTranslations()`
- Translations in `src/i18n/messages/{locale}/{module}.json` — split per module
- Keys: hierarchical, dot-separated (`dataBrowser.noResults`, `auth.login`)

### Error Handling
- Every `async` server action / API route in `try/catch`
- User-facing errors: `toast` (sonner) with a Czech message
- Technical errors: `console.error` with structured logging
- NEVER show stack traces to the user

### Git
- Commit messages in English
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- One commit = one logical change

## Subagents

Use subagents (Task tool) for complex phases and tasks. Each subagent gets an isolated context and specific assignment.

### When to use subagents
- Implementing an entire feature module (partners, items, batches...)
- Parallel work on independent parts (e.g., DB schema + UI components)
- Isolated tasks: seed data, migrations, i18n translations
- Code review and testing

### How to assign a subagent
- Always specify EXACTLY which files to read/create/edit
- Reference specific documentation sections (e.g., "Read docs/PRODUCT-SPEC.md section 4.1 Partners")
- Define acceptance criteria ("Done when: npm run build passes, types are correct, i18n keys exist")
- Subagent MUST follow all rules from CLAUDE.md (shadcn/ui only, strict TS, tenant_id filter...)

### Example
When implementing the "Partners" feature module:
- Subagent 1: DB schema (drizzle/schema/partners.ts) + migration
- Subagent 2: Module logic (src/modules/partners/*) — types, config, actions, hooks, components
- Subagent 3: i18n translations (cs/partners.json, en/partners.json)
- Main agent: integration, review, documentation

### Rules
- Subagent NEVER edits files outside its scope
- Subagent ALWAYS reports what it created/changed
- Main agent ALWAYS verifies subagent output (build, types, lint)
- Documentation updates (CHANGELOG, PRODUCT-SPEC) are done by main agent, not subagents

## Architectural Rules

### Multi-tenant Isolation (3 layers)
1. **Supabase RLS** — DB never returns data from another tenant
2. **API middleware** — every request verifies tenant_id from JWT
3. **Frontend TenantProvider** — context with tenant_id for components

### Module Access Control (4 layers)

Access to business modules (Stock, Sales, Finance, Plan) is governed by the tenant's subscription. Checked at **4 levels** — none can be skipped:

```
Layer 1: Next.js Middleware (src/middleware.ts)
  → Maps URL path → required module (config/module-routes.ts)
  → Checks subscription from JWT/session
  → If module is not in the plan → redirect to /upgrade

Layer 2: Dashboard Layout (ModuleGuard component)
  → Server component wrapper in (dashboard)/layout.tsx
  → Double safety net — if middleware lets through, layout catches it
  → Shows upgrade prompt instead of content

Layer 3: TopBar UI
  → Modules outside the plan: grayed out with lock icon
  → Click on locked module → redirect to /upgrade (not just visual block)

Layer 4: API / Server Actions
  → withModuleAccess() wrapper on every server action
  → Returns 403 if module is not in subscription
  → CANNOT be bypassed via direct API call
```

**Route → Module mapping** (`src/config/module-routes.ts`):
```typescript
export const moduleRoutes: Record<string, string> = {
  '/brewery':  'brewery',   // Always available (even Free tier)
  '/stock':    'stock',     // Subscription-gated
  '/sales':    'sales',     // Subscription-gated
  '/finance':  'finance',   // Subscription-gated
  '/plan':     'plan',      // Subscription-gated
  '/settings': '_always',   // Always available
  '/dashboard':'_always',   // Always available
  '/upgrade':  '_always',   // Always available
}
```

**Access check** (`src/lib/module-access/check.ts`):
```typescript
async function hasModuleAccess(tenantId: string, moduleSlug: string): Promise<boolean> {
  if (moduleSlug === '_always' || moduleSlug === 'brewery') return true
  // 1. Load active subscription + plan
  // 2. Check plan.included_modules
  // 3. Check subscription_addons
  // 4. Return true/false
}
```

### Reusable Components
- **DataBrowser** — universal browsing component (list + card view), configured per agenda
- **FormSection** — form section generated from field definitions
- **DetailView** — record detail with tabs and FormSections
- Component configuration in `src/modules/{module}/config.ts`

## Project Structure — Feature-Module Pattern

### 4 Route Groups

The application has **4 route groups** — each with its own layout, auth requirements, and purpose:

| Route Group | Auth | Layout | Purpose |
|-------------|------|--------|---------|
| `(marketing)` | Public | MarketingLayout (header + footer) | Homepage, pricing, features, blog |
| `(auth)` | Public | Minimal (centered card) | Login, register |
| `(dashboard)` | Protected + tenant | DashboardLayout (TopBar + Sidebar) + ModuleGuard | Main ERP application |
| `(admin)` | Protected + superadmin | AdminLayout (admin sidebar) | SaaS management |

### Complete Directory Structure

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
│   ├── schema/                        # DB schema (centralized — Drizzle requirement)
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
│   │   │   ├── brewery/               # Module: brewery (always available)
│   │   │   ├── stock/                 # Module: stock (subscription-gated)
│   │   │   ├── sales/                 # Module: sales (subscription-gated)
│   │   │   ├── finance/               # Module: finance (subscription-gated)
│   │   │   ├── plan/                  # Module: plan (Phase 2, subscription-gated)
│   │   │   ├── settings/              # Always available
│   │   │   └── upgrade/page.tsx       # Upsell/paywall page
│   │   │
│   │   ├── (admin)/                   # ★ PROTECTED — superadmin only
│   │   │   ├── layout.tsx             # AdminLayout (own sidebar, WITHOUT tenant context)
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

### Module Rules

**Pages are thin** — max 10-15 lines:
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

**3 logic folders, 3 purposes:**
- `src/modules/` — tenant business logic (partners, batches, orders...)
- `src/admin/` — SaaS admin logic (tenant management, billing, monitoring)
- `src/marketing/` — public page logic (homepage, pricing, blog)

**A module is self-contained:** components/, config.ts, actions.ts, hooks.ts, types.ts, schema.ts, index.ts

**Cross-module imports ONLY through index.ts**

**Drizzle schema centralized** in `drizzle/schema/` (Drizzle requirement)

**i18n per module** — translations in `src/i18n/messages/{locale}/{module}.json`

## Auth & Access Control Summary

```
Route              Auth Required    Additional Check           Tenant Context
──────────────────────────────────────────────────────────────────────────────
(marketing)/*      ❌               —                          ❌
(auth)/*           ❌               Redirect if logged in      ❌
(dashboard)/*      ✅ Supabase      + module access guard      ✅ Required
(admin)/*          ✅ Supabase      + superadmin check         ❌ Cross-tenant
```

**Superadmin** = flag `user_profiles.is_superadmin` (Boolean). Not a tenant role — a system-level flag. Superadmin can see data across tenants in the admin panel. In MVP, set manually in the DB.

## What NOT to Do

- DO NOT invent your own UI components where a shadcn/ui alternative exists
- DO NOT use the `any` type — ask for the correct type instead
- DO NOT write CSS modules or styled-components
- DO NOT put business logic in page files — everything goes in `modules/`, `admin/`, or `marketing/`
- DO NOT put DataBrowser config in page files — it belongs in `modules/{module}/config.ts`
- DO NOT import internal files from another module directly — only through `index.ts`
- DO NOT store tenant_id in localStorage — always from JWT/session
- DO NOT skip the tenant_id filter in DB queries — not even "temporarily"
- DO NOT skip the module access check — neither on frontend nor on API
- DO NOT commit .env files
- DO NOT write Czech strings directly in JSX — always through i18n
- DO NOT forget to update documentation (see Mandatory Documentation Rules above)
