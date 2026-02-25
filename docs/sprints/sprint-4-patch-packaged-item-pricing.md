# POKYN: Výrobní cena piva v obalech (packaged items)

## ProfiBrew.com | Doplněk cenotvorby pro prodejní položky
### Datum: 25.02.2026

---

## KONTEXT

Prodejní položky (lahve, plechovky, KEGy) jsou child items navázané přes `base_item_id` na základní výrobní položku (bulk pivo v litrech). Pro výpočet výrobní ceny packaged itemu potřebujeme 3 složky:

1. **Cena piva** — výrobní cena za litr × objem obalu (z base item)
2. **Cena obalu** — lahev + korunka + etiketa + krabice... (fixní za 1 ks)
3. **Cena stočení** — práce/energie na naplnění 1 ks (fixní za 1 ks)

**Vzorec:**
```
packaged_cost_price = (beer_cost_per_liter × base_item_quantity) + packaging_cost + filling_cost
```

**Příklad — Lahev 0,5L ležáku (výrobní cena piva 32,25 Kč/L):**
```
Pivo:      32,25 × 0,5 = 16,13 Kč
Obal:                      3,50 Kč
Stočení:                   2,00 Kč
────────────────────────────────────
Celkem:                   21,63 Kč
```

---

## ČÁST 1: DB MIGRACE

### 1.1 ALTER items — nová pole

```sql
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS packaging_cost DECIMAL,
  ADD COLUMN IF NOT EXISTS filling_cost DECIMAL;
```

| Pole | Typ | Popis |
|------|-----|-------|
| `packaging_cost` | DECIMAL | Cena obalu za 1 ks (lahev, korunka, etiketa, krabice...) |
| `filling_cost` | DECIMAL | Cena stočení/naplnění za 1 ks (práce, energie) |

### 1.2 Drizzle schema

V `drizzle/schema/items.ts` přidat do definice items tabulky:

```typescript
// === PACKAGING COSTS (for packaged/sale items with base_item) ===
packagingCost: decimal("packaging_cost"),
fillingCost: decimal("filling_cost"),
```

Umístit za `overheadPrice` v sekci PRICING.

---

## ČÁST 2: UI — ITEM DETAIL

### 2.1 Nová pole na formuláři

V sekci **Pricing** na Item detail přidat 2 nová pole. Viditelná **jen** pokud `isSaleItem = true` AND `baseItemId` je vyplněné (tzn. je to child packaged item).

| Pole | Label CZ | Label EN | Typ | Suffix |
|------|---------|---------|-----|--------|
| `packagingCost` | Cena obalu | Packaging Cost | currency | Kč |
| `fillingCost` | Cena stočení | Filling Cost | currency | Kč |

**Pozice:** Za `costPrice` (Výrobní cena), před `salePrice` (Prodejní cena).

**Visibility condition:**
```typescript
visible: (v: Record<string, unknown>) =>
  v.isSaleItem === true &&
  v.baseItemId != null &&
  v.baseItemId !== "__none__"
```

### 2.2 Computed výrobní cena — readonly info

Pod pole `packagingCost` a `fillingCost` zobrazit **readonly computed řádek**:

```
┌──────────────────────────────────────────────────────────────┐
│ Výrobní cena    Cena obalu    Cena stočení    Kalk. cena     │
│ 32,25 Kč/L     3,50 Kč       2,00 Kč         = 21,63 Kč     │
│                                                              │
│ Kalkulace: 32,25 × 0,5 L + 3,50 + 2,00 = 21,63 Kč          │
└──────────────────────────────────────────────────────────────┘
```

**Logika na klientu:**
```typescript
const calculatedPackagedCost = useMemo(() => {
  const baseItemId = values.baseItemId as string | null;
  const baseQty = parseFloat(values.baseItemQuantity as string) || 0;
  const pkgCost = parseFloat(values.packagingCost as string) || 0;
  const fillCost = parseFloat(values.fillingCost as string) || 0;

  if (!baseItemId || baseItemId === "__none__" || baseQty <= 0) return null;

  // Najít base item cost_price z productionItemOptions
  const baseItem = productionItemOptions.find(o => o.value === baseItemId);
  const beerCostPerUnit = baseItem?.costPrice ? parseFloat(baseItem.costPrice) : 0;

  const beerCost = beerCostPerUnit * baseQty;
  const total = Math.round((beerCost + pkgCost + fillCost) * 100) / 100;

  return { beerCostPerUnit, baseQty, beerCost, pkgCost, fillCost, total };
}, [values.baseItemId, values.baseItemQuantity, values.packagingCost, values.fillingCost, productionItemOptions]);
```

**Zobrazení:** Jako `<Alert>` nebo muted info box pod pricing poli. Jen pokud `calculatedPackagedCost !== null`.

**Poznámka:** `beerCostPerUnit` je `items.cost_price` base itemu. V režimu `recipe_calc` je to výrobní cena z receptu (díky předchozímu pokynu se ukládá do `recipes.costPrice` a kopíruje do `items.cost_price` base itemu — to ale zatím automaticky neděláme). Pro MVP stačí zobrazit z `items.cost_price` base itemu.

### 2.3 Rozšíření productionItemOptions

Stávající `productionItemOptions` vrací `{ value, label }`. Rozšířit o `costPrice` a `unitSymbol` pro výpočet:

```typescript
// V getProductionItems() server action nebo klientském loadu:
interface ProductionItemOption {
  value: string;
  label: string;
  costPrice: string | null;
  unitSymbol: string | null;
}
```

Pokud `productionItemOptions` již obsahuje `costPrice` (z předchozí implementace) → stačí. Pokud ne → rozšířit.

---

## ČÁST 3: TYPES & SCHEMA

### 3.1 Rozšíření Item types

V `src/modules/batches/types.ts` a/nebo `src/modules/items/types.ts`:
```typescript
// Přidat do existujícího Item interface (pokud existuje):
packagingCost: string | null;
fillingCost: string | null;
```

### 3.2 Rozšíření BottlingItem types

V `src/modules/batches/types.ts`:
```typescript
export interface BottlingItem {
  // ... stávající pole ...
  // Joined/computed pro packaged mód:
  packagingCost?: string | null;
  fillingCost?: string | null;
  baseItemQuantity?: string | null;
  unitPrice?: number | null;     // computed: beer × qty + pkg + fill
}
```

### 3.3 Zod validace

V item create/update schema:
```typescript
packagingCost: z.string().optional().nullable(),
fillingCost: z.string().optional().nullable(),
```

---

## ČÁST 4: TAB STÁČENÍ — PACKAGED MÓD

### 4.1 Rozšíření řádků stáčení

V packaged módu tab Stáčení zobrazuje N řádků (child items). Ke stávajícím sloupcům přidat:

| Sloupec | Label | Zdroj | Editovatelné |
|---------|-------|-------|-------------|
| Položka | Položka | child item name | ❌ |
| Kusy | Kusy | user input (integer) | ✅ |
| Objem | Objem | ks × base_item_quantity | ❌ computed |
| Cena piva | Pivo | beer_cost_per_L × base_item_quantity | ❌ computed |
| Obal | Obal | item.packaging_cost | ❌ |
| Stočení | Stočení | item.filling_cost | ❌ |
| Cena/ks | Cena/ks | pivo + obal + stočení | ❌ computed |
| Celkem | Celkem | cena/ks × kusy | ❌ computed |
| Expirace | Expirace | bottled_date + shelf_life_days | ❌ computed |

**Vzorec pro řádek:**
```typescript
const beerCostPerUnit = beerCostPerLiter * baseItemQuantity;
const unitPrice = beerCostPerUnit + (packagingCost ?? 0) + (fillingCost ?? 0);
const totalCost = unitPrice * quantity;
```

**Kde vzít `beerCostPerLiter`:**
- Dle `beer_pricing_mode` z shop settings:
  - `fixed`: `baseItem.costPrice` (výrobní cena base itemu = cena za litr)
  - `recipe_calc`: `recipe.costPrice / recipe.batchSizeL` (z kopie receptu varu)
- Stejná logika jako `getProductionUnitPrice()` z pokyn-bottling-lot-expiry-price

### 4.2 Sumář stáčení — rozšíření pro packaged

```
Stočeno celkem:    148,0 L   (SUM ks × base_item_quantity)
Objem z receptury: 150,0 L
Objem z tanku:     150,0 L
────────────────────────────
Rozdíl (tank):     -2,0 L    🔴 Ztráta

Celková hodnota:   4 320,00 Kč  (SUM celkem per řádek)
```

---

## ČÁST 5: NASKLADNĚNÍ — PACKAGED MÓD

### 5.1 createProductionReceipt() — packaged

V packaged módu se vytváří N řádků příjemky (1 per child item):

```typescript
// Pro každý bottling_item:
{
  itemId: bottlingItem.itemId,          // child item (lahev, KEG...)
  requestedQty: String(bottlingItem.quantity),  // kusy
  issuedQty: String(bottlingItem.quantity),
  unitPrice: String(unitPrice),          // computed: beer + pkg + fill
  totalCost: String(unitPrice * quantity),
  lotNumber: batch.lotNumber,
  expiryDate: expiryDate,               // bottled_date + shelf_life_days
}
```

**`unitPrice` výpočet v server action:**
```typescript
async function calculatePackagedUnitPrice(
  tenantId: string,
  childItem: { baseItemQuantity: string | null; packagingCost: string | null; fillingCost: string | null },
  beerCostPerLiter: number
): Promise<number> {
  const baseQty = parseFloat(childItem.baseItemQuantity ?? "0");
  const pkgCost = parseFloat(childItem.packagingCost ?? "0");
  const fillCost = parseFloat(childItem.fillingCost ?? "0");
  const beerCost = beerCostPerLiter * baseQty;
  return Math.round((beerCost + pkgCost + fillCost) * 100) / 100;
}
```

### 5.2 Srovnání bulk vs packaged příjemka

| Aspekt | Bulk | Packaged |
|--------|------|----------|
| Řádků příjemky | 1 | N (per child item) |
| Item na řádku | base item (výrobní) | child items (prodejní) |
| Quantity | litry (decimal) | kusy (integer) |
| Unit price | Kč/L (beer cost per liter) | Kč/ks (beer + obal + stočení) |
| Lot number | batch.lot_number | batch.lot_number (stejná šarže) |
| Expiry date | bottled_date + shelf_life | bottled_date + shelf_life (stejná) |

---

## ČÁST 6: I18N

### 6.1 Items i18n

`src/i18n/messages/cs/items.json` — do `detail.fields`:
```json
"packagingCost": "Cena obalu",
"fillingCost": "Cena stočení",
"calculatedCost": "Kalkulovaná výrobní cena",
"calculatedCostFormula": "Pivo {beerCost} + Obal {pkgCost} + Stočení {fillCost} = {total} Kč"
```

`src/i18n/messages/en/items.json` — do `detail.fields`:
```json
"packagingCost": "Packaging Cost",
"fillingCost": "Filling Cost",
"calculatedCost": "Calculated Production Cost",
"calculatedCostFormula": "Beer {beerCost} + Packaging {pkgCost} + Filling {fillCost} = {total}"
```

### 6.2 Batches / bottling i18n

`src/i18n/messages/cs/batches.json` — do `bottling`:
```json
"beerCost": "Pivo",
"packagingCost": "Obal",
"fillingCost": "Stočení",
"unitCost": "Cena/ks",
"totalCost": "Celkem",
"totalValue": "Celková hodnota"
```

`src/i18n/messages/en/batches.json` — do `bottling`:
```json
"beerCost": "Beer",
"packagingCost": "Packaging",
"fillingCost": "Filling",
"unitCost": "Cost/pc",
"totalCost": "Total",
"totalValue": "Total Value"
```

---

## ČÁST 7: ITEM ACTIONS — SAVE/LOAD

### 7.1 createItem / updateItem

Rozšířit o nová pole:
```typescript
// V actions.ts createItem/updateItem:
packagingCost: data.packagingCost ?? null,
fillingCost: data.fillingCost ?? null,
```

### 7.2 getItemDetail

Ověřit, že `getItemDetail` vrací `packagingCost` a `fillingCost`. Pokud stávající SELECT je `select()` (bez explicitních sloupců) → automaticky vrací. Pokud je explicitní → přidat.

### 7.3 getChildItems (pro bottling)

Bottling v packaged módu načítá child items. Ověřit/rozšířit query:
```typescript
// WHERE base_item_id = batch.itemId
// SELECT: id, name, code, base_item_quantity, packaging_cost, filling_cost
```

---

## ČÁST 8: AKCEPTAČNÍ KRITÉRIA

### DB & Schema
- [ ] `items.packaging_cost` — nový sloupec DECIMAL
- [ ] `items.filling_cost` — nový sloupec DECIMAL
- [ ] Drizzle schema aktualizované
- [ ] Migrace funguje na čisté DB

### Item Detail UI
- [ ] Pole "Cena obalu" viditelné jen na child items (isSaleItem + baseItemId)
- [ ] Pole "Cena stočení" viditelné jen na child items (isSaleItem + baseItemId)
- [ ] Computed info box: vzorec výrobní ceny = beer × qty + obal + stočení
- [ ] Computed cena se dynamicky přepočítá při změně base itemu nebo costs
- [ ] Save/load funguje

### Tab Stáčení — packaged mód
- [ ] Řádky zobrazují: Položka, Kusy, Objem, Pivo, Obal, Stočení, Cena/ks, Celkem, Expirace
- [ ] Cena piva = beer_cost_per_liter × base_item_quantity (dle pricing mode)
- [ ] Cena/ks = pivo + obal + stočení
- [ ] Celkem = cena/ks × kusy
- [ ] Sumář: celková hodnota stáčení

### Naskladnění — packaged mód
- [ ] createProductionReceipt(): N řádků příjemky (per child item)
- [ ] unit_price = beer + packaging_cost + filling_cost
- [ ] total_cost = unit_price × quantity (kusy)
- [ ] lot_number a expiry_date shodné na všech řádcích

---

## VAZBA NA PŘEDCHOZÍ POKYNY

**DOPLŇUJE:**
- `pokyn-naskladneni-piva-explicitni.md` — packaged mód naskladnění nyní má kompletní cenu
- `pokyn-bottling-lot-expiry-price.md` — unit_price v packaged = beer + obal + stočení
- `pokyn-recipe-calculation-overhead.md` — beer_cost_per_liter z recipe kalkulace se používá jako vstup

**NEMĚNÍ:**
- Bulk mód — beze změny (1 řádek, cena za litr, žádné obalové náklady)
- Kalkulační engine receptu — beze změny (počítá cenu piva, ne obalů)
- Shop settings — žádné nové parametry (packaging_cost a filling_cost jsou per item)
