# PATCH: Fermentable Types — podčíselník zkvasitelných surovin
## ProfiBrew.com | Datum: 03.03.2026 | v2 (stage-based efficiency)

---

## PROBLÉM

1. Všechny zkvasitelné suroviny procházejí výpočtem OG se stejnou efektivitou varny. To je správně pro slady v rmutování, ale špatně pro cukr/med/DME/LME přidávané přímo do varu (100% rozpuštění).
2. Kategorie `adjunct` míchá zkvasitelné (cukr, med) s nezkvasitelnými (Irish moss, koření).

---

## ŘEŠENÍ

1. Nový číselník `fermentable_types` pro UI a default extract
2. Kategorie `adjunct` → rozdělit na `fermentable` + `other`
3. **Efektivita řízena fází (useStage)**: `mash` → × efficiency, cokoliv jiného → × 1.0
4. Číselník NEMÁ flag `use_efficiency` — logika je čistě ze stage

---

## AKTUÁLNÍ STAV KÓDU (ověřeno z repo)

### calculateOG() — `src/modules/recipes/utils.ts`
```typescript
export function calculateOG(
  ingredients: IngredientInput[],
  batchSizeL: number,
  efficiencyPct: number,
  defaultExtractPct: number = 80
): number {
  const efficiency = efficiencyPct / 100;
  const malts = ingredients.filter(
    (i) => i.category === "malt" || i.category === "adjunct"  // ← ZMĚNIT
  );
  const totalExtractKg = malts.reduce((sum, malt) => {
    const weightKg = toKg(malt);
    const extractFraction = (malt.extractPercent ?? defaultExtractPct) / 100;
    return sum + weightKg * extractFraction * efficiency;  // ← ZMĚNIT
  }, 0);
  // ... iterativní SG korekce
}
```

### RecipeDesigner.tsx — filtry kategorií
```typescript
const maltItems = localItems.filter(
  (i) => i.category === "malt" || i.category === "adjunct"  // ← ZMĚNIT
);
const adjunctItems = localItems.filter(
  (i) => i.category === "other"  // tento zůstává
);
```

### RecipeIngredientsTab.tsx
```typescript
const INGREDIENT_CATEGORIES = ["malt", "hop", "yeast", "adjunct", "other"];
// ← ZMĚNIT adjunct → fermentable
```

### IngredientInput — už má useStage
```typescript
// V RecipeDesigner.tsx mapování:
useStage: item.useStage ?? undefined,  // ← UŽ EXISTUJE
```

---

## ZMĚNA 1: Číselník fermentable_types

Systémový číselník — jen pro UI a default extract. **BEZ use_efficiency** (řízeno fází).

```sql
CREATE TABLE fermentable_types (
  id                TEXT PRIMARY KEY,
  name_cs           TEXT NOT NULL,
  name_en           TEXT NOT NULL,
  default_extract   DECIMAL NOT NULL DEFAULT 80,
  sort_order        INTEGER DEFAULT 0
);

INSERT INTO fermentable_types (id, name_cs, name_en, default_extract, sort_order) VALUES
  ('grain',          'Slad',                     'Grain',              80, 1),
  ('adjunct_grain',  'Doplněk (obilný)',         'Adjunct Grain',      70, 2),
  ('sugar',          'Cukr',                     'Sugar',             100, 3),
  ('honey',          'Med',                      'Honey',              95, 4),
  ('dry_extract',    'Sušený výtažek (DME)',     'Dry Malt Extract',   96, 5),
  ('liquid_extract', 'Tekutý výtažek (LME)',     'Liquid Malt Extract', 80, 6);
```

---

## ZMĚNA 2: Pole fermentable_type na items

```sql
ALTER TABLE items ADD COLUMN fermentable_type TEXT REFERENCES fermentable_types(id);
```

Drizzle schema `drizzle/schema/items.ts`:
```typescript
fermentableType: text("fermentable_type"),  // FK na fermentable_types — jen pro malt + fermentable
```

---

## ZMĚNA 3: Kategorie adjunct → fermentable / other

### 3a: Na items

```sql
-- Zkvasitelné adjuncts (mají extract nebo EBC) → fermentable
UPDATE items 
SET material_type = 'fermentable' 
WHERE material_type = 'adjunct' 
  AND (extract_percent > 0 OR ebc > 0);

-- Nezkvasitelné adjuncts → other
UPDATE items 
SET material_type = 'other' 
WHERE material_type = 'adjunct';
```

### 3b: Na recipe_items

```sql
UPDATE recipe_items 
SET category = 'fermentable' 
WHERE category = 'adjunct' 
  AND item_id IN (SELECT id FROM items WHERE material_type = 'fermentable');

UPDATE recipe_items 
SET category = 'other' 
WHERE category = 'adjunct';
```

### 3c: Migrace fermentable_type na stávajících items

```sql
UPDATE items SET fermentable_type = 'grain' 
WHERE material_type = 'malt' AND fermentable_type IS NULL;

UPDATE items SET fermentable_type = 'sugar' 
WHERE material_type = 'fermentable' AND fermentable_type IS NULL;
```

---

## ZMĚNA 4: calculateOG() — efektivita dle stage

**Soubor:** `src/modules/recipes/utils.ts`

```typescript
export function calculateOG(
  ingredients: IngredientInput[],
  batchSizeL: number,
  efficiencyPct: number,
  defaultExtractPct: number = 80
): number {
  if (batchSizeL <= 0) return 0;

  const efficiency = efficiencyPct / 100;

  // ZMĚNA 1: filtr kategorie
  const fermentables = ingredients.filter(
    (i) => i.category === "malt" || i.category === "fermentable"
  );

  const totalExtractKg = fermentables.reduce((sum, item) => {
    const weightKg = toKg(item);
    const extractFraction = (item.extractPercent ?? defaultExtractPct) / 100;
    
    // ZMĚNA 2: efektivita jen pro mash fázi
    const effectiveEfficiency = item.useStage === "mash" ? efficiency : 1.0;
    
    return sum + weightKg * extractFraction * effectiveEfficiency;
  }, 0);

  if (totalExtractKg <= 0) return 0;

  // Iterativní SG korekce — BEZ ZMĚNY
  let plato = totalExtractKg / (totalExtractKg + batchSizeL) * 100;
  for (let i = 0; i < 3; i++) {
    const sg = platoToSG(plato);
    plato = totalExtractKg / (batchSizeL * sg) * 100;
  }

  return round1(plato);
}
```

---

## ZMĚNA 5: calculateEBC() — filtr kategorie

**Soubor:** `src/modules/recipes/utils.ts`

```typescript
// PŘED:
const malts = ingredients.filter(
  (i) => i.category === "malt" || i.category === "adjunct"
);

// PO:
const malts = ingredients.filter(
  (i) => i.category === "malt" || i.category === "fermentable"
);
```

---

## ZMĚNA 6: calculateAll() — filtr pro malt plan

**Soubor:** `src/modules/recipes/utils.ts` — v `calculateAll()`

```typescript
// PŘED:
const maltsForExtract = ingredients.filter(
  (i) => i.category === "malt" || i.category === "adjunct"
);

// PO:
const maltsForExtract = ingredients.filter(
  (i) => i.category === "malt" || i.category === "fermentable"
);
```

---

## ZMĚNA 7: RecipeDesigner.tsx — filtry kategorií

**Soubor:** `src/modules/recipes/components/RecipeDesigner.tsx`

```typescript
// PŘED:
const maltItems = useMemo(
  () => localItems.filter(
    (i) => i.category === "malt" || i.category === "adjunct"
  ),
  [localItems]
);

// PO:
const maltItems = useMemo(
  () => localItems.filter(
    (i) => i.category === "malt" || i.category === "fermentable"
  ),
  [localItems]
);
```

Přejmenovat proměnnou `adjunctItems` → `otherItems` (filtruje `other` — BEZ ZMĚNY logiky).

---

## ZMĚNA 8: RecipeDesigner.tsx — taby

Tab "Zkvasitelné suroviny" zobrazuje `maltItems` (= malt + fermentable).
Na kartách fermentable přísad zobrazit badge s typem (Cukr, Med, DME...).
Dva přidávací buttony: `[+ Slad]` (default category=malt, stage=mash) a `[+ Přísada]` (default category=fermentable, stage=boil).

Tab "Ostatní" místo "Přísady" — zobrazuje `otherItems`.

---

## ZMĚNA 9: RecipeIngredientsTab.tsx — kategorie

**Soubor:** `src/modules/recipes/components/RecipeIngredientsTab.tsx`

```typescript
// PŘED:
const INGREDIENT_CATEGORIES = ["malt", "hop", "yeast", "adjunct", "other"] as const;

// PO:
const INGREDIENT_CATEGORIES = ["malt", "hop", "yeast", "fermentable", "other"] as const;
```

```typescript
// PŘED:
const totalMaltG = sumByCategory(items, "malt") + sumByCategory(items, "adjunct");

// PO:
const totalMaltG = sumByCategory(items, "malt") + sumByCategory(items, "fermentable");
```

---

## ZMĚNA 10: Item formulář — fermentable_type pole

Když `material_type IN ('malt', 'fermentable')`:
- Zobrazit pole "Typ suroviny" (select z fermentable_types)
- Povinné
- Default: `'grain'` pro malt, `'sugar'` pro fermentable
- Při změně → předvyplnit `extract_percent` z `fermentable_types.default_extract`

Když `material_type` je jiný → pole skryté.

Dostupné material_type hodnoty v UI:

| Label CS | material_type |
|----------|--------------|
| Slad | malt |
| Chmel | hop |
| Kvasnice | yeast |
| Zkvasitelná přísada | fermentable |
| Ostatní | other |

Odstranit `adjunct` z dostupných hodnot.

---

## ZMĚNA 11: Fáze přidání — rozšířit

```typescript
// PŘED:
const USE_STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop"] as const;

// PO:
const USE_STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop", "conditioning", "bottling"] as const;
```

Dostupné fáze per material_type:

```typescript
const AVAILABLE_STAGES: Record<string, string[]> = {
  malt:        ['mash'],
  fermentable: ['mash', 'boil', 'fermentation', 'conditioning', 'bottling'],
  hop:         ['boil', 'whirlpool', 'dry_hop'],
  yeast:       ['fermentation'],
  other:       ['mash', 'boil', 'whirlpool', 'fermentation', 'conditioning', 'bottling'],
};
```

---

## ZMĚNA 12: Quick filters v items browseru

```typescript
// PŘED:
{ label: "Malts & adjuncts", filter: { material_type: ["malt", "adjunct"] } },
options: ["malt", "hop", "yeast", "adjunct", "other"]

// PO:
{ label: "Slady a přísady", filter: { material_type: ["malt", "fermentable"] } },
options: ["malt", "hop", "yeast", "fermentable", "other"]
```

---

## ZMĚNA 13: Batch ingredients — reference

Aktualizovat i18n batch kategorie a případné filtry v batch detail:

```typescript
// PŘED:
"category": { "adjunct": "Adjunct" }

// PO:
"category": { "fermentable": "Fermentable" }  // CS: "Zkvasitelná přísada"
```

---

## ZMĚNA 14: i18n — kompletní

**CS — recipes:**
```json
{
  "ingredients": {
    "categories": {
      "malt": "Slad",
      "hop": "Chmel",
      "yeast": "Kvasnice",
      "fermentable": "Zkvasitelná přísada",
      "other": "Ostatní"
    },
    "stages": {
      "mash": "Rmutování",
      "boil": "Chmelovar",
      "whirlpool": "Whirlpool",
      "fermentation": "Kvašení",
      "dry_hop": "Dry hop",
      "conditioning": "Ležení",
      "bottling": "Stáčení"
    }
  },
  "fermentableType": {
    "label": "Typ suroviny",
    "grain": "Slad",
    "adjunct_grain": "Doplněk (obilný)",
    "sugar": "Cukr",
    "honey": "Med",
    "dry_extract": "Sušený výtažek (DME)",
    "liquid_extract": "Tekutý výtažek (LME)"
  },
  "designer": {
    "tabs": {
      "fermentables": "Zkvasitelné suroviny",
      "hops": "Chmele",
      "yeast": "Kvasnice",
      "other": "Ostatní"
    },
    "cards": {
      "addFermentable": "Přísada",
      "addOther": "Ostatní",
      "directAddition": "Přímý přídavek (100%)"
    }
  }
}
```

**EN** — analogicky. Smazat klíče `adjunct` / `adjuncts`.

---

## GREP KONTROLA

```bash
grep -rn '"adjunct"' src/ --include="*.ts" --include="*.tsx" | grep -v "adjunct_grain" | grep -v "node_modules"
grep -n "category.*malt" src/modules/recipes/utils.ts
grep -n "category.*malt\|category.*adjunct\|category.*fermentable" src/modules/recipes/components/RecipeDesigner.tsx
```

Očekáváno: 0 výskytů `"adjunct"` mimo migrační skripty a `adjunct_grain`.

---

## AKCEPTAČNÍ KRITÉRIA

### DB + Schema
1. [ ] Tabulka `fermentable_types` s 6 záznamy (BEZ use_efficiency)
2. [ ] `items.fermentable_type` sloupec existuje
3. [ ] Stávající malty → `fermentable_type = 'grain'`
4. [ ] Stávající adjunct (zkvasitelné) → `material_type = 'fermentable'`
5. [ ] Stávající adjunct (nezkvasitelné) → `material_type = 'other'`
6. [ ] `recipe_items.category` aktualizovány
7. [ ] Kategorie `adjunct` se v systému nevyskytuje

### Item formulář
8. [ ] Fermentable type zobrazeno pro malt + fermentable, povinné
9. [ ] Default extract předvyplněn z číselníku
10. [ ] Dostupné material_type: malt, hop, yeast, fermentable, other

### Recipe designer
11. [ ] Tab "Zkvasitelné suroviny" zobrazuje malt + fermentable
12. [ ] Tab "Ostatní" místo "Přísady"
13. [ ] Badge s typem na kartách fermentable
14. [ ] Dva přidávací buttony [+ Slad] [+ Přísada]

### Kalkulace — KLÍČOVÉ
15. [ ] `calculateOG()`: `useStage === "mash"` → × efficiency, jinak × 1.0
16. [ ] `calculateOG()`: filtr `malt || fermentable`
17. [ ] `calculateEBC()`: filtr `malt || fermentable`
18. [ ] `calculateAll()`: malt plan filtr `malt || fermentable`
19. [ ] **Regrese**: recept samé slady (stage=mash) → OG NEZMĚNĚNÉ
20. [ ] **Nový test**: 1kg cukr (stage=boil) → OG vyšší než dříve

### Fáze
21. [ ] Stages rozšířeny o `conditioning` a `bottling`
22. [ ] Dostupné fáze filtrované dle material_type

### Items browser + batch
23. [ ] Quick filter: malt + fermentable
24. [ ] Batch ingredients i18n aktualizováno

### Regrese
25. [ ] `npm run build` bez chyb
26. [ ] Grep: 0 výskytů `"adjunct"` v src/
