# SPRINT 4 PATCH — ERRATA: Zrušení scaleFactor
## ProfiBrew.com | Oprava k sprint-4-patch-production-issues.md
### Datum: 23.02.2026

---

## PROBLÉM

Patch používá `scaleFactor = batch.plannedVolumeL / recipe.batchSizeL` k přepočtu množství surovin. Pole `plannedVolumeL` na batches neexistuje a celý koncept je špatný.

## SPRÁVNÝ MODEL

Batch má přiřazenou **editovatelnou kopii receptu** (snapshot). Sládek upraví kopii — změní objem, dávkování, přidá/odebere suroviny. Požadavky na výdej = **přímo z recipe_items kopie** bez jakéhokoli přepočtu.

```
Originální recept  →  Kopie pro var  →  Výdejka
   "Master"           "Co chci"        "Co jsem reálně vydal"
```

### Dva levely sledování

| Srovnání | Význam | Kde v UI |
|----------|--------|----------|
| Originál vs Kopie | Co sládek změnil | Batch tab "Suroviny" — sloupce Originál / Recept |
| Kopie vs Výdejka | Rozdíl plán vs realita | Batch tab "Suroviny" — sloupce Recept / Vydáno / Chybí |

---

## OPRAVY V PATCHI

### P3.1 createProductionIssue() — BEZ scaleFactor

**NAHRADIT celou funkci:**

```typescript
async function createProductionIssue(batchId: string): Promise<StockIssue> {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) throw new Error('Várka nemá přiřazený recept')
  
  const recipeItems = await getRecipeIngredients(batch.recipeId)  // Kopie
  const shop = await getShop(batch.shopId)
  
  const issue = await createStockIssue({
    type: 'issue',
    purpose: 'production',
    batch_id: batchId,
    warehouse_id: shop.settings.default_warehouse_materials_id,
    date: new Date(),
  })
  
  for (const ri of recipeItems) {
    // Přímé množství z kopie receptu — ŽÁDNÝ SCALEFACTOR
    const qty = convertToBaseUnit(ri.amountG, ri.unitToBaseFactor)
    
    await addStockIssueLine(issue.id, {
      item_id: ri.itemId,
      requested_qty: qty,
      recipe_item_id: ri.id,
    })
  }
  
  return issue
}

function convertToBaseUnit(amountG: string, unitToBaseFactor: string | null): number {
  const amount = parseFloat(amountG) || 0
  const factor = unitToBaseFactor ? parseFloat(unitToBaseFactor) : 1
  return amount / (factor || 1)
}
```

### P3.2 directProductionIssue() — beze změny

Volá createProductionIssue(), takže oprava se propaguje.

### P3.3 prefillIssueFromBatch() — BEZ scaleFactor

**NAHRADIT:**

```typescript
async function prefillIssueFromBatch(issueId: string, batchId: string) {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) throw new Error('Várka nemá přiřazený recept')
  
  const recipeItems = await getRecipeIngredients(batch.recipeId)  // Kopie
  
  await clearIssueLines(issueId)
  
  for (const ri of recipeItems) {
    const qty = convertToBaseUnit(ri.amountG, ri.unitToBaseFactor)
    
    await addStockIssueLine(issueId, {
      item_id: ri.itemId,
      requested_qty: qty,
      recipe_item_id: ri.id,
    })
  }
}
```

### P2.1 getDemandedQty() — BEZ scaleFactor

V demand query pro batch suroviny nahradit škálování přímým čtením:

```sql
-- MÍSTO:
--   (ri.amount_g / u.to_base_factor) * (b.planned_volume_l / r.batch_size_l)
-- POUŽÍT:
    (CAST(ri.amount_g AS DECIMAL) / COALESCE(NULLIF(u.to_base_factor, 0), 1)) as needed_qty
-- Žádné škálování, přímá hodnota z kopie receptu
```

### P4.2 getBatchIngredients() — rozšířit o originál

```typescript
interface BatchIngredientRow {
  recipeItemId: string
  itemName: string
  category: string
  originalQty: number | null  // NOVÉ: množství z originálního receptu (null pokud nemá source)
  recipeQty: number           // Množství z KOPIE receptu (přímo, bez škálování)
  unit: string
  issuedQty: number
  missingQty: number          // max(0, recipeQty - issuedQty)
  lots: Array<{
    lotNumber: string | null
    quantity: number
    receiptLineId: string
  }>
}
```

**originalQty** — načíst z originálního receptu (přes `recipes.source_recipe_id`):

```typescript
async function getBatchIngredients(batchId: string): Promise<BatchIngredientRow[]> {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) return []
  
  const recipe = await getRecipe(batch.recipeId)  // Snapshot
  const recipeItems = await getRecipeIngredients(batch.recipeId)
  
  // Originální recept (pokud existuje source_recipe_id)
  let originalItems: Map<string, number> | null = null
  if (recipe.sourceRecipeId) {
    const origItems = await getRecipeIngredients(recipe.sourceRecipeId)
    originalItems = new Map()
    for (const oi of origItems) {
      const qty = convertToBaseUnit(oi.amountG, oi.unitToBaseFactor)
      originalItems.set(oi.itemId, qty)  // Map per item_id
    }
  }
  
  // ... production issues + movements aggregation (beze změny) ...
  
  return recipeItems.map(ri => {
    const recipeQty = convertToBaseUnit(ri.amountG, ri.unitToBaseFactor)
    const agg = issuedAgg.find(a => a.recipe_item_id === ri.id)
    const issuedQty = agg?.issued_qty || 0
    
    return {
      recipeItemId: ri.id,
      itemName: ri.itemName,
      category: ri.category,
      originalQty: originalItems?.get(ri.itemId) ?? null,
      recipeQty,
      unit: ri.unitSymbol || 'g',
      issuedQty,
      missingQty: Math.max(0, recipeQty - issuedQty),
      lots: /* ... beze změny ... */,
    }
  })
}
```

### P4.3 UI tabulka — rozšířit o sloupec Originál

| Surovina | Kategorie | Originál | Recept | Vydáno | Chybí | Šarže |
|----------|-----------|----------|--------|--------|-------|-------|
| Plzeňský slad | Slad | 5 kg | **10 kg** | 8 kg | **2 kg** | L-001 (6), L-002 (2) |
| Apollo | Chmel | 0,05 kg | **0,08 kg** | 0,08 kg | 0 | — |
| Safale S-189 | Kvasnice | 0,02 kg | 0,02 kg | 0 kg | **0,02 kg** | — |

- **Originál** — z originálního receptu (source_recipe_id). Šedý text.
  - Pokud originál neexistuje (smazán) → sloupec skrytý nebo "—"
  - Pokud hodnota se liší od Recept → zvýraznit (bold nebo barevně)
- **Recept** — z kopie receptu. Toto je "plán pro tento var".
- **Vydáno** — z movements.
- **Chybí** — Recept - Vydáno. Červeně pokud > 0.

**Nová surovina v kopii (není v originálu):**
- Originál = "—" (nový řádek)
- Řádek z originálu odstraněný z kopie: nezobrazuje se (kopie je zdroj pravdy)

---

## OPRAVY V TEST CASECH

### TC-01.1 — PŘEPSAT

**Starý:** "Množství škálovaná ×2: slad 10 kg..."
**Nový:**

**TC-01.1 Základní vytvoření**
**Prerekvizita:** V-001 má snapshot receptu. Sládek upravil kopii: batchSizeL = 200L, slad = 10 kg, chmel = 0,1 kg, kvasnice = 0,04 kg.

**Kroky:**
1. Otevři V-001
2. Tab "Suroviny" → klikni "Připravit výdejku"

**Ověř:**
- [ ] Výdejka řádky odpovídají **přímo kopii receptu**: slad 10 kg, chmel 0,1 kg, kvasnice 0,04 kg
- [ ] Žádné škálování — hodnoty 1:1 s recipe_items kopie
- [ ] recipe_item_id na řádcích odkazuje na kopii (ne originál)

### TC-01.2 — PŘEPSAT

**TC-01.2 Jiný objem — sládek upravil kopii**
**Prerekvizita:** V-002 má snapshot s batchSizeL = 100L a originálním množstvím (slad 5 kg).

**Kroky:**
1. Otevři V-002, tab "Suroviny" → "Připravit výdejku"

**Ověř:**
- [ ] Řádky přímo z kopie: slad 5 kg, chmel 0,05 kg, kvasnice 0,02 kg

### TC-03.1, TC-03.2, TC-03.3 — opravit množství

Místo "potřeba 10 kg (scaleFactor ×2)" → "potřeba dle kopie receptu: X kg"
Konkrétní čísla závisí na tom, co sládek nastavil v kopii.

### TC-05 — přidat ověření sloupce Originál

**TC-05.1 doplnit:**
- [ ] Sloupec **Originál**: množství z master receptu (přes source_recipe_id)
- [ ] Pokud Originál ≠ Recept → zvýrazněno

**TC-05.5 (NOVÝ) — sládek změnil kopii vs originál**
**Kroky:**
1. Originální recept R1: slad 5 kg, chmel 0,05 kg
2. Kopie pro V-001: slad **10 kg** (zvýšil), chmel **0,08 kg** (AHK korekce), přidal **Irish Moss 5g**
3. Tab "Suroviny"

**Ověř:**
- [ ] Slad: Originál = 5 kg, Recept = **10 kg** (zvýrazněno — liší se)
- [ ] Chmel: Originál = 0,05 kg, Recept = **0,08 kg** (zvýrazněno)
- [ ] Irish Moss: Originál = **—** (v originálu neexistuje), Recept = 5 g
- [ ] Žádná surovina z originálu, která není v kopii, se nezobrazuje

### TC-10.1 — opravit

**Místo:** "Řádky automaticky předvyplněny: slad 10 kg, chmel 0,1 kg..."
**Nové:** "Řádky odpovídají recipe_items kopie receptu batch V-001 (bez škálování)"

### TC-13 — opravit demand výpočet

**TC-13.1 místo:** "Požadavky: 10 kg (z V-001)"
**Nové:** "Požadavky: hodnota z recipe_items kopie receptu V-001"

---

## DOPAD NA POKYN "SNAPSHOT RECEPTU"

Snapshot pokyn říká: "Kopie je editovatelná — sládek může upravit suroviny, kroky, parametry."

**Doplnit do snapshot pokynu:**
- Batch detail musí umožnit editaci kopie receptu (RecipeForm reuse)
- Při editaci kopie se změní recipe_items → automaticky se změní požadavky (demand)
- Srovnání originál vs kopie: přes `source_recipe_id` JOIN

---

## SHRNUTÍ ZMĚN

| Co | Před (špatně) | Po (správně) |
|----|--------------|-------------|
| Zdroj množství pro výdejku | `recipe_items × scaleFactor` | `recipe_items kopie` (přímo) |
| Objem várky | `batch.plannedVolumeL` (neexistuje) | `recipe.batchSizeL` na kopii |
| Scale factor | `batch.plannedVolumeL / recipe.batchSizeL` | **NEEXISTUJE** |
| Kde sládek mění objem | Nikde (chybí) | Na kopii receptu (batchSizeL) |
| Tabulka suroviny | Recept / Vydáno / Chybí | **Originál** / Recept / Vydáno / Chybí |
| Demand query | Se škálováním | Přímé čtení z recipe_items |
