# SPRINT 4 PATCH — Výdej surovin na várku (demand model)
## ProfiBrew.com | Patch spec
### Datum: 22.02.2026

---

## KONTEXT

Sprint 4 je implementován. Tento patch přidává výdej surovin na várku a zavádí **demand model** — jednotný způsob sledování požadavků z objednávek a várek.

**MVP režim: BEZ rezervací.** Požadavek → Výdej (žádný mezikrok). Rezervace se přidá post-MVP jako opt-in per shop setting.

**Prerekvizita:** Snapshot receptu při vytvoření várky (samostatný pokyn).

**Odhad:** 6–8 hodin

---

## PRINCIP: DEMAND MODEL

### Tři oddělené koncepty

```
POŽADAVEK (demand)     →    VÝDEJ (issue)
"Potřebuji 10 kg"          "Vzal jsem 10 kg"
objednávka / várka          stock_issue + movements
```

Požadavky generují dva zdroje:

| Zdroj | Nosič požadavku | Kdy vzniká |
|-------|----------------|------------|
| Objednávka | `order_items` | confirmOrder() |
| Várka | `recipe_items` (snapshot) | createBatch() s receptem |

### Co sledujeme na stock_status (MVP — bez rezervací)

| Stav skladu | Požadavky | Rozdíl |
|-------------|-----------|--------|
| `quantity` | `demanded_qty` (computed) | `quantity - demanded_qty` |

- **demanded_qty** = SUM nepokrytých požadavků (kde `issued_qty < required_qty`)
- Computed za letu, nepersistovaný
- **reserved_qty** zůstává na stock_status, ale pro MVP = 0 (nepoužívá se)

### Příprava pro budoucí režim s rezervacemi

```
POŽADAVEK → REZERVACE → VÝDEJ
```

Sloupce `reserved_qty` na demand lines (order_items, recipe_items) se přidají s default 0. Shop setting `use_reservations: boolean` (default false) — post-MVP aktivace.

---

## FÁZE P1: DB SCHEMA

### P1.1 stock_issue_lines — vazba na demand

```sql
-- Vazba výdejového řádku na ingredienci receptu (batch)
ALTER TABLE stock_issue_lines
  ADD COLUMN recipe_item_id UUID REFERENCES recipe_items(id);

-- Vazba výdejového řádku na řádek objednávky
ALTER TABLE stock_issue_lines
  ADD COLUMN order_item_id UUID REFERENCES order_items(id);
```

### P1.2 recipe_items — příprava pro demand tracking

```sql
-- Příprava pro rezervace (post-MVP, zatím default 0)
ALTER TABLE recipe_items
  ADD COLUMN reserved_qty DECIMAL DEFAULT 0;
```

### P1.3 order_items — příprava pro demand tracking

```sql
-- Příprava pro rezervace (post-MVP, zatím default 0)
ALTER TABLE order_items
  ADD COLUMN reserved_qty DECIMAL DEFAULT 0;
```

### P1.4 is_reserved — NEPOUŽÍVAT

Pokud `stock_issues.is_reserved` existuje z implementace Sprint 4:
- **Smazat sloupec** nebo ignorovat
- Odstranit veškeré reference v kódu (grep `is_reserved`)
- Reservace na výdejce je architektonicky špatně — patří na demand line

```sql
-- Pokud existuje:
ALTER TABLE stock_issues DROP COLUMN IF EXISTS is_reserved;
```

---

## FÁZE P2: DEMANDED QTY — COMPUTED VIEW

### P2.1 Demand query per item × warehouse

```typescript
/**
 * Spočítá nepokryté požadavky per item × warehouse.
 * Zdroje: potvrzené objednávky + várky s receptem.
 */
async function getDemandedQty(
  itemId: string, 
  warehouseId: string
): Promise<number> {
  
  // 1. Demand z objednávek (confirmed, ne cancelled/invoiced)
  const orderDemand = await db.queryOne(`
    SELECT COALESCE(SUM(
      oi.quantity - COALESCE(oi_issued.issued_qty, 0)
    ), 0) as demand
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(ABS(sm.quantity)), 0) as issued_qty
      FROM stock_issue_lines sil
      JOIN stock_movements sm ON sm.stock_issue_line_id = sil.id
      WHERE sil.order_item_id = oi.id
    ) oi_issued ON true
    WHERE oi.item_id = $1
      AND o.status IN ('confirmed', 'in_preparation', 'shipped')
      AND oi.quantity > COALESCE(oi_issued.issued_qty, 0)
  `, [itemId])
  
  // 2. Demand z várek (recipe_items ze snapshotů aktivních várek)
  const batchDemand = await db.queryOne(`
    SELECT COALESCE(SUM(
      ri_scaled.needed_qty - COALESCE(ri_issued.issued_qty, 0)
    ), 0) as demand
    FROM recipe_items ri
    JOIN recipes r ON r.id = ri.recipe_id
    JOIN batches b ON b.recipe_id = r.id
    CROSS JOIN LATERAL (
      SELECT (CAST(ri.amount_g AS DECIMAL) 
        / COALESCE(NULLIF(u.to_base_factor, 0), 1))
        * (COALESCE(b.planned_volume_l, r.batch_size_l) 
        / COALESCE(NULLIF(r.batch_size_l, 0), 1)
      ) as needed_qty
      FROM units u WHERE u.id = ri.unit_id
    ) ri_scaled
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(ABS(sm.quantity)), 0) as issued_qty
      FROM stock_issue_lines sil
      JOIN stock_movements sm ON sm.stock_issue_line_id = sil.id
      WHERE sil.recipe_item_id = ri.id
    ) ri_issued ON true
    WHERE ri.item_id = $1
      AND b.status IN ('planned', 'brewing', 'fermenting', 'conditioning')
      AND r.status = 'batch_snapshot'
      AND ri_scaled.needed_qty > COALESCE(ri_issued.issued_qty, 0)
  `, [itemId])
  
  return (orderDemand?.demand || 0) + (batchDemand?.demand || 0)
}
```

**POZOR:** Výše uvedená query je pro demonstraci logiky. V praxi může být škálování batch množství komplikované (jednotky, konverze). Claude Code musí implementovat přesný přepočet dle existující logiky v recipe_items.

### P2.2 Demand rozpad (pro detail pohled)

```typescript
interface DemandBreakdown {
  source: 'order' | 'batch'
  sourceId: string
  sourceCode: string          // OBJ-2026-001 nebo V-2026-003
  requiredQty: number
  issuedQty: number
  remainingQty: number        // required - issued
}

async function getDemandBreakdown(
  itemId: string, 
  warehouseId: string
): Promise<DemandBreakdown[]> {
  // Query objednávky + várky, vrátit per-source rozpad
  // Použít pro UI "klikni na Požadavky → rozpad"
}
```

### P2.3 Stock status view rozšíření

Na item detail tabu "Stav skladu" přidat sloupce:

| Sklad | Stav | Požadavky | Rozdíl |
|-------|------|-----------|--------|
| Suroviny | 50 kg | 35 kg | **+15 kg** |
| Hlavní | 10 kg | 0 kg | +10 kg |

- **Požadavky** = demanded_qty (computed, viz P2.1)
- **Rozdíl** = quantity - demanded_qty
  - Zelený pokud > 0
  - Červený pokud < 0 (nepokryto)
- Klik na "Požadavky" → expandable/tooltip s rozpadem (P2.2): "OBJ-001: 10 kg, V-003: 25 kg"

---

## FÁZE P3: PRODUCTION ISSUE — BACKEND

### P3.1 createProductionIssue() — draft výdejka z receptu

```typescript
async function createProductionIssue(batchId: string): Promise<StockIssue> {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) throw new Error('Várka nemá přiřazený recept')
  
  const recipe = await getRecipe(batch.recipeId)  // Snapshot kopie
  const recipeItems = await getRecipeIngredients(batch.recipeId)
  const shop = await getShop(batch.shopId)
  
  const scaleFactor = (batch.plannedVolumeL || recipe.batchSizeL) 
                      / (recipe.batchSizeL || 1)
  
  const issue = await createStockIssue({
    type: 'issue',
    purpose: 'production',
    batch_id: batchId,
    warehouse_id: shop.settings.default_warehouse_materials_id,
    date: new Date(),
  })
  
  for (const ri of recipeItems) {
    const baseAmountG = parseFloat(ri.amountG) || 0
    const unitFactor = ri.unitToBaseFactor ? parseFloat(ri.unitToBaseFactor) : 1
    const scaledQty = (baseAmountG / unitFactor) * scaleFactor
    
    await addStockIssueLine(issue.id, {
      item_id: ri.itemId,
      requested_qty: scaledQty,
      recipe_item_id: ri.id,
    })
  }
  
  return issue  // DRAFT — user edituje, vybere šarže, potvrdí
}
```

**Žádné reserveProductionMaterials().** Draft výdejka = rozpracovaný doklad, ne rezervace.

### P3.2 directProductionIssue() — přímý výdej

```typescript
async function directProductionIssue(batchId: string): Promise<StockIssue> {
  const issue = await createProductionIssue(batchId)
  // Prevalidace na FE (částečný výdej dialog) proběhne PŘED voláním confirm
  await confirmStockIssue(issue.id)
  return issue
}
```

### P3.3 prefillIssueFromBatch() — opačný směr

```typescript
async function prefillIssueFromBatch(issueId: string, batchId: string) {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) throw new Error('Várka nemá přiřazený recept')
  
  const recipe = await getRecipe(batch.recipeId)
  const recipeItems = await getRecipeIngredients(batch.recipeId)
  const scaleFactor = (batch.plannedVolumeL || recipe.batchSizeL) 
                      / (recipe.batchSizeL || 1)
  
  await clearIssueLines(issueId)
  
  for (const ri of recipeItems) {
    const baseAmountG = parseFloat(ri.amountG) || 0
    const unitFactor = ri.unitToBaseFactor ? parseFloat(ri.unitToBaseFactor) : 1
    const scaledQty = (baseAmountG / unitFactor) * scaleFactor
    
    await addStockIssueLine(issueId, {
      item_id: ri.itemId,
      requested_qty: scaledQty,
      recipe_item_id: ri.id,
    })
  }
}
```

### P3.4 confirmStockIssue() — BEZ reservation logiky

V `confirmStockIssue()`:
- **Smazat** veškerou `is_reserved` / `unreserveProductionMaterials` logiku
- FIFO engine běží standardně — movements s receipt_line_id
- `reserved_qty` na stock_status se **NEMĚNNÍ** (pro MVP nepoužíváme)

---

## FÁZE P4: BATCH DETAIL — TAB "SUROVINY" REDESIGN

### P4.1 Data model

```typescript
interface BatchIngredientRow {
  recipeItemId: string
  itemName: string
  category: string           // 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  recipeQty: number          // Z receptu, škálované na objem várky
  unit: string
  issuedQty: number          // SUM(ABS(movements)) z confirmed production issues
  missingQty: number         // max(0, recipeQty - issuedQty)
  lots: Array<{
    lotNumber: string | null
    quantity: number
    receiptLineId: string
  }>
}
```

### P4.2 getBatchIngredients() query

```typescript
async function getBatchIngredients(batchId: string): Promise<BatchIngredientRow[]> {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) return []
  
  const recipe = await getRecipe(batch.recipeId)
  const recipeItems = await getRecipeIngredients(batch.recipeId)
  const scaleFactor = (batch.plannedVolumeL || recipe.batchSizeL) 
                      / (recipe.batchSizeL || 1)
  
  // Všechny production issues na tento batch (ne cancelled)
  const productionIssues = await db.query(`
    SELECT si.id, si.status
    FROM stock_issues si
    WHERE si.batch_id = $1 
      AND si.purpose = 'production'
      AND si.type = 'issue'
      AND si.status != 'cancelled'
  `, [batchId])
  
  const issueIds = productionIssues.map(i => i.id)
  
  // Vydané množství per recipe_item_id (z confirmed movements)
  const issuedAgg = issueIds.length > 0 ? await db.query(`
    SELECT 
      sil.recipe_item_id,
      COALESCE(SUM(ABS(sm.quantity)), 0) as issued_qty
    FROM stock_issue_lines sil
    JOIN stock_issues si ON si.id = sil.stock_issue_id
    JOIN stock_movements sm ON sm.stock_issue_line_id = sil.id
    WHERE sil.stock_issue_id = ANY($1)
      AND si.status = 'confirmed'
      AND sil.recipe_item_id IS NOT NULL
    GROUP BY sil.recipe_item_id
  `, [issueIds]) : []
  
  // Šarže per recipe_item_id
  const lotDetails = issueIds.length > 0 ? await db.query(`
    SELECT 
      sil.recipe_item_id,
      rl.lot_number,
      sm.receipt_line_id,
      ABS(sm.quantity) as quantity
    FROM stock_movements sm
    JOIN stock_issue_lines sil ON sil.id = sm.stock_issue_line_id
    JOIN stock_issue_lines rl ON rl.id = sm.receipt_line_id
    WHERE sm.stock_issue_id = ANY($1)
      AND sm.quantity < 0
      AND sil.recipe_item_id IS NOT NULL
  `, [issueIds]) : []
  
  return recipeItems.map(ri => {
    const baseAmountG = parseFloat(ri.amountG) || 0
    const unitFactor = ri.unitToBaseFactor ? parseFloat(ri.unitToBaseFactor) : 1
    const recipeQty = (baseAmountG / unitFactor) * scaleFactor
    
    const agg = issuedAgg.find(a => a.recipe_item_id === ri.id)
    const issuedQty = agg?.issued_qty || 0
    
    return {
      recipeItemId: ri.id,
      itemName: ri.itemName,
      category: ri.category,
      recipeQty,
      unit: ri.unitSymbol || 'g',
      issuedQty,
      missingQty: Math.max(0, recipeQty - issuedQty),
      lots: lotDetails
        .filter(l => l.recipe_item_id === ri.id)
        .map(l => ({
          lotNumber: l.lot_number,
          quantity: l.quantity,
          receiptLineId: l.receipt_line_id,
        })),
    }
  })
}
```

### P4.3 UI tabulka

| Surovina | Kategorie | Recept | Vydáno | Chybí | Šarže |
|----------|-----------|--------|--------|-------|-------|
| Plzeňský slad | Slad | 10 kg | 8 kg | **2 kg** | L-001 (6 kg), L-002 (2 kg) |
| Apollo | Chmel | 0,1 kg | 0,1 kg | 0 | — |
| Safale S-189 | Kvasnice | 0,04 kg | 0 kg | **0,04 kg** | — |

- **Chybí** — červeně pokud > 0, zelené/šedé pokud 0
- **Šarže** — klikatelné, link na Tracking detail
- Grouping per kategorie (collapsible)
- Žádný sloupec "Rezervováno" (MVP)

### P4.4 Akce

| Tlačítko | Akce | Výsledek |
|----------|------|----------|
| "Připravit výdejku" | `createProductionIssue()` | Otevře draft výdejku (user edituje, vybere šarže, potvrdí) |
| "Vydat suroviny" | `directProductionIssue()` + prevalidace | Rovnou confirm (s dialogem při nedostatku) |

- Obě tlačítka dostupná vždy (pokud batch má recept)
- Žádné "Rezervovat" / "Zrušit rezervaci" (MVP)

### P4.5 Sekce "Výdejky" pod tabulkou

Seznam production issues navázaných na batch:

| Kód | Stav | Datum |
|-----|------|-------|
| VD-S1-005 | ✅ Potvrzeno | 15.02.2026 |
| VD-S1-008 | 📝 Draft | 18.02.2026 |

- Kód = klikatelný link na detail výdejky
- Cancelled výdejky nezobrazovat (nebo přeškrtnutě)

---

## FÁZE P5: VÝDEJKA FORMULÁŘ — PURPOSE + BATCH PREFILL

### P5.1 Purpose select

Na formuláři výdejky přidat dropdown **"Účel"**:

| Hodnota | Label |
|---------|-------|
| `sale` | Prodej (default) |
| `production` | Výroba |
| `transfer` | Převod |
| `writeoff` | Odpis |
| `other` | Ostatní |

### P5.2 Batch select (podmíněný)

Zobrazit **JEN** pokud purpose = `production`:

- Select z batches ve stavu planned / brewing / fermenting / conditioning
- Label: "{batchNumber} — {recipeName}"
- Po výběru → `prefillIssueFromBatch()` → řádky se předvyplní
- Pokud user změní batch → confirm dialog "Přepsat řádky?" → re-prefill
- Pokud purpose se změní z production na jiný → batch select zmizí, batch_id se vyčistí

### P5.3 Přechod z batch detail

Pokud user přijde z batch detail (klikl "Připravit výdejku"):
- Výdejka se otevře s purpose=production a batch_id=X přednastavené
- Řádky předvyplněny z receptu
- User může editovat → uložit draft → potvrdit

---

## FÁZE P6: TRACKING DETAIL — SLOUPEC VÁRKA

### P6.1 Rozšíření query

V Tracking detailu (Sprint 3 patch P6.3) — tabulka "výdeje z této šarže":

```sql
SELECT sm.quantity, sm.created_at, si.code, si.purpose, 
       b.batch_number, b.id as batch_id
FROM stock_movements sm
JOIN stock_issues si ON si.id = sm.stock_issue_id
LEFT JOIN batches b ON b.id = si.batch_id
WHERE sm.receipt_line_id = :receipt_line_id
  AND sm.quantity < 0
ORDER BY sm.created_at ASC
```

### P6.2 UI

Přidat sloupec **Várka**:

| Datum | Výdejka | Účel | Várka | Množství |
|-------|---------|------|-------|----------|
| 15.02 | VD-S1-005 | Výroba | V-2026-003 | 25 kg |
| 18.02 | VD-S1-008 | Prodej | — | 10 kg |

- Várka klikatelný link na batch detail
- Prázdný pokud výdejka není na batch

---

## FÁZE P7: ÚPRAVA ORDERS — ORDER_ITEM_ID VAZBA

### P7.1 createStockIssueFromOrder() — doplnit order_item_id

V existující funkci `createStockIssueFromOrder()` (Sprint 4, fáze 4C.4) doplnit vazbu:

```typescript
// Při vytváření řádků výdejky z objednávky:
await addStockIssueLine(issue.id, {
  item_id: orderItem.item_id,
  requested_qty: orderItem.quantity,
  order_item_id: orderItem.id,     // PŘIDAT — vazba na řádek objednávky
})
```

Tohle umožní:
- Sledovat kolik z objednávky je vydáno (issued_qty computed z movements přes order_item_id)
- Demand model: demanded_qty = order_items.quantity - issued_qty
- Traceability: objednávka → výdejka → movements → šarže

### P7.2 Stávající reserved_qty logika na objednávkách

Sprint 4 implementoval `reserved_qty` na `stock_status` při confirmOrder/cancelOrder. 

**Pro MVP dvě možnosti:**

**Varianta A (čistší):** Smazat reserved_qty logiku z orders úplně. Místo toho používat demanded_qty. Available = quantity - demanded_qty.

**Varianta B (pragmatická):** Nechat jak je. reserved_qty na stock_status funguje pro objednávky jako "soft lock". Pro batch se nepoužívá.

**Doporučení: Varianta B** — fungující kód neměnit, jen přidat demand view vedle.

---

## FÁZE P8: I18N

```jsonc
// src/i18n/messages/cs/batches.json — přidat:
{
  "ingredients": {
    "title": "Suroviny",
    "columns": {
      "ingredient": "Surovina",
      "category": "Kategorie",
      "recipe": "Recept",
      "issued": "Vydáno",
      "missing": "Chybí",
      "lots": "Šarže"
    },
    "actions": {
      "prepareIssue": "Připravit výdejku",
      "directIssue": "Vydat suroviny",
      "confirmDirectIssue": "Vydat suroviny pro várku {batchNumber}?"
    },
    "issues": {
      "title": "Výdejky",
      "noIssues": "Žádné výdejky"
    },
    "noRecipe": "Várka nemá přiřazený recept"
  }
}

// src/i18n/messages/cs/stockIssues.json — přidat:
{
  "purpose": {
    "sale": "Prodej",
    "production": "Výroba",
    "transfer": "Převod",
    "writeoff": "Odpis",
    "other": "Ostatní"
  },
  "batchSelect": "Várka",
  "batchSelectHint": "Vyberte várku pro předvyplnění řádků z receptu",
  "prefillConfirm": "Přepsat řádky z nového receptu?",
  "prefillFromBatch": "Předvyplněno z várky {batchNumber}"
}

// src/i18n/messages/cs/stock.json — přidat:
{
  "demandedQty": "Požadavky",
  "demandDiff": "Rozdíl",
  "demandBreakdown": "Rozpad požadavků",
  "demandSource": {
    "order": "Objednávka",
    "batch": "Várka"
  }
}
```

Anglické verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### DB & Types
1. [ ] stock_issue_lines má sloupec recipe_item_id (FK → recipe_items)
2. [ ] stock_issue_lines má sloupec order_item_id (FK → order_items)
3. [ ] recipe_items má sloupec reserved_qty (default 0, nepoužívá se v MVP)
4. [ ] order_items má sloupec reserved_qty (default 0, nepoužívá se v MVP)
5. [ ] stock_issues.is_reserved NEEXISTUJE (smazáno / nikdy nevzniklo)

### Demand model
6. [ ] getDemandedQty() vrací nepokryté požadavky per item × warehouse
7. [ ] Item detail tab "Stav skladu": sloupce Požadavky + Rozdíl
8. [ ] Klik na Požadavky zobrazuje rozpad (objednávky + várky)

### Production issue
9. [ ] createProductionIssue: draft výdejka s řádky z recipe snapshot (škálované)
10. [ ] recipe_item_id vyplněn na každém řádku výdejky z batch
11. [ ] directProductionIssue: draft + rovnou confirm
12. [ ] Žádná reserved_qty logika na production issues

### Batch detail tab "Suroviny"
13. [ ] Tabulka: Surovina / Kategorie / Recept / Vydáno / Chybí / Šarže
14. [ ] Chybí červeně pokud > 0
15. [ ] Šarže klikatelné (link na Tracking detail)
16. [ ] Tlačítko "Připravit výdejku" → otevře draft výdejku
17. [ ] Tlačítko "Vydat suroviny" → přímý výdej (s prevalidací)
18. [ ] Sekce Výdejky pod tabulkou — seznam s linky
19. [ ] Vícenásobné výdeje se agregují (hlavní + dry hop)

### Výdejka formulář
20. [ ] Purpose select: Prodej / Výroba / Převod / Odpis / Ostatní
21. [ ] Pokud purpose=Výroba → batch select se zobrazí
22. [ ] Po výběru batch → prefill řádků z receptu
23. [ ] Řádky editovatelné po prefill
24. [ ] Změna batch → "Přepsat řádky?" dialog

### Objednávky
25. [ ] createStockIssueFromOrder doplňuje order_item_id na řádky výdejky

### Tracking
26. [ ] Tracking detail: sloupec Várka s linkem na batch

### Obecné
27. [ ] `npm run build` projde bez chyb
28. [ ] i18n: cs + en pro nové texty

---

## PRIORITA IMPLEMENTACE

1. **DB migrace** (P1) — recipe_item_id, order_item_id, reserved_qty, drop is_reserved
2. **Production issue backend** (P3) — createProductionIssue, directProductionIssue, prefillFromBatch
3. **Batch tab "Suroviny"** (P4) — getBatchIngredients, tabulka, akce, výdejky
4. **Výdejka formulář** (P5) — purpose select, batch select, prefill
5. **Orders vazba** (P7) — order_item_id na createStockIssueFromOrder
6. **Demand model** (P2) — getDemandedQty, stock status view rozšíření
7. **Tracking** (P6) — sloupec Várka
8. **i18n** (P8)

---

## TECHNICKÉ POZNÁMKY

- **Žádné reserved_qty pro production issues v MVP.** Demand model stačí — sládek vidí co potřebuje a co má. Soft lock přijde post-MVP.
- **Scale factor** — `(batch.plannedVolumeL / recipe.batchSizeL) * recipeItem.amountG`. POZOR na jednotky — unitToBaseFactor konvertuje na base unit.
- **Vícenásobné production issues** — Na jednu várku může být víc výdejek (hlavní + dry hop). getBatchIngredients() agreguje přes VŠECHNY non-cancelled production issues.
- **Recipe snapshot prerekvizita** — recipe_item_id odkazuje na snapshot, ne originál. Bez snapshotu editace receptu rozbije vazby.
- **order_item_id retroaktivní backfill** — Pokud Sprint 4 už vytvořil výdejky z objednávek bez order_item_id, zvážit backfill migrace (match přes item_id + order_id na stock_issue).
- **demanded_qty performance** — Pro MVP computed za letu. Pokud pomalé → materializovat do stock_status (post-MVP trigger/cron).
