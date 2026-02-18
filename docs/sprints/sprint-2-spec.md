# SPRINT 2 — VÝROBA (PRODUCTION)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 18.02.2026

---

## CÍL SPRINTU

Implementovat kompletní výrobní modul: receptury (s ingrediencemi, kroky a kalkulací), výrobní šarže (s workflow, měřeními a poznámkami) a stáčení. Na konci sprintu musí pivovar umět navrhnout recept, založit várku, provést ji celým stavovým workflow a nastáčet hotové pivo.

**Časový odhad:** 3 týdny (T5-T7)

**Závisí na:** Sprint 1 (Items, Equipment, Partners, Counters, FormSection s reálnými daty)

---

## REFERENČNÍ DOKUMENTY

- `docs/SYSTEM-DESIGN.md` — sekce 5.6 (Recipes), 5.7 (Batches), 5.12 (Beer Styles), 4.2 (DataBrowser), 4.4 (FormSection/DetailView)
- `docs/PRODUCT-SPEC.md` — sekce 4.4 (Receptury), 4.5 (Vary/Šarže), 4.6 (Zařízení — stav)
- Bubble prototype screenshoty: `DashboardBrewery.jpg` (referenční UI pro přehled várek)

---

## FÁZE 2A: DB SCHEMA — RECEPTY

### 2A.1 Beer Styles (systémový číselník)

**Soubor:** `drizzle/schema/beer-styles.ts`

Tabulky dle SYSTEM-DESIGN.md sekce 5.6:

```
beer_style_groups
  id, name, sort_order, created_at

beer_styles
  id, bjcp_number, bjcp_category, name,
  abv_min, abv_max, ibu_min, ibu_max, ebc_min, ebc_max,
  og_min, og_max, fg_min, fg_max,
  appearance, aroma, flavor, comments,
  style_group_id (FK → beer_style_groups), created_at
```

**RLS:** Žádný — globální tabulka, read-only pro všechny.

### 2A.2 Seed data — BJCP styly

**Soubor:** `drizzle/seed/beer-styles.ts`

Naplnit BJCP 2021 Guidelines — minimálně tyto skupiny a styly relevantní pro český trh:

```
Skupiny:
- Czech Lager (2A, 2B, 2C)
- International Lager (1A, 1B, 1C, 1D, 2A)
- Pale Ale / IPA (12A, 12B, 12C, 21A, 21B, 21C, 22A)
- Wheat Beer (10A, 10B, 10C)
- Stout / Porter (13A, 13B, 13C, 15A, 15B, 15C, 16A, 16B)
- Belgian (24A, 24B, 24C, 25A, 25B, 25C, 26A, 26B, 26C, 26D)
- Sour / Wild (23A, 23B, 23C, 23D, 23E, 23F)
- Specialty (28A, 28B, 28C, 29A, 29B, 29C, 30A, 30B, 30C, 30D)
```

Minimálně 30-40 nejčastějších stylů s kompletními parametry. Seed se spustí jako Drizzle migrace/seed.

### 2A.3 Mashing Profiles

**Soubor:** `drizzle/schema/recipes.ts`

```
mashing_profiles
  id, tenant_id (NULL = systémový), name, steps (JSONB), notes, created_at
```

**Systémové profily (seed):**
- Jednokvasný infuzní (62°C → 72°C → 78°C)
- Dvourastový (52°C → 62°C → 72°C → 78°C)
- Český dekokční — dvoumezový
- Český dekokční — jednomezový

**RLS:** tenant_id IS NULL (systémové) = READ pro všechny. tenant_id = tenant → standardní tenant RLS.

### 2A.4 Recipes + related tables

**Soubor:** `drizzle/schema/recipes.ts` (rozšířit)

Tabulky dle SYSTEM-DESIGN.md sekce 5.6:

```
recipes
  id, tenant_id, code, name, beer_style_id (FK),
  status ('draft' | 'active' | 'archived'),
  batch_size_l, batch_size_bruto_l, beer_volume_l,
  og, fg, abv, ibu, ebc, boil_time_min, cost_price,
  duration_fermentation_days, duration_conditioning_days,
  notes, is_from_library, source_library_id,
  created_by, created_at, updated_at

recipe_items
  id, tenant_id, recipe_id (FK CASCADE), item_id (FK → items),
  category ('malt' | 'hop' | 'yeast' | 'adjunct' | 'other'),
  amount_g, use_stage ('mash' | 'boil' | 'whirlpool' | 'fermentation' | 'dry_hop'),
  use_time_min, hop_phase, notes, sort_order, created_at, updated_at

recipe_steps
  id, tenant_id, recipe_id (FK CASCADE), mash_profile_id (FK nullable),
  step_type ('mash_in' | 'rest' | 'decoction' | 'mash_out' | 'boil' | 'whirlpool' | 'cooling'),
  name, temperature_c, time_min, ramp_time_min, temp_gradient,
  notes, sort_order, created_at

recipe_calculations
  id, tenant_id, recipe_id (FK), calculated_at, data (JSONB), created_at
```

**RLS:** Standardní tenant izolace na všech tabulkách.

**Indexy:**
```sql
CREATE INDEX idx_recipes_tenant_status ON recipes(tenant_id, status);
CREATE INDEX idx_recipe_items_recipe ON recipe_items(recipe_id);
CREATE INDEX idx_recipe_steps_recipe ON recipe_steps(recipe_id);
```

### 2A.5 Drizzle migrace

Spustit `drizzle-kit generate` + `drizzle-kit migrate` pro všechny nové tabulky.

---

## FÁZE 2B: DB SCHEMA — ŠARŽE (BATCHES)

### 2B.1 Batches + related tables

**Soubor:** `drizzle/schema/batches.ts`

Tabulky dle SYSTEM-DESIGN.md sekce 5.7:

```
batches
  id, tenant_id, batch_number, batch_seq,
  recipe_id (FK nullable), item_id (FK → items nullable),
  status ('planned' | 'brewing' | 'fermenting' | 'conditioning' | 'carbonating' | 'packaging' | 'completed' | 'dumped'),
  brew_status,
  planned_date, brew_date, end_brew_date,
  actual_volume_l, og_actual, fg_actual, abv_actual,
  equipment_id (FK → equipment nullable),
  primary_batch_id (FK self-reference nullable),
  excise_relevant_hl, excise_reported_hl, excise_status,
  is_paused, notes, brewer_id, created_by,
  created_at, updated_at
  UNIQUE(tenant_id, batch_number)

batch_steps
  id, tenant_id, batch_id (FK CASCADE),
  step_type, brew_phase ('mashing' | 'boiling' | 'fermentation' | 'conditioning'),
  name, temperature_c, time_min, pause_min, auto_switch,
  equipment_id (FK nullable),
  start_time_plan, start_time_real, end_time_real,
  sort_order, created_at

batch_measurements
  id, tenant_id, batch_id (FK),
  measurement_type ('gravity' | 'temperature' | 'ph' | 'volume' | 'pressure'),
  value, value_plato, value_sg, temperature_c,
  is_start, is_end, notes,
  measured_at, created_at

batch_notes
  id, tenant_id, batch_id (FK), batch_step_id (FK nullable),
  text, created_by, created_at

bottling_items
  id, tenant_id, batch_id (FK),
  item_id (FK → items), quantity, base_units,
  bottled_at, notes, created_at

batch_material_lots
  id, tenant_id, batch_id (FK), lot_id (FK → material_lots),
  item_id (FK → items), quantity_used, created_at
```

**RLS:** Standardní tenant izolace.

**Indexy:**
```sql
CREATE INDEX idx_batches_tenant_status ON batches(tenant_id, status);
CREATE INDEX idx_batches_tenant_date ON batches(tenant_id, brew_date);
CREATE INDEX idx_batch_steps_batch ON batch_steps(batch_id);
CREATE INDEX idx_batch_measurements_batch ON batch_measurements(batch_id);
```

### 2B.2 Drizzle migrace

Spustit `drizzle-kit generate` + `drizzle-kit migrate`.

---

## FÁZE 2C: MODUL RECEPTURY — BACKEND

### 2C.1 Module structure

```
src/modules/recipes/
├── components/
│   ├── RecipeBrowser.tsx          # DataBrowser pro seznam receptur
│   ├── RecipeDetail.tsx           # DetailView wrapper s taby
│   ├── RecipeForm.tsx             # FormSection pro základní info
│   ├── RecipeIngredientsTab.tsx   # Tab: suroviny v receptuře
│   ├── RecipeStepsTab.tsx         # Tab: kroky (rmut, var, whirlpool...)
│   ├── RecipeCalculation.tsx      # Výpočet parametrů + nákladová kalkulace
│   └── MashProfileSelector.tsx    # Výběr/aplikace rmutovacího profilu
├── config.ts                      # DataBrowser konfigurace
├── actions.ts                     # Server actions (CRUD)
├── hooks.ts                       # useRecipes, useRecipeDetail, useRecipeCalculation
├── types.ts                       # TypeScript interfaces
├── schema.ts                      # Zod validace
├── utils.ts                       # Kalkulační funkce (OG, IBU, EBC, cost)
└── index.ts                       # Re-exports
```

### 2C.2 Types (`types.ts`)

```typescript
export interface Recipe {
  id: string
  tenantId: string
  code: string | null
  name: string
  beerStyleId: string | null
  status: 'draft' | 'active' | 'archived'
  batchSizeL: number | null
  batchSizeBrutoL: number | null
  beerVolumeL: number | null
  og: number | null
  fg: number | null
  abv: number | null
  ibu: number | null
  ebc: number | null
  boilTimeMin: number | null
  costPrice: number | null
  durationFermentationDays: number | null
  durationConditioningDays: number | null
  notes: string | null
  isFromLibrary: boolean
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export interface RecipeItem {
  id: string
  tenantId: string
  recipeId: string
  itemId: string
  category: 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  amountG: number
  useStage: 'mash' | 'boil' | 'whirlpool' | 'fermentation' | 'dry_hop' | null
  useTimeMin: number | null
  hopPhase: string | null
  notes: string | null
  sortOrder: number
  // Joined fields:
  item?: { name: string; code: string; brand: string | null; alphaAcid?: number }
}

export interface RecipeStep {
  id: string
  tenantId: string
  recipeId: string
  mashProfileId: string | null
  stepType: 'mash_in' | 'rest' | 'decoction' | 'mash_out' | 'boil' | 'whirlpool' | 'cooling'
  name: string
  temperatureC: number | null
  timeMin: number | null
  rampTimeMin: number | null
  tempGradient: number | null
  notes: string | null
  sortOrder: number
}

export interface RecipeCalculation {
  og: number
  fg: number
  abv: number
  ibu: number
  ebc: number
  costPrice: number
  costPerLiter: number
  ingredients: { itemId: string; name: string; amount: number; cost: number }[]
}
```

### 2C.3 Zod Schema (`schema.ts`)

```typescript
export const recipeSchema = z.object({
  name: z.string().min(1, 'Název je povinný'),
  beerStyleId: z.string().uuid().nullable(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  batchSizeL: z.number().positive().nullable(),
  batchSizeBrutoL: z.number().positive().nullable(),
  beerVolumeL: z.number().positive().nullable(),
  boilTimeMin: z.number().int().min(0).nullable(),
  durationFermentationDays: z.number().int().min(0).nullable(),
  durationConditioningDays: z.number().int().min(0).nullable(),
  notes: z.string().nullable(),
})

export const recipeItemSchema = z.object({
  itemId: z.string().uuid(),
  category: z.enum(['malt', 'hop', 'yeast', 'adjunct', 'other']),
  amountG: z.number().positive('Množství musí být kladné'),
  useStage: z.enum(['mash', 'boil', 'whirlpool', 'fermentation', 'dry_hop']).nullable(),
  useTimeMin: z.number().int().min(0).nullable(),
  hopPhase: z.string().nullable(),
  notes: z.string().nullable(),
})

export const recipeStepSchema = z.object({
  stepType: z.enum(['mash_in', 'rest', 'decoction', 'mash_out', 'boil', 'whirlpool', 'cooling']),
  name: z.string().min(1),
  temperatureC: z.number().nullable(),
  timeMin: z.number().int().min(0).nullable(),
  rampTimeMin: z.number().int().min(0).nullable(),
  notes: z.string().nullable(),
})
```

### 2C.4 Server Actions (`actions.ts`)

CRUD operace pro receptury:

**`getRecipes(tenantId, filters?)`** — seznam receptur s filtrací a stránkováním
**`getRecipeDetail(tenantId, recipeId)`** — receptura + suroviny + kroky + kalkulace (JOIN)
**`createRecipe(tenantId, data)`** — vytvoření receptury (status=draft, automatický kód z číslovací řady pokud je nastavená)
**`updateRecipe(tenantId, recipeId, data)`** — aktualizace základních údajů
**`deleteRecipe(tenantId, recipeId)`** — soft delete (status → archived), NIKDY fyzický delete
**`duplicateRecipe(tenantId, recipeId)`** — duplikace celé receptury vč. surovin a kroků, nový status=draft, nový kód

**Recipe Items:**
**`addRecipeItem(tenantId, recipeId, data)`** — přidání suroviny do receptury
**`updateRecipeItem(tenantId, itemId, data)`** — aktualizace množství/fáze
**`removeRecipeItem(tenantId, itemId)`** — fyzický DELETE (ne soft delete — je to podřízený záznam)
**`reorderRecipeItems(tenantId, recipeId, itemIds[])`** — přeřazení sort_order

**Recipe Steps:**
**`addRecipeStep(tenantId, recipeId, data)`** — přidání kroku
**`updateRecipeStep(tenantId, stepId, data)`** — aktualizace
**`removeRecipeStep(tenantId, stepId)`** — fyzický DELETE
**`applyMashProfile(tenantId, recipeId, profileId)`** — nahradit rmutovací kroky profilem
**`reorderRecipeSteps(tenantId, recipeId, stepIds[])`** — přeřazení

**Calculation:**
**`calculateRecipe(tenantId, recipeId)`** — spočítat OG, IBU, EBC, ABV, cost → uložit snapshot do recipe_calculations

### 2C.5 Kalkulační funkce (`utils.ts`)

Implementovat pivovarské výpočetní vzorce:

**OG (Original Gravity) — °Plato:**
- Součet extraktivnosti všech sladů ÷ objem várky
- Vstup: množství sladů (g), extraktivita (PPG nebo %), objem (L), efektivita (výchozí 75%)

**IBU (International Bitterness Units):**
- Tinseth formula: IBU = (W × U × A × 1000) / V
- W = hmotnost chmele (g), U = utilization (f(čas varu, OG)), A = alpha acid (%), V = objem (L)
- Utilization tabulka podle času varu (5min → 60min)

**EBC (European Brewery Convention — barva):**
- Morey formula: SRM = 1.4922 × (MCU)^0.6859, EBC = SRM × 1.97
- MCU = Σ(hmotnost_sladu_kg × Lovibond) / objem_L

**ABV (Alcohol By Volume):**
- ABV = (OG - FG) × 0.131 (kde OG a FG v °Plato)
- Alternativně Balling: ABV = (OG_plato - FG_plato) / (2.0665 - 0.010665 × OG_plato)

**Cost Price:**
- Součet (množství × jednotková_cena) pro všechny suroviny
- Používat `cost_price` nebo `average_stock_price` z items

**POZNÁMKA:** Výpočty jsou přibližné — používat standardní pivovarské vzorce. Přesnost není kritická pro MVP, ale vzorce musí být korektní.

---

## FÁZE 2D: MODUL RECEPTURY — FRONTEND

### 2D.1 RecipeBrowser

**Konfigurace DataBrowser (`config.ts`):**

**List view columns:**
| Sloupec | Typ | Sortable |
|---------|-----|----------|
| Kód | text | ✓ |
| Název | link | ✓ |
| Styl | text | ✓ |
| Status | badge (draft/active/archived) | ✓ |
| OG (°P) | number | ✓ |
| IBU | number | ✓ |
| EBC | number | ✓ |
| Objem (L) | number | ✓ |
| Cena várky | currency | ✓ |

**Quick filters:** Vše | Aktivní | Koncepty | Archivované

**Card view:**
- Název receptury (bold)
- Styl piva (badge)
- Status (badge — barva dle stavu)
- Parametry: OG, IBU, EBC (inline)
- Objem
- Cena várky

**Parametrické filtry:**
- Název (text)
- Pivní styl (select → beer_styles)
- Status (multi-select)
- OG rozsah (number min/max)
- IBU rozsah (number min/max)

**Akce:**
- `+ Receptura` → navigace na vytvoření
- Řádek klik → navigace na detail (`/brewery/recipes/[id]`)
- Bulk: delete (archive)

### 2D.2 RecipeDetail (taby)

**Route:** `/brewery/recipes/[id]`

**Header:** Název receptury + status badge + akce (Duplikovat, Archivovat, Smazat)

**Tab 1: Základní údaje (RecipeForm)**
FormSection s poli:
- Název* (text)
- Kód (text, readonly pokud autogenerovaný)
- Pivní styl (select → beer_styles lookup, seskupený dle beer_style_groups)
- Status (select: draft/active/archived)
- Cílový objem várky (number, L) + brutto objem
- Objem hotového piva (number, L)
- Doba varu (number, min)
- Doba kvašení (number, dny)
- Doba dokvašování (number, dny)
- Poznámky (textarea)

**Tab 2: Suroviny (RecipeIngredientsTab)**
Editovatelná tabulka:
- Přidání suroviny: lookup na items (kde `is_brew_material = true`)
- Sloupce: Položka (link→item), Kategorie (auto z item nebo ruční override), Množství (g, s konverzí kg zobrazení), Fáze (select), Čas (min), Poznámka
- Inline editing — klik na buňku → edit
- Drag & drop řazení (sort_order)
- Tlačítko "+ Surovina" → dialog s vyhledáváním položek
- Seskupení dle kategorie: Slady, Chmele, Kvasnice, Přísady
- Pod tabulkou: shrnutí (celková hmotnost sladů, celková hmotnost chmelů)

**Tab 3: Postup (RecipeStepsTab)**
Editovatelná tabulka:
- Sloupce: Typ kroku (badge), Název, Teplota (°C), Čas (min), Náběh (min), Poznámka
- Drag & drop řazení
- Tlačítko "+ Krok" → dialog s typem kroku
- Tlačítko "Načíst rmutovací profil" → MashProfileSelector → nahradí rmutovací kroky
- Vizuální oddělení fází: Rmutování | Var | Whirlpool | Chlazení

**Tab 4: Kalkulace (RecipeCalculation)**
Read-only panel (přepočítává se na vyžádání nebo automaticky):
- Vypočtené parametry: OG (°P), FG (°P), ABV (%), IBU, EBC
- Porovnání se stylem: pokud je vybraný styl, zobrazit rozsahy a zda recept spadá do stylu (✓/✗)
- Nákladová kalkulace: tabulka surovin s cenami, celková cena várky, cena za litr
- Tlačítko "Přepočítat" → spustí calculateRecipe, uloží snapshot

**Tab 5: Poznámky**
- Prosté textové pole (notes na receptuře)

### 2D.3 Stránky

**`src/app/[locale]/(dashboard)/brewery/recipes/page.tsx`:**
```typescript
import { RecipeBrowser } from '@/modules/recipes'
export default function RecipesPage() {
  return <RecipeBrowser />
}
```

**`src/app/[locale]/(dashboard)/brewery/recipes/[id]/page.tsx`:**
```typescript
import { RecipeDetail } from '@/modules/recipes'
export default function RecipeDetailPage({ params }: { params: { id: string } }) {
  return <RecipeDetail recipeId={params.id} />
}
```

**`src/app/[locale]/(dashboard)/brewery/recipes/new/page.tsx`:**
```typescript
import { RecipeDetail } from '@/modules/recipes'
export default function NewRecipePage() {
  return <RecipeDetail isNew />
}
```

### 2D.4 i18n

**`src/i18n/messages/cs/recipes.json`:**
```json
{
  "title": "Receptury",
  "create": "+ Receptura",
  "quickFilters": {
    "all": "Vše",
    "active": "Aktivní",
    "draft": "Koncepty",
    "archived": "Archivované"
  },
  "columns": {
    "code": "Kód",
    "name": "Název",
    "style": "Styl",
    "status": "Status",
    "og": "OG (°P)",
    "ibu": "IBU",
    "ebc": "EBC",
    "batchSize": "Objem (L)",
    "costPrice": "Cena várky"
  },
  "status": {
    "draft": "Koncept",
    "active": "Aktivní",
    "archived": "Archivovaná"
  },
  "tabs": {
    "basic": "Základní údaje",
    "ingredients": "Suroviny",
    "steps": "Postup",
    "calculation": "Kalkulace",
    "notes": "Poznámky"
  },
  "form": {
    "name": "Název receptury",
    "code": "Kód",
    "beerStyle": "Pivní styl",
    "batchSize": "Cílový objem (L)",
    "batchSizeBruto": "Brutto objem (L)",
    "beerVolume": "Hotové pivo (L)",
    "boilTime": "Doba varu (min)",
    "fermentationDays": "Kvašení (dní)",
    "conditioningDays": "Dokvašování (dní)",
    "notes": "Poznámky"
  },
  "ingredients": {
    "add": "+ Surovina",
    "item": "Položka",
    "category": "Kategorie",
    "amount": "Množství",
    "stage": "Fáze",
    "time": "Čas (min)",
    "categories": {
      "malt": "Slad",
      "hop": "Chmel",
      "yeast": "Kvasnice",
      "adjunct": "Přísada",
      "other": "Ostatní"
    },
    "stages": {
      "mash": "Rmut",
      "boil": "Var",
      "whirlpool": "Whirlpool",
      "fermentation": "Kvašení",
      "dry_hop": "Dry hop"
    }
  },
  "steps": {
    "add": "+ Krok",
    "loadProfile": "Načíst rmutovací profil",
    "stepTypes": {
      "mash_in": "Zapáření",
      "rest": "Rast",
      "decoction": "Dekokce",
      "mash_out": "Odrmutování",
      "boil": "Var",
      "whirlpool": "Whirlpool",
      "cooling": "Chlazení"
    },
    "phases": {
      "mashing": "Rmutování",
      "boiling": "Vaření",
      "fermentation": "Kvašení",
      "conditioning": "Dokvašování"
    }
  },
  "calculation": {
    "recalculate": "Přepočítat",
    "parameters": "Vypočtené parametry",
    "styleComparison": "Porovnání se stylem",
    "costBreakdown": "Nákladová kalkulace",
    "totalCost": "Celková cena várky",
    "costPerLiter": "Cena za litr",
    "inRange": "V rozsahu stylu",
    "outOfRange": "Mimo rozsah stylu"
  },
  "actions": {
    "duplicate": "Duplikovat",
    "archive": "Archivovat",
    "activate": "Aktivovat",
    "delete": "Smazat"
  }
}
```

**`src/i18n/messages/en/recipes.json`** — anglická verze (analogicky).

---

## FÁZE 2E: MODUL ŠARŽE — BACKEND

### 2E.1 Module structure

```
src/modules/batches/
├── components/
│   ├── BatchBrowser.tsx           # DataBrowser pro seznam várek
│   ├── BatchDetail.tsx            # DetailView wrapper s taby
│   ├── BatchForm.tsx              # FormSection pro základní info
│   ├── BatchStepsTab.tsx          # Tab: kroky vaření s real-time tracking
│   ├── BatchMeasurementsTab.tsx   # Tab: měření (tabulka + graf)
│   ├── BatchIngredientsTab.tsx    # Tab: spotřebované suroviny
│   ├── BatchBottlingTab.tsx       # Tab: stáčení
│   ├── BatchNotesTab.tsx          # Tab: poznámky
│   ├── BatchStatusBadge.tsx       # Status badge s barvou
│   └── BatchStatusTransition.tsx  # Tlačítka pro změnu stavu
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts
└── index.ts
```

### 2E.2 Types (`types.ts`)

```typescript
export type BatchStatus = 'planned' | 'brewing' | 'fermenting' | 'conditioning' | 'carbonating' | 'packaging' | 'completed' | 'dumped'

export interface Batch {
  id: string
  tenantId: string
  batchNumber: string
  batchSeq: number | null
  recipeId: string | null
  itemId: string | null
  status: BatchStatus
  brewStatus: string | null
  plannedDate: Date | null
  brewDate: Date | null
  endBrewDate: Date | null
  actualVolumeL: number | null
  ogActual: number | null
  fgActual: number | null
  abvActual: number | null
  equipmentId: string | null
  primaryBatchId: string | null
  exciseRelevantHl: number | null
  exciseReportedHl: number | null
  exciseStatus: string | null
  isPaused: boolean
  notes: string | null
  brewerId: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
  // Joined:
  recipe?: { name: string; og: number | null; beerStyleId: string | null }
  item?: { name: string; code: string }
  equipment?: { name: string; equipmentType: string; volumeL: number | null }
}

export interface BatchStep { /* dle DB schema */ }
export interface BatchMeasurement { /* dle DB schema */ }
export interface BatchNote { /* dle DB schema */ }
export interface BottlingItem { /* dle DB schema */ }
```

### 2E.3 Server Actions (`actions.ts`)

**CRUD:**
**`getBatches(tenantId, filters?)`** — seznam várek
**`getBatchDetail(tenantId, batchId)`** — detail + kroky + měření + poznámky + bottling (JOINy)
**`createBatch(tenantId, data)`** — vytvoření:
  1. Vygenerovat batch_number z číslovací řady (counter entity='batch')
  2. Pokud je vybraná receptura → zkopírovat recipe_items do batch context + zkopírovat recipe_steps → batch_steps
  3. Status = 'planned'
  4. Přiřadit equipment (volitelné) → pokud přiřazeno, ověřit že je 'available'
**`updateBatch(tenantId, batchId, data)`** — aktualizace
**`deleteBatch(tenantId, batchId)`** — soft delete (status → dumped + notes proč)

**Status workflow:**
**`transitionBatchStatus(tenantId, batchId, newStatus)`** — validace přechodů:
```
planned    → brewing
brewing    → fermenting
fermenting → conditioning
conditioning → carbonating
carbonating → packaging
packaging  → completed
ANY        → dumped (s povinnou poznámkou)
```
Při přechodu do `brewing`:
- Nastavit `brew_date = today` pokud není nastaveno
- Změnit equipment.status → 'in_use', equipment.current_batch_id = batchId

Při přechodu do `completed`:
- Nastavit `end_brew_date = today`
- Změnit equipment.status → 'available', equipment.current_batch_id = null

**Kroky:**
**`updateBatchStep(tenantId, stepId, data)`** — aktualizace (start_time_real, end_time_real)
**`completeBatchStep(tenantId, stepId)`** — nastavit end_time_real = now

**Měření:**
**`addBatchMeasurement(tenantId, batchId, data)`** — přidat měření
**`deleteBatchMeasurement(tenantId, measurementId)`** — smazat

**Poznámky:**
**`addBatchNote(tenantId, batchId, data)`** — přidat poznámku (volitelně ke kroku)
**`deleteBatchNote(tenantId, noteId)`** — smazat

**Stáčení:**
**`addBottlingItem(tenantId, batchId, data)`** — přidat stáčecí řádek
**`updateBottlingItem(tenantId, bottlingId, data)`** — aktualizovat
**`deleteBottlingItem(tenantId, bottlingId)`** — smazat

### 2E.4 Zod Schema (`schema.ts`)

```typescript
export const batchSchema = z.object({
  recipeId: z.string().uuid().nullable(),
  itemId: z.string().uuid().nullable(),
  plannedDate: z.date().nullable(),
  equipmentId: z.string().uuid().nullable(),
  brewerId: z.string().uuid().nullable(),
  actualVolumeL: z.number().positive().nullable(),
  notes: z.string().nullable(),
})

export const batchMeasurementSchema = z.object({
  measurementType: z.enum(['gravity', 'temperature', 'ph', 'volume', 'pressure']),
  value: z.number().nullable(),
  valuePlato: z.number().nullable(),
  valueSg: z.number().nullable(),
  temperatureC: z.number().nullable(),
  isStart: z.boolean().default(false),
  isEnd: z.boolean().default(false),
  notes: z.string().nullable(),
  measuredAt: z.date().default(() => new Date()),
})

export const bottlingItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().positive('Množství musí být kladné'),
  baseUnits: z.number().positive().nullable(),
  bottledAt: z.date(),
  notes: z.string().nullable(),
})
```

---

## FÁZE 2F: MODUL ŠARŽE — FRONTEND

### 2F.1 BatchBrowser

**Konfigurace DataBrowser:**

**List view columns:**
| Sloupec | Typ | Sortable |
|---------|-----|----------|
| Číslo | link | ✓ |
| Pivo | text (item.name) | ✓ |
| Recept | text (recipe.name) | ✓ |
| Status | badge (barva dle stavu) | ✓ |
| Datum vaření | date | ✓ |
| Tank | text (equipment.name) | ✓ |
| OG (°P) | number | ✓ |
| Objem (L) | number | ✓ |
| Sládek | text | - |

**Quick filters:** Vše | Probíhající (brewing+fermenting+conditioning+carbonating) | Naplánované | Dokončené | Zlikvidované

**Card view:**
- Číslo várky (badge s barvou dle stavu)
- Datum vaření
- Název piva (bold)
- Parametry: °P OG, objem (L)
- Tank
- Pivní styl (badge)

**Akce:**
- `+ Várka` → dialog/stránka vytvoření (výběr receptury → vytvoření)
- Řádek klik → navigace na detail

### 2F.2 BatchDetail (taby)

**Route:** `/brewery/batches/[id]`

**Header:**
- Číslo várky (V-2026-001) + Název piva
- Status badge (velký, barevný)
- BatchStatusTransition: tlačítka pro posun stavu (jen validní přechody)
- Akce: Pozastavit/Obnovit, Zlikvidovat, Smazat

**Tab 1: Přehled (BatchForm)**
FormSection:
- Číslo várky (readonly)
- Receptura (select → recipes lookup, readonly po vytvoření)
- Pivo / Výrobní položka (select → items kde is_production_item=true)
- Datum vaření (plánovaný + skutečný)
- Tank/zařízení (select → equipment kde status=available NEBO aktuální tank)
- Sládek (select → tenant_users)
- Skutečný objem (L)
- Skutečné OG (°P)
- FG, ABV (readonly — vypočteno z měření pokud je is_end)
- Poznámky

**Tab 2: Kroky vaření (BatchStepsTab)**
Tabulka kroků (zkopírované z receptury):
- Sloupce: Fáze (badge), Název, Teplota (°C), Čas plan (min), Start plán, Start skutečný, Konec skutečný
- U každého kroku: tlačítko "Zahájit" (nastaví start_time_real = now) a "Dokončit" (nastaví end_time_real = now)
- Vizuální progress: dokončené kroky = šedé/zelené, aktuální = zvýrazněný, budoucí = světlé
- Kroky seskupené dle brew_phase

**Tab 3: Měření (BatchMeasurementsTab)**
- Tabulka měření: typ, hodnota, °P, SG, teplota, datum, poznámka
- Tlačítko "+ Měření" → dialog
- **Graf:** line chart (recharts) zobrazující vývoj gravitace v čase (°P na ose Y, datum na ose X)
- Označení start/end měření

**Tab 4: Suroviny (BatchIngredientsTab)**
- Tabulka: položka, kategorie, plánované množství (z receptury), skutečné množství, lot (pokud je lot tracking)
- V Sprint 2 **BEZ lot tracking** — jen zobrazení plánovaných surovin z receptury
- Lot tracking přijde ve Sprint 3

**Tab 5: Stáčení (BatchBottlingTab)**
- Tabulka: produkt (item kde is_sale_item=true), množství (ks), objem celkem (L), datum stáčení, poznámka
- Tlačítko "+ Stáčení" → dialog (výběr produktu, množství, datum)
- Sumář: celkem nastáčeno (L), zbývá v tanku

**Tab 6: Poznámky (BatchNotesTab)**
- Timeline poznámek (chronologicky, nejnovější nahoře)
- Ke každé poznámce: text, autor, datum, případně vazba na krok
- Přidání poznámky: textarea + tlačítko

### 2F.3 Status barvy (BatchStatusBadge)

```
planned:      šedá (gray)
brewing:      oranžová (orange)
fermenting:   žlutá (yellow)
conditioning: modrá (blue)
carbonating:  indigo (indigo)
packaging:    fialová (purple)
completed:    zelená (green)
dumped:       červená (red)
```

### 2F.4 Vytvoření várky (flow)

1. User klikne "+ Várka"
2. Dialog: výběr receptury (required) + plánované datum + tank (optional)
3. Po potvrzení:
   - createBatch → zkopíruje suroviny a kroky z receptury
   - Redirect na detail nové várky
   - Status = planned

### 2F.5 Stránky

**`src/app/[locale]/(dashboard)/brewery/batches/page.tsx`** → `<BatchBrowser />`
**`src/app/[locale]/(dashboard)/brewery/batches/[id]/page.tsx`** → `<BatchDetail batchId={params.id} />`
**`src/app/[locale]/(dashboard)/brewery/batches/new/page.tsx`** → `<BatchDetail isNew />`

### 2F.6 i18n

**`src/i18n/messages/cs/batches.json`:**
```json
{
  "title": "Vary / Šarže",
  "create": "+ Várka",
  "quickFilters": {
    "all": "Vše",
    "inProgress": "Probíhající",
    "planned": "Naplánované",
    "completed": "Dokončené",
    "dumped": "Zlikvidované"
  },
  "status": {
    "planned": "Naplánováno",
    "brewing": "Vaří se",
    "fermenting": "Kvasí",
    "conditioning": "Dokvašuje",
    "carbonating": "Sycení",
    "packaging": "Stáčení",
    "completed": "Dokončeno",
    "dumped": "Zlikvidováno"
  },
  "tabs": {
    "overview": "Přehled",
    "steps": "Kroky vaření",
    "measurements": "Měření",
    "ingredients": "Suroviny",
    "bottling": "Stáčení",
    "notes": "Poznámky"
  },
  "form": {
    "batchNumber": "Číslo várky",
    "recipe": "Receptura",
    "item": "Pivo (výrobní položka)",
    "plannedDate": "Plánované datum",
    "brewDate": "Datum vaření",
    "equipment": "Tank / zařízení",
    "brewer": "Sládek",
    "actualVolume": "Skutečný objem (L)",
    "ogActual": "Skutečné OG (°P)",
    "fgActual": "FG (°P)",
    "abvActual": "ABV (%)"
  },
  "steps": {
    "start": "Zahájit",
    "complete": "Dokončit",
    "completed": "Dokončeno",
    "inProgress": "Probíhá"
  },
  "measurements": {
    "add": "+ Měření",
    "types": {
      "gravity": "Hustota",
      "temperature": "Teplota",
      "ph": "pH",
      "volume": "Objem",
      "pressure": "Tlak"
    },
    "chart": "Graf vývoje"
  },
  "bottling": {
    "add": "+ Stáčení",
    "product": "Produkt",
    "quantity": "Množství (ks)",
    "volume": "Objem celkem (L)",
    "date": "Datum stáčení",
    "totalBottled": "Celkem nastáčeno",
    "remaining": "Zbývá v tanku"
  },
  "notes": {
    "add": "Přidat poznámku",
    "placeholder": "Napište poznámku..."
  },
  "actions": {
    "transition": "Posunout stav",
    "pause": "Pozastavit",
    "resume": "Obnovit",
    "dump": "Zlikvidovat",
    "dumpReason": "Důvod likvidace"
  },
  "createDialog": {
    "title": "Nová várka",
    "selectRecipe": "Vyberte recepturu",
    "selectDate": "Plánované datum vaření",
    "selectEquipment": "Tank (volitelné)"
  }
}
```

**`src/i18n/messages/en/batches.json`** — anglická verze (analogicky).

---

## FÁZE 2G: EQUIPMENT STATUS UPDATES

### 2G.1 Automatická aktualizace stavu zařízení

Při operacích s várkami je nutné synchronizovat stav equipment:

**Přiřazení tanku k várce:**
- Ověřit: equipment.status === 'available' (jinak error)
- Nastavit: `equipment.status = 'in_use'`, `equipment.current_batch_id = batchId`

**Dokončení/likvidace várky:**
- Nastavit: `equipment.status = 'available'`, `equipment.current_batch_id = null`

**Změna tanku na várce:**
- Uvolnit starý tank (→ available)
- Obsadit nový tank (→ in_use)

Tato logika se implementuje v `batches/actions.ts` jako součást `transitionBatchStatus` a `updateBatch`.

---

## FÁZE 2H: NAVIGACE A INTEGRACE

### 2H.1 Sidebar aktualizace

Receptury a Vary by měly být v sidebar modulu "Pivovar" již od Sprintu 0/1 (placeholdery). Nyní je propojit na skutečné stránky:

```
Pivovar:
  - Přehled          (/brewery/overview)
  - Partneři         (/brewery/partners)      ← Sprint 1
  - Kontakty         (/brewery/contacts)       ← Sprint 1
  - Suroviny         (/brewery/materials)      ← Sprint 1 (pohled na items)
  - Receptury        (/brewery/recipes)        ← Sprint 2 ★
  - Vary             (/brewery/batches)        ← Sprint 2 ★
  - Zařízení         (/brewery/equipment)      ← Sprint 1
```

### 2H.2 Cross-module links

- RecipeDetail → klik na surovinu → navigace na ItemDetail
- BatchDetail → klik na recepturu → navigace na RecipeDetail
- BatchDetail → klik na tank → navigace na EquipmentDetail
- EquipmentDetail → zobrazit aktuální šarži (link na BatchDetail)

---

## FÁZE 2I: DOKUMENTACE

### 2I.1 Po dokončení každé fáze aktualizovat:

**CHANGELOG.md:**
- Odškrtnout hotové položky v sekci Sprint 2
- Přidat jakékoli odchylky od specifikace

**PRODUCT-SPEC.md:**
- Sekce 4.4 (Receptury): `📋` → `✅`
- Sekce 4.5 (Vary/Šarže): `📋` → `✅`
- Pokud implementace odlišná od spec → aktualizovat spec tak, aby odpovídal realitě

**SYSTEM-DESIGN.md:**
- Aktualizovat pouze pokud se mění architektura nebo datový model oproti specifikaci

---

## ACCEPTANCE CRITERIA (Definice hotovo)

Sprint 2 je hotový když:

### Receptury
1. [ ] DataBrowser zobrazuje seznam receptur (list + card view)
2. [ ] Quick filtry fungují (Vše/Aktivní/Koncepty/Archivované)
3. [ ] Vytvoření nové receptury funguje
4. [ ] Detail receptury — tab Základní údaje: CRUD funguje
5. [ ] Detail receptury — tab Suroviny: přidání/odebrání/úprava surovin funguje
6. [ ] Detail receptury — tab Postup: přidání/odebrání kroků funguje
7. [ ] Rmutovací profil se dá načíst a nahradí kroky
8. [ ] Detail receptury — tab Kalkulace: výpočet OG, IBU, EBC, ABV, cost funguje
9. [ ] Duplikace receptury vytvoří kopii vč. surovin a kroků
10. [ ] Archivace receptury (soft delete) funguje
11. [ ] Pivní styly (BJCP) jsou naplněny a funkční v selectu

### Šarže
12. [ ] DataBrowser zobrazuje seznam várek (list + card view)
13. [ ] Quick filtry fungují
14. [ ] Vytvoření várky z receptury zkopíruje suroviny a kroky
15. [ ] Číslo várky se generuje z číslovací řady
16. [ ] Status workflow funguje: planned → brewing → ... → completed
17. [ ] Při přechodu do brewing se nastaví brew_date a equipment.status → in_use
18. [ ] Při dokončení se nastaví end_brew_date a equipment.status → available
19. [ ] Tab Kroky: zahájení/dokončení kroků funguje
20. [ ] Tab Měření: přidání měření + graf vývoje gravitace
21. [ ] Tab Stáčení: přidání stáčecího řádku funguje
22. [ ] Tab Poznámky: přidání/zobrazení poznámek

### Obecné
23. [ ] Všechny texty přes i18n (cs + en)
24. [ ] TypeScript: strict mode, zero errors, no `any`
25. [ ] `npm run build` projde bez chyb
26. [ ] RLS policies na všech nových tabulkách
27. [ ] Cross-module linky fungují (recept↔šarže, šarže↔tank)
28. [ ] Dokumentace aktualizována (CHANGELOG, PRODUCT-SPEC)

---

## POZNÁMKY PRO CLAUDE CODE

### Co NEIMPLEMENTOVAT v Sprint 2
- **Lot tracking surovin** — přijde ve Sprint 3 (batch_material_lots tabulku vytvořit, ale UI ne)
- **Excise tax výpočty** — přijde ve Sprint 5 (sloupce v tabulce vytvořit, ale logiku ne)
- **Skladové pohyby** — při stáčení se v Sprint 2 nevytváří skladové příjmy/výdeje (přijde ve Sprint 3)
- **Plánování výroby** — kalendář, Gantt — Fáze 2

### Priorita implementace
1. DB schema + migrace (Fáze 2A + 2B) — základ pro vše
2. Receptury backend + frontend (Fáze 2C + 2D) — receptury jsou prerekvizita pro šarže
3. Šarže backend + frontend (Fáze 2E + 2F) — jádro sprintu
4. Equipment synchronizace (Fáze 2G) — propojení
5. Navigace + dokumentace (Fáze 2H + 2I)

### Doporučení pro subagenty
- **Subagent 1:** DB schema (2A + 2B) + migrace + seed beer styles
- **Subagent 2:** Recipes modul (2C + 2D) — kompletní backend + frontend
- **Subagent 3:** Batches modul (2E + 2F) — kompletní backend + frontend
- **Subagent 4:** i18n (cs + en pro recipes + batches)
- **Main agent:** integrace, equipment sync (2G), navigace (2H), dokumentace (2I), review

### Technické poznámky
- Používat `recharts` pro graf měření (je v závislostech z Sprint 0)
- Inline editing v tabulkách surovin/kroků: shadcn `Sheet` nebo inline editable cells
- Item lookup pro suroviny: použít `Command` (shadcn) s vyhledáváním
- Beer style select: seskupený dle beer_style_groups (shadcn `Select` s optgroups nebo `Command`)
- Drag & drop řazení: `@dnd-kit/core` + `@dnd-kit/sortable` (přidat do dependencies)
- Kalkulace: spouštět na klientu pro rychlou odezvu, ukládat snapshot přes server action
