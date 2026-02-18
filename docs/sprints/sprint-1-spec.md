# SPRINT 1 — ZÁKLADY (FOUNDATIONS)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 18.02.2026

---

## CÍL SPRINTU

Implementovat všechny základní datové entity, které jsou prerekvizitou pro výrobu, sklad i obchod: Items (hybrid model), Partners (unified), Contacts, Addresses, Bank Accounts, Equipment, Shops, Counters (číslovací řady) a RBAC middleware. Na konci sprintu musí být pivovar schopen: spravovat suroviny a produkty, evidovat zákazníky/dodavatele s kontakty, spravovat provozovny a zařízení, a všechny entity musí mít plný CRUD s DataBrowserem a DetailView.

**Časový odhad:** 2 týdny (T3-T4)

**Závisí na:** Sprint 0 (DataBrowser, FormSection, DetailView, Auth, Layout, i18n — musí být hotové)

---

## REFERENČNÍ DOKUMENTY

- `docs/SYSTEM-DESIGN.md` sekce 5.2 (Counters), 5.3 (Shops, Equipment), 5.4 (Items), 5.5 (Partners)
- `docs/PRODUCT-SPEC.md` sekce 4.1-4.3 (Partners, Contacts, Suroviny), 4.6 (Equipment)
- `docs/CHANGELOG.md` — planned scope for Sprint 1
- Bubble prototyp screenshoty: Browser1_list, Browser1_cards, Browser2_list, Browser2_cards, EditFormItem, EditFormPartner_subbrowser, EditForm_guide, Browser_paramFilter
- `CLAUDE.md` — pravidla kódování, dokumentační povinnosti

---

## ⚠️ PREREKVIZITA: DOCS AUDIT SPRINT 0

**PŘED zahájením Sprint 1 proveď audit dokumentace Sprint 0:**

1. **CHANGELOG.md** — Sprint 0 musí mít status ✅ Done, všechny checkboxy `- [x]`. Pokud nejsou zaškrtnuté, zaškrtni je dle skutečného stavu implementace.
2. **PRODUCT-SPEC.md** — framework komponenty (DataBrowser, FormSection, DetailView) musí mít status ✅, ne 📋.
3. Pokud se implementace Sprint 0 odchýlila od specifikace, **aktualizuj PRODUCT-SPEC.md** aby odpovídal realitě.

---

## FÁZE 1A: DB SCHEMA — NOVÉ TABULKY

### 1A.1 Číslovací řady (Counters)

**`drizzle/schema/system.ts`** — přidat tabulku `counters`:

```sql
CREATE TABLE counters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity          TEXT NOT NULL,          -- 'batch', 'order', 'stock_issue', 'item'...
  prefix          TEXT NOT NULL,          -- 'V', 'OBJ', 'PR', 'VD', 'it'...
  include_year    BOOLEAN DEFAULT true,
  current_number  INTEGER DEFAULT 0,
  padding         INTEGER DEFAULT 3,
  separator       TEXT DEFAULT '-',
  reset_yearly    BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, entity)
);
```

**Seed při registraci tenanta** (rozšířit registrační flow ze Sprint 0):
- `item`: prefix `it`, include_year=false, padding=5, separator='' → `it00001`
- `batch`: prefix `V`, include_year=true, padding=3 → `V-2026-001`
- `order`: prefix `OBJ`, include_year=true, padding=4 → `OBJ-2026-0001`
- `stock_issue_receipt`: prefix `PR`, include_year=true, padding=3 → `PR-2026-001`
- `stock_issue_dispatch`: prefix `VD`, include_year=true, padding=3 → `VD-2026-001`

**Helper funkce** `src/lib/db/counters.ts`:
```typescript
export async function getNextNumber(tenantId: string, entity: string): Promise<string>
// 1. SELECT ... FOR UPDATE (lock row)
// 2. Increment current_number (check reset_yearly)
// 3. Format: prefix + separator + year? + padded number
// 4. Return formatted string
```

### 1A.2 Provozovny (Shops)

**`drizzle/schema/shops.ts`**:

```sql
CREATE TABLE shops (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  shop_type       TEXT NOT NULL,         -- 'brewery' | 'taproom' | 'warehouse' | 'office'
  address         JSONB,                 -- { street, city, zip, country }
  is_default      BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  settings        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Seed:** Při registraci tenanta vytvořit jednu výchozí provozovnu (type=brewery, is_default=true, name = tenant.name).

### 1A.3 Zařízení (Equipment)

**`drizzle/schema/equipment.ts`**:

```sql
CREATE TABLE equipment (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  shop_id         UUID REFERENCES shops(id),
  name            TEXT NOT NULL,
  equipment_type  TEXT NOT NULL,          -- 'brewhouse' | 'fermenter' | 'brite_tank' |
                                          -- 'conditioning' | 'bottling_line' | 'keg_washer'
  volume_l        DECIMAL,
  status          TEXT DEFAULT 'available', -- 'available' | 'in_use' | 'maintenance' | 'retired'
  current_batch_id UUID,                 -- FK na batches přidáme v Sprint 2
  properties      JSONB DEFAULT '{}',
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Pozor:** `current_batch_id` v Sprint 1 nemá FK constraint na batches (tabulka ještě neexistuje). FK se přidá migrací v Sprint 2. Sloupec existuje jako nullable UUID.

### 1A.4 Položky (Items) — Hybrid model

**`drizzle/schema/items.ts`**:

Kompletní tabulka dle SYSTEM-DESIGN.md sekce 5.4. Klíčové sloupce:

```sql
CREATE TABLE items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  code              TEXT NOT NULL,              -- it00001 (z counteru)
  name              TEXT NOT NULL,
  brand             TEXT,                       -- Značka / výrobce

  -- FLAGS
  is_brew_material  BOOLEAN DEFAULT false,
  is_production_item BOOLEAN DEFAULT false,
  is_sale_item      BOOLEAN DEFAULT false,
  is_excise_relevant BOOLEAN DEFAULT false,

  -- STOCK
  stock_category    TEXT,                       -- 'raw_material' | 'finished_product' | 'packaging' | 'other'
  issue_mode        TEXT DEFAULT 'fifo',        -- 'fifo' | 'lifo' | 'average'
  unit_id           UUID,                       -- FK na units (Sprint 1)
  base_unit_amount  DECIMAL,

  -- MATERIAL-SPECIFIC
  material_type     TEXT,                       -- 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  alpha             DECIMAL,
  ebc               DECIMAL,
  extract_percent   DECIMAL,

  -- PRODUCT-SPECIFIC
  packaging_type    TEXT,
  volume_l          DECIMAL,
  abv               DECIMAL,
  plato             DECIMAL,
  ean               TEXT,

  -- PRICING
  cost_price        DECIMAL,
  avg_price         DECIMAL,
  sale_price        DECIMAL,
  overhead_manual   BOOLEAN DEFAULT false,
  overhead_price    DECIMAL,

  -- POS / WEB
  pos_available     BOOLEAN DEFAULT false,
  web_available     BOOLEAN DEFAULT false,
  color             TEXT,

  -- META
  image_url         TEXT,
  notes             TEXT,
  is_active         BOOLEAN DEFAULT true,
  is_from_library   BOOLEAN DEFAULT false,
  source_library_id UUID,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, code)
);

CREATE INDEX idx_items_tenant_material ON items(tenant_id, material_type) WHERE is_brew_material;
CREATE INDEX idx_items_tenant_product ON items(tenant_id) WHERE is_sale_item;
CREATE INDEX idx_items_tenant_active ON items(tenant_id, is_active);
```

**Tabulky navázané na Items:**

```sql
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

CREATE TABLE units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),  -- NULL = system
  name            TEXT NOT NULL,
  base_unit       TEXT,
  conversion_factor DECIMAL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Seed Units** (systémové, tenant_id = NULL):
- kg, g, l, ml, ks (pcs), balení (pack)

### 1A.5 Partneři (Partners) — Unified model

**`drizzle/schema/partners.ts`**:

```sql
CREATE TABLE partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,

  -- FLAGS
  is_customer     BOOLEAN DEFAULT false,
  is_supplier     BOOLEAN DEFAULT false,

  -- LEGAL
  legal_form      TEXT,                   -- 'individual' | 'legal_entity'
  ico             TEXT,
  dic             TEXT,
  dic_validated   BOOLEAN DEFAULT false,
  legal_form_code TEXT,

  -- CONTACT
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  web             TEXT,

  -- ADDRESS (primary)
  address_street  TEXT,
  address_city    TEXT,
  address_zip     TEXT,
  country_id      UUID,                   -- FK na countries

  -- COMMERCIAL
  payment_terms   INTEGER DEFAULT 14,
  price_list_id   UUID,                   -- FK na price_lists (Phase 2)
  credit_limit    DECIMAL,

  -- META
  logo_url        TEXT,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  last_sync_at    TIMESTAMPTZ,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- CONTACTS (multiple per partner)
CREATE TABLE contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  first_name      TEXT,
  last_name       TEXT,
  position        TEXT,
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  is_primary      BOOLEAN DEFAULT false,
  notes           TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ADDRESSES (multiple per partner)
CREATE TABLE addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  address_type    TEXT NOT NULL,          -- 'billing' | 'shipping' | 'branch'
  street          TEXT,
  city            TEXT,
  zip             TEXT,
  country_id      UUID,
  is_default      BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- BANK ACCOUNTS (multiple per partner)
CREATE TABLE partner_bank_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  partner_id      UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  account_number  TEXT NOT NULL,
  bank_code       TEXT,
  iban            TEXT,
  swift           TEXT,
  currency        TEXT DEFAULT 'CZK',
  is_default      BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 1A.6 Countries (systémový číselník)

**`drizzle/schema/system.ts`** — přidat:

```sql
CREATE TABLE countries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,    -- 'CZ', 'SK', 'DE'...
  name_cs         TEXT NOT NULL,
  name_en         TEXT NOT NULL,
  sort_order      INTEGER DEFAULT 0
);
```

**Seed:** CZ, SK, DE, AT, PL + dalších ~20 EU zemí.

### 1A.7 RLS Policies

Pro KAŽDOU novou tabulku (shops, equipment, items, partners, contacts, addresses, partner_bank_accounts, counters, categories, units) vytvořit RLS policies:

```sql
ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;

CREATE POLICY "{table}_tenant_isolation" ON {table}
  USING (tenant_id = (current_setting('app.current_tenant_id'))::uuid);

CREATE POLICY "{table}_insert" ON {table}
  FOR INSERT WITH CHECK (tenant_id = (current_setting('app.current_tenant_id'))::uuid);
```

Pro globální tabulky (countries, units s tenant_id=NULL): policy pro SELECT bez tenant filtru.

### 1A.8 Migrace

```bash
npx drizzle-kit generate
npx drizzle-kit push
```

Ověřit že všechny tabulky existují v Supabase, indexy jsou vytvořené, RLS je enabled.

---

## FÁZE 1B: MODUL ITEMS (Položky)

### 1B.1 Module structure

```
src/modules/items/
├── components/
│   ├── ItemBrowser.tsx          # DataBrowser pro kompletní katalog
│   ├── MaterialBrowser.tsx      # DataBrowser s baseFilter { is_brew_material: true }
│   ├── ItemDetail.tsx           # DetailView s taby
│   └── ItemForm.tsx             # FormSection pro create/edit
├── config.ts                    # DataBrowser configs (itemBrowserConfig, materialBrowserConfig)
├── actions.ts                   # Server actions: createItem, updateItem, deleteItem
├── hooks.ts                     # useItems, useItem, useMaterials
├── types.ts                     # Item, ItemCreate, ItemUpdate interfaces
├── schema.ts                    # Zod validace: itemCreateSchema, itemUpdateSchema
└── index.ts                     # Public API re-exports
```

### 1B.2 Pohledy (Views)

Items mají 3 pohledy — VŠECHNY pracují s jednou tabulkou `items`, liší se baseFilter:

| Pohled | Agenda | URL | baseFilter | Quick Filters |
|--------|--------|-----|------------|---------------|
| Suroviny | Pivovar → Suroviny | `/brewery/materials` | `{ is_brew_material: true }` | Vše, Slady a přísady, Chmel, Kvasnice |
| Katalog položek | Sklad → Položky | `/stock/items` | `{}` (vše) | Vše, Na pokladně, Výrobní |
| Produkty | *(nesamostatné — zatím jen filtr v katalogu)* | — | `{ is_sale_item: true }` | — |

### 1B.3 Suroviny (Materials) — DataBrowser config

**List view sloupce:** Kód, Název, Cena (cost_price), Surovina (is_brew_material boolean badge), Prodejní (is_sale_item boolean badge), Alpha, Výrobce (brand), Z knihovny (is_from_library icon)

**Card view:**
- imageField: `image_url`
- titleField: `name`
- subtitleField: `material_type` (zobrazit česky: "Slad", "Chmel", "Kvasnice", "Přísada")
- badgeFields: `is_brew_material`, `is_sale_item`
- metricFields: `cost_price` (currency), `alpha` (showIf: material_type=hop)
- actions: detail, delete, duplicate

**Quick Filters:**
- Vše: žádný extra filtr
- Slady a přísady: `{ material_type: ['malt', 'adjunct'] }`
- Chmel: `{ material_type: 'hop' }`
- Kvasnice: `{ material_type: 'yeast' }`
- *(overflow menu "..":)* Ostatní: `{ material_type: 'other' }`

**Parametric Filters:**
- Název (text search)
- Značka/výrobce (text)
- Prodejní položka (boolean)
- Zpřístupněno na pokladně (boolean)
- Typ suroviny (select: malt, hop, yeast, adjunct, other)
- Základní vyráběná položka (is_production_item, boolean)
- Kategorie skladu (select from categories)

### 1B.4 Katalog položek (Stock → Items) — DataBrowser config

**List view sloupce:** Kód, Název, Typ (material_type / packaging_type), Cena, Surovina, Prodejní, Výrobní, Alpha, EBC

**Card view:**
- imageField: `image_url`
- titleField: `name`
- subtitleField: *(typ — composite: material_type nebo packaging_type)*
- badgeFields: `is_brew_material`, `is_sale_item`, `is_production_item`
- metricFields: `cost_price`, `alpha`, `ebc`
- actions: detail, delete, duplicate

**Quick Filters:**
- Vše
- Na pokladně: `{ pos_available: true }`
- Výrobní: `{ is_production_item: true }`

### 1B.5 Detail položky (ItemDetail)

**DetailView** s taby:

**Tab "Základní informace":**

FormSection — respektovat layout z Bubble prototypu (viz EditFormItem.jpg):

Řádek 1: Master (toggle, TODO Sprint 6), Public (toggle, TODO Sprint 6)
Řádek 2: Kód položky (readonly, auto z counteru), Název položky, Značka/výrobce
Řádek 3 (highlighted sekce): 
  - Surovina na výrobu piva (is_brew_material, toggle)
  - Položka pro evidenci výroby (is_production_item, toggle)
  - Prodávat položku (is_sale_item, toggle)
Řádek 4: Kategorie skladu (select), Spotřební daň (is_excise_relevant, toggle), Mód výdeje (select: FIFO/LIFO/Average)
Řádek 5 (conditional — zobrazit jen pokud is_brew_material=true):
  - Typ materiálu (select: malt/hop/yeast/adjunct/other)
  - Alpha (number, jen pokud material_type=hop)
  - EBC (number, jen pokud material_type=malt)
  - Výtěžnost % (number, jen pokud material_type=malt)
Řádek 6: MJ — Měrná jednotka (select z units)
Řádek 7 (pricing sekce):
  - Kalkulační cena (cost_price)
  - Průměrná skladová cena (avg_price, readonly — přepočítá se ze skladu)
  - Prodejní cena (sale_price)
Řádek 8: Zpřístupnit na pokladně (pos_available), Nabízet na webu (web_available)
Řádek 9 (overhead sekce):
  - Režii nastavit ručně (overhead_manual, toggle)
  - Režijní cena pro prodej (overhead_price, editable jen pokud overhead_manual=true)
Řádek 10: Kategorie (relation to categories, multi-select)
Řádek 11: Barva položky (color picker)
Řádek 12: Poznámka (textarea)

**Tab "Přílohy":**
- Attachment management (TODO — v MVP stačí image_url field + placeholder pro future attachment system)
- V MVP: jednoduché pole pro URL obrázku

**Header akce:**
- Smazat (soft delete: is_active = false)
- Duplikovat (copy entity, nový kód z counteru)
- Export (TODO)

### 1B.6 Server Actions

**`src/modules/items/actions.ts`:**

```typescript
'use server'

export async function createItem(data: ItemCreate): Promise<ActionResult<Item>>
// 1. Validace Zod schématem
// 2. Vygenerovat kód z counteru (getNextNumber)
// 3. INSERT do items s tenant_id z kontextu
// 4. Revalidate paths

export async function updateItem(id: string, data: ItemUpdate): Promise<ActionResult<Item>>
// 1. Validace
// 2. UPDATE WHERE id AND tenant_id
// 3. Revalidate

export async function deleteItem(id: string): Promise<ActionResult>
// Soft delete: UPDATE is_active = false WHERE id AND tenant_id

export async function duplicateItem(id: string): Promise<ActionResult<Item>>
// 1. Načíst originál
// 2. Vygenerovat nový kód
// 3. INSERT kopie (bez id, created_at, updated_at, code)
```

### 1B.7 Pages (thin files)

**`src/app/[locale]/(dashboard)/brewery/materials/page.tsx`:**
```typescript
import { MaterialBrowser } from '@/modules/items'
export default function MaterialsPage() { return <MaterialBrowser /> }
```

**`src/app/[locale]/(dashboard)/brewery/materials/[id]/page.tsx`:**
```typescript
import { ItemDetail } from '@/modules/items'
export default function MaterialDetailPage({ params }: { params: { id: string } }) {
  return <ItemDetail id={params.id} />
}
```

**`src/app/[locale]/(dashboard)/stock/items/page.tsx`:**
```typescript
import { ItemBrowser } from '@/modules/items'
export default function ItemsPage() { return <ItemBrowser /> }
```

**`src/app/[locale]/(dashboard)/stock/items/[id]/page.tsx`:**
```typescript
import { ItemDetail } from '@/modules/items'
export default function ItemDetailPage({ params }: { params: { id: string } }) {
  return <ItemDetail id={params.id} />
}
```

### 1B.8 i18n

**`src/i18n/messages/cs/items.json`:**
```json
{
  "materials": {
    "title": "Suroviny",
    "create": "+ Surovina",
    "quickFilters": {
      "all": "Vše",
      "maltsAdditives": "Slady a přísady",
      "hops": "Chmel",
      "yeast": "Kvasnice",
      "other": "Ostatní"
    }
  },
  "catalog": {
    "title": "Katalog položek",
    "create": "+ Položka",
    "quickFilters": {
      "all": "Vše",
      "pos": "Na pokladně",
      "production": "Výrobní"
    }
  },
  "columns": {
    "code": "Kód",
    "name": "Název",
    "brand": "Značka/výrobce",
    "costPrice": "Kalk. cena",
    "avgPrice": "Průměrná cena",
    "salePrice": "Prodejní cena",
    "alpha": "Alpha",
    "ebc": "EBC",
    "isMaterial": "Surovina",
    "isSaleItem": "Prodejní",
    "isProduction": "Výrobní",
    "fromLibrary": "Z knihovny",
    "materialType": "Typ suroviny"
  },
  "materialTypes": {
    "malt": "Slad",
    "hop": "Chmel",
    "yeast": "Kvasnice",
    "adjunct": "Přísada",
    "other": "Ostatní"
  },
  "detail": {
    "title": "Editace položky",
    "tabs": {
      "basic": "Základní informace",
      "attachments": "Přílohy"
    },
    "fields": {
      "code": "Kód položky",
      "name": "Název položky",
      "brand": "Značka / výrobce",
      "isMaterial": "Surovina na výrobu piva",
      "isProduction": "Položka pro evidenci výroby piva",
      "isSaleItem": "Prodávat položku",
      "stockCategory": "Kategorie skladu",
      "exciseRelevant": "Spotřební daň",
      "issueMode": "Mód výdeje",
      "materialType": "Typ materiálu",
      "alpha": "Alfa",
      "ebc": "EBC",
      "extractPercent": "Výtěžnost %",
      "unit": "MJ",
      "costPrice": "Kalk. cena",
      "avgPrice": "Prům. cena",
      "salePrice": "Prodejní cena",
      "posAvailable": "Zpřístupnit na pokladně",
      "webAvailable": "Nabízet na webu",
      "overheadManual": "Režii nastavit ručně",
      "overheadPrice": "Režijní cena pro prodej",
      "category": "Kategorie",
      "color": "Barva položky",
      "notes": "Poznámka"
    }
  },
  "stockCategories": {
    "rawMaterial": "Suroviny",
    "finishedProduct": "Hotové výrobky",
    "packaging": "Obaly",
    "other": "Ostatní"
  },
  "issueModes": {
    "fifo": "FIFO",
    "lifo": "LIFO",
    "average": "Průměr"
  }
}
```

**`src/i18n/messages/en/items.json`** — anglická verze (analogicky).

---

## FÁZE 1C: MODUL PARTNERS (Partneři)

### 1C.1 Module structure

```
src/modules/partners/
├── components/
│   ├── PartnerBrowser.tsx       # DataBrowser — nahradí demo z Sprint 0
│   ├── PartnerDetail.tsx        # DetailView s taby (info, kontakty, adresy, účty)
│   ├── PartnerForm.tsx          # FormSection pro create/edit
│   ├── ContactsTab.tsx          # Nested DataBrowser kontaktů v detailu partnera
│   ├── AddressesTab.tsx         # Nested DataBrowser adres
│   ├── BankAccountsTab.tsx      # Nested DataBrowser bank účtů
│   └── AresLookup.tsx           # ARES integrace — IČO lookup button
├── config.ts                    # DataBrowser config
├── actions.ts                   # Server actions (partner + contacts + addresses + bank accounts)
├── hooks.ts                     # usePartners, usePartner, useContacts...
├── types.ts                     # Partner, Contact, Address, BankAccount interfaces
├── schema.ts                    # Zod validace
└── index.ts
```

### 1C.2 PartnerBrowser — upgrade z Sprint 0

**Nahradit mock data reálnými DB daty.** Zachovat stávající konfiguraci (sloupce, quick filters) ale rozšířit:

**Quick Filters:**
- Vše
- Zjednodušený (view mode — méně sloupců, TODO)
- Zákazníci: `{ is_customer: true }`
- Dodavatelé: `{ is_supplier: true }`

**Sloupce list view:** Název (link), IČO, Ulice, Město, PSČ, Stát, Mobil, Email

**Parametric Filters:**
- Název (text)
- IČO (text)
- Město (text)
- Zákazník (boolean)
- Dodavatel (boolean)
- Aktivní (boolean, default: true)

**Card view:** Název, IČO, město, typ (Zákazník/Dodavatel badge), email, telefon

### 1C.3 PartnerDetail — taby

**Tab "Základní informace":**

FormSection layout (viz EditFormPartner_subbrowser.jpg a EditForm_guide.jpg):

Sekce "Právní údaje":
- Právní forma (select: individual/legal_entity)
- IČO + tlačítko "Načíst z ARES" (AresLookup component)
- DIČ
- Stav validace DIČ (readonly badge: ověřeno/neověřeno)

Sekce "Kontaktní údaje":
- Email, Telefon, Mobil, Web

Sekce "Primární adresa":
- Ulice, Město, PSČ, Země (select z countries)

Sekce "Obchodní podmínky":
- Splatnost (payment_terms, number, dny)
- Kreditní limit (credit_limit, currency)
- Poznámky (textarea)

Sekce "Flagy":
- Zákazník (is_customer, toggle)
- Dodavatel (is_supplier, toggle)

**Tab "Kontakty":**
- Nested DataBrowser: seznam kontaktů pro tohoto partnera
- Sloupce: Jméno, Příjmení, Pozice, Email, Telefon, Primární (badge)
- CRUD: přidat/editovat kontakt inline nebo v dialogu
- Akce: nastavit jako primární, smazat

**Tab "Adresy":**
- Nested DataBrowser: adresy partnera
- Sloupce: Typ (Fakturační/Dodací/Pobočka), Ulice, Město, PSČ, Země, Výchozí (badge)
- CRUD v dialogu

**Tab "Bankovní účty":**
- Nested DataBrowser
- Sloupce: Číslo účtu, Kód banky, IBAN, SWIFT, Měna, Výchozí
- CRUD v dialogu

**Tab "Logo, přílohy":**
- Upload loga (image_url)
- Attachment management (placeholder, jako u Items)

### 1C.4 ARES Integrace

**`src/modules/partners/components/AresLookup.tsx`:**

- Input: IČO
- Tlačítko "Načíst z ARES"
- Volá server action `lookupAres(ico: string)`
- API endpoint: `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/{ico}`
- Parsovat odpověď → vyplnit formulář: název, adresa, DIČ, právní forma
- Nastavit `dic_validated = true`, `last_sync_at = now()`
- Error handling: nevalidní IČO, ARES nedostupný, subjekt nenalezen

**Server action `src/modules/partners/actions.ts`:**
```typescript
export async function lookupAres(ico: string): Promise<ActionResult<AresData>>
// 1. Validace formátu IČO (8 číslic)
// 2. Fetch ARES REST API
// 3. Parse response: obchodniJmeno, sidlo, dic, pravniForma
// 4. Return structured data
```

### 1C.5 Server Actions

```typescript
// Partner CRUD
export async function createPartner(data: PartnerCreate): Promise<ActionResult<Partner>>
export async function updatePartner(id: string, data: PartnerUpdate): Promise<ActionResult<Partner>>
export async function deletePartner(id: string): Promise<ActionResult> // soft delete

// Contacts CRUD
export async function createContact(partnerId: string, data: ContactCreate): Promise<ActionResult<Contact>>
export async function updateContact(id: string, data: ContactUpdate): Promise<ActionResult<Contact>>
export async function deleteContact(id: string): Promise<ActionResult>
export async function setPrimaryContact(partnerId: string, contactId: string): Promise<ActionResult>

// Addresses CRUD
export async function createAddress(partnerId: string, data: AddressCreate): Promise<ActionResult<Address>>
export async function updateAddress(id: string, data: AddressUpdate): Promise<ActionResult<Address>>
export async function deleteAddress(id: string): Promise<ActionResult>

// Bank Accounts CRUD
export async function createBankAccount(partnerId: string, data: BankAccountCreate): Promise<ActionResult<BankAccount>>
export async function updateBankAccount(id: string, data: BankAccountUpdate): Promise<ActionResult<BankAccount>>
export async function deleteBankAccount(id: string): Promise<ActionResult>

// ARES
export async function lookupAres(ico: string): Promise<ActionResult<AresData>>
```

### 1C.6 Pages

**`src/app/[locale]/(dashboard)/brewery/partners/page.tsx`:**
```typescript
import { PartnerBrowser } from '@/modules/partners'
export default function PartnersPage() { return <PartnerBrowser /> }
```

**`src/app/[locale]/(dashboard)/brewery/partners/[id]/page.tsx`:**
```typescript
import { PartnerDetail } from '@/modules/partners'
export default function PartnerDetailPage({ params }: { params: { id: string } }) {
  return <PartnerDetail id={params.id} />
}
```

### 1C.7 i18n

**`src/i18n/messages/cs/partners.json`** — rozšířit existující o:
```json
{
  "title": "Obchodní partneři",
  "create": "+ Partner",
  "quickFilters": {
    "all": "Vše",
    "simplified": "Zjednodušený",
    "customers": "Zákazníci",
    "suppliers": "Dodavatelé"
  },
  "columns": {
    "name": "Název",
    "ico": "IČO",
    "dic": "DIČ",
    "street": "Ulice",
    "city": "Město",
    "zip": "PSČ",
    "country": "Stát",
    "phone": "Mobil",
    "email": "Email",
    "isCustomer": "Zákazník",
    "isSupplier": "Dodavatel"
  },
  "detail": {
    "title": "Detail partnera",
    "tabs": {
      "basic": "Základní informace",
      "contacts": "Kontakty",
      "addresses": "Adresy",
      "bankAccounts": "Bankovní účty",
      "attachments": "Logo, přílohy"
    },
    "sections": {
      "legal": "Právní údaje",
      "contact": "Kontaktní údaje",
      "address": "Primární adresa",
      "commercial": "Obchodní podmínky",
      "flags": "Typ partnera"
    },
    "fields": {
      "legalForm": "Právní forma",
      "individual": "Fyzická osoba",
      "legalEntity": "Právnická osoba",
      "ico": "IČO",
      "dic": "DIČ",
      "dicValidated": "Ověřeno přes ARES",
      "loadFromAres": "Načíst z ARES",
      "email": "Email",
      "phone": "Telefon",
      "mobile": "Mobil",
      "web": "Web",
      "street": "Ulice",
      "city": "Město",
      "zip": "PSČ",
      "country": "Země",
      "paymentTerms": "Splatnost (dny)",
      "creditLimit": "Kreditní limit",
      "notes": "Poznámky",
      "isCustomer": "Zákazník",
      "isSupplier": "Dodavatel"
    }
  },
  "contacts": {
    "title": "Kontakty",
    "create": "+ Kontakt",
    "firstName": "Jméno",
    "lastName": "Příjmení",
    "position": "Pozice",
    "email": "Email",
    "phone": "Telefon",
    "mobile": "Mobil",
    "isPrimary": "Primární",
    "setPrimary": "Nastavit jako primární"
  },
  "addresses": {
    "title": "Adresy",
    "create": "+ Adresa",
    "type": "Typ",
    "billing": "Fakturační",
    "shipping": "Dodací",
    "branch": "Pobočka",
    "isDefault": "Výchozí"
  },
  "bankAccounts": {
    "title": "Bankovní účty",
    "create": "+ Účet",
    "accountNumber": "Číslo účtu",
    "bankCode": "Kód banky",
    "iban": "IBAN",
    "swift": "SWIFT",
    "currency": "Měna",
    "isDefault": "Výchozí"
  },
  "ares": {
    "loading": "Načítám z ARES...",
    "success": "Data úspěšně načtena z ARES",
    "notFound": "Subjekt s tímto IČO nebyl nalezen",
    "error": "Nepodařilo se načíst data z ARES",
    "invalidIco": "IČO musí mít 8 číslic"
  }
}
```

---

## FÁZE 1D: MODUL CONTACTS (Kontakty — samostatná agenda)

### 1D.1 Agenda Kontakty

Samostatná agenda v sidebaru (Pivovar → Kontakty) = flat list všech kontaktů across all partners.

**`src/app/[locale]/(dashboard)/brewery/contacts/page.tsx`:**
```typescript
import { ContactBrowser } from '@/modules/partners'  // Re-use z partners modulu
export default function ContactsPage() { return <ContactBrowser /> }
```

**ContactBrowser DataBrowser config:**
- List view: Jméno, Příjmení, Partner (link), Pozice, Email, Telefon, Primární
- Click → navigace na detail partnera, tab Kontakty
- Parametric filters: jméno, příjmení, partner, email

---

## FÁZE 1E: MODUL EQUIPMENT (Zařízení)

### 1E.1 Module structure

```
src/modules/equipment/
├── components/
│   ├── EquipmentBrowser.tsx
│   ├── EquipmentDetail.tsx
│   └── EquipmentForm.tsx
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts
└── index.ts
```

### 1E.2 EquipmentBrowser

**Sloupce list view:** Název (link), Typ, Kapacita (litrů), Stav (badge), Provozovna (shop.name), Poznámky

**Quick Filters:**
- Vše
- Varny: `{ equipment_type: 'brewhouse' }`
- Fermentory: `{ equipment_type: 'fermenter' }`
- Ležácké: `{ equipment_type: 'brite_tank' }`
- CKT: `{ equipment_type: 'conditioning' }`
- Stáčecí: `{ equipment_type: 'bottling_line' }`

**Card view:** Název, typ (badge), kapacita, stav (color-coded badge: available=zelená, in_use=modrá, maintenance=žlutá, retired=šedá)

### 1E.3 EquipmentDetail

FormSection:
- Název, Typ (select), Kapacita v litrech, Provozovna (select z shops)
- Stav (select: available/in_use/maintenance/retired)
- Aktuální šarže — v Sprint 1: readonly text "(přiřazení v Sprint 2)". V Sprint 2 se nahradí linkem.
- Vlastnosti (JSONB) — v MVP: klíč-hodnota editor nebo prostý JSON textarea
- Poznámky

### 1E.4 i18n

**`src/i18n/messages/cs/equipment.json`:**
```json
{
  "title": "Zařízení",
  "create": "+ Zařízení",
  "quickFilters": {
    "all": "Vše",
    "brewhouse": "Varny",
    "fermenter": "Fermentory",
    "briteTank": "Ležácké",
    "conditioning": "CKT",
    "bottlingLine": "Stáčecí"
  },
  "columns": {
    "name": "Název",
    "type": "Typ",
    "volumeL": "Kapacita (l)",
    "status": "Stav",
    "shop": "Provozovna",
    "currentBatch": "Aktuální šarže",
    "notes": "Poznámky"
  },
  "types": {
    "brewhouse": "Varna",
    "fermenter": "Fermentor",
    "brite_tank": "Ležácký tank",
    "conditioning": "CKT",
    "bottling_line": "Stáčecí linka",
    "keg_washer": "Myčka sudů"
  },
  "statuses": {
    "available": "Volný",
    "in_use": "Obsazený",
    "maintenance": "Údržba",
    "retired": "Vyřazený"
  },
  "detail": {
    "title": "Detail zařízení",
    "fields": {
      "name": "Název",
      "type": "Typ zařízení",
      "volumeL": "Kapacita (litry)",
      "shop": "Provozovna",
      "status": "Stav",
      "currentBatch": "Aktuální šarže",
      "properties": "Vlastnosti",
      "notes": "Poznámky"
    }
  }
}
```

### 1E.5 Pages

**`src/app/[locale]/(dashboard)/brewery/equipment/page.tsx`**
**`src/app/[locale]/(dashboard)/brewery/equipment/[id]/page.tsx`**

---

## FÁZE 1F: MODUL SHOPS (Provozovny)

### 1F.1 Module structure

```
src/modules/shops/
├── components/
│   ├── ShopBrowser.tsx
│   ├── ShopDetail.tsx
│   └── ShopForm.tsx
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts
└── index.ts
```

### 1F.2 ShopBrowser

**Umístění:** Settings → Provozovny (`/settings/shops`)

**Sloupce:** Název, Typ (badge), Adresa, Výchozí (badge), Aktivní

**Quick Filters:**
- Vše
- Pivovar: `{ shop_type: 'brewery' }`
- Výčep: `{ shop_type: 'taproom' }`
- Sklad: `{ shop_type: 'warehouse' }`

### 1F.3 ShopDetail

FormSection:
- Název, Typ (select: brewery/taproom/warehouse/office)
- Adresa (street, city, zip, country — parsováno z JSONB address)
- Výchozí provozovna (toggle)
- Aktivní (toggle)
- Nastavení (JSONB — placeholder pro budoucí konfiguraci)

### 1F.4 Pages

**`src/app/[locale]/(dashboard)/settings/shops/page.tsx`**
**`src/app/[locale]/(dashboard)/settings/shops/[id]/page.tsx`**

### 1F.5 i18n

**`src/i18n/messages/cs/shops.json`:**
```json
{
  "title": "Provozovny",
  "create": "+ Provozovna",
  "types": {
    "brewery": "Pivovar",
    "taproom": "Výčep",
    "warehouse": "Sklad",
    "office": "Kancelář"
  },
  "columns": {
    "name": "Název",
    "type": "Typ",
    "address": "Adresa",
    "isDefault": "Výchozí",
    "isActive": "Aktivní"
  },
  "detail": {
    "title": "Detail provozovny",
    "fields": {
      "name": "Název",
      "type": "Typ provozovny",
      "street": "Ulice",
      "city": "Město",
      "zip": "PSČ",
      "country": "Země",
      "isDefault": "Výchozí provozovna",
      "isActive": "Aktivní"
    }
  }
}
```

---

## FÁZE 1G: RBAC MIDDLEWARE

### 1G.1 Permission check

**`src/lib/rbac/check.ts`:**

```typescript
export type Permission = `${Entity}.${Action}`
// Entity: 'items' | 'partners' | 'equipment' | 'shops' | 'recipes' | 'batches' | ...
// Action: 'create' | 'read' | 'update' | 'delete'

export function hasPermission(
  userRole: UserRole,
  permission: Permission
): boolean
// Implementuje permission matrix z SYSTEM-DESIGN.md sekce 3.3
```

**Permission matrix (relevantní pro Sprint 1):**

| Entity | owner | admin | brewer | sales | viewer |
|--------|-------|-------|--------|-------|--------|
| items | CRUD | CRUD | CRU | R | R |
| partners | CRUD | CRUD | R | CRUD | R |
| equipment | CRUD | CRUD | CRU | R | R |
| shops | CRUD | CRU | R | R | R |
| counters | CRUD | R | - | - | - |

### 1G.2 Server action wrapper

**`src/lib/rbac/middleware.ts`:**

```typescript
export function withPermission<T>(
  permission: Permission,
  action: () => Promise<T>
): Promise<T>
// 1. Načti user role z session/tenant context
// 2. Zkontroluj hasPermission(role, permission)
// 3. Pokud nemá oprávnění → throw Forbidden
// 4. Pokud má → execute action
```

Použití v actions.ts:
```typescript
export async function createItem(data: ItemCreate) {
  return withPermission('items.create', async () => {
    // ... implementace
  })
}
```

### 1G.3 UI permission check

**`src/lib/rbac/hooks.ts`:**

```typescript
export function usePermission(permission: Permission): boolean
// Čte role z TenantContext, vrací true/false

// Použití v komponentách:
const canCreate = usePermission('items.create')
// Skrýt "+ Položka" button pokud canCreate === false
```

---

## FÁZE 1H: NASTAVENÍ ČÍSLOVACÍCH ŘAD

### 1H.1 Settings → Counters

**`src/app/[locale]/(dashboard)/settings/counters/page.tsx`:**

Jednoduchý DataBrowser / tabulka:
- Entity (readonly), Prefix, Include Year (toggle), Aktuální číslo, Padding, Separátor, Reset ročně (toggle)
- Editace inline nebo v dialogu
- NENÍ možné přidávat/mazat — countery se seedují při registraci tenanta
- Pouze editace existujících (prefix, padding, separator...)

---

## FÁZE 1I: NAVIGACE A ROUTING

### 1I.1 Aktualizace navigace

**`src/config/navigation.ts`** — ověřit že všechny nové agendy jsou v navigaci:

Modul Pivovar:
- Přehled → `/brewery/overview` (placeholder)
- Partneři → `/brewery/partners` ✅ (upgrade z demo)
- Kontakty → `/brewery/contacts` ✅ (nové)
- Suroviny → `/brewery/materials` ✅ (nové)
- Receptury → `/brewery/recipes` (placeholder — Sprint 2)
- Vary → `/brewery/batches` (placeholder — Sprint 2)
- Zařízení → `/brewery/equipment` ✅ (nové)

Modul Sklad:
- Položky → `/stock/items` ✅ (nové)
- *(ostatní — placeholder)*

Settings:
- Provozovny → `/settings/shops` ✅ (nové)
- Číslovací řady → `/settings/counters` ✅ (nové)

### 1I.2 Placeholder pages

Pro agendy z navbaru které ještě nemají implementaci (Receptury, Vary, skladové pohyby, obchod, finance...) — thin page s:
```typescript
export default function PlaceholderPage() {
  return <div className="p-8 text-muted-foreground">Bude implementováno v Sprint X</div>
}
```

---

## ACCEPTANCE CRITERIA (Definition of Done)

Sprint 1 je kompletní když:

### Items
1. [ ] Suroviny browser (`/brewery/materials`) zobrazuje reálná data z DB
2. [ ] List view + Card view fungují s correct sloupci a card layout
3. [ ] Quick filters (Vše, Slady, Chmel, Kvasnice) filtrují správně
4. [ ] Parametrický filtr funguje
5. [ ] Vytvoření nové suroviny — kód automaticky z counteru
6. [ ] Detail suroviny — všechny fieldy editovatelné, podmíněná viditelnost funguje
7. [ ] Duplikace položky
8. [ ] Soft delete (is_active = false)
9. [ ] Katalog položek (`/stock/items`) zobrazuje VŠECHNY items, ne jen suroviny

### Partners
10. [ ] Partner browser zobrazuje reálná data (nahrazený demo mock)
11. [ ] Quick filters (Zákazníci, Dodavatelé) fungují
12. [ ] Vytvoření nového partnera
13. [ ] Detail partnera — tab Základní informace s FormSection
14. [ ] Tab Kontakty — nested CRUD funguje (přidat, editovat, smazat, nastavit primární)
15. [ ] Tab Adresy — nested CRUD funguje
16. [ ] Tab Bankovní účty — nested CRUD funguje
17. [ ] ARES integrace — IČO lookup vyplní formulář

### Contacts
18. [ ] Kontakty agenda (`/brewery/contacts`) — flat list across all partners
19. [ ] Click na kontakt → navigace na detail partnera

### Equipment
20. [ ] Equipment browser s quick filters dle typu
21. [ ] CRUD funguje
22. [ ] Detail s provozovnou (select ze shops)

### Shops
23. [ ] Shops browser v Settings
24. [ ] CRUD funguje
25. [ ] Default provozovna existuje po registraci

### Counters
26. [ ] Countery se seedují při registraci tenanta
27. [ ] `getNextNumber()` generuje správné kódy (it00001, V-2026-001...)
28. [ ] Settings → Counters umožňuje editaci

### RBAC
29. [ ] Server actions checkují permissions dle role
30. [ ] UI skrývá akce na které uživatel nemá oprávnění (create buttons, delete...)

### Obecné
31. [ ] TypeScript: zero errors, strict mode, žádné `any`
32. [ ] i18n: všechny texty přes useTranslations, CS + EN
33. [ ] Responsive: funguje na mobilu
34. [ ] `npm run build` projde bez chyb

---

## DOCUMENTATION UPDATES (povinné)

Po dokončení Sprint 1 MUSÍŠ aktualizovat:

### CHANGELOG.md
- Sprint 0: změnit status na ✅ Done (pokud ještě není)
- Sprint 1: odkomentovat sekci, zaškrtnout hotové checkboxy
- Přidat jakékoli odchylky od specifikace

### PRODUCT-SPEC.md
- Partners: 📋 → ✅
- Contacts: 📋 → ✅
- Suroviny: 📋 → ✅
- Equipment: 📋 → ✅
- Katalog položek: 📋 → ✅
- Pokud se implementace liší od specifikace → aktualizovat popis v PRODUCT-SPEC

### SYSTEM-DESIGN.md
- Přidat nové tabulky do sekce 5 pokud se liší od plánu
- Aktualizovat ER diagram v sekci 6 pokud se přidaly vztahy

---

## DOPORUČENÁ STRUKTURA SUBAGENTŮ

Pro efektivní paralelní práci doporučuji rozdělit na subagenty:

**Subagent 1 — DB Schema + Migrace:**
- Scope: `drizzle/schema/items.ts`, `drizzle/schema/partners.ts`, `drizzle/schema/equipment.ts`, `drizzle/schema/shops.ts`, rozšíření `drizzle/schema/system.ts` (counters, countries, units, categories)
- Výstup: schéma + migrace + seed data (countries, units, default counters)
- Acceptance: `npx drizzle-kit push` projde, tabulky v Supabase

**Subagent 2 — Items modul:**
- Scope: `src/modules/items/*`, stránky v `src/app/[locale]/(dashboard)/brewery/materials/`, `src/app/[locale]/(dashboard)/stock/items/`
- Předpoklad: DB schema hotové (Subagent 1)
- Čte: SYSTEM-DESIGN.md 5.4, PRODUCT-SPEC.md 4.3

**Subagent 3 — Partners modul:**
- Scope: `src/modules/partners/*` (upgrade), stránky, `src/app/[locale]/(dashboard)/brewery/contacts/`
- Čte: SYSTEM-DESIGN.md 5.5, PRODUCT-SPEC.md 4.1-4.2

**Subagent 4 — Equipment + Shops moduly:**
- Scope: `src/modules/equipment/*`, `src/modules/shops/*`, stránky
- Čte: SYSTEM-DESIGN.md 5.3, PRODUCT-SPEC.md 4.6

**Subagent 5 — RBAC + Counters + i18n:**
- Scope: `src/lib/rbac/*`, `src/lib/db/counters.ts`, i18n soubory, settings pages
- Čte: SYSTEM-DESIGN.md 3.2-3.3, 5.2

**Main agent:** integrace, review, build check, documentation updates.
