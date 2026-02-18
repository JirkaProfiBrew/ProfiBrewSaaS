# SPRINT 0 — INFRASTRUCTURE
## Specification for Claude Code | ProfiBrew.com
### Version: 1.0 | Date: 17.02.2026

---

## SPRINT GOAL

Build the complete application foundation: project scaffold, auth, multi-tenant isolation, layout with navigation, DataBrowser framework (list + card view), FormSection component, and basic i18n. At the end of the sprint, the application must run with functional login, an empty dashboard, and one demo agenda (placeholder) utilizing DataBrowser.

**Time estimate:** 2 weeks (T1-T2)

---

## REFERENCE DOCUMENT

The complete architecture is in `profibrew-system-design-v2.md`. That document is the **specification** — it contains what and how. This document is the **step-by-step plan** — it contains exact steps.

---

## PHASE 0A: PROJECT SCAFFOLD

### 0A.1 Project initialization

```bash
npx create-next-app@latest profibrew \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```

### 0A.2 Dependencies

```bash
# Core
npm install @supabase/supabase-js @supabase/ssr
npm install drizzle-orm postgres
npm install next-intl
npm install zod
npm install swr

# UI
npx shadcn@latest init
# Install shadcn components:
npx shadcn@latest add button input label card table badge
npx shadcn@latest add dialog sheet dropdown-menu select checkbox
npx shadcn@latest add tabs separator avatar tooltip
npx shadcn@latest add command popover calendar
npx shadcn@latest add form toast sonner
npx shadcn@latest add pagination skeleton switch textarea
npx shadcn@latest add scroll-area toggle toggle-group

# Utility
npm install lucide-react
npm install clsx tailwind-merge
npm install date-fns

# Dev
npm install -D drizzle-kit
npm install -D @types/node
```

### 0A.3 TypeScript strict mode

`tsconfig.json` — verify/configure:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### 0A.4 Environment variables

`.env.local` (template — actual values are not committed to the repo):
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Database (direct connection for Drizzle migrations)
DATABASE_URL=postgresql://postgres:xxx@db.xxx.supabase.co:5432/postgres

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=cs
```

### 0A.5 Project structure

Create the complete directory structure according to the **Feature-Module Pattern** defined in CLAUDE.md:

```
src/
├── app/[locale]/                      # ROUTES ONLY — thin files
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (dashboard)/layout.tsx
│   ├── (dashboard)/dashboard/page.tsx
│   └── (dashboard)/brewery/partners/page.tsx   # Demo agenda
│
├── modules/                           # BUSINESS LOGIC
│   └── partners/                      # Demo module (Sprint 0 = mock data)
│       ├── components/
│       │   └── PartnerBrowser.tsx
│       ├── config.ts
│       ├── types.ts
│       └── index.ts
│
├── components/                        # SHARED FRAMEWORK
│   ├── ui/                            # shadcn/ui
│   ├── data-browser/                  # DataBrowser framework
│   ├── detail-view/                   # DetailView framework (skeleton)
│   ├── forms/                         # FormSection framework
│   ├── layout/                        # TopBar, Sidebar
│   ├── providers/                     # TenantProvider, AuthProvider
│   └── shared/                        # EmptyState, LoadingState
│
├── lib/
│   ├── db/                            # Drizzle client, withTenant
│   ├── supabase/                      # Browser, server, middleware clients
│   ├── auth/                          # Auth actions, hooks
│   ├── hooks/                         # useTenant, shared hooks
│   ├── utils/                         # cn(), formatters
│   └── types/                         # Global types
│
├── config/
│   ├── navigation.ts
│   └── permissions.ts
│
├── i18n/messages/
│   ├── cs/
│   │   ├── common.json
│   │   ├── auth.json
│   │   ├── nav.json
│   │   ├── dataBrowser.json
│   │   └── partners.json             # Demo module translations
│   └── en/
│       └── ...
└── styles/
```

Empty folders for future modules (`items/`, `recipes/`, `batches/`, ...) should **NOT be created** — they will be added in their respective sprints. Create only what is actually implemented in Sprint 0.

---

## PHASE 0B: SUPABASE + DRIZZLE SETUP

### 0B.1 Supabase client

Create two clients:

**`src/lib/supabase/client.ts`** — browser client (for client components):
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`src/lib/supabase/server.ts`** — server client (for server components, API routes):
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

**`src/lib/supabase/middleware.ts`** — for Next.js middleware (refresh session):
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { supabaseResponse, user }
}
```

### 0B.2 Drizzle schema — Sprint 0 tables

For Sprint 0 we only need these tables (the rest will be added in later sprints):

**`drizzle/schema/tenants.ts`**
- `tenants` table (per System Design 2.2)

**`drizzle/schema/auth.ts`**
- `user_profiles` table (per System Design 3.4) — add `is_superadmin BOOLEAN DEFAULT false`
- `tenant_users` table (per System Design 3.4)

**`drizzle/schema/subscriptions.ts`**
- `plans` table (per System Design 2.3) — seed with 4 plans (Free/Starter/Pro/Business) with placeholder prices

**`drizzle/schema/system.ts`**
- `saved_views` table (per System Design 4.3)

**`src/config/module-routes.ts`** — Route → Module mapping:
```typescript
// Maps URL path segment to required module slug
// Used by middleware + ModuleGuard for access control
export const moduleRoutes: Record<string, string> = {
  '/brewery':  'brewery',   // Always available (even Free tier)
  '/stock':    'stock',     // Subscription-gated
  '/sales':    'sales',     // Subscription-gated
  '/finance':  'finance',   // Subscription-gated
  '/plan':     'plan',      // Subscription-gated (Phase 2)
  '/settings': '_always',   // Always available
  '/dashboard':'_always',   // Always available
  '/upgrade':  '_always',   // Always available
}
```

**`drizzle/config.ts`**:
```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './drizzle/schema/*.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
```

**`src/lib/db/index.ts`** — Drizzle client:
```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as tenantSchema from '@/../drizzle/schema/tenants'
import * as authSchema from '@/../drizzle/schema/auth'
// ... additional schemas

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, {
  schema: { ...tenantSchema, ...authSchema }
})
```

### 0B.3 RLS policies

After migration, create basic RLS policies in Supabase:

```sql
-- Tenant isolation for all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- tenant_users: user can only see their own records
CREATE POLICY "Users can view own tenant memberships"
  ON tenant_users FOR SELECT
  USING (user_id = auth.uid());

-- tenants: user can only see tenants where they are a member
CREATE POLICY "Users can view own tenants"
  ON tenants FOR SELECT
  USING (id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));

-- user_profiles: user can view and edit their own profile
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());
```

---

## PHASE 0C: AUTHENTICATION

### 0C.1 Middleware

**`src/middleware.ts`**:

Logic:
1. Call `updateSession()` (refresh Supabase token)
2. Extract locale from URL path (`/cs/...` or `/en/...`)
3. If URL has no locale → redirect to default locale
4. **Route group detection:**
   - `(marketing)` routes → public, no checks
   - `(auth)` routes → if user IS logged in → redirect to dashboard
   - `(dashboard)` routes → if user IS NOT logged in → redirect to login
   - `(admin)` routes → if user IS NOT logged in → redirect to login, if not superadmin → 403
5. **Module access check** (only for dashboard routes):
   - Map URL path to required module via `config/module-routes.ts`
   - If module === '_always' || module === 'brewery' → OK
   - Otherwise check subscription → if module is not in the plan → redirect to `/[locale]/upgrade`
6. Protected routes = everything under `/(dashboard)/` and `/(admin)/`
7. Public routes = `(marketing)`, `(auth)`

### 0C.2 Login page

**`src/app/[locale]/(auth)/login/page.tsx`**

Simple login form:
- Email + password
- "Přihlásit se" button
- Link to registration
- Link to "Zapomenuté heslo?" (TODO: Sprint 6)
- Supabase `signInWithPassword`
- On success: redirect to dashboard
- Error message on failed login
- Design: clean, centered card, ProfiBrew logo on top

### 0C.3 Register page

**`src/app/[locale]/(auth)/register/page.tsx`**

Registration form:
- Brewery name (→ tenant.name)
- Email
- Password + password confirmation
- Terms agreement (checkbox)
- "Vytvořit účet" button

Registration flow (server action):
1. `supabase.auth.signUp({ email, password })`
2. Create `user_profiles` record
3. Create `tenants` record (name = brewery name, slug = slugify(name), status = 'trial')
4. Create `tenant_users` record (role = 'owner')
5. Create default `subscription` (plan = Free, status = 'trialing', trial_ends_at = +14 days)
6. Redirect to dashboard (or onboarding — TODO Sprint 5)

### 0C.4 Auth context/hooks

**`src/lib/auth/hooks.ts`**:
- `useUser()` — current Supabase user
- `useSession()` — session data

**`src/lib/auth/actions.ts`** — server actions:
- `signIn(email, password)`
- `signUp(email, password, breweryName)`
- `signOut()`

---

## PHASE 0D: MULTI-TENANT CONTEXT

### 0D.1 Tenant Provider

**`src/lib/hooks/useTenant.ts`**:

After login:
1. Load `tenant_users` for the current user
2. If user has one tenant → set as active
3. If user has multiple tenants → show selection (edge case, later)
4. Store tenant_id + role in React context

**`src/components/providers/TenantProvider.tsx`**:
```typescript
// Context provides:
interface TenantContext {
  tenantId: string
  tenantName: string
  tenantSlug: string
  userRole: 'owner' | 'admin' | 'brewer' | 'sales' | 'viewer'
  subscription: {
    planSlug: string
    modules: string[]    // Allowed modules (from plan.included_modules + subscription_addons)
    status: string
  }
  hasModule: (moduleSlug: string) => boolean  // Helper for quick check
}
```

### 0D.3 Module Access Guard

**`src/components/layout/ModuleGuard.tsx`**:

Server component wrapper used in `(dashboard)/layout.tsx`:
```typescript
// Extracts module slug from URL path
// Checks via hasModuleAccess()
// If module is not available → renders <UpgradePrompt /> instead of children
// If module is available → renders children normally
```

**`src/app/[locale]/(dashboard)/upgrade/page.tsx`**:

Upsell/paywall page:
- Shows the user's current plan
- Shows what they gain by upgrading (plan comparison table)
- CTA button for upgrade (in MVP: link to billing in settings)
- Parameter `?module=stock` → highlights the module that brought them here

### 0D.4 Skeleton route groups for marketing and admin

Create empty layout files for future route groups:

**`src/app/[locale]/(marketing)/layout.tsx`** — empty layout with placeholder:
```typescript
// TODO: Sprint 6 — MarketingLayout (header, footer, CTA)
export default function MarketingLayout({ children }) { return <>{children}</> }
```

**`src/app/[locale]/(marketing)/page.tsx`** — placeholder homepage:
```typescript
// TODO: Sprint 6 — Homepage
export default function HomePage() { return <div>ProfiBrew — Coming Soon</div> }
```

**`src/app/[locale]/(admin)/layout.tsx`** — empty layout with auth check:
```typescript
// TODO: Sprint 6 — AdminLayout
// Must check is_superadmin, otherwise redirect
export default function AdminLayout({ children }) { return <>{children}</> }
```

**`src/app/[locale]/(admin)/admin/page.tsx`** — placeholder:
```typescript
// TODO: Sprint 6 — Admin Dashboard
export default function AdminPage() { return <div>Admin Dashboard — Coming Soon</div> }
```

These skeletons ensure that route groups exist from the beginning and middleware can route them correctly.

### 0D.2 API tenant middleware

**`src/lib/db/with-tenant.ts`**:

Helper for all DB queries:
```typescript
// Every DB query MUST go through this function
export async function withTenant<T>(
  fn: (tenantId: string, db: DrizzleDB) => Promise<T>
): Promise<T> {
  const tenantId = await getCurrentTenantId() // from session/JWT
  if (!tenantId) throw new AuthError('No tenant context')
  return fn(tenantId, db)
}

// Usage:
const items = await withTenant(async (tenantId, db) => {
  return db.select().from(items).where(eq(items.tenantId, tenantId))
})
```

---

## PHASE 0E: i18n SETUP

### 0E.1 next-intl configuration

**`src/i18n/request.ts`**:
```typescript
import { getRequestConfig } from 'next-intl/server'

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale || 'cs'
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  }
})
```

**`src/i18n/routing.ts`**:
```typescript
import { defineRouting } from 'next-intl/routing'

export const routing = defineRouting({
  locales: ['cs', 'en'],
  defaultLocale: 'cs'
})
```

### 0E.2 Base translations

Translations are split per module — each module has its own JSON file.

**`src/i18n/messages/cs/common.json`**:
```json
{
  "save": "Uložit",
  "cancel": "Storno",
  "delete": "Smazat",
  "edit": "Upravit",
  "create": "Vytvořit",
  "search": "Hledat",
  "filter": "Filtr",
  "loading": "Načítání...",
  "noResults": "Žádné výsledky",
  "confirmDelete": "Opravdu chcete smazat?",
  "yes": "Ano",
  "no": "Ne",
  "back": "Zpět",
  "next": "Další",
  "items": "položek",
  "perPage": "položek na stránku",
  "page": "Strana",
  "of": "z",
  "total": "celkem",
  "all": "Vše",
  "selected": "Vybráno"
}
```

**`src/i18n/messages/cs/auth.json`**:
```json
{
  "login": "Přihlásit se",
  "register": "Vytvořit účet",
  "logout": "Odhlásit se",
  "email": "E-mail",
  "password": "Heslo",
  "confirmPassword": "Potvrzení hesla",
  "breweryName": "Název pivovaru",
  "forgotPassword": "Zapomenuté heslo?",
  "noAccount": "Nemáte účet?",
  "hasAccount": "Již máte účet?",
  "termsAgree": "Souhlasím s podmínkami"
}
```

**`src/i18n/messages/cs/nav.json`**:
```json
{
  "modules": {
    "brewery": "Pivovar",
    "stock": "Sklad",
    "sales": "Obchod",
    "finance": "Finance",
    "plan": "Plán"
  },
  "agendas": {
    "overview": "Přehled",
    "partners": "Partneři",
    "contacts": "Kontakty",
    "materials": "Suroviny",
    "recipes": "Receptury",
    "batches": "Vary",
    "equipment": "Zařízení",
    "items": "Položky",
    "movements": "Skladové pohyby",
    "tracking": "Tracking",
    "excise": "Daňové pohyby",
    "monthlyReport": "Měsíční podání",
    "orders": "Objednávky",
    "cashflow": "Cash Flow",
    "cashdesk": "Pokladna",
    "settings": "Nastavení",
    "productSetup": "Nastavení produktu"
  }
}
```

**`src/i18n/messages/cs/dataBrowser.json`**:
```json
{
  "listView": "Seznam",
  "cardView": "Dlaždice",
  "filters": "Filtry",
  "savedViews": "Uložené pohledy",
  "saveView": "Uložit pohled",
  "clearFilters": "Vymazat filtry",
  "bulkActions": "Hromadné akce",
  "export": "Exportovat",
  "noData": "Žádná data k zobrazení"
}
```

**`src/i18n/messages/cs/partners.json`**: see Phase 0I (demo agenda)

**`src/i18n/messages/en/`** — English version of all files (analogously).

**i18n loader** must compose per-module JSONs into a single messages object:
```typescript
// src/i18n/request.ts
export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale || 'cs'
  const common = (await import(`./messages/${locale}/common.json`)).default
  const auth = (await import(`./messages/${locale}/auth.json`)).default
  const nav = (await import(`./messages/${locale}/nav.json`)).default
  const dataBrowser = (await import(`./messages/${locale}/dataBrowser.json`)).default
  const partners = (await import(`./messages/${locale}/partners.json`)).default
  return {
    locale,
    messages: { common, auth, nav, dataBrowser, partners }
  }
})
```

Note: In future sprints, new modules are added — just add an import for the additional JSON file.

---

## PHASE 0F: LAYOUT — TOPBAR + SIDEBAR

### 0F.1 Dashboard layout

**`src/app/[locale]/(dashboard)/layout.tsx`**

Main layout for the entire application after login:

```
┌──────────────────────────────────────────────────────┐
│ TopBar (fixed, h-14)                                  │
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │ Main Content (scrollable)                  │
│ (w-64    │                                            │
│  or      │  ┌─ Breadcrumb ──────────────────────┐    │
│  w-16    │  └───────────────────────────────────┘    │
│  collapsed│                                           │
│          │  {children}                                │
│          │                                            │
└──────────┴───────────────────────────────────────────┘
```

### 0F.2 TopBar

**`src/components/layout/TopBar.tsx`**

- Left side: tenant name (brewery), module tabs (Pivovar | Sklad | Obchod | Finance | Plán)
- Right side: notifications icon (placeholder), user avatar + dropdown (profile, settings, logout)
- Module tabs: highlighted active module, clicking switches module and sidebar agendas
- Module tabs react to subscription — if a module is not in the plan, it appears grayed out with a lock icon
- Responsive: on mobile, tabs collapse into a hamburger menu

### 0F.3 Sidebar

**`src/components/layout/Sidebar.tsx`**

- Collapsible (« button) — when collapsed shows only icons
- Collapse/expand state saved in user_profiles.preferences (localStorage fallback)
- Agendas change based on the active module (TopBar)
- Active agenda is highlighted
- ProfiBrew logo at the bottom
- Scrollable if many agendas

### 0F.4 Navigation configuration

**`src/config/navigation.ts`**:

```typescript
export interface NavModule {
  slug: string           // 'brewery' | 'stock' | 'sales' | 'finance' | 'plan'
  labelKey: string       // i18n key
  icon: LucideIcon
  requiredModule: string // For subscription check
  agendas: NavAgenda[]
}

export interface NavAgenda {
  slug: string
  labelKey: string
  icon: LucideIcon
  href: string          // Relative path within the module
  requiredPermission?: string  // 'items.read', 'batches.create'...
}

export const modules: NavModule[] = [
  {
    slug: 'brewery',
    labelKey: 'nav.modules.brewery',
    icon: Beer,
    requiredModule: 'brewery',
    agendas: [
      { slug: 'overview', labelKey: 'nav.agendas.overview', icon: LayoutDashboard, href: '/brewery/overview' },
      { slug: 'partners', labelKey: 'nav.agendas.partners', icon: Users, href: '/brewery/partners' },
      { slug: 'contacts', labelKey: 'nav.agendas.contacts', icon: Contact, href: '/brewery/contacts' },
      { slug: 'materials', labelKey: 'nav.agendas.materials', icon: Wheat, href: '/brewery/materials' },
      { slug: 'recipes', labelKey: 'nav.agendas.recipes', icon: BookOpen, href: '/brewery/recipes' },
      { slug: 'batches', labelKey: 'nav.agendas.batches', icon: FlaskConical, href: '/brewery/batches' },
      { slug: 'equipment', labelKey: 'nav.agendas.equipment', icon: Container, href: '/brewery/equipment' },
    ]
  },
  {
    slug: 'stock',
    labelKey: 'nav.modules.stock',
    icon: Warehouse,
    requiredModule: 'stock',
    agendas: [
      { slug: 'items', labelKey: 'nav.agendas.items', icon: Package, href: '/stock/items' },
      { slug: 'movements', labelKey: 'nav.agendas.movements', icon: ArrowLeftRight, href: '/stock/movements' },
      { slug: 'tracking', labelKey: 'nav.agendas.tracking', icon: MapPin, href: '/stock/tracking' },
      { slug: 'excise', labelKey: 'nav.agendas.excise', icon: Receipt, href: '/stock/excise' },
      { slug: 'monthlyReport', labelKey: 'nav.agendas.monthlyReport', icon: FileText, href: '/stock/monthly-report' },
    ]
  },
  // ... sales, finance, plan analogously
]
```

---

## PHASE 0G: DATABROWSER FRAMEWORK

This is the most critical component of the entire system. DataBrowser will be used on EVERY agenda.

### 0G.1 DataBrowser types

**`src/components/data-browser/types.ts`**:

Complete TypeScript interface for DataBrowser configuration — see System Design section 4.2. Key types:

```typescript
export interface DataBrowserConfig<T = any> {
  entity: string
  title: string
  baseFilter?: Record<string, any>

  views: {
    list: { enabled: boolean; default?: boolean }
    card: CardViewConfig | false
  }

  columns: ColumnDef[]
  quickFilters?: QuickFilter[]
  filters?: FilterDef[]

  defaultSort: { key: string; direction: 'asc' | 'desc' }
  pageSize: number
  pageSizeOptions: number[]

  actions: {
    create?: { label: string; enabled: boolean }
    bulkDelete?: boolean
    bulkExport?: boolean
    rowClick?: 'detail' | 'edit' | 'none'
  }

  permissions: {
    create: string[]
    read: string[]
    update: string[]
    delete: string[]
  }
}

export interface ColumnDef {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'link' | 'badge' | 'icon' | 'currency'
  sortable?: boolean
  width?: number
  format?: string
  render?: (value: any, row: any) => React.ReactNode
}

export interface CardViewConfig {
  enabled: boolean
  imageField?: string
  titleField: string
  subtitleField?: string
  badgeFields?: string[]
  metricFields?: { key: string; label: string; format?: string; showIf?: string }[]
  actions?: string[]
}

export interface QuickFilter {
  label: string
  filter: Record<string, any>
}

export interface FilterDef {
  key: string
  label: string
  type: 'text' | 'select' | 'multiselect' | 'boolean' | 'date_range' | 'number_range'
  options?: { value: string; label: string }[]
  optionsFrom?: string  // Dynamic options from DB
}
```

### 0G.2 DataBrowser component

**`src/components/data-browser/DataBrowser.tsx`**:

Props: `config: DataBrowserConfig`, `data: T[]`, `totalCount: number`, `isLoading: boolean`, `onParamsChange: (params) => void`

State (URL search params for shareable links):
- `view`: 'list' | 'card'
- `page`: number
- `pageSize`: number
- `sort`: string (e.g. 'name:asc')
- `search`: string
- `quickFilter`: string (slug of active quick filter)
- `filters`: JSON string (active parametric filters)

Renders:
1. **Toolbar**: Create button, view toggle (list/card), filter toggle, saved views dropdown, search input, sort selector
2. **QuickFilters**: Tab-style horizontal filters
3. **Active filter chips**: Display of active filters with x for removal
4. **Content**: ListView OR CardView based on state
5. **ParametricFilterPanel**: Sheet/drawer from the left side
6. **Pagination**: Bottom
7. **BulkActions**: Sticky bar at the bottom when records are selected

### 0G.3 ListView

**`src/components/data-browser/ListView.tsx`**

- shadcn/ui Table
- Sortable columns (click on header → toggle asc/desc)
- Checkbox for bulk select
- Row click → navigate to detail (per config.actions.rowClick)
- Row actions menu (...) — edit, delete, duplicate, custom
- Responsive: horizontal scroll on small screens

### 0G.4 CardView

**`src/components/data-browser/CardView.tsx`**

- CSS Grid (responsive: 1-5 columns based on width)
- Card layout per CardViewConfig: image, title, subtitle, badges, metrics, action icons
- Card click → detail
- Action icons at the bottom of the card

### 0G.5 FilterBar, QuickFilters, Pagination, BulkActions

Separate sub-components. See System Design 4.2 wireframe.

### 0G.6 ParametricFilterPanel

**`src/components/data-browser/ParametricFilterPanel.tsx`**

- shadcn/ui Sheet (from the left side)
- Dynamically generated filters from `config.filters`
- "Apply" and "Clear" buttons
- Filter values propagate to URL params

### 0G.7 SavedViews

**`src/components/data-browser/SavedViews.tsx`**

- Dropdown with saved views
- "Save current view" → dialog with name + shared checkbox
- Loading a view → sets all params (filters, sort, view mode, columns)
- CRUD operations via API on the `saved_views` table

---

## PHASE 0H: FORMSECTION FRAMEWORK

### 0H.1 FormSection types

**`src/components/forms/types.ts`**:

```typescript
export interface FormFieldDef {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'decimal' | 'date' | 'datetime' |
        'select' | 'multiselect' | 'toggle' | 'checkbox' | 'file_upload' |
        'relation' | 'computed' | 'color' | 'currency'
  placeholder?: string
  required?: boolean
  disabled?: boolean | ((values: any) => boolean)
  visible?: boolean | ((values: any) => boolean)    // Conditional visibility
  validation?: ZodSchema
  options?: { value: string; label: string }[]
  optionsFrom?: string                              // Dynamic from DB
  relationConfig?: {                                 // For type='relation'
    entity: string
    displayField: string
    searchFields: string[]
  }
  computeFn?: (values: any) => any                   // For type='computed'
  gridSpan?: 1 | 2 | 3 | 4                          // How many columns it spans
  helpText?: string
  prefix?: string                                    // "Kč", "kg"
  suffix?: string
}

export interface FormSectionDef {
  title?: string
  description?: string
  columns?: 1 | 2 | 3 | 4                           // Grid layout
  fields: FormFieldDef[]
}
```

### 0H.2 FormSection component

**`src/components/forms/FormSection.tsx`**

- Renders fields in a responsive grid
- Uses shadcn/ui form components
- Zod validation (inline error messages)
- Modes: 'create' | 'edit' | 'readonly'
- Conditional visibility — fields show/hide based on a condition
- `onChange` callback for each field
- `onSubmit` for the entire section

### 0H.3 DetailView wrapper

**`src/components/detail-view/DetailView.tsx`**

- Header: Back button, title, action buttons (save, delete, duplicate, etc.)
- Tabs: Configurable tabs with FormSection or nested DataBrowser
- Footer: Cancel + Save buttons
- Loading state, error state

---

## PHASE 0I: DEMO AGENDA (PLACEHOLDER)

To verify the entire framework, create one functioning placeholder agenda using the feature-module pattern.

### Demo: Partners browser (mock data)

**Module: `src/modules/partners/`**

Structure:
```
src/modules/partners/
├── components/
│   └── PartnerBrowser.tsx      # Imports DataBrowser, uses config
├── config.ts                   # DataBrowser config (columns, filters, card layout)
├── types.ts                    # Partner TypeScript interface
└── index.ts                    # Re-export: export { PartnerBrowser } from './components/PartnerBrowser'
```

**Page: `src/app/[locale]/(dashboard)/brewery/partners/page.tsx`**

Thin page file:
```typescript
import { PartnerBrowser } from '@/modules/partners'

export default function PartnersPage() {
  return <PartnerBrowser />
}
```

**Translations: `src/i18n/messages/cs/partners.json`**
```json
{
  "title": "Obchodní partneři",
  "create": "+ Partner",
  "quickFilters": {
    "all": "Vše",
    "customers": "Zákazníci",
    "suppliers": "Dodavatelé"
  },
  "columns": {
    "name": "Název",
    "ico": "IČO",
    "street": "Ulice",
    "city": "Město",
    "zip": "PSČ",
    "country": "Stát",
    "phone": "Mobil",
    "email": "Email"
  }
}
```

**PartnerBrowser.tsx:**
- Imports `DataBrowser` from `@/components/data-browser`
- Uses `partnerBrowserConfig` from `../config`
- Mock data: hardcoded array of 20-30 partners (Czech names, addresses)
- List view + Card view
- Quick filters: Vše, Zákazníci, Dodavatelé
- Columns: Název, IČO, Ulice, Město, PSČ, Stát, Mobil, Email
- Click on row → console.log (placeholder, detail page in Sprint 1)

This verifies:
- Feature-module pattern works (page imports from modules/)
- Layout works (TopBar + Sidebar + content)
- DataBrowser renders list and card view
- Filters, sorting, pagination work
- i18n works (per-module translations)
- Navigation between modules/agendas works
- Responsive design works

---

## ACCEPTANCE CRITERIA (Definition of Done)

Sprint 0 is complete when:

1. [ ] `npm run dev` starts the application without errors
2. [ ] Unauthenticated user is redirected to login
3. [ ] Registration creates tenant + user + subscription in DB
4. [ ] After login, layout with TopBar + Sidebar is displayed
5. [ ] Module tabs in TopBar work (switch sidebar agendas)
6. [ ] Sidebar collapses/expands, state is remembered
7. [ ] Navigation to /brewery/partners shows DataBrowser with mock data
8. [ ] List view displays a table with sorting and pagination
9. [ ] Card view displays tiles
10. [ ] Quick filters switch data
11. [ ] Parametric filter panel opens and filters
12. [ ] Search works (client-side on mock data)
13. [ ] i18n: switching to /en/ displays English texts
14. [ ] Responsive: on mobile the sidebar hides, TopBar adapts
15. [ ] TypeScript: no `any` types, strict mode, zero errors
16. [ ] Build: `npm run build` passes without errors
17. [ ] Feature-module pattern: page.tsx only imports from modules/, all logic in src/modules/partners/
18. [ ] i18n split: translations in cs/partners.json, not in a single monolith
19. [ ] Documentation updated: CHANGELOG.md (checked-off items), PRODUCT-SPEC.md (statuses updated)

---

## NOTES FOR CLAUDE CODE

- **Always use shadcn/ui** components where they exist, do not invent your own
- **Tailwind only** — no CSS modules, no styled-components
- **Server Components by default** — `'use client'` only where necessary (interactivity)
- **All text via next-intl** — no hardcoded Czech strings in components
- **Consistent naming**: PascalCase components, camelCase hooks/utils, snake_case DB
- **Error handling**: every async operation in try/catch, user-friendly toast messages
- **TypeScript strict**: no `any`, no `as` casts without good reason
- **Comments**: only where non-obvious, prefer self-documenting code
- **Feature-module pattern**: business logic in `src/modules/{module}/`, pages are thin imports
- **Cross-module imports**: only via `index.ts` (public API), never direct import of internal files
- **i18n per module**: translations in `src/i18n/messages/{locale}/{module}.json`
- **Documentation**: after completing each phase, update CHANGELOG.md and PRODUCT-SPEC.md (see CLAUDE.md rules)
