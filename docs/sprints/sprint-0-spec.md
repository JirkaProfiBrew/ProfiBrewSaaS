# SPRINT 0 — INFRASTRUKTURA
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 17.02.2026

---

## CÍL SPRINTU

Postavit kompletní základ aplikace: projekt scaffold, auth, multi-tenant izolace, layout s navigací, DataBrowser framework (list + card view), FormSection komponentu a základní i18n. Na konci sprintu musí běžet aplikace s funkčním přihlášením, prázdným dashboardem a jednou demo agendou (placeholder) využívající DataBrowser.

**Časový odhad:** 2 týdny (T1-T2)

---

## REFERENČNÍ DOKUMENT

Kompletní architektura je v `profibrew-system-design-v2.md`. Tento dokument je **zadání** — obsahuje co a jak. Zde je **specifikace** — obsahuje přesné kroky.

---

## FÁZE 0A: PROJECT SCAFFOLD

### 0A.1 Inicializace projektu

```bash
npx create-next-app@latest profibrew \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"
```

### 0A.2 Závislosti

```bash
# Core
npm install @supabase/supabase-js @supabase/ssr
npm install drizzle-orm postgres
npm install next-intl
npm install zod
npm install swr

# UI
npx shadcn@latest init
# Nainstalovat shadcn komponenty:
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

`tsconfig.json` — ověřit/nastavit:
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

`.env.local` (template — skutečné hodnoty se nedávají do repa):
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

### 0A.5 Projekt struktura

Vytvořit kompletní adresářovou strukturu dle **Feature-Module Pattern** definovaného v CLAUDE.md:

```
src/
├── app/[locale]/                      # ROUTES ONLY — tenké soubory
│   ├── (auth)/login/page.tsx
│   ├── (auth)/register/page.tsx
│   ├── (dashboard)/layout.tsx
│   ├── (dashboard)/dashboard/page.tsx
│   └── (dashboard)/brewery/partners/page.tsx   # Demo agenda
│
├── modules/                           # BUSINESS LOGIC
│   └── partners/                      # Demo modul (Sprint 0 = mock data)
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
│   │   └── partners.json             # Demo modul translations
│   └── en/
│       └── ...
└── styles/
```

Prázdné složky pro budoucí moduly (`items/`, `recipes/`, `batches/`, ...) **NEVYTVÁŘET** — přibudou v příslušných sprintech. Vytvořit pouze to co se v Sprint 0 skutečně implementuje.

---

## FÁZE 0B: SUPABASE + DRIZZLE SETUP

### 0B.1 Supabase klient

Vytvořit dva klienty:

**`src/lib/supabase/client.ts`** — browser klient (pro client components):
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`src/lib/supabase/server.ts`** — server klient (pro server components, API routes):
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

**`src/lib/supabase/middleware.ts`** — pro Next.js middleware (refresh session):
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

### 0B.2 Drizzle schema — Sprint 0 tabulky

Pro Sprint 0 potřebujeme jen tyto tabulky (zbytek se přidá v dalších sprintech):

**`drizzle/schema/tenants.ts`**
- `tenants` tabulka (dle System Design 2.2)

**`drizzle/schema/auth.ts`**
- `user_profiles` tabulka (dle System Design 3.4) — přidat `is_superadmin BOOLEAN DEFAULT false`
- `tenant_users` tabulka (dle System Design 3.4)

**`drizzle/schema/subscriptions.ts`**
- `plans` tabulka (dle System Design 2.3) — seed s 4 plány (Free/Starter/Pro/Business) s placeholder cenami

**`drizzle/schema/system.ts`**
- `saved_views` tabulka (dle System Design 4.3)

**`src/config/module-routes.ts`** — Route → Module mapping:
```typescript
// Mapuje URL path segment na required module slug
// Používá middleware + ModuleGuard pro access control
export const moduleRoutes: Record<string, string> = {
  '/brewery':  'brewery',   // Vždy dostupný (i Free tier)
  '/stock':    'stock',     // Subscription-gated
  '/sales':    'sales',     // Subscription-gated
  '/finance':  'finance',   // Subscription-gated
  '/plan':     'plan',      // Subscription-gated (Fáze 2)
  '/settings': '_always',   // Vždy dostupný
  '/dashboard':'_always',   // Vždy dostupný
  '/upgrade':  '_always',   // Vždy dostupný
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
// ... další schémata

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, {
  schema: { ...tenantSchema, ...authSchema }
})
```

### 0B.3 RLS policies

Po migraci vytvořit základní RLS policies v Supabase:

```sql
-- Tenant izolace pro všechny tenant-scoped tabulky
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- tenant_users: uživatel vidí jen svoje záznamy
CREATE POLICY "Users can view own tenant memberships"
  ON tenant_users FOR SELECT
  USING (user_id = auth.uid());

-- tenants: uživatel vidí jen tenanty kde je členem
CREATE POLICY "Users can view own tenants"
  ON tenants FOR SELECT
  USING (id IN (
    SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid()
  ));

-- user_profiles: uživatel vidí a edituje vlastní profil
CREATE POLICY "Users can view own profile"
  ON user_profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  USING (id = auth.uid());
```

---

## FÁZE 0C: AUTENTIZACE

### 0C.1 Middleware

**`src/middleware.ts`**:

Logika:
1. Zavolej `updateSession()` (refresh Supabase token)
2. Extrahuj locale z URL path (`/cs/...` nebo `/en/...`)
3. Pokud URL nemá locale → redirect na default locale
4. **Route group detection:**
   - `(marketing)` routes → public, žádné kontroly
   - `(auth)` routes → pokud user JE přihlášen → redirect na dashboard
   - `(dashboard)` routes → pokud user NENÍ přihlášen → redirect na login
   - `(admin)` routes → pokud user NENÍ přihlášen → redirect na login, pokud není superadmin → 403
5. **Module access check** (jen pro dashboard routes):
   - Mapuj URL path na required module přes `config/module-routes.ts`
   - Pokud module === '_always' || module === 'brewery' → OK
   - Jinak zkontroluj subscription → pokud modul není v plánu → redirect na `/[locale]/upgrade`
6. Protected routes = vše pod `/(dashboard)/` a `/(admin)/`
7. Public routes = `(marketing)`, `(auth)`

### 0C.2 Login page

**`src/app/[locale]/(auth)/login/page.tsx`**

Jednoduchý login formulář:
- Email + heslo
- "Přihlásit se" button
- Link na registraci
- Link na "Zapomenuté heslo" (TODO: Sprint 6)
- Supabase `signInWithPassword`
- Po úspěchu: redirect na dashboard
- Chybová hláška při špatném loginu
- Design: čistý, centered card, ProfiBrew logo nahoře

### 0C.3 Register page

**`src/app/[locale]/(auth)/register/page.tsx`**

Registrační formulář:
- Jméno pivovaru (→ tenant.name)
- Email
- Heslo + potvrzení hesla
- Souhlas s podmínkami (checkbox)
- "Vytvořit účet" button

Registrační flow (server action):
1. `supabase.auth.signUp({ email, password })`
2. Vytvoř `user_profiles` záznam
3. Vytvoř `tenants` záznam (name = brewery name, slug = slugify(name), status = 'trial')
4. Vytvoř `tenant_users` záznam (role = 'owner')
5. Vytvoř default `subscription` (plan = Free, status = 'trialing', trial_ends_at = +14 dní)
6. Redirect na dashboard (nebo onboarding — TODO Sprint 5)

### 0C.4 Auth context/hooks

**`src/lib/auth/hooks.ts`**:
- `useUser()` — aktuální Supabase user
- `useSession()` — session data

**`src/lib/auth/actions.ts`** — server actions:
- `signIn(email, password)` 
- `signUp(email, password, breweryName)`
- `signOut()`

---

## FÁZE 0D: MULTI-TENANT CONTEXT

### 0D.1 Tenant Provider

**`src/lib/hooks/useTenant.ts`**:

Po přihlášení:
1. Načti `tenant_users` pro aktuálního usera
2. Pokud má jeden tenant → nastav jako aktivní
3. Pokud má víc tenantů → zobraz výběr (edge case, later)
4. Ulož tenant_id + role do React context

**`src/components/providers/TenantProvider.tsx`**:
```typescript
// Context poskytuje:
interface TenantContext {
  tenantId: string
  tenantName: string
  tenantSlug: string
  userRole: 'owner' | 'admin' | 'brewer' | 'sales' | 'viewer'
  subscription: {
    planSlug: string
    modules: string[]    // Povolené moduly (z plan.included_modules + subscription_addons)
    status: string
  }
  hasModule: (moduleSlug: string) => boolean  // Helper pro rychlou kontrolu
}
```

### 0D.3 Module Access Guard

**`src/components/layout/ModuleGuard.tsx`**:

Server component wrapper použitý v `(dashboard)/layout.tsx`:
```typescript
// Extrahuje module slug z URL path
// Kontroluje přes hasModuleAccess()
// Pokud modul není dostupný → renderuje <UpgradePrompt /> místo children
// Pokud modul je dostupný → renderuje children normálně
```

**`src/app/[locale]/(dashboard)/upgrade/page.tsx`**:

Upsell/paywall stránka:
- Zobrazí aktuální plán uživatele
- Ukáže co získá upgradem (tabulka plánů)
- CTA button na upgrade (v MVP: odkaz na billing v settings)
- Parametr `?module=stock` → zvýrazní modul kvůli kterému přišel

### 0D.4 Skeleton route groups pro marketing a admin

Vytvořit prázdné layout soubory pro budoucí route groups:

**`src/app/[locale]/(marketing)/layout.tsx`** — prázdný layout s placeholder:
```typescript
// TODO: Sprint 6 — MarketingLayout (header, footer, CTA)
export default function MarketingLayout({ children }) { return <>{children}</> }
```

**`src/app/[locale]/(marketing)/page.tsx`** — placeholder homepage:
```typescript
// TODO: Sprint 6 — Homepage
export default function HomePage() { return <div>ProfiBrew — Coming Soon</div> }
```

**`src/app/[locale]/(admin)/layout.tsx`** — prázdný layout s auth check:
```typescript
// TODO: Sprint 6 — AdminLayout
// Musí kontrolovat is_superadmin, jinak redirect
export default function AdminLayout({ children }) { return <>{children}</> }
```

**`src/app/[locale]/(admin)/admin/page.tsx`** — placeholder:
```typescript
// TODO: Sprint 6 — Admin Dashboard
export default function AdminPage() { return <div>Admin Dashboard — Coming Soon</div> }
```

Tyto skeletony zajistí, že route groups existují od začátku a middleware je může správně routovat.

### 0D.2 API tenant middleware

**`src/lib/db/with-tenant.ts`**:

Helper pro všechny DB dotazy:
```typescript
// Každý DB dotaz MUSÍ projít přes tuto funkci
export async function withTenant<T>(
  fn: (tenantId: string, db: DrizzleDB) => Promise<T>
): Promise<T> {
  const tenantId = await getCurrentTenantId() // z session/JWT
  if (!tenantId) throw new AuthError('No tenant context')
  return fn(tenantId, db)
}

// Použití:
const items = await withTenant(async (tenantId, db) => {
  return db.select().from(items).where(eq(items.tenantId, tenantId))
})
```

---

## FÁZE 0E: i18n SETUP

### 0E.1 next-intl konfigurace

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

### 0E.2 Základní překlady

Překlady split per modul — každý modul má vlastní JSON soubor.

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

**`src/i18n/messages/cs/partners.json`**: viz Fáze 0I (demo agenda)

**`src/i18n/messages/en/`** — anglická verze všech souborů (analogicky).

**i18n loader** musí skládat per-module JSONy do jednoho messages objektu:
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

Pozn.: V budoucích sprintech se přidávají nové moduly — stačí přidat import dalšího JSON souboru.

---

## FÁZE 0F: LAYOUT — TOPBAR + SIDEBAR

### 0F.1 Dashboard layout

**`src/app/[locale]/(dashboard)/layout.tsx`**

Hlavní layout pro celou aplikaci po přihlášení:

```
┌──────────────────────────────────────────────────────┐
│ TopBar (fixed, h-14)                                  │
├──────────┬───────────────────────────────────────────┤
│ Sidebar  │ Main Content (scrollable)                  │
│ (w-64    │                                            │
│  nebo    │  ┌─ Breadcrumb ──────────────────────┐    │
│  w-16    │  └───────────────────────────────────┘    │
│  collapsed│                                           │
│          │  {children}                                │
│          │                                            │
└──────────┴───────────────────────────────────────────┘
```

### 0F.2 TopBar

**`src/components/layout/TopBar.tsx`**

- Levá strana: tenant name (pivovar), module tabs (Pivovar | Sklad | Obchod | Finance | Plán)
- Pravá strana: notifications icon (placeholder), user avatar + dropdown (profil, nastavení, odhlásit)
- Module tabs: zvýrazněný aktivní modul, kliknutí přepne modul a sidebar agendy
- Module tabs reagují na subscription — pokud modul není v plánu, zobrazí se šedě s lock ikonou
- Responsive: na mobilu se tabs schovají do hamburger menu

### 0F.3 Sidebar

**`src/components/layout/Sidebar.tsx`**

- Collapsible (« button) — při collapse zobrazí jen ikony
- Stav collapse/expand uložen v user_profiles.preferences (localStorage fallback)
- Agendy se mění podle aktivního modulu (TopBar)
- Aktivní agenda zvýrazněna
- Logo ProfiBrew dole
- Scrollovatelný pokud hodně agend

### 0F.4 Navigační konfigurace

**`src/config/navigation.ts`**:

```typescript
export interface NavModule {
  slug: string           // 'brewery' | 'stock' | 'sales' | 'finance' | 'plan'
  labelKey: string       // i18n key
  icon: LucideIcon
  requiredModule: string // Pro subscription check
  agendas: NavAgenda[]
}

export interface NavAgenda {
  slug: string
  labelKey: string
  icon: LucideIcon
  href: string          // Relative path v rámci modulu
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
  // ... sales, finance, plan analogicky
]
```

---

## FÁZE 0G: DATABROWSER FRAMEWORK

Tohle je nejkritičtější komponenta celého systému. DataBrowser se použije na KAŽDÉ agendě.

### 0G.1 DataBrowser types

**`src/components/data-browser/types.ts`**:

Kompletní TypeScript interface pro konfiguraci DataBrowseru — viz System Design sekce 4.2. Klíčové typy:

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
  optionsFrom?: string  // Dynamické options z DB
}
```

### 0G.2 DataBrowser komponenta

**`src/components/data-browser/DataBrowser.tsx`**:

Props: `config: DataBrowserConfig`, `data: T[]`, `totalCount: number`, `isLoading: boolean`, `onParamsChange: (params) => void`

Stav (URL search params pro shareable links):
- `view`: 'list' | 'card'
- `page`: number
- `pageSize`: number
- `sort`: string (e.g. 'name:asc')
- `search`: string
- `quickFilter`: string (slug aktivního quick filtru)
- `filters`: JSON string (aktivní parametrické filtry)

Renderuje:
1. **Toolbar**: Create button, view toggle (list/card), filter toggle, saved views dropdown, search input, sort selector
2. **QuickFilters**: Tab-style horizontální filtry
3. **Active filter chips**: Zobrazení aktivních filtrů s ✕ pro odebrání
4. **Content**: ListView NEBO CardView dle stavu
5. **ParametricFilterPanel**: Sheet/drawer z levé strany
6. **Pagination**: Dole
7. **BulkActions**: Sticky bar dole pokud vybrány záznamy

### 0G.3 ListView

**`src/components/data-browser/ListView.tsx`**

- shadcn/ui Table
- Sortovatelné sloupce (klik na header → toggle asc/desc)
- Checkbox pro bulk select
- Kliknutí na řádek → navigace na detail (dle config.actions.rowClick)
- Row actions menu (⋮) — edit, delete, duplicate, custom
- Responsive: horizontální scroll na malém displeji

### 0G.4 CardView

**`src/components/data-browser/CardView.tsx`**

- CSS Grid (responsive: 1-5 sloupců dle šířky)
- Card layout dle CardViewConfig: image, title, subtitle, badges, metrics, action icons
- Klik na card → detail
- Action icons ve spodní části karty

### 0G.5 FilterBar, QuickFilters, Pagination, BulkActions

Samostatné sub-komponenty. Viz System Design 4.2 wireframe.

### 0G.6 ParametricFilterPanel

**`src/components/data-browser/ParametricFilterPanel.tsx`**

- shadcn/ui Sheet (z levé strany)
- Dynamicky generované filtry z `config.filters`
- "Použít" a "Vymazat" tlačítka
- Filtr hodnoty se propagují do URL params

### 0G.7 SavedViews

**`src/components/data-browser/SavedViews.tsx`**

- Dropdown s uloženými pohledy
- "Uložit aktuální pohled" → dialog s názvem + shared checkbox
- Načtení pohledu → nastaví všechny params (filtry, sort, view mode, columns)
- CRUD operace přes API na `saved_views` tabulku

---

## FÁZE 0H: FORMSECTION FRAMEWORK

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
  optionsFrom?: string                              // Dynamické z DB
  relationConfig?: {                                 // Pro type='relation'
    entity: string
    displayField: string
    searchFields: string[]
  }
  computeFn?: (values: any) => any                   // Pro type='computed'
  gridSpan?: 1 | 2 | 3 | 4                          // Kolik sloupců zabírá
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

### 0H.2 FormSection komponenta

**`src/components/forms/FormSection.tsx`**

- Renderuje fields v responsive grid
- Používá shadcn/ui form components
- Zod validace (inline error messages)
- Režimy: 'create' | 'edit' | 'readonly'
- Conditional visibility — pole se zobrazí/skryje dle podmínky
- `onChange` callback pro každé pole
- `onSubmit` pro celou sekci

### 0H.3 DetailView wrapper

**`src/components/detail-view/DetailView.tsx`**

- Header: Back button, title, action buttons (save, delete, duplicate, etc.)
- Tabs: Konfigurovatelné taby s FormSection nebo vnořeným DataBrowserem
- Footer: Storno + Uložit buttons
- Loading state, error state

---

## FÁZE 0I: DEMO AGENDA (PLACEHOLDER)

Pro ověření celého frameworku vytvořit jednu fungující placeholder agendu pomocí feature-module pattern.

### Demo: Partners browser (mock data)

**Modul: `src/modules/partners/`**

Struktura:
```
src/modules/partners/
├── components/
│   └── PartnerBrowser.tsx      # Importuje DataBrowser, používá config
├── config.ts                   # DataBrowser config (columns, filters, card layout)
├── types.ts                    # Partner TypeScript interface
└── index.ts                    # Re-export: export { PartnerBrowser } from './components/PartnerBrowser'
```

**Page: `src/app/[locale]/(dashboard)/brewery/partners/page.tsx`**

Tenký page soubor:
```typescript
import { PartnerBrowser } from '@/modules/partners'

export default function PartnersPage() {
  return <PartnerBrowser />
}
```

**Překlady: `src/i18n/messages/cs/partners.json`**
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
- Importuje `DataBrowser` z `@/components/data-browser`
- Používá `partnerBrowserConfig` z `../config`
- Mock data: hardcoded array 20-30 partnerů (české názvy, adresy)
- List view + Card view
- Quick filters: Vše, Zákazníci, Dodavatelé
- Columns: Název, IČO, Ulice, Město, PSČ, Stát, Mobil, Email
- Click na řádek → console.log (placeholder, detail page v Sprint 1)

Tím ověříme:
- ✅ Feature-module pattern funguje (page importuje z modules/)
- ✅ Layout funguje (TopBar + Sidebar + content)
- ✅ DataBrowser renderuje list i card view
- ✅ Filtry, sorting, pagination fungují
- ✅ i18n funguje (per-module translations)
- ✅ Navigace mezi moduly/agendami funguje
- ✅ Responsive design funguje

---

## ACCEPTANCE CRITERIA (Definice hotovo)

Sprint 0 je hotový když:

1. ☐ `npm run dev` spustí aplikaci bez chyb
2. ☐ Nepřihlášený user je redirectnán na login
3. ☐ Registrace vytvoří tenant + user + subscription v DB
4. ☐ Po přihlášení se zobrazí layout s TopBar + Sidebar
5. ☐ Module tabs v TopBar fungují (přepínají sidebar agendy)
6. ☐ Sidebar se collapsuje/expanduje, stav se pamatuje
7. ☐ Navigace na /brewery/partners zobrazí DataBrowser s mock daty
8. ☐ List view zobrazuje tabulku s řazením a paginací
9. ☐ Card view zobrazuje dlaždice
10. ☐ Quick filters přepínají data
11. ☐ Parametrický filtr panel se otevírá a filtruje
12. ☐ Search funguje (client-side na mock datech)
13. ☐ i18n: přepnutí na /en/ zobrazí anglické texty
14. ☐ Responsive: na mobile se sidebar skrývá, TopBar adaptuje
15. ☐ TypeScript: žádné `any` typy, strict mode, zero errors
16. ☐ Build: `npm run build` projde bez chyb
17. ☐ Feature-module pattern: page.tsx jen importuje z modules/, veškerá logika v src/modules/partners/
18. ☐ i18n split: překlady v cs/partners.json, ne v jednom monolitu
19. ☐ Dokumentace aktualizována: CHANGELOG.md (odškrtnuté položky), PRODUCT-SPEC.md (statusy 📋→✅)

---

## POZNÁMKY PRO CLAUDE CODE

- **Vždy používej shadcn/ui** komponenty kde existují, nevymýšlej vlastní
- **Tailwind only** — žádné CSS moduly, žádné styled-components
- **Server Components defaultně** — `'use client'` jen kde nutné (interaktivita)
- **Všechny texty přes next-intl** — žádné hardcoded české stringy v komponentách
- **Konzistentní naming**: PascalCase components, camelCase hooks/utils, snake_case DB
- **Error handling**: každý async operation v try/catch, user-friendly toast messages
- **TypeScript strict**: no `any`, no `as` casts bez dobrého důvodu
- **Komentáře**: jen kde je to neočividné, preferuj self-documenting code
- **Feature-module pattern**: business logika v `src/modules/{modul}/`, pages jsou tenké importy
- **Cross-module imports**: jen přes `index.ts` (public API), nikdy přímý import interních souborů
- **i18n per modul**: překlady v `src/i18n/messages/{locale}/{modul}.json`
- **Dokumentace**: po dokončení každé fáze aktualizuj CHANGELOG.md a PRODUCT-SPEC.md (viz CLAUDE.md pravidla)
