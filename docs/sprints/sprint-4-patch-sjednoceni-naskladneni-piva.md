## Úkol: Sjednocení naskladnění piva (bulk + packaged) přes tab Stáčení

Aktuální `onBatchCompleted()` VŽDY naskladní výrobní položku vcelku (bulk) bez ohledu na shop settings a bez využití tab Stáčení. To je špatně. Sjednocujeme oba režimy — bulk i packaged — tak, aby obě cesty šly přes tab Stáčení.

**DŮVOD:** Sládek si vždy potřebuje zkontrolovat a upravit výsledný objem. I při "bulk" stáčení (přetok z ležáckého do expedičního tanku) se objem koriguje, evidují se ztráty/přebytky. Tab Stáčení je jednotné místo kde to probíhá.

---

## KONTEXT — CO JE ŠPATNĚ

### Aktuální implementace `onBatchCompleted()`:
```
1. Najde první aktivní warehouse (ne z shop settings)
2. Pokud batch má itemId → vytvoří příjemku s 1 řádkem (production item, celý objem)
3. Ignoruje stock_mode z shop settings
4. Ignoruje bottling_items tab
5. Batch nemá shopId → nemůže získat shop settings
```

### Co má být:
```
1. Batch má vazbu na shop → přes shop settings zjistit stock_mode
2. stock_mode 'none' → žádná příjemka, žádné stáčení
3. stock_mode 'bulk' → tab Stáčení zobrazí 1 řádek (výrobní položka), user edituje objem
4. stock_mode 'packaged' → tab Stáčení zobrazí N řádků (balené produkty), user edituje kusy
5. Příjemka se vytvoří z bottling_items při batch completion (obě varianty)
```

---

## ČÁST 1: VAZBA BATCH → SHOP

### 1.1 Získání shop settings pro batch

**NEBUDEME přidávat shop_id sloupec na batches** — zbytečná migrace a údržba pro MVP kde 95% pivovarů má 1 provozovnu.

**Řešení — resolve funkce:**

```typescript
async function getShopSettingsForBatch(
  tx: TxType,
  tenantId: string
): Promise<ShopSettings> {
  // Najít default shop (nebo první aktivní)
  const shopRows = await tx
    .select({ settings: shops.settings })
    .from(shops)
    .where(
      and(
        eq(shops.tenantId, tenantId),
        eq(shops.isActive, true)
      )
    )
    .orderBy(desc(shops.isDefault), asc(shops.createdAt))
    .limit(1);

  if (!shopRows[0]) {
    return { stock_mode: 'none' } as ShopSettings;
  }

  return shopRows[0].settings as ShopSettings;
}
```

**Pozn:** Default shop (isDefault=true) má prioritu. Pokud žádný nemá isDefault, vezme se první vytvořený. Pokud žádný shop neexistuje → stock_mode 'none' (žádné naskladnění).

---

## ČÁST 2: TAB STÁČENÍ — SJEDNOCENÍ PRO BULK + PACKAGED

### 2.1 Auto-generování řádků dle stock_mode

Při otevření tabu "Stáčení" na batch detail:

```typescript
async function getBottlingLines(
  batchId: string,
  tenantId: string
): Promise<BottlingLine[]> {
  const batch = await getBatch(batchId);
  if (!batch.itemId) return []; // Žádná výrobní položka

  const settings = await getShopSettingsForBatch(tenantId);

  // Načíst existující bottling_items (pokud user už něco vyplnil)
  const existing = await getBatchBottlingItems(batchId);

  if (settings.stock_mode === 'bulk') {
    // === BULK: 1 řádek = výrobní položka sama ===
    const productionItem = await getItem(batch.itemId);
    if (!productionItem) return [];

    const existingLine = existing.find(e => e.itemId === batch.itemId);
    return [{
      itemId: productionItem.id,
      itemName: productionItem.name,
      itemCode: productionItem.code,
      baseItemQuantity: 1,           // 1 L = 1 L (MJ výrobní položky = litry)
      quantity: existingLine?.quantity 
        ?? Number(batch.actualVolumeL) 
        ?? Number(batch.recipeBatchSizeL) 
        ?? 0,
      isBulk: true,                  // UI flag: zobrazit jako objem v L, ne kusy
    }];

  } else if (settings.stock_mode === 'packaged') {
    // === PACKAGED: N řádků = child items dle base_item_id ===
    const childItems = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.baseItemId, batch.itemId),
          eq(items.isActive, true)
        )
      )
      .orderBy(asc(items.name));

    return childItems.map(item => {
      const existingLine = existing.find(e => e.itemId === item.id);
      return {
        itemId: item.id,
        itemName: item.name,
        itemCode: item.code,
        baseItemQuantity: Number(item.baseItemQuantity) || 0,
        quantity: existingLine?.quantity ?? 0,
        isBulk: false,
      };
    });

  } else {
    // stock_mode 'none' — žádné řádky
    return [];
  }
}
```

### 2.2 UI tabulka — dva módy

**Mód BULK (1 řádek):**

| Produkt | MJ | Množství | Celkem (L) |
|---------|-----|----------|-----------|
| Světlý ležák 12° | L | [148___] | 148 L |

- **Množství** = editovatelný decimal input, předvyplněný z `batch.actual_volume_l`
- **Celkem** = quantity × 1 = quantity (MJ = litry)
- UI: pole zobrazuje litry (ne kusy)

**Mód PACKAGED (N řádků):**

| Produkt | Objem (L) | Ks | Celkem (L) |
|---------|-----------|-----|-----------|
| Lahev 0,5L | 0.5 | [___] | 0 |
| PET 1,5L | 1.5 | [___] | 0 |
| KEG 30L | 30 | [3___] | 90 |

- **Ks** = editovatelný integer input
- **Celkem** = ks × base_item_quantity

**Mód NONE:**

Zobrazit hlášku: "Naskladnění piva je vypnuto v nastavení provozovny."

### 2.3 Sumář — společný pro oba módy

```
Stočeno celkem:    148,0 L      ← SUM(qty × baseItemQuantity)
Objem z receptury: 150 L        ← batch kopie receptu: recipe.batch_size_l
Objem z tanku:     150 L        ← batch.actual_volume_l
────────────────────────────
Rozdíl (tank):     -2,0 L       ← stočeno - actual_volume_l
                   Ztráta        ← červeně (nebo zeleně pro přebytek)
```

### 2.4 Ukládání — saveBottlingData()

```typescript
async function saveBottlingData(
  batchId: string,
  lines: BottlingLine[]
): Promise<void> {
  const batch = await getBatch(batchId);

  // 1. Smazat stávající bottling_items
  await deleteAllBottlingItems(batchId);

  // 2. Vložit nenulové řádky
  for (const line of lines.filter(l => l.quantity > 0)) {
    await addBottlingItem(batchId, {
      itemId: line.itemId,
      quantity: line.quantity,
      baseUnits: String(line.quantity * line.baseItemQuantity),
    });
  }

  // 3. Spočítat a uložit packaging_loss_l
  const totalBottledL = lines.reduce(
    (sum, l) => sum + l.quantity * l.baseItemQuantity, 0
  );
  const tankVolume = Number(batch.actualVolumeL) || 0;
  const loss = tankVolume - totalBottledL;
  // kladné = ztráta (stočili méně), záporné = přebytek

  await updateBatch(batchId, {
    packagingLossL: String(loss),
  });
}
```

---

## ČÁST 3: PŘEPIS onBatchCompleted()

### 3.1 Nová logika

Kompletně přepsat `onBatchCompleted()` v `src/modules/batches/actions.ts`:

```typescript
async function onBatchCompleted(
  tx: TxType,
  tenantId: string,
  batchId: string,
  batch: typeof batches.$inferSelect
): Promise<void> {
  // 1. Získat shop settings
  const settings = await getShopSettingsForBatch(tx, tenantId);

  // 2. Pokud stock_mode = 'none' → skip
  if (!settings.stock_mode || settings.stock_mode === 'none') return;

  // 3. Batch musí mít itemId (výrobní položku)
  if (!batch.itemId) return;

  // 4. Načíst bottling_items — MUSÍ existovat
  const bottlingItems = await tx
    .select()
    .from(bottlingItemsTable)
    .where(
      and(
        eq(bottlingItemsTable.tenantId, tenantId),
        eq(bottlingItemsTable.batchId, batchId)
      )
    );

  if (bottlingItems.length === 0) {
    // Pro bulk: pokud user nevyplnil tab Stáčení, vytvořit 1 fallback řádek z actual_volume_l
    // Pro packaged: error — musí vyplnit stáčení
    if (settings.stock_mode === 'bulk') {
      // Auto-fallback: naskladnit výrobní položku s celým objemem
      // (zpětná kompatibilita + convenience)
      const receiptQty = batch.actualVolumeL ?? "0";
      if (Number(receiptQty) <= 0) return;

      // ... vytvoření příjemky se 1 řádkem (stávající logika)
      await createReceiptForBatch(tx, tenantId, batchId, batch, settings, [{
        itemId: batch.itemId,
        quantity: Number(receiptQty),
        baseItemQuantity: 1,
      }]);
      return;
    } else {
      // Packaged bez bottling dat → skip (validace by měla zachytit dříve)
      return;
    }
  }

  // 5. Vytvořit příjemku z bottling_items
  const lines = bottlingItems.map(bi => ({
    itemId: bi.itemId,
    quantity: Number(bi.quantity),
    baseItemQuantity: Number(bi.baseUnits) / Number(bi.quantity) || 1,
  }));

  await createReceiptForBatch(tx, tenantId, batchId, batch, settings, lines);
}
```

### 3.2 createReceiptForBatch() — společná funkce

```typescript
async function createReceiptForBatch(
  tx: TxType,
  tenantId: string,
  batchId: string,
  batch: typeof batches.$inferSelect,
  settings: ShopSettings,
  lines: Array<{ itemId: string; quantity: number; baseItemQuantity: number }>
): Promise<void> {
  // a. Warehouse z shop settings (nebo fallback na první aktivní)
  const warehouseId = settings.default_warehouse_beer_id
    || await getFirstActiveWarehouseId(tx, tenantId);

  if (!warehouseId) return;

  // b. Načíst warehouse pro kód
  const warehouse = await tx
    .select()
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .limit(1);

  if (!warehouse[0]) return;

  // c. Generovat číslo dokladu
  const code = await getNextNumber(tenantId, "stock_issue_receipt", warehouse[0].id);

  // d. Vytvořit příjemku
  const today = new Date().toISOString().split("T")[0]!;
  const issueRows = await tx
    .insert(stockIssues)
    .values({
      tenantId,
      code,
      movementType: "receipt",
      movementPurpose: "production_in",
      date: today,
      status: "draft",
      warehouseId,
      batchId,
      notes: `Auto-receipt for batch ${batch.batchNumber}`,
    })
    .returning();

  const issue = issueRows[0];
  if (!issue) return;

  // e. Řádky
  let totalCost = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.quantity <= 0) continue;

    // Cena: z karty položky (MVP = fixed)
    const itemRow = await tx
      .select({ costPrice: items.costPrice })
      .from(items)
      .where(eq(items.id, line.itemId))
      .limit(1);

    const unitPrice = Number(itemRow[0]?.costPrice) || 0;
    const lineTotal = line.quantity * unitPrice;
    totalCost += lineTotal;

    const lineRows = await tx
      .insert(stockIssueLines)
      .values({
        tenantId,
        stockIssueId: issue.id,
        itemId: line.itemId,
        lineNo: i + 1,
        requestedQty: String(line.quantity),
        unitPrice: String(unitPrice),
        sortOrder: i,
      })
      .returning();

    const dbLine = lineRows[0];
    if (!dbLine) continue;

    // f. Movement (in)
    await tx.insert(stockMovements).values({
      tenantId,
      itemId: line.itemId,
      warehouseId,
      movementType: "in",
      quantity: String(line.quantity),
      unitPrice: String(unitPrice),
      stockIssueId: issue.id,
      stockIssueLineId: dbLine.id,
      batchId,
      isClosed: false,
      date: today,
    });

    // g. Issued qty + remaining qty
    await tx
      .update(stockIssueLines)
      .set({
        issuedQty: String(line.quantity),
        totalCost: String(lineTotal),
        remainingQty: String(line.quantity),
      })
      .where(eq(stockIssueLines.id, dbLine.id));

    // h. Stock status update
    await updateStockStatusRow(tx, tenantId, line.itemId, warehouseId, line.quantity);
  }

  // i. Confirm issue
  await tx
    .update(stockIssues)
    .set({
      status: "confirmed",
      totalCost: String(totalCost),
      updatedAt: sql`now()`,
    })
    .where(eq(stockIssues.id, issue.id));
}
```

---

## ČÁST 4: VALIDACE PŘI BATCH COMPLETION

### 4.1 Kontrola v transitionBatchStatus()

Před přechodem do stavu `completed`, přidat validaci:

```typescript
// V transitionBatchStatus(), PŘED změnou stavu na 'completed':
if (newStatus === 'completed') {
  const settings = await getShopSettingsForBatch(tx, tenantId);

  if (settings.stock_mode === 'packaged') {
    // Packaged mód: MUSÍ mít bottling data
    const bottling = await tx
      .select({ id: bottlingItemsTable.id })
      .from(bottlingItemsTable)
      .where(
        and(
          eq(bottlingItemsTable.tenantId, tenantId),
          eq(bottlingItemsTable.batchId, batchId)
        )
      )
      .limit(1);

    if (bottling.length === 0) {
      throw new Error('BOTTLING_REQUIRED');
      // UI: "Před naskladněním vyplňte stáčení (tab Stáčení)"
    }
  }

  if (settings.stock_mode === 'bulk') {
    // Bulk mód: stáčení je volitelné
    // Pokud user nevyplnil tab → fallback na actual_volume_l (viz onBatchCompleted)
    // Warning pokud actual_volume_l chybí
    if (!batch.actualVolumeL || Number(batch.actualVolumeL) <= 0) {
      // Soft warning, ne blok — user může vyplnit objem na batch detail
    }
  }
}
```

### 4.2 UI error handling

V batch detail komponentě (transitions):
```typescript
if (result.error === 'BOTTLING_REQUIRED') {
  toast.error(t('statusTransition.bottlingRequired'));
  // Přepnout na tab Stáčení
  setActiveTab('bottling');
  return;
}
```

---

## ČÁST 5: AKTUALIZACE POKYN-PACKAGED-RECEIPT-REDESIGN.MD

Předchozí pokyn (`pokyn-packaged-receipt-redesign.md`) se NAHRAZUJE tímto dokumentem v těchto bodech:

1. **Tab Stáčení** zobrazuje řádky i pro BULK mód (1 řádek = výrobní položka)
2. **onBatchCompleted()** se KOMPLETNĚ přepisuje — oba režimy čtou z bottling_items
3. **Odstraňuje se rozlišení** createBulkReceipt vs createPackagedReceipt — jedna funkce createReceiptForBatch

**Zbytek předchozího pokynu PLATÍ:**
- Sumář se ztrátami/přebytky ✅
- packaging_loss_l na batch ✅
- Item detail taby (Recepty, Produkty) ✅
- Recipe → Item vazba ✅
- Auto-generování řádků z child items (packaged) ✅

---

## I18N — doplnění

```jsonc
// cs/batches.json — rozšířit bottling:
{
  "bottling": {
    "modeNone": "Naskladnění piva je vypnuto v nastavení provozovny.",
    "modeBulk": "Naskladnění vcelku — zadejte objem v litrech",
    "modePackaged": "Naskladnění do obalů — zadejte kusy",
    "amount": "Množství (L)",
    "pieces": "Ks"
  }
}

// cs/batches.json — rozšířit statusTransition:
{
  "statusTransition": {
    "bottlingRequired": "Před ukončením vyplňte stáčení (tab Stáčení)"
  }
}
```

Anglické verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### Shop settings → batch
1. [ ] getShopSettingsForBatch() vrací settings z default/první aktivní shop
2. [ ] Pokud žádný shop neexistuje → stock_mode = 'none'

### Tab Stáčení — bulk mód
3. [ ] Otevření tabu v bulk módu zobrazí 1 řádek = výrobní položka (batch.itemId)
4. [ ] Předvyplněný objem z batch.actual_volume_l
5. [ ] User může editovat objem (decimal input v litrech)
6. [ ] Uložení zapisuje do bottling_items (1 řádek)

### Tab Stáčení — packaged mód
7. [ ] Otevření tabu zobrazí VŠECHNY produkty s base_item_id = batch.itemId
8. [ ] User edituje kusy (integer input)
9. [ ] Řádky s 0 ks se nezapisují do bottling_items

### Tab Stáčení — none mód
10. [ ] Zobrazit hlášku "Naskladnění vypnuto"

### Sumář (oba módy)
11. [ ] Stočeno celkem = SUM(qty × baseItemQuantity)
12. [ ] Rozdíl (tank) s barevným indikátorem
13. [ ] packaging_loss_l uložen na batch

### onBatchCompleted() — přepis
14. [ ] stock_mode 'none' → žádná příjemka
15. [ ] stock_mode 'bulk' bez bottling dat → fallback příjemka z actual_volume_l
16. [ ] stock_mode 'bulk' s bottling daty → příjemka z bottling_items (1 řádek)
17. [ ] stock_mode 'packaged' s bottling daty → příjemka z bottling_items (N řádků)
18. [ ] stock_mode 'packaged' bez bottling dat → skip (validace by měla zachytit)
19. [ ] Warehouse z shop settings.default_warehouse_beer_id (ne první aktivní)
20. [ ] Fallback na první aktivní warehouse pokud settings nemá default

### Validace batch completion
21. [ ] Packaged mód: přechod do completed BLOKOVÁN pokud bottling_items prázdné
22. [ ] Error handling: UI přepne na tab Stáčení s chybovou hláškou

### Zpětná kompatibilita
23. [ ] Stávající batche bez bottling dat: bulk fallback funguje (actual_volume_l)
24. [ ] Stávající bottling_items data: správně se načtou při otevření tabu

### Obecné
25. [ ] i18n: cs + en
26. [ ] `npm run build` bez chyb

---

## PRIORITA IMPLEMENTACE

1. **getShopSettingsForBatch()** — resolve funkce
2. **getBottlingLines()** — auto-generování řádků (bulk = 1 řádek, packaged = N řádků)
3. **Tab Stáčení UI** — dva módy (bulk/packaged/none), společný sumář
4. **saveBottlingData()** — upsert + packaging_loss_l
5. **Přepis onBatchCompleted()** — čte z bottling_items, společná createReceiptForBatch
6. **Validace batch completion** — packaged requires bottling data
7. **i18n**

---

## TECHNICKÉ POZNÁMKY

- **bottling_items.quantity** — pro BULK mód = objem v L (decimal), pro PACKAGED mód = kusy (integer). Type v DB je DECIMAL, takže obojí funguje.
- **bottling_items.base_units** — vždy celkový objem v L (qty × baseItemQuantity). Pro bulk: base_units = quantity (protože baseItemQuantity = 1).
- **Fallback u bulk** — pokud user nevyplní tab Stáčení, onBatchCompleted vytvoří příjemku z actual_volume_l. To je pro convenience a zpětnou kompatibilitu. Pro packaged fallback neexistuje — user MUSÍ vyplnit stáčení.
- **stock_mode 'none'** — tab Stáčení zobrazí info hlášku, ale user NEMŮŽE přidávat řádky. Pokud chce naskladnit, musí změnit stock_mode v Settings → Provozovna → Parametry.
- **Cenotvorba** — MVP = item.cost_price (fixed). beer_pricing_mode z shop settings se implementuje až v dalším kroku.
- **Warehouse resolution** — priorita: shop settings.default_warehouse_beer_id → první aktivní warehouse. NIKDY null (pak skip celé příjemky).

### VAZBA NA DALŠÍ POKYNY

Tento pokyn NAHRAZUJE onBatchCompleted() logiku z:
- `pokyn-packaged-receipt-redesign.md` (ČÁST 2: Úprava packaged receipt) — přebírá tento pokyn
- Stávající implementace v `src/modules/batches/actions.ts`

Tento pokyn DOPLŇUJE (nezměněno):
- `pokyn-packaged-receipt-redesign.md` ČÁST 1 (Tab Stáčení UI — rozšiřujeme o bulk mód)
- `pokyn-packaged-receipt-redesign.md` ČÁST 3 (Item detail taby — beze změny)
- `pokyn-packaged-receipt-redesign.md` ČÁST 4 (Recipe → Item vazba — beze změny)

### Aktualizuj dokumentaci
- CHANGELOG.md
- PRODUCT-SPEC.md — sekce batch completion / naskladnění
- CLAUDE.md
