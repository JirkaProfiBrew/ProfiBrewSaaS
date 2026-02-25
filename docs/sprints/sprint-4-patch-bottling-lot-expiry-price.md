# POKYN: Šarže, expirace a výrobní cena na stáčení piva

## ProfiBrew.com | Doplněk k pokyn-naskladneni-piva-explicitni.md
### Datum: 25.02.2026 | Režim: BULK (packaged později)

---

## KONTEXT

Při stáčení a naskladnění piva potřebujeme přenést na příjemku 3 klíčové údaje:
1. **Číslo šarže (lot_number)** — identifikace šarže pro traceability
2. **Datum expirace (expiry_date)** — vypočteno z data stočení + shelf life z receptu
3. **Výrobní cena (unit_price)** — dle nastavení provozovny (pevná / z kalkulace receptu)

Šarže v ProfiBrew = řádek příjemky (lot tracking bez material_lots tabulky).

---

## ČÁST 1: DB MIGRACE

### 1.1 ALTER batches — nová pole

```sql
ALTER TABLE batches
  ADD COLUMN IF NOT EXISTS lot_number TEXT,
  ADD COLUMN IF NOT EXISTS bottled_date DATE;
```

| Pole | Typ | Popis |
|------|-----|-------|
| `lot_number` | TEXT | Číslo šarže, předvyplněno z batch_number bez pomlček |
| `bottled_date` | DATE | Datum stočení — vstup pro výpočet expirace |

**Drizzle schema** (`drizzle/schema/batches.ts`):
```typescript
// V definici batches tabulky přidat:
lotNumber: text("lot_number"),
bottledDate: date("bottled_date"),
```

### 1.2 ALTER recipes — nové pole

```sql
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER;
```

| Pole | Typ | Popis |
|------|-----|-------|
| `shelf_life_days` | INTEGER | Trvanlivost piva ve dnech (od data stočení) |

**Drizzle schema** (`drizzle/schema/recipes.ts`):
```typescript
// V definici recipes tabulky přidat:
shelfLifeDays: integer("shelf_life_days"),
```

### 1.3 Migrace — backfill lot_number

```sql
-- Předvyplnit lot_number z batch_number pro existující várky
UPDATE batches
SET lot_number = REPLACE(batch_number, '-', '')
WHERE lot_number IS NULL;
```

---

## ČÁST 2: ŠARŽE (LOT NUMBER)

### 2.1 Batch hlavička — nové pole

Na formuláři detailu várky (hlavička) přidat pole:

| Pole | Label | Typ | Default | Editovatelné |
|------|-------|-----|---------|-------------|
| `lot_number` | Číslo šarže | text input | `batchNumber.replace(/-/g, '')` | ✅ Ano, vždy |

**Předvyplnění:** Při vytváření nové várky (`createBatch`):
```typescript
const lotNumber = batchNumber.replace(/-/g, '');
// V-2026-001 → V2026001
```

**Pozice na formuláři:** Vedle batch_number (ve stejném řádku). Editovatelné i po naskladnění — user může potřebovat sloučit šarže nebo změnit číslování.

### 2.2 Batch types

Rozšířit `Batch` interface v `src/modules/batches/types.ts`:
```typescript
export interface Batch {
  // ... existující pole ...
  lotNumber: string | null;
  bottledDate: string | null; // ISO date string
}
```

### 2.3 Přenos do příjemky

V `createProductionReceipt()` (z pokyn-naskladneni-piva-explicitni.md):
```typescript
// Na každý řádek příjemky:
lotNumber: batch.lotNumber,  // stock_issue_lines.lot_number
```

---

## ČÁST 3: EXPIRACE

### 3.1 Recipe — pole shelf_life_days

Na formuláři receptu přidat pole:

| Pole | Label CZ | Label EN | Typ | Pozice |
|------|---------|---------|-----|--------|
| `shelf_life_days` | Trvanlivost (dny) | Shelf Life (days) | integer input | Sekce "Základní informace", za `durationConditioningDays` |

**Kopírování do batch snapshotu:** Při vytvoření várky se recept duplikuje (`duplicateRecipe`). Pole `shelf_life_days` se kopíruje automaticky (je součástí recipe tabulky). Na kopii receptu vztažené k várce je editovatelné — sládek může pro konkrétní várku upravit.

### 3.2 Recipe types

Rozšířit `Recipe` interface v `src/modules/recipes/types.ts`:
```typescript
export interface Recipe {
  // ... existující pole ...
  shelfLifeDays: number | null;
}
```

Rozšířit `mapRecipeRow()` v `src/modules/recipes/actions.ts`:
```typescript
shelfLifeDays: row.shelfLifeDays,
```

### 3.3 Tab Stáčení — Datum stočení

Na tab Stáčení (bottling) přidat do hlavičky (NAD tabulkou řádků):

| Pole | Label CZ | Typ | Default | Editovatelné |
|------|---------|-----|---------|-------------|
| `bottled_date` | Datum stočení | date picker | `today()` | ✅ Ano |

**Uložení:** `bottled_date` se ukládá na batches tabulku (`batches.bottled_date`). Ukládá se společně s bottling_items při kliknutí "Uložit" (stávající save flow).

### 3.4 Expirace na řádcích stáčení — dynamický výpočet

Na každém řádku tabulky stáčení zobrazit **computed sloupec**:

| Sloupec | Label | Výpočet | Editovatelné |
|---------|-------|---------|-------------|
| Expirace | Expirace | `bottled_date + recipe.shelf_life_days` | ❌ Ne (readonly) |

**Logika:**
```typescript
// Na klientu (React computed):
const expiryDate = useMemo(() => {
  if (!bottledDate || !recipe?.shelfLifeDays) return null;
  const d = new Date(bottledDate);
  d.setDate(d.getDate() + recipe.shelfLifeDays);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}, [bottledDate, recipe?.shelfLifeDays]);
```

**Zobrazení:** Formátovaný datum. Pokud `shelf_life_days` na receptu není vyplněn → zobrazit "—" (pomlčku).

### 3.5 Přenos do příjemky

V `createProductionReceipt()`:
```typescript
// Výpočet expirace
const expiryDate = batch.bottledDate && recipe.shelfLifeDays
  ? addDays(new Date(batch.bottledDate), recipe.shelfLifeDays)
  : null;

// Na každý řádek příjemky:
expiryDate: expiryDate ? formatISO(expiryDate, { representation: 'date' }) : null,
```

`addDays` z `date-fns` (nebo manuální Date manipulace).

---

## ČÁST 4: VÝROBNÍ CENA

### 4.1 Přejmenování labelu na Items

**Pouze i18n změna**, žádná DB/schema změna.

`src/i18n/messages/cs/items.json`:
```json
"costPrice": "Výrobní cena"
```

`src/i18n/messages/en/items.json`:
```json
"costPrice": "Production Cost"
```

**Kde se label zobrazuje:**
- Item detail formulář — sekce Pricing
- Item browser — sloupec
- Všude kde se referencuje `items.columns.costPrice` nebo `items.detail.fields.costPrice`

### 4.2 Resoluce ceny dle shop settings

Funkce pro získání výrobní ceny za litr:

```typescript
/**
 * Získat výrobní cenu za litr piva pro naskladnění.
 * Dle beer_pricing_mode v shop settings.
 */
async function getProductionUnitPrice(
  tenantId: string,
  batchId: string,
  shopSettings: ShopSettings
): Promise<number | null> {
  const mode = shopSettings.beer_pricing_mode ?? 'fixed';

  if (mode === 'fixed') {
    // Cena ze skladové karty výrobní položky (items.cost_price)
    const batch = await getBatchBasic(tenantId, batchId);
    if (!batch?.itemId) return null;
    const item = await getItemBasic(tenantId, batch.itemId);
    return item?.costPrice ? parseFloat(item.costPrice) : null;
  }

  if (mode === 'recipe_calc') {
    // Cena z kalkulace receptu várky
    const batch = await getBatchBasic(tenantId, batchId);
    if (!batch?.recipeId) return null;
    const recipe = await getRecipeBasic(tenantId, batch.recipeId);
    if (!recipe?.costPrice || !recipe?.batchSizeL) return null;
    const totalCost = parseFloat(recipe.costPrice);
    const volume = parseFloat(recipe.batchSizeL);
    return volume > 0 ? Math.round((totalCost / volume) * 100) / 100 : null;
  }

  // mode === 'actual_costs' → budoucí rozšíření, zatím fallback na null
  return null;
}
```

**Poznámka k `recipe_calc`:**
- `recipe.costPrice` = celková cena surovin za várku (uloženo při kalkulaci receptu)
- `recipe.batchSizeL` = plánovaný objem várky
- `costPerLiter = recipe.costPrice / recipe.batchSizeL`
- Batch má vlastní kopii receptu → cena reflektuje případné úpravy surovin na kopii

### 4.3 Zobrazení ceny na tab Stáčení

Na tab Stáčení zobrazit **readonly info** nad tabulkou řádků (vedle Datum stočení):

```
┌─────────────────────────────────────────────────────┐
│ Datum stočení: [2026-03-15]   Výrobní cena: 12,50 Kč/L │
│                               (dle kalkulace receptu)    │
└─────────────────────────────────────────────────────┘
```

| Pole | Label | Typ | Pozn. |
|------|-------|-----|-------|
| Výrobní cena | Výrobní cena | readonly text | `{price} Kč/L` |
| Zdroj ceny | (popisek) | readonly muted text | "(dle skladové karty)" nebo "(dle kalkulace receptu)" |

**Logika na klientu:**
```typescript
// Načíst shop settings → beer_pricing_mode
// Pokud 'fixed' → items.cost_price výrobní položky
// Pokud 'recipe_calc' → recipe.costPrice / recipe.batchSizeL
// Zobrazit s 2 desetinnými místy + zdroj
```

**Na řádcích stáčení** cenu nezobrazujeme (jeden řádek v bulk režimu = celý objem, cena je za litr — zobrazení v hlavičce stačí).

### 4.4 Přenos do příjemky

V `createProductionReceipt()`:
```typescript
const unitPrice = await getProductionUnitPrice(tenantId, batchId, shopSettings);

// Na řádek příjemky:
unitPrice: unitPrice ? String(unitPrice) : null,
totalCost: unitPrice && issuedQty
  ? String(Math.round(unitPrice * parseFloat(issuedQty) * 100) / 100)
  : null,
```

**Pro bulk:** 1 řádek, `issuedQty` = objem v litrech, `unitPrice` = cena za litr.

---

## ČÁST 5: AKTUALIZACE STÁVAJÍCÍCH FLOW

### 5.1 createBatch — lot_number default

V `createBatch()` (`src/modules/batches/actions.ts`):
```typescript
// Po vygenerování batchNumber:
const lotNumber = batchNumber.replace(/-/g, '');

// INSERT do batches:
lotNumber,
```

### 5.2 duplicateRecipe — shelf_life_days

Ověřit, že `duplicateRecipe()` kopíruje i `shelf_life_days`. Pokud duplikace kopíruje všechny sloupce recipes tabulky → automaticky se zkopíruje. Pokud je explicitní SELECT → přidat.

### 5.3 Tab Stáčení — rozšířený save

Při uložení stáčení (save bottling items) uložit současně:
- `batches.bottled_date` — z date pickeru
- `bottling_items[]` — řádky stáčení (stávající logika)

### 5.4 createProductionReceipt — kompletní update

Shrnutí všech hodnot přenášených na příjemku:

| Příjemka pole | Zdroj |
|--------------|-------|
| `stock_issue_lines.lot_number` | `batches.lot_number` |
| `stock_issue_lines.expiry_date` | `batches.bottled_date + recipe.shelf_life_days` |
| `stock_issue_lines.unit_price` | `getProductionUnitPrice()` dle shop settings |
| `stock_issue_lines.total_cost` | `unit_price × issued_qty` |
| `stock_issues.date` | `batches.bottled_date` (datum příjemky = datum stočení) |

**Datum příjemky:** `stock_issues.date` by měl být `bottled_date` (ne datum kliknutí na "Naskladnit"). Logicky: pivo bylo naskladněno v den stočení.

---

## ČÁST 6: I18N

### 6.1 Batch i18n

`src/i18n/messages/cs/batches.json`:
```json
{
  "detail": {
    "fields": {
      "lotNumber": "Číslo šarže",
      "bottledDate": "Datum stočení"
    }
  },
  "bottling": {
    "bottledDate": "Datum stočení",
    "productionPrice": "Výrobní cena",
    "priceSource": {
      "fixed": "(dle skladové karty)",
      "recipe_calc": "(dle kalkulace receptu)"
    },
    "expiryDate": "Expirace",
    "perLiter": "Kč/L"
  }
}
```

`src/i18n/messages/en/batches.json`:
```json
{
  "detail": {
    "fields": {
      "lotNumber": "Lot Number",
      "bottledDate": "Bottling Date"
    }
  },
  "bottling": {
    "bottledDate": "Bottling Date",
    "productionPrice": "Production Cost",
    "priceSource": {
      "fixed": "(from item card)",
      "recipe_calc": "(from recipe calculation)"
    },
    "expiryDate": "Expiry Date",
    "perLiter": "/L"
  }
}
```

### 6.2 Recipe i18n

`src/i18n/messages/cs/recipes.json` — do sekce `detail.fields`:
```json
"shelfLifeDays": "Trvanlivost (dny)"
```

`src/i18n/messages/en/recipes.json` — do sekce `detail.fields`:
```json
"shelfLifeDays": "Shelf Life (days)"
```

### 6.3 Items i18n — přejmenování

`src/i18n/messages/cs/items.json`:
```json
"costPrice": "Výrobní cena"
```

`src/i18n/messages/en/items.json`:
```json
"costPrice": "Production Cost"
```

_(Přejmenováno z "Kalkulační cena" / "Cost Price")_

---

## ČÁST 7: VALIDACE

### 7.1 Batch schema

V `src/modules/batches/schema.ts`:
```typescript
// Rozšířit batch create/update schema:
lotNumber: z.string().max(50).optional().nullable(),
bottledDate: z.string().date().optional().nullable(),
```

### 7.2 Recipe schema

V `src/modules/recipes/schema.ts`:
```typescript
// Rozšířit recipe create/update schema:
shelfLifeDays: z.number().int().min(1).max(3650).optional().nullable(),
```

### 7.3 Bottling save validace

Při uložení stáčení (před "Naskladnit"):
- `bottled_date` povinné pokud existují bottling_items (warn, ne block)
- Pokud `bottled_date` > today → warning "Datum stočení je v budoucnosti" (neblokuje)

---

## ČÁST 8: AKCEPTAČNÍ KRITÉRIA

### Šarže
- [ ] `batches.lot_number` — nový sloupec, migrace backfill
- [ ] Předvyplněno z batch_number bez pomlček při vytvoření várky
- [ ] Editovatelné na hlavičce detailu várky
- [ ] Přeneseno do `stock_issue_lines.lot_number` při naskladnění

### Expirace
- [ ] `recipes.shelf_life_days` — nový sloupec
- [ ] Zobrazeno na formuláři receptu + kopie receptu (editovatelné)
- [ ] `batches.bottled_date` — nový sloupec
- [ ] Date picker na tab Stáčení, default today
- [ ] Expirace na řádcích = bottled_date + shelf_life_days (readonly, computed)
- [ ] Přeneseno do `stock_issue_lines.expiry_date` při naskladnění (natvrdo uložené)

### Výrobní cena
- [ ] Label items.cost_price přejmenován na "Výrobní cena" / "Production Cost"
- [ ] `getProductionUnitPrice()` — resoluce dle shop settings beer_pricing_mode
- [ ] Mode `fixed`: cena z items.cost_price výrobní položky
- [ ] Mode `recipe_calc`: recipe.costPrice / recipe.batchSizeL
- [ ] Cena zobrazena readonly na tab Stáčení (s popiskem zdroje)
- [ ] Přenesena do `stock_issue_lines.unit_price` při naskladnění
- [ ] `stock_issue_lines.total_cost` = unit_price × issued_qty

### Příjemka
- [ ] `stock_issues.date` = `batches.bottled_date`
- [ ] Řádek má lot_number, expiry_date, unit_price, total_cost

---

## VAZBA NA PŘEDCHOZÍ POKYNY

**DOPLŇUJE (beze změny):**
- `pokyn-naskladneni-piva-explicitni.md` — přidává lot/expiry/price do createProductionReceipt()
- Batch detail hlavička — přidává pole lot_number
- Recipe detail — přidává pole shelf_life_days
- Tab Stáčení — přidává bottled_date, cenu (readonly), expiraci na řádcích

**NEMĚNÍ:**
- Logiku tlačítka "Naskladnit" (stav enabled/disabled)
- Duplicitní kontrolu příjemky
- onBatchCompleted() chování
- Sumář stáčení (Stočeno / Z receptury / Z tanku / Rozdíl)
