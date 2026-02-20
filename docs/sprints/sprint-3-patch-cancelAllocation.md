# SPRINT 3 PATCH — Zrušení allocations + model množství
## ProfiBrew.com | Patch spec
### Datum: 19.02.2026

---

## SHRNUTÍ ZMĚN

**A) Zrušit stock_issue_allocations** — movements s receipt_line_id jsou jediný zdroj pravdy
**B) Model množství na řádcích** — příjemka jen "Množství", výdejka Požadované/Skutečné/Chybějící
**C) Částečný výdej** — prevalidace, varování dialog, FIFO vydá co může
**D) Storno příjemky** — blokace pokud existují výdejové movements

**Prerekvizita:** Sprint 3 patch v1 (šarže = řádek příjemky) je implementovaný.

**Odhad:** 3–4 hodiny

---

## FÁZE P1: DB SCHEMA

### P1.1 stock_movements — přidat receipt_line_id

```sql
ALTER TABLE stock_movements
  ADD COLUMN receipt_line_id UUID REFERENCES stock_issue_lines(id);

CREATE INDEX idx_movements_receipt_line ON stock_movements(receipt_line_id);
```

Při výdeji každý movement odkazuje na příjmový řádek (= šarži), ze kterého bylo fyzicky odebráno. Při příjmu je NULL.

### P1.2 manual_allocations na stock_issue_lines

```sql
ALTER TABLE stock_issue_lines
  ADD COLUMN manual_allocations JSONB;
```

Jen pro výdejky s `issue_mode = 'manual_lot'`. Formát:
```json
[
  { "receipt_line_id": "uuid-1", "quantity": 5.0 },
  { "receipt_line_id": "uuid-2", "quantity": 3.0 }
]
```

### P1.3 stock_issue_allocations — zrušit

```sql
-- Pokud tabulka existuje a je prázdná:
DROP TABLE IF EXISTS stock_issue_allocations;

-- Pokud má data: nechat tabulku, ale odstranit VŠECHNY reference v kódu.
```

Odstranit veškerý kód, který čte/zapisuje do stock_issue_allocations. Grep celý codebase.

### P1.4 Migrace remaining_qty backfill

Pokud remaining_qty ještě není správně naplněno přes movements:

```sql
UPDATE stock_issue_lines sil
SET remaining_qty = sil.requested_qty - COALESCE(
  (SELECT SUM(ABS(sm.quantity))
   FROM stock_movements sm
   WHERE sm.receipt_line_id = sil.id
     AND sm.quantity < 0),
  0
)
WHERE sil.id IN (
  SELECT sil2.id FROM stock_issue_lines sil2
  JOIN stock_issues si ON si.id = sil2.stock_issue_id
  WHERE si.type = 'receipt' AND si.status = 'confirmed'
);
```

---

## FÁZE P2: MODEL MNOŽSTVÍ NA ŘÁDCÍCH

### P2.1 Příjemka (type = 'receipt')

Jen **jedno množství** — skutečně přijaté. Pivovar přijme to, co fyzicky dorazilo.

| Pole | DB sloupec | Editovatelné | Popis |
|------|-----------|-------------|-------|
| Množství | `requested_qty` | ✅ Ano | Skutečně přijaté množství |
| Zbývá | `remaining_qty` | ❌ Ne | Materializované, snižuje se při výdeji |

DB sloupec zůstává `requested_qty` (žádná migrace schématu). V UI label **"Množství"** místo "Požadované množství".

**UI tabulka řádků příjemky:**

| Sloupec | Pozn. |
|---------|-------|
| Položka | item lookup |
| Množství | editovatelný input, label "Množství" |
| MJ | unit.symbol |
| Cena/MJ | editovatelný |
| Celkem | computed: quantity × unit_price |
| Šarže | lot_number (volitelné, z patch v1) |
| Expirace | expiry_date (volitelné, z patch v1) |

**Žádné sloupce** Požadované / Skutečné / Chybějící na příjemce.

### P2.2 Výdejka (type = 'issue')

Tři hodnoty — požadované, skutečně vydané, chybějící:

| Pole | Zdroj | Editovatelné | Popis |
|------|-------|-------------|-------|
| Požadované | `requested_qty` | ✅ Ano (v draft) | Kolik chci vydat |
| Skutečné | computed | ❌ Ne | SUM(ABS(movements) WHERE stock_issue_line_id = this) |
| Chybějící | computed | ❌ Ne | requested_qty - actual_qty (≥ 0) |

**KRITICKÉ: actual_qty a missing_qty se NEPERSISTUJÍ.** Počítají se za letu:

```typescript
interface IssueLineWithActuals extends StockIssueLine {
  actual_qty: number     // SUM ABS(movements) pro tento řádek
  missing_qty: number    // requested_qty - actual_qty (≥ 0)
}

// Query pro načtení řádků výdejky s computed fields:
const linesWithActuals = await db.query(`
  SELECT 
    sil.*,
    COALESCE(SUM(ABS(sm.quantity)), 0) as actual_qty,
    GREATEST(sil.requested_qty - COALESCE(SUM(ABS(sm.quantity)), 0), 0) as missing_qty
  FROM stock_issue_lines sil
  LEFT JOIN stock_movements sm ON sm.stock_issue_line_id = sil.id
  WHERE sil.stock_issue_id = :issueId
  GROUP BY sil.id
`)
```

### P2.3 UI tabulka řádků výdejky

| Sloupec | Editovatelné | Viditelnost | Pozn. |
|---------|-------------|-------------|-------|
| Položka | ✅ (v draft) | Vždy | item lookup |
| Požadované | ✅ (v draft) | Vždy | requested_qty, hlavní input |
| Skutečné | ❌ | Jen po confirm | actual_qty, computed ze SUM movements |
| Chybějící | ❌ | Jen po confirm | missing_qty, **červeně pokud > 0** |
| MJ | ❌ | Vždy | unit.symbol |
| Cena/MJ | ❌ | Jen po confirm | vážený průměr z movements |

V **draft** stavu vidí user jen Požadované. Sloupce Skutečné a Chybějící se zobrazí až po potvrzení.

---

## FÁZE P3: VÝDEJOVÝ ENGINE — MOVEMENTS MÍSTO ALLOCATIONS

### P3.1 FIFO engine přepis

Celý FIFO engine pracuje **pouze s movements**. Žádné allocations.

**allocateFIFO():**

```typescript
async function allocateFIFO(
  issue: StockIssue,
  line: StockIssueLine,
  item: Item
): Promise<{ lineId: string; itemId: string; allocated: number; missing: number }> {

  const requestedQty = line.requested_qty
  
  // Najít příjmové řádky s remaining_qty > 0
  const receiptLines = await db.query(`
    SELECT sil.* FROM stock_issue_lines sil
    JOIN stock_issues si ON si.id = sil.stock_issue_id
    WHERE sil.item_id = $1
      AND si.warehouse_id = $2
      AND si.type = 'receipt'
      AND si.status = 'confirmed'
      AND sil.remaining_qty > 0
    ORDER BY si.date ASC, sil.created_at ASC
    FOR UPDATE
  `, [item.id, issue.warehouse_id])
  
  let remaining = requestedQty
  for (const rl of receiptLines) {
    if (remaining <= 0) break
    const take = Math.min(remaining, rl.remaining_qty)
    
    // Vytvořit MOVEMENT s vazbou na příjmový řádek
    await createStockMovement({
      stock_issue_id: issue.id,
      stock_issue_line_id: line.id,
      item_id: item.id,
      warehouse_id: issue.warehouse_id,
      quantity: -take,
      unit_price: rl.unit_price,
      receipt_line_id: rl.id,          // KLÍČOVÁ VAZBA
    })
    
    // Snížit remaining_qty na příjmovém řádku (= šarži)
    await sql`
      UPDATE stock_issue_lines 
      SET remaining_qty = remaining_qty - ${take}
      WHERE id = ${rl.id}
    `
    
    remaining -= take
  }
  
  return {
    lineId: line.id,
    itemId: item.id,
    allocated: requestedQty - remaining,
    missing: Math.max(0, remaining),
  }
}
```

### P3.2 Ruční výběr šarží — processManualAllocations

Patch v1 už implementoval LotSelectionDialog. Nyní ho přepojit na movements místo allocations.

LotSelectionDialog ukládá výběr do `stock_issue_lines.manual_allocations` JSONB (nový sloupec z P1.2).

**Při confirm výdejky:**

```typescript
async function processManualAllocations(
  issue: StockIssue,
  line: StockIssueLine,
  item: Item
): Promise<{ lineId: string; itemId: string; allocated: number; missing: number }> {

  let totalAllocated = 0
  
  for (const alloc of line.manual_allocations!) {
    const receiptLine = await getStockIssueLine(alloc.receipt_line_id)
    
    await createStockMovement({
      stock_issue_id: issue.id,
      stock_issue_line_id: line.id,
      item_id: item.id,
      warehouse_id: issue.warehouse_id,
      quantity: -alloc.quantity,
      unit_price: receiptLine.unit_price,
      receipt_line_id: alloc.receipt_line_id,
    })
    
    await sql`
      UPDATE stock_issue_lines 
      SET remaining_qty = remaining_qty - ${alloc.quantity}
      WHERE id = ${alloc.receipt_line_id}
    `
    
    totalAllocated += alloc.quantity
  }
  
  return {
    lineId: line.id,
    itemId: item.id,
    allocated: totalAllocated,
    missing: Math.max(0, line.requested_qty - totalAllocated),
  }
}
```

### P3.3 confirmStockIssue — orchestrace

```typescript
async function confirmStockIssue(issueId: string) {
  const issue = await getStockIssue(issueId)
  if (issue.type !== 'issue') { /* příjemka — stávající logika beze změny */ }
  
  for (const line of issue.lines) {
    const item = await getItem(line.item_id)
    
    if (item.issue_mode === 'manual_lot') {
      if (!line.manual_allocations?.length) {
        throw new Error(`Položka "${item.name}" vyžaduje ruční výběr šarží`)
      }
      await processManualAllocations(issue, line, item)
    } else {
      await allocateFIFO(issue, line, item)
    }
  }
  
  // Aktualizovat stock_status — stávající logika
  // Nastavit status = 'confirmed'
}
```

---

## FÁZE P4: ČÁSTEČNÝ VÝDEJ

### P4.1 Prevalidace před confirm

```typescript
interface PrevalidationResult {
  canConfirm: boolean
  hasWarnings: boolean
  warnings: Array<{
    itemName: string
    unit: string
    requested: number
    available: number
    willIssue: number
    missing: number
  }>
}

async function prevalidateIssue(issueId: string): Promise<PrevalidationResult> {
  const issue = await getStockIssue(issueId)
  const warnings = []
  
  for (const line of issue.lines) {
    const item = await getItem(line.item_id)
    
    // Celkové dostupné množství z příjmových řádků
    const available = await db.queryOne(`
      SELECT COALESCE(SUM(sil.remaining_qty), 0) as available
      FROM stock_issue_lines sil
      JOIN stock_issues si ON si.id = sil.stock_issue_id
      WHERE sil.item_id = $1
        AND si.warehouse_id = $2
        AND si.type = 'receipt'
        AND si.status = 'confirmed'
        AND sil.remaining_qty > 0
    `, [item.id, issue.warehouse_id])
    
    if (available < line.requested_qty) {
      warnings.push({
        itemName: item.name,
        unit: item.unit.symbol,
        requested: line.requested_qty,
        available: available,
        willIssue: available,
        missing: line.requested_qty - available,
      })
    }
  }
  
  return {
    canConfirm: true,  // Vždy lze potvrdit (i částečně)
    hasWarnings: warnings.length > 0,
    warnings,
  }
}
```

### P4.2 UI flow

1. User klikne "Potvrdit výdejku"
2. Systém zavolá `prevalidateIssue()`
3. **Pokud žádné warnings** → confirm rovnou (žádný dialog)
4. **Pokud warnings** → zobrazí se dialog:

```
⚠️ Nedostatečný stav skladu

Následující položky nemají dostatečné množství:

• Plzeňský slad: požadováno 50 kg, dostupné 35 kg
  → vydá se 35 kg, chybí 15 kg

• Apollo chmel: požadováno 2 kg, dostupné 2 kg → OK

[Potvrdit částečný výdej]    [Zrušit]
```

5. **Potvrdit částečný výdej** → FIFO alokuje co může
6. Na potvrzené výdejce se zobrazí:

| Položka | Požadované | Skutečné | Chybějící |
|---------|-----------|----------|-----------|
| Plzeňský slad | 50 kg | 35 kg | **15 kg** (červeně) |
| Apollo chmel | 2 kg | 2 kg | 0 kg |

---

## FÁZE P5: STORNO

### P5.1 Cancel výdejky — vrátit remaining_qty

```typescript
async function cancelStockIssue(issueId: string) {
  const issue = await getStockIssue(issueId)
  
  if (issue.type === 'issue' && issue.status === 'confirmed') {
    const movements = await getMovements(issueId)
    
    // Vrátit remaining_qty na příjmových řádcích
    for (const m of movements.filter(m => m.receipt_line_id)) {
      await sql`
        UPDATE stock_issue_lines 
        SET remaining_qty = remaining_qty + ${Math.abs(m.quantity)}
        WHERE id = ${m.receipt_line_id}
      `
    }
    
    // Smazat movements
    await deleteMovements(issueId)
    
    // Vrátit stock_status
    // ... stávající logika ...
  }
  
  // ... rest of cancel logic ...
}
```

### P5.2 Cancel příjemky — blokace

Při pokusu o storno příjemky zkontrolovat, zda z jejích řádků nebylo vydáváno:

```typescript
if (issue.type === 'receipt') {
  for (const line of issue.lines) {
    const issuedMovements = await db.query(`
      SELECT sm.*, si.code as issue_code
      FROM stock_movements sm
      JOIN stock_issues si ON si.id = sm.stock_issue_id
      WHERE sm.receipt_line_id = $1 AND sm.quantity < 0
    `, [line.id])
    
    if (issuedMovements.length > 0) {
      const totalIssued = issuedMovements.reduce((s, m) => s + Math.abs(m.quantity), 0)
      const issueCodes = [...new Set(issuedMovements.map(m => m.issue_code))].join(', ')
      throw new Error(
        `Nelze stornovat — z řádku "${line.item.name}" `
        + `(šarže ${line.lot_number || 'bez šarže'}) `
        + `bylo vydáno ${totalIssued} ${line.unit.symbol}. `
        + `Výdejky: ${issueCodes}. `
        + `Nejprve stornujte příslušné výdejky.`
      )
    }
  }
}
```

**UI:** Tlačítko "Stornovat" na příjemce:
- Pokud blokováno → dialog s varováním a výčtem blokujících výdejek (s linky)
- Pokud OK → standardní confirm dialog "Opravdu stornovat?"

---

## FÁZE P6: TRACKING AGENDA — AKTUALIZACE

Tracking agenda (implementovaná v patch v1) aktualizovat:
- Detail šarže: tabulka "kde šarže skončila" teď čte z **movements** (ne allocations):

```sql
SELECT sm.quantity, sm.created_at, si.code, si.purpose, b.batch_number
FROM stock_movements sm
JOIN stock_issues si ON si.id = sm.stock_issue_id
LEFT JOIN batches b ON b.id = si.batch_id
WHERE sm.receipt_line_id = :receipt_line_id
  AND sm.quantity < 0
ORDER BY sm.created_at ASC
```

- remaining_qty v TrackingBrowser: počítá se z materializovaného sloupce (beze změny)

---

## FÁZE P7: I18N

```jsonc
// src/i18n/messages/cs/stockIssues.json — přidat:
{
  "quantity": "Množství",
  "requestedQty": "Požadované",
  "actualQty": "Skutečné",
  "missingQty": "Chybějící",
  "partialIssue": {
    "title": "Nedostatečný stav skladu",
    "description": "Následující položky nemají dostatečné množství:",
    "willIssue": "vydá se",
    "missing": "chybí",
    "confirmPartial": "Potvrdit částečný výdej",
    "cancel": "Zrušit"
  },
  "cancelReceipt": {
    "blocked": "Nelze stornovat příjemku",
    "issuedFrom": "Z následujících řádků bylo vydáváno:",
    "cancelIssuesFirst": "Nejprve stornujte příslušné výdejky."
  }
}
```

Anglické verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### Zrušení allocations
1. [ ] stock_movements má sloupec receipt_line_id (FK → stock_issue_lines)
2. [ ] stock_issue_allocations se nepoužívá (žádné reference v kódu)
3. [ ] FIFO engine vytváří movements s receipt_line_id místo allocations
4. [ ] manual_lot: LotSelectionDialog ukládá do manual_allocations JSONB na issue line
5. [ ] manual_lot: při confirm se z manual_allocations vytvoří movements s receipt_line_id

### Model množství
6. [ ] Příjemka — řádek má jen jedno editovatelné pole (label "Množství")
7. [ ] Výdejka draft — řádek zobrazuje jen Požadované (editovatelné)
8. [ ] Výdejka confirmed — řádek zobrazuje Požadované + Skutečné + Chybějící
9. [ ] Chybějící zobrazeno červeně pokud > 0
10. [ ] actual_qty a missing_qty se NEPERSISTUJÍ (computed z movements)

### Částečný výdej
11. [ ] Prevalidace před confirm — detekce nedostatku
12. [ ] Varování dialog s výčtem položek a dostupných množství
13. [ ] User může potvrdit částečný výdej
14. [ ] FIFO vydá co je dostupné, missing_qty > 0

### Storno
15. [ ] Cancel výdejky: smazání movements, vrácení remaining_qty na receipt lines
16. [ ] Cancel příjemky: blokováno pokud existují výdejové movements
17. [ ] Error message s konkrétními řádky, množstvím a kódy výdejek

### Tracking
18. [ ] Detail šarže čte výdeje z movements (ne allocations)

### Obecné
19. [ ] `npm run build` projde bez chyb
20. [ ] TypeScript: strict mode, zero errors
21. [ ] i18n: cs + en pro nové texty

---

## PRIORITA IMPLEMENTACE

1. **DB migrace** (P1) — receipt_line_id na movements, manual_allocations, drop allocations
2. **FIFO engine přepis** (P3) — movements místo allocations
3. **Model množství UI** (P2) — příjemka jen Množství, výdejka Požadované/Skutečné/Chybějící
4. **Částečný výdej** (P4) — prevalidace, dialog, partial confirm
5. **Storno logika** (P5) — cancel výdejky (restore remaining_qty), block cancel příjemky
6. **Tracking update** (P6) — movements místo allocations
7. **i18n** (P7)

---

## DOPAD NA SPRINT 4

Sprint 4 spec aktualizován současně. V Sprint 4 kódu **NESMÍ být žádná reference na stock_issue_allocations**.
