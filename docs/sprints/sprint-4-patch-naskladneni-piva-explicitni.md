## Úkol: Naskladnění piva — explicitní akce na tabu Stáčení

Naskladnění piva po stáčení je explicitní, uživatelem spuštěná akce — tlačítko "Naskladnit" na tabu Stáčení. NENÍ to automatický side-effect přechodu stavu na completed.

**NAHRAZUJE:** Stávající `onBatchCompleted()` logiku v `src/modules/batches/actions.ts` a předchozí pokyn `pokyn-sjednoceni-naskladneni-piva.md`.

**DOPLŇUJE (beze změny):** `pokyn-packaged-receipt-redesign.md` — ČÁST 3 (Item detail taby), ČÁST 4 (Recipe → Item vazba).

---

## KONTEXT — REÁLNÝ WORKFLOW SLÁDKA

```
1. Pivo dozraje v tanku (conditioning/carbonating)
2. Sládek fyzicky stáčí do obalů / přetáčí do expedičního tanku
3. Sládek zapíše stáčení do systému (tab Stáčení — kolik čeho)
4. Sládek klikne "Naskladnit" → systém vytvoří příjemku → vidí výsledek
5. Sládek ukončí várku (completed) — logické ukončení, nezávislé na naskladnění
```

Kroky 3–4 jsou na tabu Stáčení. Krok 5 je status transition — warning pokud příjemka neexistuje, ale NEBLOKUJE.

---

## AKTUÁLNÍ STAV (co je špatně)

1. `onBatchCompleted()` automaticky vytváří příjemku → user nevidí co se děje
2. Vždy bulk (1 řádek, výrobní položka) → ignoruje stock_mode
3. Warehouse = první aktivní → ne z shop settings
4. Tab Stáčení = ruční přidávání řádků → nesystematické
5. Batch nemá vazbu na shop → nelze získat settings

---

## ČÁST 1: SHOP SETTINGS PRO BATCH

### 1.1 Resolve funkce

**Soubor:** `src/modules/batches/actions.ts` (nebo nový `src/modules/batches/utils.ts`)

```typescript
/**
 * Resolve shop settings for a batch.
 * MVP: 1 shop per tenant — take default or first active.
 * Future: batch.shopId for multi-shop.
 */
export async function getShopSettingsForBatch(
  tenantId: string,
  txOrDb?: TxType
): Promise<ShopSettings> {
  const executor = txOrDb ?? db;

  const shopRows = await executor
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

---

## ČÁST 2: TAB STÁČENÍ — AUTO-GENEROVÁNÍ ŘÁDKŮ

### 2.1 Backend — getBottlingLines()

**Soubor:** `src/modules/batches/actions.ts`

```typescript
'use server'

export async function getBottlingLines(batchId: string): Promise<{
  mode: 'none' | 'bulk' | 'packaged';
  lines: BottlingLine[];
  receiptInfo: ReceiptInfo | null;
}> {
  return withTenant(async (tenantId) => {
    const batch = await getBatch(batchId);
    const settings = await getShopSettingsForBatch(tenantId);

    // Režim
    const mode = settings.stock_mode || 'none';
    if (mode === 'none' || !batch.itemId) {
      return { mode: 'none', lines: [], receiptInfo: null };
    }

    // Existující bottling_items (pokud user už něco uložil)
    const existing = await getBatchBottlingItems(batchId);

    // Existující příjemka z tohoto batche
    const receiptInfo = await getProductionReceiptForBatch(batchId);

    let lines: BottlingLine[];

    if (mode === 'bulk') {
      // 1 řádek = výrobní položka
      const prodItem = await getItem(batch.itemId);
      if (!prodItem) return { mode, lines: [], receiptInfo };

      const existingLine = existing.find(e => e.itemId === batch.itemId);
      lines = [{
        itemId: prodItem.id,
        itemName: prodItem.name,
        itemCode: prodItem.code || '',
        baseItemQuantity: 1,             // 1 L = 1 L
        quantity: existingLine
          ? Number(existingLine.quantity)
          : Number(batch.actualVolumeL) || Number(batch.recipeBatchSizeL) || 0,
        isBulk: true,
      }];

    } else {
      // N řádků = child items dle base_item_id
      const childItems = await db
        .select({
          id: items.id,
          name: items.name,
          code: items.code,
          baseItemQuantity: items.baseItemQuantity,
        })
        .from(items)
        .where(
          and(
            eq(items.tenantId, tenantId),
            eq(items.baseItemId, batch.itemId),
            eq(items.isActive, true)
          )
        )
        .orderBy(asc(items.name));

      lines = childItems.map(item => {
        const existingLine = existing.find(e => e.itemId === item.id);
        return {
          itemId: item.id,
          itemName: item.name,
          itemCode: item.code || '',
          baseItemQuantity: Number(item.baseItemQuantity) || 0,
          quantity: existingLine ? Number(existingLine.quantity) : 0,
          isBulk: false,
        };
      });
    }

    return { mode, lines, receiptInfo };
  });
}
```

### 2.2 Backend — getProductionReceiptForBatch()

```typescript
async function getProductionReceiptForBatch(
  batchId: string
): Promise<ReceiptInfo | null> {
  const rows = await db
    .select({
      id: stockIssues.id,
      code: stockIssues.code,
      status: stockIssues.status,
      date: stockIssues.date,
    })
    .from(stockIssues)
    .where(
      and(
        eq(stockIssues.batchId, batchId),
        eq(stockIssues.movementType, 'receipt'),
        eq(stockIssues.movementPurpose, 'production_in'),
        ne(stockIssues.status, 'cancelled')
      )
    )
    .limit(1);

  return rows[0] || null;
}
```

### 2.3 Types

```typescript
export interface BottlingLine {
  itemId: string;
  itemName: string;
  itemCode: string;
  baseItemQuantity: number;  // L per unit (bulk: 1, packaged: 0.5, 30, etc.)
  quantity: number;          // bulk: litry, packaged: kusy
  isBulk: boolean;
}

export interface ReceiptInfo {
  id: string;
  code: string;
  status: string;
  date: string;
}
```

---

## ČÁST 3: TAB STÁČENÍ — UKLÁDÁNÍ

### 3.1 Backend — saveBottlingData()

**Soubor:** `src/modules/batches/actions.ts`

```typescript
'use server'

export async function saveBottlingData(
  batchId: string,
  lines: Array<{ itemId: string; quantity: number; baseItemQuantity: number }>
): Promise<{ success: boolean; error?: string }> {
  return withTenant(async (tenantId) => {
    const batch = await getBatch(batchId);

    // Validace: nemůže měnit stáčení pokud existuje potvrzená příjemka
    const receipt = await getProductionReceiptForBatch(batchId);
    if (receipt && receipt.status === 'confirmed') {
      return { success: false, error: 'RECEIPT_EXISTS' };
    }

    // 1. Smazat stávající bottling_items
    await db
      .delete(bottlingItems)
      .where(
        and(
          eq(bottlingItems.tenantId, tenantId),
          eq(bottlingItems.batchId, batchId)
        )
      );

    // 2. Vložit nenulové řádky
    for (const line of lines.filter(l => l.quantity > 0)) {
      const baseUnits = line.quantity * line.baseItemQuantity;
      await db.insert(bottlingItems).values({
        tenantId,
        batchId,
        itemId: line.itemId,
        quantity: line.quantity,
        baseUnits: String(baseUnits),
        bottledAt: sql`now()`,
      });
    }

    // 3. Spočítat a uložit packaging_loss_l
    const totalBottledL = lines.reduce(
      (sum, l) => sum + l.quantity * l.baseItemQuantity, 0
    );
    const tankVolume = Number(batch.actualVolumeL) || 0;
    const loss = tankVolume - totalBottledL;
    // kladné = ztráta (stočili méně), záporné = přebytek

    await db
      .update(batches)
      .set({
        packagingLossL: String(loss),
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(batches.tenantId, tenantId), eq(batches.id, batchId))
      );

    return { success: true };
  });
}
```

---

## ČÁST 4: TLAČÍTKO "NASKLADNIT"

### 4.1 Backend — createProductionReceipt()

**Soubor:** `src/modules/batches/actions.ts`

Toto je HLAVNÍ funkce — explicitně volaná z UI.

```typescript
'use server'

export async function createProductionReceipt(
  batchId: string
): Promise<{ receiptId: string; receiptCode: string } | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      return await db.transaction(async (tx) => {
        const batch = await tx
          .select()
          .from(batches)
          .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
          .limit(1)
          .then(r => r[0]);

        if (!batch) return { error: 'BATCH_NOT_FOUND' };
        if (!batch.itemId) return { error: 'NO_PRODUCTION_ITEM' };

        // Kontrola duplicity — nesmí existovat aktivní příjemka
        const existingReceipt = await tx
          .select({ id: stockIssues.id, code: stockIssues.code })
          .from(stockIssues)
          .where(
            and(
              eq(stockIssues.tenantId, tenantId),
              eq(stockIssues.batchId, batchId),
              eq(stockIssues.movementType, 'receipt'),
              eq(stockIssues.movementPurpose, 'production_in'),
              ne(stockIssues.status, 'cancelled')
            )
          )
          .limit(1);

        if (existingReceipt[0]) {
          return { error: 'RECEIPT_ALREADY_EXISTS' };
        }

        // Načíst bottling_items — MUSÍ existovat
        const bottling = await tx
          .select()
          .from(bottlingItems)
          .where(
            and(
              eq(bottlingItems.tenantId, tenantId),
              eq(bottlingItems.batchId, batchId)
            )
          );

        if (bottling.length === 0) {
          return { error: 'NO_BOTTLING_DATA' };
        }

        // Shop settings → warehouse
        const settings = await getShopSettingsForBatch(tenantId, tx);
        const warehouseId = settings.default_warehouse_beer_id
          || await getFirstActiveWarehouseId(tx, tenantId);

        if (!warehouseId) return { error: 'NO_WAREHOUSE' };

        // Warehouse pro kód
        const warehouseRow = await tx
          .select()
          .from(warehouses)
          .where(eq(warehouses.id, warehouseId))
          .limit(1);

        if (!warehouseRow[0]) return { error: 'WAREHOUSE_NOT_FOUND' };

        // Generovat číslo dokladu
        const code = await getNextNumber(tenantId, "stock_issue_receipt", warehouseId);
        const today = new Date().toISOString().split("T")[0]!;

        // Vytvořit příjemku
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
            notes: `Naskladnění z várky ${batch.batchNumber}`,
          })
          .returning();

        const issue = issueRows[0];
        if (!issue) return { error: 'CREATE_FAILED' };

        // Řádky
        let totalCost = 0;
        for (let i = 0; i < bottling.length; i++) {
          const bi = bottling[i];
          const qty = Number(bi.quantity);
          if (qty <= 0) continue;

          // Cena z karty položky
          const itemRow = await tx
            .select({ costPrice: items.costPrice })
            .from(items)
            .where(eq(items.id, bi.itemId))
            .limit(1);

          const unitPrice = Number(itemRow[0]?.costPrice) || 0;
          const lineTotal = qty * unitPrice;
          totalCost += lineTotal;

          const lineRows = await tx
            .insert(stockIssueLines)
            .values({
              tenantId,
              stockIssueId: issue.id,
              itemId: bi.itemId,
              lineNo: i + 1,
              requestedQty: String(qty),
              unitPrice: String(unitPrice),
              sortOrder: i,
            })
            .returning();

          const line = lineRows[0];
          if (!line) continue;

          // Movement (in)
          await tx.insert(stockMovements).values({
            tenantId,
            itemId: bi.itemId,
            warehouseId,
            movementType: "in",
            quantity: String(qty),
            unitPrice: String(unitPrice),
            stockIssueId: issue.id,
            stockIssueLineId: line.id,
            batchId,
            isClosed: false,
            date: today,
          });

          // Issued + remaining qty
          await tx
            .update(stockIssueLines)
            .set({
              issuedQty: String(qty),
              totalCost: String(lineTotal),
              remainingQty: String(qty),
            })
            .where(eq(stockIssueLines.id, line.id));

          // Stock status
          await updateStockStatusRow(tx, tenantId, bi.itemId, warehouseId, qty);
        }

        // Confirm
        await tx
          .update(stockIssues)
          .set({
            status: "confirmed",
            totalCost: String(totalCost),
            updatedAt: sql`now()`,
          })
          .where(eq(stockIssues.id, issue.id));

        return { receiptId: issue.id, receiptCode: code };
      });
    } catch (err) {
      console.error('[batches] createProductionReceipt failed:', err);
      return { error: 'RECEIPT_FAILED' };
    }
  });
}
```

### 4.2 Helper — getFirstActiveWarehouseId()

```typescript
async function getFirstActiveWarehouseId(
  tx: TxType,
  tenantId: string
): Promise<string | null> {
  const rows = await tx
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(
      and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.isActive, true)
      )
    )
    .orderBy(asc(warehouses.createdAt))
    .limit(1);

  return rows[0]?.id || null;
}
```

---

## ČÁST 5: TAB STÁČENÍ — UI KOMPONENTA

### 5.1 Layout

**Soubor:** Nový `src/modules/batches/components/BottlingTab.tsx` (nebo přepis stávajícího)

```
┌────────────────────────────────────────────────────────────┐
│ Stáčení                                     [bulk/packaged]│
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Produkt          │ Objem (L) │ Množství │ Celkem (L)   │ │
│ │──────────────────│───────────│──────────│──────────────│ │
│ │ Světlý 12° (bulk)│ 1         │ [148___] │ 148,0        │ │
│ │                                                        │ │
│ │ --- NEBO (packaged) ---                                │ │
│ │ Lahev 0,5L       │ 0.5       │ [200___] │ 100,0        │ │
│ │ PET 1,5L         │ 1.5       │ [  0___] │   0,0        │ │
│ │ KEG 30L          │ 30        │ [  3___] │  90,0        │ │
│ └────────────────────────────────────────────────────────┘ │
│                                                            │
│ ┌─ Sumář ──────────────────────────────────────────────┐   │
│ │ Stočeno celkem:    148,0 L                           │   │
│ │ Objem z receptury: 150,0 L                           │   │
│ │ Objem z tanku:     150,0 L                           │   │
│ │ ──────────────────────────                           │   │
│ │ Rozdíl (tank):      -2,0 L  🔴 Ztráta               │   │
│ └──────────────────────────────────────────────────────┘   │
│                                                            │
│ [Uložit stáčení]                      [🏭 Naskladnit]     │
│                                                            │
│ ┌─ Příjemka ───────────────────────────────────────────┐   │
│ │ PR-S1-2026-005 — Potvrzena ✅           [Otevřít →]  │   │
│ └──────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Stavy tlačítek

**Tlačítko "Uložit stáčení":**
- Vždy viditelné (pokud mode != 'none')
- Disabled pokud existuje potvrzená příjemka → tooltip: "Stornujte příjemku pro úpravu stáčení"
- Klik → `saveBottlingData()` → toast "Stáčení uloženo"

**Tlačítko "Naskladnit" (🏭):**

| Stav | Viditelnost | Akce |
|------|-------------|------|
| mode = 'none' | Skryté | — |
| Stáčení nevyplněno (všechny qty = 0) | Disabled | Tooltip: "Nejdříve vyplňte a uložte stáčení" |
| Stáčení vyplněno, neuloženo | Disabled | Tooltip: "Nejdříve uložte stáčení" |
| Stáčení uloženo, příjemka neexistuje | **Aktivní** | Confirm dialog → `createProductionReceipt()` |
| Příjemka existuje (confirmed) | Skryté | Místo něj: info box s linkem na příjemku |

**Confirm dialog před naskladněním:**
```
Naskladnit pivo z várky {batchNumber}?

Sklad: {warehouseName}
Řádků: {count}
Celkový objem: {totalL} L

[Naskladnit]  [Zrušit]
```

### 5.3 Info box — příjemka

Pokud příjemka existuje, zobrazit pod tlačítky:

```tsx
{receiptInfo && (
  <div className="border rounded p-3 flex items-center justify-between">
    <div>
      <span className="font-medium">{receiptInfo.code}</span>
      <Badge variant={receiptInfo.status === 'confirmed' ? 'success' : 'secondary'}>
        {receiptInfo.status}
      </Badge>
    </div>
    <Link href={`/stock/issues/${receiptInfo.id}`}>
      Otevřít →
    </Link>
  </div>
)}
```

### 5.4 Hlášky pro mode 'none'

Pokud stock_mode = 'none':
```tsx
<div className="text-muted-foreground text-center py-8">
  <p>Naskladnění piva je vypnuto.</p>
  <p className="text-sm mt-1">
    Změňte režim v <Link href="/settings/shops">Nastavení → Provozovny → Parametry</Link>
  </p>
</div>
```

### 5.5 Oprava stáčení po naskladnění

Pokud user chce opravit stáčení po naskladnění:
1. Otevřít příjemku (link)
2. Stornovat příjemku (cancelStockIssue)
3. Vrátit se na tab Stáčení → řádky editovatelné
4. Upravit → Uložit → Naskladnit znovu

Tohle neřešíme extra UI — stačí tooltip na disabled "Uložit": "Pro úpravu stornujte příjemku {code}".

---

## ČÁST 6: ODSTRANĚNÍ AUTOMATICKÉHO NASKLADNĚNÍ Z onBatchCompleted()

### 6.1 Přepis onBatchCompleted()

**SMAZAT** celou stávající implementaci `onBatchCompleted()` v `src/modules/batches/actions.ts` a nahradit:

```typescript
/**
 * Hook after batch transitions to 'completed'.
 * Previously: auto-created production receipt.
 * Now: only logs/notifies. Stocking is explicit via createProductionReceipt().
 */
async function onBatchCompleted(
  tx: TxType,
  tenantId: string,
  batchId: string,
  batch: typeof batches.$inferSelect
): Promise<void> {
  // Naskladnění se provádí explicitně z tabu Stáčení.
  // Tady jen release equipment (pokud ještě nebylo).
  // Equipment release je už řešen v transitionBatchStatus() výše.
  // → Funkce je prázdná (nebo jen logging).
}
```

### 6.2 Warning při batch completion

V `transitionBatchStatus()`, před přechodem na `completed`:

```typescript
if (newStatus === 'completed') {
  const settings = await getShopSettingsForBatch(tenantId, tx);

  if (settings.stock_mode && settings.stock_mode !== 'none') {
    // Zkontrolovat zda existuje příjemka
    const receipt = await tx
      .select({ id: stockIssues.id })
      .from(stockIssues)
      .where(
        and(
          eq(stockIssues.tenantId, tenantId),
          eq(stockIssues.batchId, batchId),
          eq(stockIssues.movementType, 'receipt'),
          eq(stockIssues.movementPurpose, 'production_in'),
          ne(stockIssues.status, 'cancelled')
        )
      )
      .limit(1);

    if (!receipt[0]) {
      // NEBLOKOVAT — jen vrátit warning flag
      // UI zobrazí confirm dialog: "Várka nemá naskladněné pivo. Ukončit přesto?"
      // Pro implementaci: přidat do response pole `warnings: string[]`
      // Alternativa (jednodušší): nechat na UI — před voláním transition
      // zkontrolovat receiptInfo a zobrazit confirm
    }
  }
}
```

**Implementace warning — jednodušší varianta (UI-side):**

V komponentě batch status transition:

```typescript
async function handleTransition(newStatus: string) {
  if (newStatus === 'completed') {
    // Zkontrolovat příjemku
    const { receiptInfo } = await getBottlingLines(batchId);
    if (!receiptInfo) {
      const confirmed = await confirmDialog({
        title: t('statusTransition.noReceiptTitle'),
        description: t('statusTransition.noReceiptDescription'),
        confirmText: t('statusTransition.completeAnyway'),
      });
      if (!confirmed) return;
    }
  }

  const result = await transitionBatchStatus(batchId, newStatus);
  // ...
}
```

---

## ČÁST 7: I18N

```jsonc
// cs/batches.json — bottling sekce (nová/rozšířená):
{
  "bottling": {
    "title": "Stáčení",
    "modeNone": "Naskladnění piva je vypnuto.",
    "modeNoneHint": "Změňte režim v Nastavení → Provozovny → Parametry",
    "modeBulk": "Naskladnění vcelku",
    "modePackaged": "Naskladnění do obalů",
    "product": "Produkt",
    "volume": "Objem (L)",
    "amount": "Množství (L)",
    "pieces": "Ks",
    "lineTotal": "Celkem (L)",
    "save": "Uložit stáčení",
    "saved": "Stáčení uloženo",
    "saveError": "Chyba při ukládání stáčení",
    "saveDisabledReceipt": "Pro úpravu stornujte příjemku {code}",
    "noProductionItem": "Várka nemá přiřazenou výrobní položku",
    "noProducts": "Výrobní položka nemá žádné přiřazené produkty",
    "summary": {
      "totalBottled": "Stočeno celkem",
      "recipeVolume": "Objem z receptury",
      "tankVolume": "Objem z tanku",
      "diffTank": "Rozdíl (tank)",
      "surplus": "Přebytek",
      "loss": "Ztráta",
      "exact": "Beze zbytku"
    },
    "stock": {
      "button": "Naskladnit",
      "buttonDisabledEmpty": "Nejdříve vyplňte a uložte stáčení",
      "buttonDisabledUnsaved": "Nejdříve uložte stáčení",
      "confirmTitle": "Naskladnit pivo?",
      "confirmDescription": "Vytvoří potvrzenou příjemku na sklad {warehouse}.",
      "confirmLines": "Řádků: {count}",
      "confirmVolume": "Celkový objem: {volume} L",
      "confirm": "Naskladnit",
      "cancel": "Zrušit",
      "success": "Pivo naskladněno",
      "error": "Chyba při naskladnění",
      "errorNoBottling": "Nejdříve vyplňte stáčení",
      "errorNoWarehouse": "Není nastaven sklad pro pivo",
      "errorAlreadyExists": "Příjemka už existuje",
      "errorNoProductionItem": "Várka nemá výrobní položku"
    },
    "receipt": {
      "title": "Příjemka",
      "open": "Otevřít",
      "none": "Příjemka zatím nevytvořena"
    }
  },
  "statusTransition": {
    "noReceiptTitle": "Várka nemá naskladněné pivo",
    "noReceiptDescription": "Pivo nebylo naskladněno na sklad. Chcete přesto ukončit várku?",
    "completeAnyway": "Ukončit přesto"
  }
}
```

Anglické verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### Shop settings
1. [ ] `getShopSettingsForBatch()` vrací settings z default/první aktivní shop
2. [ ] Bez shop → stock_mode = 'none'

### Tab Stáčení — auto-generování
3. [ ] Bulk mód: 1 řádek = výrobní položka, předvyplněný z actual_volume_l
4. [ ] Packaged mód: N řádků = child items (base_item_id = batch.itemId)
5. [ ] None mód: hlášku "vypnuto" s linkem na settings
6. [ ] Pokud batch nemá itemId → hlášku "nemá výrobní položku"
7. [ ] Pokud výrobní položka nemá child items (packaged) → hlášku "nemá produkty"

### Tab Stáčení — ukládání
8. [ ] "Uložit stáčení" → saveBottlingData() → bottling_items upsert
9. [ ] packaging_loss_l uložen na batch
10. [ ] "Uložit" disabled pokud existuje potvrzená příjemka

### Naskladnění — tlačítko
11. [ ] "Naskladnit" disabled pokud stáčení prázdné/neuložené
12. [ ] "Naskladnit" → confirm dialog → createProductionReceipt()
13. [ ] Vytvoří příjemku (receipt, production_in) na správný sklad
14. [ ] Příjemka automaticky potvrzena (confirmed)
15. [ ] Stock status aktualizován
16. [ ] Po úspěchu: zobrazit info box s linkem na příjemku
17. [ ] Duplicitní kontrola: nelze vytvořit druhou příjemku

### Naskladnění — sklad
18. [ ] Warehouse z shop settings.default_warehouse_beer_id
19. [ ] Fallback na první aktivní warehouse

### Oprava stáčení
20. [ ] Pokud příjemka existuje: "Uložit" disabled s tooltipem
21. [ ] Po stornování příjemky: "Uložit" znovu aktivní, "Naskladnit" znovu aktivní

### Batch completion
22. [ ] onBatchCompleted() NEVYTVÁŘÍ příjemku (prázdná funkce)
23. [ ] Přechod na completed: warning pokud příjemka neexistuje (confirm dialog)
24. [ ] Warning NEBLOKUJE — user může ukončit i bez naskladnění

### Zpětná kompatibilita
25. [ ] Stávající batche (completed, bez bottling dat): žádný error, fungují normálně

### Obecné
26. [ ] i18n: cs + en
27. [ ] `npm run build` bez chyb
28. [ ] TypeScript: zero errors, no `any`

---

## PRIORITA IMPLEMENTACE

1. **getShopSettingsForBatch()** — resolve funkce
2. **getBottlingLines()** — auto-generování + receiptInfo
3. **saveBottlingData()** — ukládání s lock kontrolou
4. **createProductionReceipt()** — hlavní funkce naskladnění
5. **BottlingTab UI** — tabulka, sumář, tlačítka, info box
6. **Odstranění onBatchCompleted() logiky** — vyprázdnit funkci
7. **Warning při batch completion** — UI-side check
8. **i18n**

---

## TECHNICKÉ POZNÁMKY

- **bottling_items.quantity** — BULK: objem v L (decimal), PACKAGED: kusy (integer). DB typ DECIMAL zvládne obojí.
- **bottling_items.base_units** — vždy celkový objem v L. Bulk: = quantity. Packaged: = qty × baseItemQuantity.
- **Příjemka se vytváří a rovnou potvrzuje** v jedné transakci (draft → confirmed). User nepotřebuje editovat příjemku — data jsou z tabu Stáčení.
- **Cenotvorba MVP** = item.cost_price (fixed). beer_pricing_mode z shop settings se implementuje v recipe designer sprintu.
- **Storno flow**: User stornuje příjemku přes stock issues detail → cancelStockIssue() → stock se vrátí → tab Stáčení se odemkne.
- **packaging_loss_l** = actual_volume_l − SUM(bottling base_units). Kladné = ztráta, záporné = přebytek. Vstup pro S5 excise.
- **Edge case: batch bez actual_volume_l** — sumář: "Objem z tanku: nevyplněn", rozdíl nepočítat. Bulk: předvyplnit 0.
- **Edge case: productsEmpty (packaged mód)** — zobrazit hlášku + link na detail výrobní položky (tab Produkty) kde může přidat produkty.

### Aktualizuj dokumentaci
- CHANGELOG.md
- PRODUCT-SPEC.md — sekce batch completion / naskladnění
- CLAUDE.md
