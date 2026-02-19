# SPRINT 2 — PATCH: MĚRNÉ JEDNOTKY (Units of Measurement)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 19.02.2026

---

## CÍL PATCHE

Zavést systémový číselník měrných jednotek, napojit ho na položky (items) a receptury (recipe_items), a zajistit správnou konverzi při výpočtu IBU. Po aplikaci patche: slady mají vždy kg (readonly), chmely mají nezávislou MJ pro sklad a recepturu, IBU kalkulace respektuje zvolenou MJ.

**Odhad:** 2-4 hodiny práce

**Závisí na:** Sprint 2 musí být hotový (recipes, recipe_items, batches, kalkulace)

---

## P1: DB SCHEMA

### P1.1 Tabulka units

**Soubor:** `drizzle/schema/units.ts`

```typescript
export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').unique().notNull(),           // 'kg', 'g', 'l', 'ml', 'ks'
  nameCs: text('name_cs').notNull(),               // 'kilogram'
  nameEn: text('name_en').notNull(),               // 'kilogram'
  symbol: text('symbol').notNull(),                // 'kg'
  category: text('category').notNull(),            // 'weight' | 'volume' | 'count'
  baseUnitCode: text('base_unit_code'),            // NULL = je base unit; 'kg' pro g
  toBaseFactor: numeric('to_base_factor'),         // g→kg = 0.001, ml→l = 0.001
  isSystem: boolean('is_system').default(true),
  tenantId: uuid('tenant_id').references(() => tenants.id),  // NULL = systémové
  sortOrder: integer('sort_order').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
```

### P1.2 Seed data

**Soubor:** `drizzle/seed/units.ts`

```typescript
const systemUnits = [
  { code: 'kg',  nameCs: 'kilogram',  nameEn: 'kilogram',   symbol: 'kg',  category: 'weight', baseUnitCode: null,  toBaseFactor: 1,     sortOrder: 1 },
  { code: 'g',   nameCs: 'gram',      nameEn: 'gram',       symbol: 'g',   category: 'weight', baseUnitCode: 'kg',  toBaseFactor: 0.001, sortOrder: 2 },
  { code: 'l',   nameCs: 'litr',      nameEn: 'liter',      symbol: 'l',   category: 'volume', baseUnitCode: null,  toBaseFactor: 1,     sortOrder: 3 },
  { code: 'ml',  nameCs: 'mililitr',  nameEn: 'milliliter',  symbol: 'ml',  category: 'volume', baseUnitCode: 'l',   toBaseFactor: 0.001, sortOrder: 4 },
  { code: 'ks',  nameCs: 'kus',       nameEn: 'piece',      symbol: 'ks',  category: 'count',  baseUnitCode: null,  toBaseFactor: 1,     sortOrder: 5 },
]
```

Seed musí být idempotentní (INSERT ... ON CONFLICT DO NOTHING).

### P1.3 RLS

```sql
-- Systémové jednotky (tenant_id IS NULL): SELECT pro všechny authenticated users
CREATE POLICY "units_system_read" ON units
  FOR SELECT USING (tenant_id IS NULL);

-- Tenant custom units (budoucnost): standardní tenant izolace
CREATE POLICY "units_tenant_read" ON units
  FOR SELECT USING (tenant_id = auth.jwt()->>'tenant_id');
```

### P1.4 Rozšíření items tabulky

**Migrace:**

```sql
-- Přidat FK sloupce
ALTER TABLE items ADD COLUMN unit_id UUID REFERENCES units(id);
ALTER TABLE items ADD COLUMN recipe_unit_id UUID REFERENCES units(id);

-- Migrovat stávající textová data
-- Pokud existující items mají textový sloupec 'unit':
UPDATE items SET unit_id = (SELECT id FROM units WHERE code = 'kg')
  WHERE unit IS NULL OR unit = '' OR unit = 'kg';
UPDATE items SET unit_id = (SELECT id FROM units WHERE code = items.unit)
  WHERE unit IS NOT NULL AND unit != '' AND unit != 'kg';

-- Pro slady (grain): vynutit kg
UPDATE items SET unit_id = (SELECT id FROM units WHERE code = 'kg')
  WHERE material_type = 'grain';

-- Pro chmely: default recipe_unit = g (typicky se receptury dávají v gramech)
UPDATE items SET recipe_unit_id = (SELECT id FROM units WHERE code = 'g')
  WHERE material_type = 'hop' AND recipe_unit_id IS NULL;

-- Starý textový sloupec ponechat (backward compatibility), ale přestat používat v kódu
```

### P1.5 Rozšíření recipe_items tabulky

**Migrace:**

```sql
ALTER TABLE recipe_items ADD COLUMN unit_id UUID REFERENCES units(id);

-- Backfill: přiřadit MJ dle item.unit_id (pro slady) resp. item.recipe_unit_id (pro chmely)
UPDATE recipe_items ri SET unit_id = COALESCE(
  (SELECT i.recipe_unit_id FROM items i WHERE i.id = ri.item_id AND i.recipe_unit_id IS NOT NULL),
  (SELECT i.unit_id FROM items i WHERE i.id = ri.item_id)
);
```

---

## P2: TYPY A HELPER FUNKCE

### P2.1 Unit types

**Soubor:** `src/modules/units/types.ts`

```typescript
export interface Unit {
  id: string
  code: string
  nameCs: string
  nameEn: string
  symbol: string
  category: 'weight' | 'volume' | 'count'
  baseUnitCode: string | null
  toBaseFactor: number
  isSystem: boolean
}

// Které MJ jsou povolené pro kterou kategorii materiálu
export const ALLOWED_UNITS: Record<string, string[]> = {
  grain:   ['kg'],                        // Slad: VŽDY kg, readonly
  hop:     ['kg', 'g'],                   // Chmel: kg nebo g
  yeast:   ['g', 'ks'],                   // Kvasnice: g nebo ks
  adjunct: ['kg', 'g', 'l', 'ml'],       // Přísady: váha nebo objem
  other:   ['kg', 'g', 'l', 'ml', 'ks'], // Ostatní: vše
}

// Které materiály mají oddělenou recipe MJ
export const HAS_RECIPE_UNIT = ['hop']
```

### P2.2 Konverzní utility

**Soubor:** `src/modules/units/conversion.ts`

```typescript
/**
 * Převede množství do base unit (kg pro weight, l pro volume)
 */
export function toBaseUnit(amount: number, unit: Unit): number {
  if (!unit.toBaseFactor) return amount  // Už je base unit
  return amount * unit.toBaseFactor
}

/**
 * Převede množství z base unit do cílové unit
 */
export function fromBaseUnit(amount: number, unit: Unit): number {
  if (!unit.toBaseFactor) return amount
  return amount / unit.toBaseFactor
}

/**
 * Převede mezi dvěma jednotkami (přes base unit)
 */
export function convertUnit(amount: number, fromUnit: Unit, toUnit: Unit): number {
  if (fromUnit.code === toUnit.code) return amount
  const base = toBaseUnit(amount, fromUnit)
  return fromBaseUnit(base, toUnit)
}
```

### P2.3 Server action pro načtení units

**Soubor:** `src/modules/units/actions.ts`

```typescript
'use server'

export async function getUnits(): Promise<Unit[]>
export async function getUnitsByCategory(category: 'weight' | 'volume' | 'count'): Promise<Unit[]>
export async function getUnitByCode(code: string): Promise<Unit | null>
```

Výsledky cachovat — systémové units se nemění. Použít `unstable_cache` nebo jednoduše načíst jednou při renderování stránky.

---

## P3: UI ZMĚNY — ITEM DETAIL

### P3.1 Logika zobrazení MJ na Item formuláři

Nahradit stávající textový input `unit` za select(y) vázané na číselník:

**Pro `material_type = 'grain'` (slad):**
```
MJ: [kg]  ← Select, disabled=true, value předvyplněno na 'kg'
```
Při vytvoření nového sladu: automaticky nastavit `unit_id` na kg UUID. Pole readonly/disabled.

**Pro `material_type = 'hop'` (chmel):**
```
MJ sklad:     [kg ▾]  ← Select z ALLOWED_UNITS['hop'] = ['kg', 'g']
MJ receptury: [g  ▾]  ← Select z ALLOWED_UNITS['hop'] = ['kg', 'g'], default 'g'
```
Dvě oddělené pole. `recipe_unit_id` viditelné POUZE pro chmely.

**Pro `material_type = 'yeast'` (kvasnice):**
```
MJ: [g ▾]  ← Select: g, ks
```

**Pro `material_type = 'adjunct'` (přísady):**
```
MJ: [kg ▾]  ← Select: kg, g, l, ml
```

**Pro `material_type = 'other'` / NULL:**
```
MJ: [kg ▾]  ← Select: kg, g, l, ml, ks
```

### P3.2 Podmíněná viditelnost recipe_unit_id

Pole "MJ receptury" se zobrazuje **POUZE** pokud `material_type` je v `HAS_RECIPE_UNIT` (momentálně jen 'hop').

Implementace: conditional visibility na FormSection nebo v custom renderování item formuláře.

### P3.3 Auto-fill při změně material_type

Když user změní `material_type` na formuláři:
- `grain` → auto-set unit_id = kg, clear recipe_unit_id, disable unit select
- `hop` → auto-set unit_id = kg (default), recipe_unit_id = g (default), enable oba selecty
- `yeast` → auto-set unit_id = g, clear recipe_unit_id
- `adjunct` → auto-set unit_id = kg, clear recipe_unit_id
- `other` → ponechat stávající nebo kg default

---

## P4: UI ZMĚNY — RECEPTURY

### P4.1 Recipe Items tabulka — zobrazení MJ

V tabulce surovin na receptuře přidat sloupec MJ za množství:

```
| Surovina              | Množství | MJ | Alpha | IBU  | Čas  |
|-----------------------|----------|----|-------|------|------|
| Slad plzeňský         | 5.20     | kg |       |      |      |
| Slad karamelový       | 0.30     | kg |       |      |      |
| Chmel Žatecký         | 150      | g  | 3.5   | 28.4 | 60   |
| Chmel Citra (dry hop) | 50       | g  | 12.0  | 0.0  | 0    |
```

MJ sloupec je **readonly** — zobrazuje symbol z `recipe_items.unit_id → units.symbol`.

### P4.2 Přidání položky do receptury — předvyplnění MJ

Při přidání nové suroviny do receptury (AddIngredientDialog / inline):

```typescript
function getDefaultRecipeUnit(item: Item): string {
  // Chmel: použij recipe_unit_id (pokud nastaveno), jinak unit_id
  if (item.materialType === 'hop' && item.recipeUnitId) {
    return item.recipeUnitId
  }
  // Vše ostatní: použij unit_id
  return item.unitId
}
```

Hodnota se zapíše do `recipe_items.unit_id` při vytvoření řádku.

### P4.3 Kalkulace IBU — konverze

**Upravit stávající IBU kalkulaci** (pravděpodobně v `src/modules/recipes/lib/calculations.ts`):

```typescript
import { toBaseUnit } from '@/modules/units/conversion'

function calculateHopIBU(
  hopAmount: number,           // Množství v recipe unit
  hopUnit: Unit,               // MJ z recipe_items.unit_id
  alphaAcid: number,           // % alpha acid
  boilTimeMin: number,         // Čas varu v minutách
  batchSizeL: number,          // Objem várky v litrech
  boilGravity: number          // Gravita při varu
): number {
  // Tinseth vzorec pracuje s kg
  const hopKg = toBaseUnit(hopAmount, hopUnit)

  // Bigness factor
  const bignessFactor = 1.65 * Math.pow(0.000125, boilGravity - 1)
  // Boil time factor
  const boilTimeFactor = (1 - Math.exp(-0.04 * boilTimeMin)) / 4.15
  // Utilization
  const utilization = bignessFactor * boilTimeFactor
  // IBU
  const ibu = (hopKg * 1000 * utilization * alphaAcid) / batchSizeL

  return Math.round(ibu * 10) / 10
}
```

**KRITICKÉ:** Stávající kalkulace pravděpodobně předpokládá vstup v gramech nebo kg bez konverze. Najít aktuální kód, zjistit jaké jednotky očekává, a přidat `toBaseUnit()` konverzi na vstupu.

### P4.4 Kalkulace cost_price — konverze

Pokud se cost_price počítá z ceny surovin, konverze je nutná i tam:

```typescript
// Cena suroviny je per unit_id (skladová MJ)
// Množství v receptuře je per recipe_unit_id
// Pro výpočet nákladů: převést recipe množství do skladové MJ

const recipeAmountInStockUnit = convertUnit(
  recipeItem.amount,
  recipeItem.unit,      // recipe MJ (např. g)
  item.unit             // skladová MJ (např. kg)
)
const lineCost = recipeAmountInStockUnit * item.calcPrice
```

---

## P5: MIGRACE STÁVAJÍCÍCH DAT

### P5.1 Migrační sekvence

Pořadí migrace je důležité:

1. **Vytvořit tabulku `units`** + seed systémových jednotek
2. **ALTER items** — přidat unit_id, recipe_unit_id
3. **Backfill items** — z textového pole unit do FK:
   - Pokud `unit` text = 'kg' nebo prázdné → unit_id = kg UUID
   - Pokud `unit` text = 'g' → unit_id = g UUID
   - Pokud `unit` text = 'l' → unit_id = l UUID
   - Grain items → force unit_id = kg
   - Hop items → force recipe_unit_id = g (default)
4. **ALTER recipe_items** — přidat unit_id
5. **Backfill recipe_items** — z item.recipe_unit_id (chmel) nebo item.unit_id (ostatní)
6. **Textový sloupec `unit`** na items: ponechat (backward compat), přestat používat v kódu

### P5.2 Validace migrace

Po migraci zkontrolovat:
```sql
-- Žádný item bez unit_id
SELECT COUNT(*) FROM items WHERE unit_id IS NULL;  -- Mělo by být 0

-- Všechny grain items mají kg
SELECT COUNT(*) FROM items WHERE material_type = 'grain' AND unit_id != (SELECT id FROM units WHERE code = 'kg');  -- 0

-- Všechny hop items mají recipe_unit_id
SELECT COUNT(*) FROM items WHERE material_type = 'hop' AND recipe_unit_id IS NULL;  -- 0

-- Všechny recipe_items mají unit_id
SELECT COUNT(*) FROM recipe_items WHERE unit_id IS NULL;  -- 0
```

---

## AKCEPTAČNÍ KRITÉRIA

1. [ ] Tabulka `units` existuje s 5 systémovými záznamy (kg, g, l, ml, ks)
2. [ ] Items mají `unit_id` FK místo textového pole
3. [ ] Items slad (grain): MJ = kg, readonly, auto-předvyplněné
4. [ ] Items chmel (hop): dvě MJ — sklad (kg/g) + receptura (kg/g), default receptura = g
5. [ ] Items ostatní: jedna MJ, select dle kategorie
6. [ ] Změna material_type auto-nastaví správné MJ defaults
7. [ ] Recipe items: sloupec MJ se zobrazuje v tabulce surovin
8. [ ] Přidání suroviny do receptury: MJ se předvyplní z item.recipe_unit_id (chmel) resp. item.unit_id
9. [ ] IBU kalkulace: správný výsledek nezávisle na tom, zda chmel je v g nebo kg
10. [ ] Cost kalkulace: správná konverze mezi skladovou a recepturovou MJ
11. [ ] Stávající data migrována (žádný item bez unit_id)
12. [ ] `npm run build` projde bez chyb
13. [ ] RLS na units tabulce funguje
