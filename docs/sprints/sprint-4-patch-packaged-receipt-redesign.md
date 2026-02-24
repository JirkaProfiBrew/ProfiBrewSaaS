## Úkol: Redesign naskladnění do obalů + záložky výrobní položky

Přepracovat flow naskladnění piva v režimu "packaged" a přidat záložky na detail výrobní položky.

---

## KONTEXT — DATOVÝ MODEL

Existující vazby:
```
Recipe.item_id → Items (výrobní položka, is_production_item=true)
    ↓ (kopíruje se při vytvoření batch)
Batch.item_id → Items (výrobní položka, tatáž)
    ↑
Items (prodejní) .base_item_id → Items (výrobní)
Items (prodejní) .base_item_quantity = objem v litrech (např. 0.5, 1.5, 30)
```

Příklad:
```
Výrobní položka: "Světlý ležák 12°" (is_production_item=true, MJ=litry)
  ↑ base_item_id
  ├── "Světlý ležák 12° lahev 0,5L" (base_item_quantity=0.5)
  ├── "Světlý ležák 12° PET 1,5L" (base_item_quantity=1.5)
  ├── "Světlý ležák 12° KEG 30L" (base_item_quantity=30)
  └── "Světlý ležák 12° plechovka 0,33L" (base_item_quantity=0.33)
```

---

## ČÁST 1: REDESIGN TAB STÁČENÍ (BOTTLING)

### 1.1 Změna flow

**Stávající (špatně):** Uživatel ručně přidává řádky do bottling_items, vybírá produkt ze selectu.

**Nové (správně):** Systém automaticky vygeneruje všechny prodejní položky, které mají `base_item_id = batch.item_id`. Uživatel jen vyplňuje kusy. Řádky s 0 ks se ignorují.

### 1.2 UI tab Stáčení — nový layout

Při otevření tabu "Stáčení" na batch detail:

1. Načíst `batch.item_id` (výrobní položka)
2. Pokud `item_id` je NULL → zobrazit hlášku "Várka nemá přiřazenou výrobní položku"
3. Query: `SELECT * FROM items WHERE base_item_id = {batch.item_id} AND is_active = true ORDER BY name`
4. Zobrazit tabulku:

| Produkt | Objem (L) | Ks | Celkem (L) |
|---------|-----------|-----|-----------|
| Lahev 0,5L | 0.5 | [___] | 0 |
| PET 1,5L | 1.5 | [___] | 0 |
| KEG 30L | 30 | [___] | 0 |
| Plechovka 0,33L | 0.33 | [___] | 0 |

**Sloupce:**
- **Produkt** — název položky (readonly)
- **Objem** — `base_item_quantity` (readonly)
- **Ks** — editovatelný input (integer ≥ 0)
- **Celkem** — ks × objem (computed, readonly)

### 1.3 Sumář pod tabulkou

```
Stočeno celkem:    142,5 L
Objem z receptury: 150 L        ← batch kopie receptu: recipe.batch_size_l
Objem z tanku:     148 L        ← batch.actual_volume_l (měřený objem)
────────────────────────
Rozdíl (receptura): -7,5 L     ← stočeno - batch_size_l
Rozdíl (tank):      -5,5 L     ← stočeno - actual_volume_l
```

**Barevné indikátory:**
- Rozdíl > 0 → zelená + "Přebytek"
- Rozdíl < 0 → červená + "Ztráta"
- Rozdíl = 0 → šedá + "Beze zbytku"

**Primární je "Rozdíl (tank)"** — skutečný stav. Receptura je referenční.

### 1.4 Ukládání

**Stávající `bottling_items` tabulka se ZACHOVÁVÁ** — jen se mění způsob plnění:

- Při uložení tabu: pro každý řádek kde ks > 0 → upsert do `bottling_items`
- Řádky kde ks = 0 → smazat z `bottling_items` (pokud existovaly)
- `bottling_items.base_units` = ks × base_item_quantity (celkový objem řádku)

**Nový přístup k ukládání:**
```typescript
async function saveBottlingData(batchId: string, lines: BottlingLine[]): Promise<void> {
  // 1. Smazat stávající bottling_items pro batch
  await deleteBottlingItems(batchId)
  
  // 2. Vložit jen nenulové
  for (const line of lines.filter(l => l.quantity > 0)) {
    await addBottlingItem(batchId, {
      itemId: line.itemId,
      quantity: line.quantity,
      baseUnits: String(line.quantity * line.baseItemQuantity),
    })
  }
  
  // 3. Uložit packaging_loss_l na batch
  const totalBottled = lines.reduce((s, l) => s + l.quantity * l.baseItemQuantity, 0)
  const tankVolume = Number(batch.actualVolumeL) || 0
  const loss = tankVolume - totalBottled  // kladná = ztráta, záporná = přebytek
  await updateBatch(batchId, { packagingLossL: String(loss) })
}
```

### 1.5 DB — nový sloupec na batches

```sql
ALTER TABLE batches ADD COLUMN packaging_loss_l DECIMAL;
```

Drizzle schema rozšíření:
```typescript
// drizzle/schema/batches.ts — přidat:
packagingLossL: decimal("packaging_loss_l"),
```

Význam: `packaging_loss_l` = `actual_volume_l - SUM(bottling_items.base_units)`
- Kladné = ztráta (stočili jsme méně než bylo v tanku)
- Záporné = přebytek (stočili jsme víc — chyba měření)
- Toto číslo půjde do daňového přiznání (S5)

---

## ČÁST 2: ÚPRAVA PACKAGED RECEIPT

### 2.1 Změna createPackagedReceipt()

Stávající funkce čte `bottling_items` a vytváří příjemku. To zůstává — ale nyní `bottling_items` jsou plněny z nového UI (viz část 1).

**Žádná změna v `createPackagedReceipt()`** — funkce je správně, čte bottling_items. Jen data v bottling_items přicházejí jinak (z auto-generovaných řádků místo ručního přidávání).

### 2.2 Validace při naskladnění (batch completion v packaged režimu)

Při pokusu o přechod do stavu `completed` (nebo `packaging` → `completed`):

```typescript
// Validace:
if (settings.stock_mode === 'packaged') {
  const bottling = await getBatchBottlingItems(batchId)
  if (bottling.length === 0) {
    throw new Error('Před naskladněním vyplňte stáčení (tab Stáčení)')
  }
  
  // Warning (ne blok): pokud packaging_loss_l je výrazná (> 10% objemu)
  const lossPercent = Math.abs(batch.packagingLossL / batch.actualVolumeL * 100)
  if (lossPercent > 10) {
    // UI confirm dialog: "Ztráta/přebytek při stáčení je {x}% ({y}L). Pokračovat?"
  }
}
```

---

## ČÁST 3: ITEM DETAIL — ZÁLOŽKY PRO VÝROBNÍ POLOŽKU

### 3.1 Podmínka zobrazení

Na detail položky (`ItemDetail.tsx`), pokud `item.isProductionItem === true`, přidat **2 nové taby**:

### 3.2 Tab "Recepty"

**Obsah:** Seznam receptů, které mají `recipe.item_id = thisItem.id`

| Recept | Styl | Objem (L) | OG | IBU | Primární | Status |
|--------|------|-----------|-----|-----|----------|--------|
| Světlý ležák v1 | Czech Lager | 100 | 12 | 28 | ⭐ | Aktivní |
| Světlý ležák v2 | Czech Lager | 100 | 11.5 | 25 | — | Archiv |

**Query:**
```sql
SELECT r.* FROM recipes r
WHERE r.item_id = {itemId} AND r.tenant_id = {tenantId}
ORDER BY r.is_primary DESC, r.name
```

**Akce:**
- Klik na řádek → navigace na detail receptu
- Badge "Primární" na primárním receptu

**Poznámka:** `recipes.item_id` a `recipes.is_primary` — ověřit zda tyto sloupce existují. Pokud `item_id` na recipes neexistuje, je potřeba:
```sql
ALTER TABLE recipes ADD COLUMN item_id UUID REFERENCES items(id);
ALTER TABLE recipes ADD COLUMN is_primary BOOLEAN DEFAULT false;
```
A přidat na formulář receptu: select "Výrobní položka" (items kde is_production_item=true).

### 3.3 Tab "Produkty"

**Obsah:** Seznam položek, které mají `items.base_item_id = thisItem.id`

| Produkt | Kód | Objem (L) | Obal | Cena | Aktivní |
|---------|-----|-----------|------|------|---------|
| Světlý ležák lahev 0,5L | it00010 | 0.5 | bottle_500 | 35 Kč | ✅ |
| Světlý ležák PET 1,5L | it00011 | 1.5 | pet_1500 | 89 Kč | ✅ |
| Světlý ležák KEG 30L | it00012 | 30 | keg_30 | 1 200 Kč | ✅ |

**Query:**
```sql
SELECT i.* FROM items i
WHERE i.base_item_id = {itemId} AND i.tenant_id = {tenantId}
ORDER BY i.base_item_quantity, i.name
```

**Sloupce:**
- Produkt — název (link na detail)
- Kód — item code
- Objem — `base_item_quantity` L
- Obal — `packaging_type` (lokalizovaný)
- Cena — `sale_price`
- Aktivní — `is_active` badge

**Akce:**
- Klik na řádek → navigace na detail položky
- Button "+ Produkt" → navigace na novou položku s předvyplněným `base_item_id = thisItem.id`

### 3.4 Layout tabů na ItemDetail

Stávající layout:
```
[Základní informace] [Přílohy]  ← existující taby
```

Nový layout (jen pro is_production_item):
```
[Základní informace] [Recepty] [Produkty] [Přílohy]
```

Podmínka: taby "Recepty" a "Produkty" viditelné **jen pokud `isProductionItem = true`**.

---

## ČÁST 4: RECIPE → ITEM VAZBA (NOVÝ SLOUPEC)

### 4.1 DB migrace — recipes.item_id

Sloupec `recipes.item_id` **NEEXISTUJE** — je potřeba ho vytvořit:

```sql
ALTER TABLE recipes ADD COLUMN item_id UUID REFERENCES items(id);
CREATE INDEX idx_recipes_item ON recipes(item_id) WHERE item_id IS NOT NULL;
```

Drizzle schema (`drizzle/schema/recipes.ts`):
```typescript
// Přidat do recipes tabulky:
itemId: uuid("item_id").references(() => items.id),
```

### 4.2 UI — pole "Výrobní položka" na formuláři receptu

**Kde:** RecipeDetail / RecipeForm, tab "Základní informace", pod pole "Styl piva" (nebo vedle názvu)

**Pole:**
- Label: **"Výrobní položka"** (= co se z tohoto receptu vyrábí)
- Typ: relation select s vyhledáváním
- **Filtr: pouze `is_production_item = true AND is_active = true`**
- Nullable (nepovinné — starší recepty nemusí mít)
- Placeholder: "Vyberte výrobní položku"

**Query pro select options:**
```sql
SELECT id, code, name FROM items 
WHERE tenant_id = {tenantId} 
  AND is_production_item = true 
  AND is_active = true 
ORDER BY name
```

### 4.3 Kopírování recipe → batch

V `createBatch()` (soubor `src/modules/batches/actions.ts`):

```typescript
// Při vytvoření batch z receptu — kopírovat item_id:
const recipe = await getRecipe(recipeId)
const batch = await createBatch({
  recipeId: recipe.id,
  itemId: recipe.itemId,  // ← KOPÍROVAT z receptu
  // ...ostatní pole
})
```

**Ověřit** že stávající kód v `createBatch()` toto dělá. Pokud ne, doplnit.

### 4.4 Kopírování recipe → recipe snapshot (kopie pro var)

Při vytvoření kopie receptu pro var (recipe snapshot / `source_recipe_id`):

```typescript
// V kódu kde se kopíruje recept pro var:
const snapshot = await createRecipeSnapshot({
  ...originalRecipe,
  itemId: originalRecipe.itemId,  // ← KOPÍROVAT i výrobní položku
  sourceRecipeId: originalRecipe.id,
})
```

**Ověřit** stávající snapshot logiku — `item_id` se musí kopírovat spolu s ostatními poli.

### 4.5 Duplikace receptu

Při duplikaci receptu (stávající funkce `duplicateRecipe()`):

```typescript
const copy = await createRecipe({
  ...original,
  name: `${original.name} (kopie)`,
  itemId: original.itemId,  // ← KOPÍROVAT
})
```

### 4.6 Recipe types update

Rozšířit Recipe type/interface o `itemId`:
```typescript
export interface Recipe {
  // ...stávající pole...
  itemId: string | null    // NOVÉ
}
```

A input schemas:
```typescript
// recipeCreateSchema — přidat:
itemId: z.string().uuid().nullable().optional(),

// recipeUpdateSchema — přidat:
itemId: z.string().uuid().nullable().optional(),
```

---

## ČÁST 5: I18N

```jsonc
// cs/batches.json — upravit bottling sekci:
{
  "bottling": {
    "title": "Stáčení",
    "empty": "Várka nemá přiřazenou výrobní položku",
    "noProducts": "Výrobní položka nemá žádné přiřazené produkty",
    "product": "Produkt",
    "volume": "Objem (L)",
    "quantity": "Ks",
    "lineTotal": "Celkem (L)",
    "save": "Uložit",
    "saved": "Stáčení uloženo",
    "saveError": "Chyba při ukládání stáčení",
    "summary": {
      "totalBottled": "Stočeno celkem",
      "recipeVolume": "Objem z receptury",
      "tankVolume": "Objem z tanku",
      "diffRecipe": "Rozdíl (receptura)",
      "diffTank": "Rozdíl (tank)",
      "surplus": "Přebytek",
      "loss": "Ztráta",
      "exact": "Beze zbytku"
    }
  }
}

// cs/recipes.json — přidat:
{
  "form": {
    "itemId": "Výrobní položka",
    "itemIdPlaceholder": "Vyberte výrobní položku",
    "itemIdHelp": "Co se z tohoto receptu vyrábí (jen položky s příznakem Výrobní)"
  }
}

// cs/items.json — přidat:
{
  "tabs": {
    "basic": "Základní informace",
    "recipes": "Recepty",
    "products": "Produkty",
    "attachments": "Přílohy"
  },
  "productionTabs": {
    "recipesEmpty": "Žádné recepty pro tuto výrobní položku",
    "productsEmpty": "Žádné produkty pro tuto výrobní položku",
    "addProduct": "Přidat produkt",
    "primaryRecipe": "Primární",
    "recipeName": "Recept",
    "recipeStyle": "Styl",
    "recipeVolume": "Objem",
    "recipeOG": "OG",
    "recipeIBU": "IBU",
    "productName": "Produkt",
    "productCode": "Kód",
    "productVolume": "Objem (L)",
    "productPackaging": "Obal",
    "productPrice": "Cena",
    "productActive": "Aktivní"
  }
}
```

Anglické verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### Tab Stáčení — auto-generování
1. [ ] Otevření tabu zobrazí VŠECHNY produkty s `base_item_id = batch.item_id`
2. [ ] Řádky s 0 ks se nezapisují do `bottling_items`
3. [ ] Uložení: upsert/delete dle nenulových řádků
4. [ ] Pokud batch nemá `item_id` → hláška "nemá výrobní položku"
5. [ ] Pokud výrobní položka nemá produkty → hláška "nemá produkty"

### Tab Stáčení — sumář
6. [ ] Stočeno celkem = SUM(ks × base_item_quantity)
7. [ ] Objem z receptury = recipe kopie batch_size_l
8. [ ] Objem z tanku = batch.actual_volume_l
9. [ ] Rozdíl (tank) = stočeno - tank, barevně (zelená/červená/šedá)
10. [ ] `packaging_loss_l` uložen na batch

### Packaged receipt
11. [ ] createPackagedReceipt stále čte z `bottling_items` (beze změny)
12. [ ] Validace: při completion v packaged režimu musí existovat bottling data
13. [ ] Warning při > 10% ztráta/přebytek

### Item detail — záložky
14. [ ] Tab "Recepty" viditelný jen pro is_production_item=true
15. [ ] Tab "Produkty" viditelný jen pro is_production_item=true
16. [ ] Tab Recepty: seznam receptů s `recipe.item_id = thisItem.id`
17. [ ] Tab Produkty: seznam položek s `base_item_id = thisItem.id`
18. [ ] Tab Produkty: button "+ Produkt" → nová položka s předvyplněným base_item_id

### Recipe → Item vazba
19. [ ] `recipes.item_id` sloupec vytvořen (migrace + Drizzle schema)
20. [ ] Index `idx_recipes_item` vytvořen
21. [ ] Formulář receptu: pole "Výrobní položka" (filtr: is_production_item=true)
22. [ ] createBatch: kopíruje `recipe.item_id → batch.item_id`
23. [ ] Recipe snapshot (kopie pro var): kopíruje `item_id`
24. [ ] Duplikace receptu: kopíruje `item_id`
25. [ ] Recipe types + schemas rozšířeny o `itemId`

### DB
26. [ ] `batches.packaging_loss_l` sloupec existuje
27. [ ] `recipes.item_id` sloupec existuje + FK + index

### Obecné
28. [ ] i18n: cs + en
29. [ ] `npm run build` bez chyb

---

## PRIORITA IMPLEMENTACE

1. **DB migrace** — `recipes.item_id` (FK + index), `batches.packaging_loss_l`
2. **Recipe types + schemas** — rozšířit o `itemId`
3. **Recipe formulář** — pole "Výrobní položka" (filtr is_production_item)
4. **Recipe → batch kopírování** — createBatch, snapshot, duplikace
5. **Tab Stáčení redesign** — auto-generování řádků, sumář, ukládání
6. **Úprava validace batch completion** — kontrola bottling dat
7. **Item detail taby** — Recepty, Produkty
8. **i18n**

---

## TECHNICKÉ POZNÁMKY

- **Bottling_items tabulka zůstává** — je to storage layer. Jen se mění jak se plní (z auto-generated UI místo ručního přidávání).
- **createPackagedReceipt() se NEMĚNÍ** — čte bottling_items jako dřív. Data v nich jsou jen jinak generovaná.
- **packaging_loss_l** — kladná = ztráta, záporná = přebytek. Vstup pro S5 (daňový sklad — manko/přebytek).
- **recipes.item_id** — NEEXISTUJE, vytvořit migrací. Přidat FK, index, Drizzle schema, types, schemas. Kopírovat ve všech relevantních operacích: createBatch, snapshot, duplikace.
- **Performance** — query na produkty dle base_item_id: přidat index `CREATE INDEX idx_items_base_item ON items(base_item_id) WHERE base_item_id IS NOT NULL`.
- **Edge case: batch bez actual_volume_l** — sumář zobrazit "Objem z tanku: nevyplněn", rozdíl nepočítat.
- **Edge case: prodejní položka bez base_item_quantity** — přeskočit v tabulce (nemělo by nastat, ale defensive).

### Aktualizuj dokumentaci
- CHANGELOG.md
- PRODUCT-SPEC.md
- CLAUDE.md
