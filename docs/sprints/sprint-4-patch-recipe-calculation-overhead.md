# POKYN: Rozšíření kalkulace receptu — výrobní cena piva

## ProfiBrew.com | Doplněk kalkulačního enginu
### Datum: 25.02.2026

---

## KONTEXT

Kalkulace receptu aktuálně počítá pouze cenu surovin (SUM množství × items.cost_price). Potřebujeme:

1. **Zohlednit zdroj ceny surovin** dle `ingredient_pricing_mode` z parametrů provozovny
2. **Přidat režijní náklady** — režie suroviny (%), náklady var (fix), režie (fix)
3. **Výsledná `recipes.costPrice`** = plná výrobní cena celé várky (suroviny + overhead)

**Vzorec výrobní ceny:**
```
Cena surovin (ingredientsCost)                    — dle ingredient_pricing_mode
+ Režie suroviny (ingredientsCost × overhead_pct / 100)
+ Náklady var (brew_cost_czk)                      — fix z parametrů
+ Režie (overhead_czk)                             — fix z parametrů
────────────────────────────────────────────────────
= Celková výrobní cena (totalProductionCost)

Výrobní cena za litr = totalProductionCost / batchSizeL
```

---

## ČÁST 1: RESOLUCE CENY SUROVIN

### 1.1 Ingredient pricing mode

Parametr z shop settings: `ingredient_pricing_mode`:

| Mód | Zdroj ceny | Odkud |
|-----|-----------|-------|
| `calc_price` (default) | Výrobní cena ze skladové karty | `items.cost_price` |
| `avg_stock` | Průměrná skladová cena | `items.avg_price` |
| `last_purchase` | Poslední nákupní cena | Poslední potvrzená příjemka pro danou položku |

### 1.2 Nová helper funkce

```typescript
// src/modules/recipes/price-resolver.ts

import { db } from "@/lib/db";
import { items } from "@/../drizzle/schema/items";
import { stockIssueLines, stockIssues } from "@/../drizzle/schema/stock";
import { eq, and, desc, sql } from "drizzle-orm";
import type { ShopSettings } from "@/modules/shops/types";

export interface ResolvedItemPrice {
  itemId: string;
  price: number | null;     // Cena za base unit (kg/l)
  source: string;           // 'cost_price' | 'avg_price' | 'last_purchase'
}

/**
 * Resolver cen surovin dle ingredient_pricing_mode.
 * Vrací mapu itemId → cena za base unit.
 */
export async function resolveIngredientPrices(
  tenantId: string,
  itemIds: string[],
  mode: ShopSettings["ingredient_pricing_mode"]
): Promise<Map<string, ResolvedItemPrice>> {
  const result = new Map<string, ResolvedItemPrice>();

  if (mode === "calc_price" || !mode) {
    // Výrobní cena ze skladové karty
    const rows = await db
      .select({ id: items.id, costPrice: items.costPrice })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), sql`${items.id} = ANY(${itemIds})`));

    for (const row of rows) {
      result.set(row.id, {
        itemId: row.id,
        price: row.costPrice ? parseFloat(row.costPrice) : null,
        source: "cost_price",
      });
    }
  } else if (mode === "avg_stock") {
    // Průměrná skladová cena
    const rows = await db
      .select({ id: items.id, avgPrice: items.avgPrice })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), sql`${items.id} = ANY(${itemIds})`));

    for (const row of rows) {
      result.set(row.id, {
        itemId: row.id,
        price: row.avgPrice ? parseFloat(row.avgPrice) : null,
        source: "avg_price",
      });
    }
  } else if (mode === "last_purchase") {
    // Poslední nákupní cena z potvrzené příjemky
    // Pro každý item: najdi poslední potvrzený příjmový řádek
    for (const itemId of itemIds) {
      const row = await db
        .select({ unitPrice: stockIssueLines.unitPrice })
        .from(stockIssueLines)
        .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
        .where(
          and(
            eq(stockIssueLines.tenantId, tenantId),
            eq(stockIssueLines.itemId, itemId),
            eq(stockIssues.status, "confirmed"),
            sql`${stockIssues.movement_type} = 'receipt'`
          )
        )
        .orderBy(desc(stockIssues.date))
        .limit(1);

      result.set(itemId, {
        itemId,
        price: row[0]?.unitPrice ? parseFloat(row[0].unitPrice) : null,
        source: "last_purchase",
      });
    }
  }

  return result;
}
```

**Fallback logika:** Pokud pro daný mód cena neexistuje (avg_price je NULL, žádná příjemka), fallback na `items.cost_price`. Implementovat v `calculateAndSaveRecipe()`.

### 1.3 Optimalizace last_purchase

Varianta s N dotazy (per item) je OK pro MVP (recept má typicky 5-15 surovin). Pro budoucnost lze optimalizovat jedním dotazem s window function.

---

## ČÁST 2: ROZŠÍŘENÍ KALKULAČNÍHO ENGINU

### 2.1 Rozšíření RecipeCalculationResult

V `src/modules/recipes/types.ts`:

```typescript
export interface RecipeCalculationResult {
  // --- Stávající pivovarské parametry (beze změny) ---
  og: number;
  fg: number;
  abv: number;
  ibu: number;
  ebc: number;

  // --- Nákladová kalkulace (ROZŠÍŘENO) ---
  ingredientsCost: number;         // Celková cena surovin
  ingredientOverheadPct: number;   // Použitý % režie (pro zobrazení)
  ingredientOverheadCost: number;  // ingredientsCost × overhead_pct / 100
  brewCost: number;                // Náklady var (fix)
  overheadCost: number;            // Režie (fix)
  totalProductionCost: number;     // Plná výrobní cena várky
  costPerLiter: number;            // totalProductionCost / batchSizeL
  pricingMode: string;             // Použitý ingredient_pricing_mode

  // --- Rozpad per surovina (beze změny) ---
  ingredients: {
    itemId: string;
    name: string;
    amount: number;
    cost: number;
    priceSource: string;           // NOVÉ: 'cost_price' | 'avg_price' | 'last_purchase'
  }[];

  // --- DEPRECATED (zpětná kompatibilita) ---
  costPrice: number;               // = totalProductionCost (pro zpětnou kompatibilitu)
}
```

### 2.2 Rozšíření calculateAll()

V `src/modules/recipes/utils.ts` — funkce `calculateAll()`:

Přidat nové vstupní parametry:

```typescript
export interface OverheadInputs {
  overheadPct: number;    // % režie suroviny (default 0)
  overheadCzk: number;    // Režie fix CZK (default 0)
  brewCostCzk: number;    // Náklady var fix CZK (default 0)
}

export function calculateAll(
  ingredients: IngredientInput[],
  volumeL: number,
  fgPlato?: number,
  overhead?: OverheadInputs    // NOVÝ optional parametr
): RecipeCalculationResult {
  // ... stávající výpočty OG, IBU, EBC, ABV ...

  const { total: ingredientsCost, perItem } = calculateCost(ingredients);

  // Overhead výpočet
  const oh = overhead ?? { overheadPct: 0, overheadCzk: 0, brewCostCzk: 0 };
  const ingredientOverheadCost = Math.round(ingredientsCost * oh.overheadPct / 100 * 100) / 100;
  const totalProductionCost = Math.round(
    (ingredientsCost + ingredientOverheadCost + oh.brewCostCzk + oh.overheadCzk) * 100
  ) / 100;
  const costPerLiter = volumeL > 0
    ? Math.round((totalProductionCost / volumeL) * 100) / 100
    : 0;

  return {
    og, fg, abv, ibu, ebc,
    ingredientsCost,
    ingredientOverheadPct: oh.overheadPct,
    ingredientOverheadCost,
    brewCost: oh.brewCostCzk,
    overheadCost: oh.overheadCzk,
    totalProductionCost,
    costPerLiter,
    pricingMode: "calc_price", // bude přepsáno v actions.ts
    ingredients: perItem,
    // Zpětná kompatibilita:
    costPrice: totalProductionCost,
  };
}
```

**DŮLEŽITÉ:** Stávající volání `calculateAll(ingredients, volume, fg)` bez overhead parametru funguje beze změny — overhead defaults to 0, výsledek = jen surovinová cena. Žádný breaking change.

---

## ČÁST 3: SERVER ACTION — calculateAndSaveRecipe()

### 3.1 Rozšíření logiky

V `src/modules/recipes/actions.ts` — funkce `calculateAndSaveRecipe()`:

```typescript
export async function calculateAndSaveRecipe(
  recipeId: string
): Promise<RecipeCalculationResult> {
  return withTenant(async (tenantId) => {
    // 1. Load recipe (stávající kód)
    const recipe = ...;

    // 2. Load recipe items (stávající kód)
    const itemRows = ...;

    // 3. NOVÉ: Načíst shop settings
    const shopSettings = await getDefaultShopSettings(tenantId);
    const pricingMode = shopSettings?.ingredient_pricing_mode ?? "calc_price";

    // 4. NOVÉ: Resolve ceny surovin dle pricing mode
    const itemIds = itemRows.map(r => r.recipeItem.itemId);
    const priceMap = await resolveIngredientPrices(tenantId, itemIds, pricingMode);

    // 5. Build IngredientInput[] s RESOLVED cenami
    const ingredientInputs: IngredientInput[] = itemRows.map((row) => {
      const resolved = priceMap.get(row.recipeItem.itemId);
      // Fallback: pokud resolved price je null → použij items.cost_price
      const price = resolved?.price
        ?? (row.itemCostPrice ? parseFloat(row.itemCostPrice) : null);

      return {
        // ... stávající pole ...
        costPrice: price,
        // Přidat source pro tracking:
        _priceSource: resolved?.source ?? "cost_price",
      };
    });

    // 6. NOVÉ: Připravit overhead inputs
    const overhead: OverheadInputs = {
      overheadPct: shopSettings?.overhead_pct ?? 0,
      overheadCzk: shopSettings?.overhead_czk ?? 0,
      brewCostCzk: shopSettings?.brew_cost_czk ?? 0,
    };

    // 7. Kalkulace (rozšířená)
    const volumeL = recipe.batchSizeL ? parseFloat(recipe.batchSizeL) : 0;
    const fgPlato = recipe.fg ? parseFloat(recipe.fg) : undefined;
    const result = calculateAll(ingredientInputs, volumeL, fgPlato, overhead);
    result.pricingMode = pricingMode;

    // 8. Save calculation snapshot (stávající kód)
    await db.insert(recipeCalculations).values({
      tenantId,
      recipeId,
      data: result,
    });

    // 9. Update recipe — costPrice = totalProductionCost
    await db.update(recipes).set({
      og: String(result.og),
      fg: String(result.fg),
      abv: String(result.abv),
      ibu: String(result.ibu),
      ebc: String(result.ebc),
      costPrice: String(result.totalProductionCost),  // ZMĚNA: plná výrobní cena
      updatedAt: sql`now()`,
    }).where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)));

    return result;
  });
}
```

### 3.2 Helper: getDefaultShopSettings()

```typescript
// src/modules/shops/actions.ts (nebo utils)

/**
 * Načíst settings z default (nebo první aktivní) provozovny.
 */
export async function getDefaultShopSettings(
  tenantId: string
): Promise<ShopSettings | null> {
  const row = await db
    .select({ settings: shops.settings })
    .from(shops)
    .where(
      and(
        eq(shops.tenantId, tenantId),
        eq(shops.isActive, true)
      )
    )
    .orderBy(desc(shops.isDefault))  // isDefault=true first
    .limit(1);

  if (!row[0]?.settings) return null;
  return row[0].settings as ShopSettings;
}
```

---

## ČÁST 4: UI — RecipeCalculation COMPONENT

### 4.1 Rozšíření Cost Breakdown sekce

Aktuální sekce "Nákladová kalkulace" zobrazuje jen tabulku surovin + Total + Per Liter.

**Nové zobrazení:**

```
┌─────────────────────────────────────────────────────────────┐
│ Nákladová kalkulace                                         │
│                                                             │
│ Surovina          Množství    Jedn. cena    Celkem          │
│ ─────────────────────────────────────────────────────        │
│ Český plzeňský    15,00 kg    40,00 / kg    600,00          │
│ Žatecký poloranný  0,50 kg   350,00 / kg    175,00          │
│ Safale US-05       1 ks       90,00 / ks     90,00          │
│ ─────────────────────────────────────────────────────        │
│ Suroviny celkem                              865,00 Kč      │
│                                                             │
│ ─────────────────────────────────────────────────────        │
│ Režie suroviny (20 %)                        173,00 Kč      │
│ Náklady var                                1 800,00 Kč      │
│ Režie                                      2 000,00 Kč      │
│ ─────────────────────────────────────────────────────        │
│ VÝROBNÍ CENA VÁRKY                         4 838,00 Kč      │
│ VÝROBNÍ CENA ZA LITR                          32,25 Kč/L    │
│                                                             │
│ Zdroj cen surovin: Výrobní cena ze skladové karty           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Implementace

Komponenta `RecipeCalculation.tsx` aktuálně počítá cost breakdown na **klientu** z `item.itemCostPrice`. To je problém — klient nezná shop settings ani alternativní ceny.

**Řešení:**

A) Overhead řádky (režie, var, režie fix) se zobrazují z **uloženého recipe_calculations.data** (ze serveru). Po kliknutí na "Přepočítat" se zavolá `calculateAndSaveRecipe()` a data se obnoví.

B) Surovinový breakdown se nadále počítá na klientu z `item.itemCostPrice` (pro real-time feedback při editaci surovin). To je OK — odpovídá `calc_price` režimu. Po "Přepočítat" se nahradí serverovým výsledkem.

**Practical approach pro MVP:**

1. **Ingredient tabulka** = stávající client-side logika (beze změny)
2. **Pod tabulkou** = nová sekce s režijními řádky, čtená ze `recipe_calculations.data`:
   - Pokud `recipe_calculations.data` obsahuje overhead pole → zobrazit
   - Pokud ne (starší data) → nezobrazovat (jen "Suroviny celkem")
3. **Sumář** = total z posledního recipe_calculations snapshotu (server-side)
4. **Tlačítko "Přepočítat"** = recalculate vše server-side vč. overhead

**Implementace v RecipeCalculation.tsx:**

```typescript
// Načíst poslední recipe_calculations snapshot (server action)
// Pokud má overhead pole, zobrazit rozšířenou kalkulaci.
// Pokud ne, zobrazit jen ingredientsCost (stávající).

// Přidat nový server action:
export async function getLatestRecipeCalculation(
  recipeId: string
): Promise<RecipeCalculationResult | null> {
  return withTenant(async (tenantId) => {
    const row = await db
      .select({ data: recipeCalculations.data })
      .from(recipeCalculations)
      .where(
        and(
          eq(recipeCalculations.tenantId, tenantId),
          eq(recipeCalculations.recipeId, recipeId)
        )
      )
      .orderBy(desc(recipeCalculations.calculatedAt))
      .limit(1);

    return row[0]?.data as RecipeCalculationResult | null;
  });
}
```

### 4.3 Poznámka k ingredientsCost klientský vs serverový

Na klientu se ingredientsCost počítá vždy z `items.cost_price` (JOIN). Pokud `ingredient_pricing_mode` = `avg_stock` nebo `last_purchase`, klientská kalkulace **neodpovídá** serveru. To je OK pro MVP — user klikne "Přepočítat" a vidí správný výsledek. Drobný UX kompromis.

**Budoucí vylepšení:** Předat resolved prices z serveru do klienta.

---

## ČÁST 5: DOPAD NA PŘEDCHOZÍ POKYN (bottling-lot-expiry-price)

### 5.1 getProductionUnitPrice — beze změny

Funkce `getProductionUnitPrice()` v režimu `recipe_calc` čte:
```typescript
recipe.costPrice / recipe.batchSizeL
```

Díky tomuto pokynu `recipes.costPrice` nyní obsahuje **plnou výrobní cenu** (včetně overhead). Takže `costPerLiter` pro naskladnění automaticky zahrnuje režie. **Žádná změna v pokyn-bottling-lot-expiry-price.md není potřeba.**

### 5.2 Podmínka: recalculate po změně shop settings

Pokud uživatel změní overhead parametry v nastavení provozovny, stávající recepty mají starou `costPrice`. User musí ručně přepočítat. Pro MVP je to OK — v budoucnu lze přidat auto-recalc.

---

## ČÁST 6: I18N

### 6.1 Recipe calculation i18n

`src/i18n/messages/cs/recipes.json` — rozšířit sekci `calculation`:
```json
{
  "calculation": {
    "ingredientsCost": "Suroviny celkem",
    "ingredientOverhead": "Režie suroviny ({pct} %)",
    "brewCost": "Náklady var",
    "overheadCost": "Režie",
    "totalProductionCost": "Výrobní cena várky",
    "productionCostPerLiter": "Výrobní cena za litr",
    "pricingSource": "Zdroj cen surovin",
    "pricingModes": {
      "calc_price": "Výrobní cena ze skladové karty",
      "avg_stock": "Průměrná skladová cena",
      "last_purchase": "Poslední nákupní cena"
    }
  }
}
```

`src/i18n/messages/en/recipes.json`:
```json
{
  "calculation": {
    "ingredientsCost": "Ingredients Total",
    "ingredientOverhead": "Ingredient Overhead ({pct} %)",
    "brewCost": "Brew Cost",
    "overheadCost": "Overhead",
    "totalProductionCost": "Total Production Cost",
    "productionCostPerLiter": "Production Cost per Liter",
    "pricingSource": "Ingredient price source",
    "pricingModes": {
      "calc_price": "Production cost from item card",
      "avg_stock": "Average stock price",
      "last_purchase": "Last purchase price"
    }
  }
}
```

---

## ČÁST 7: AKCEPTAČNÍ KRITÉRIA

### Zdroj ceny surovin
- [ ] `resolveIngredientPrices()` — helper funkce pro resoluce cen
- [ ] Mód `calc_price`: čte `items.cost_price` (stávající default)
- [ ] Mód `avg_stock`: čte `items.avg_price`
- [ ] Mód `last_purchase`: čte `stock_issue_lines.unit_price` z poslední potvrzené příjemky
- [ ] Fallback: pokud resolved price = NULL → fallback na `items.cost_price`
- [ ] `ingredient_pricing_mode` se čte z default shop settings

### Výpočet výrobní ceny
- [ ] `calculateAll()` rozšířen o `OverheadInputs` parametr (optional, zpětně kompatibilní)
- [ ] `ingredientOverheadCost` = ingredientsCost × overhead_pct / 100
- [ ] `totalProductionCost` = ingredientsCost + ingredientOverheadCost + brewCostCzk + overheadCzk
- [ ] `costPerLiter` = totalProductionCost / batchSizeL
- [ ] Overhead values z shop settings: `overhead_pct`, `overhead_czk`, `brew_cost_czk`

### Server action
- [ ] `calculateAndSaveRecipe()` načítá shop settings (default shop)
- [ ] Resoluje ceny surovin dle `ingredient_pricing_mode`
- [ ] Počítá s overhead inputs z shop settings
- [ ] `recipes.costPrice` = `totalProductionCost` (plná výrobní cena)
- [ ] `recipe_calculations.data` obsahuje kompletní breakdown vč. overhead polí

### UI — RecipeCalculation
- [ ] Tabulka surovin — beze změny (client-side z items.cost_price)
- [ ] Pod tabulkou: řádky Režie suroviny (%), Náklady var, Režie — ze server snapshot
- [ ] Sumář: Výrobní cena várky, Výrobní cena za litr
- [ ] Zobrazení zdroje cen (popisek pod sumářem)
- [ ] Tlačítko "Přepočítat" — přepočítá vše server-side vč. overhead

### Zpětná kompatibilita
- [ ] `calculateAll()` bez overhead parametru funguje beze změny
- [ ] Starší recipe_calculations snapshoty bez overhead polí → overhead řádky se nezobrazí
- [ ] `result.costPrice` = alias pro `totalProductionCost`

---

## VAZBA NA OSTATNÍ POKYNY

**DOPLŇUJE:**
- `pokyn-bottling-lot-expiry-price.md` — `recipes.costPrice` nyní obsahuje plnou výrobní cenu, takže `getProductionUnitPrice()` v režimu `recipe_calc` automaticky zahrnuje overhead
- Sprint 3 spec (shop settings) — parametry se nyní aktivně používají

**NEMĚNÍ:**
- `pokyn-naskladneni-piva-explicitni.md` — logika naskladnění beze změny
- Sprint 5 spec (excise) — nezávislé
- Pivovarské výpočty (OG, IBU, EBC, ABV) — beze změny
