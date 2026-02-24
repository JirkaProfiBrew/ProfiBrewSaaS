## Úkol: Vedlejší pořizovací náklady (VPN) na příjemce

Nahradit jednoduchý `additionalCost` na hlavičce příjemky plnohodnotným systémem vedlejších pořizovacích nákladů s rozpuštěním na řádky. Standard českého účetnictví — pořizovací cena = nákupní cena + VPN.

**Odhad:** 8–12 hodin

---

## TERMINOLOGIE

| Zkratka | Český termín | DB field | Popis |
|---------|-------------|----------|-------|
| NC | Nákupní cena | `unit_price` | Cena od dodavatele per MJ (stávající) |
| VPN | Vedl. pořiz. náklad | `overhead_per_unit` | Rozpuštěný VPN per MJ (NOVÝ, computed) |
| PC | Pořizovací cena | `full_unit_price` | NC + VPN — tato cena jde do movements (NOVÝ) |

---

## FÁZE 1: DB SCHEMA

### 1.1 Nová tabulka: receipt_costs

```sql
CREATE TABLE receipt_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  stock_issue_id  UUID NOT NULL REFERENCES stock_issues(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,                    -- "Doprava", "Clo", "Balné"
  amount          DECIMAL NOT NULL,                 -- Celková částka VPN
  allocation      TEXT NOT NULL DEFAULT 'by_value', -- 'by_value' | 'by_quantity'
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_receipt_costs_issue ON receipt_costs(stock_issue_id);
```

### 1.2 Drizzle schema

```typescript
// drizzle/schema/stock.ts — přidat:
export const receiptCosts = pgTable(
  "receipt_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    stockIssueId: uuid("stock_issue_id").notNull()
      .references(() => stockIssues.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: decimal("amount").notNull(),
    allocation: text("allocation").notNull().default("by_value"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_receipt_costs_issue").on(table.stockIssueId),
  ]
);
```

### 1.3 Rozšíření stock_issue_lines

```sql
-- Nové sloupce pro VPN a PC:
ALTER TABLE stock_issue_lines
  ADD COLUMN overhead_per_unit DECIMAL DEFAULT 0,    -- VPN na MJ (computed při uložení)
  ADD COLUMN full_unit_price DECIMAL;                -- PC = unit_price + overhead_per_unit
```

### 1.4 Deprecace additionalCost

Pole `stock_issues.additional_cost`:
- **NEMAZAT** (zpětná kompatibilita, stávající data)
- Na hlavičce PŘESTAT ZOBRAZOVAT jako editovatelné pole
- Při confirm: `additional_cost = SUM(receipt_costs.amount)` — backfill pro zpětnou kompatibilitu
- Nové příjemky: `additional_cost` se plní automaticky ze SUM receipt_costs

### 1.5 RLS

```sql
ALTER TABLE receipt_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY receipt_costs_tenant ON receipt_costs
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

---

## FÁZE 2: BACKEND — CRUD + ALLOCATION ENGINE

### 2.1 CRUD pro receipt_costs

**Soubor:** `src/modules/stock-issues/actions.ts` — rozšířit

```typescript
// === RECEIPT COSTS (VPN) ===
export async function getReceiptCosts(stockIssueId: string): Promise<ReceiptCost[]>
export async function addReceiptCost(stockIssueId: string, data: CreateReceiptCostInput): Promise<ReceiptCost>
export async function updateReceiptCost(id: string, data: UpdateReceiptCostInput): Promise<ReceiptCost>
export async function removeReceiptCost(id: string): Promise<void>
```

Po každé mutaci receipt_costs → přepočítat rozpuštění (viz 2.2).

### 2.2 Allocation engine — rozpuštění VPN na řádky

```typescript
/**
 * Přepočítá overhead_per_unit a full_unit_price na všech řádcích příjemky.
 * Volat po KAŽDÉ změně: add/update/remove receipt_cost, add/update/remove line.
 */
async function recalculateOverhead(stockIssueId: string): Promise<void> {
  const lines = await getStockIssueLines(stockIssueId)
  const costs = await getReceiptCosts(stockIssueId)
  
  if (lines.length === 0) return
  
  // Příprava: hodnoty a množství per řádek
  const lineData = lines.map(line => ({
    id: line.id,
    qty: Number(line.requestedQty) || 0,
    unitPrice: Number(line.unitPrice) || 0,
    get value() { return this.qty * this.unitPrice },
  }))
  
  const totalValue = lineData.reduce((s, l) => s + l.value, 0)
  const totalQty = lineData.reduce((s, l) => s + l.qty, 0)
  
  // Inicializace overhead per řádek
  const overheadMap = new Map<string, number>()
  lineData.forEach(l => overheadMap.set(l.id, 0))
  
  // Rozpuštění každého VPN
  for (const cost of costs) {
    const costAmount = Number(cost.amount) || 0
    if (costAmount === 0) continue
    
    if (cost.allocation === 'by_quantity') {
      // Dle množství
      if (totalQty === 0) continue
      for (const line of lineData) {
        const share = line.qty / totalQty
        const allocated = costAmount * share
        overheadMap.set(line.id, (overheadMap.get(line.id) || 0) + allocated)
      }
    } else {
      // Dle hodnoty (default)
      if (totalValue === 0) continue
      for (const line of lineData) {
        const share = line.value / totalValue
        const allocated = costAmount * share
        overheadMap.set(line.id, (overheadMap.get(line.id) || 0) + allocated)
      }
    }
  }
  
  // Zaokrouhlení + haléřové vyrovnání
  // Celkový VPN musí sedět na halíř: SUM(rozpuštěné) = SUM(costs.amount)
  const totalCostAmount = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0)
  let allocatedSum = 0
  const updates: Array<{ id: string; overhead: number }> = []
  
  for (let i = 0; i < lineData.length; i++) {
    const line = lineData[i]
    let overhead = overheadMap.get(line.id) || 0
    
    // Haléřové vyrovnání na posledním řádku
    if (i === lineData.length - 1) {
      overhead = totalCostAmount - allocatedSum
    }
    
    overhead = Math.round(overhead * 100) / 100  // Na haléře
    allocatedSum += overhead
    updates.push({ id: line.id, overhead })
  }
  
  // Update řádků
  for (const upd of updates) {
    const line = lineData.find(l => l.id === upd.id)!
    const overheadPerUnit = line.qty > 0 ? upd.overhead / line.qty : 0
    const fullUnitPrice = line.unitPrice + overheadPerUnit
    
    await updateStockIssueLine(upd.id, {
      overhead_per_unit: overheadPerUnit,
      full_unit_price: fullUnitPrice,
    })
  }
  
  // Backfill additional_cost na hlavičce
  await updateStockIssue(stockIssueId, {
    additionalCost: String(totalCostAmount),
  })
}
```

**DŮLEŽITÉ:** `recalculateOverhead()` volat po:
- addReceiptCost / updateReceiptCost / removeReceiptCost
- addStockIssueLine / updateStockIssueLine / removeStockIssueLine (pokud se změní qty nebo unitPrice)

### 2.3 Úprava confirmStockIssue() — cena do movements

V `confirmStockIssue()` při vytváření movements pro příjemku:

```typescript
// STÁVAJÍCÍ:
//   unitPrice: line.unitPrice
// NOVÉ:
//   unitPrice: line.full_unit_price || line.unitPrice
```

To znamená: do `stock_movements.unit_price` jde **pořizovací cena** (NC + VPN), ne jen nákupní cena. Tím se VPN správně promítne do:
- FIFO alokace (výdejka čerpá PC)
- Průměrné ceny na stock_status
- CF z příjemky (celková částka = SUM řádků × PC)

### 2.4 Validační kontrola

Při confirm příjemky přidat kontrolu:

```typescript
function validateReceiptTotals(lines: StockIssueLine[], costs: ReceiptCost[]): void {
  const linesTotal = lines.reduce((s, l) => {
    return s + (Number(l.requestedQty) || 0) * (Number(l.unitPrice) || 0)
  }, 0)
  
  const costsTotal = costs.reduce((s, c) => s + (Number(c.amount) || 0), 0)
  
  const fullTotal = lines.reduce((s, l) => {
    return s + (Number(l.requestedQty) || 0) * (Number(l.fullUnitPrice) || 0)
  }, 0)
  
  const expected = linesTotal + costsTotal
  const diff = Math.abs(expected - fullTotal)
  
  if (diff > 0.01) {
    throw new Error(
      `Kontrola součtů: NC×množství (${linesTotal}) + VPN (${costsTotal}) = ${expected}, ` +
      `ale SUM(PC×množství) = ${fullTotal}. Rozdíl: ${diff} Kč`
    )
  }
}
```

---

## FÁZE 3: TYPES

### 3.1 Nové typy

```typescript
// src/modules/stock-issues/types.ts — přidat:

export type CostAllocation = 'by_value' | 'by_quantity'

export interface ReceiptCost {
  id: string
  tenantId: string
  stockIssueId: string
  description: string
  amount: string          // Decimal as string
  allocation: CostAllocation
  sortOrder: number
  createdAt: Date | null
}

export interface CreateReceiptCostInput {
  description: string
  amount: string
  allocation?: CostAllocation  // default: 'by_value'
}

export interface UpdateReceiptCostInput {
  description?: string
  amount?: string
  allocation?: CostAllocation
}
```

### 3.2 Rozšíření StockIssueLine

```typescript
// Přidat do StockIssueLine:
export interface StockIssueLine {
  // ... stávající pole ...
  overheadPerUnit: string | null   // VPN na MJ
  fullUnitPrice: string | null     // PC = NC + VPN
}
```

### 3.3 Rozšíření StockIssueWithLines

```typescript
export interface StockIssueWithLines extends StockIssue {
  lines: StockIssueLine[]
  costs: ReceiptCost[]      // NOVÉ
}
```

---

## FÁZE 4: UI — TAB VEDLEJŠÍ NÁKLADY

### 4.1 Nový tab na příjemce

Na detail příjemky přidat tab **"Náklady"** (nebo sekci pod hlavičkou, dle layoutu).

**Zobrazit JEN pokud movementType === 'receipt'** (na výdejce nesmí být).

### 4.2 Layout tabu Náklady

Inline editovatelná tabulka (stejný pattern jako řádky příjemky):

| # | Popis | Částka | Rozpuštění | Akce |
|---|-------|--------|-----------|------|
| 1 | Doprava | 500 Kč | Dle hodnoty ▾ | 🗑 |
| 2 | Clo | 200 Kč | Dle množství ▾ | 🗑 |
| | **Celkem VPN** | **700 Kč** | | |

**Tlačítko:** "+ Přidat náklad" pod tabulkou

**Pole:**
- Popis: text input (required)
- Částka: currency input (required, > 0)
- Rozpuštění: select — "Dle hodnoty" (default) | "Dle množství"

**Editace pouze v draft stavu.** V confirmed/cancelled: readonly.

### 4.3 Sumář na hlavičce

Na hlavičce příjemky (nad taby) zobrazit finanční sumář:

```
Položky: 1 500 Kč | VPN: 700 Kč | Celkem (PC): 2 200 Kč
```

- **Položky** = SUM(requestedQty × unitPrice) per řádek
- **VPN** = SUM(receipt_costs.amount)
- **Celkem** = SUM(requestedQty × fullUnitPrice) = Položky + VPN

Nahrazuje stávající `additionalCost` input na hlavičce. Ten **smazat** (nebo readonly s hodnotou z SUM receipt_costs).

---

## FÁZE 5: UI — ŘÁDKY PŘÍJEMKY — FINANČNÍ SLOUPCE

### 5.1 Rozšíření tabulky řádků (jen příjemka)

Stávající sloupce + nové finanční:

| Položka | Množství | MJ | NC | Celkem NC | VPN/MJ | PC | Celkem PC | Šarže | Exp. |
|---------|----------|----|----|-----------|--------|----|-----------|-------|------|
| Plzeňský slad | 100 | kg | 20,00 | 2 000 | 5,00 | 25,00 | 2 500 | L-001 | 12/26 |
| Apollo chmel | 2 | kg | 750,00 | 1 500 | 100,00 | 850,00 | 1 700 | L-002 | 06/26 |

**Popisy sloupců:**

| Sloupec | Zkratka | Popis | Editovatelný | Typ |
|---------|---------|-------|-------------|-----|
| NC | Nákupní cena | Cena od dodavatele per MJ | ✅ input | decimal |
| Celkem NC | — | qty × NC | readonly, computed | decimal |
| VPN/MJ | Vedl. náklad | Rozpuštěný VPN per MJ | readonly, computed | decimal |
| PC | Pořizovací cena | NC + VPN/MJ | readonly, computed | decimal |
| Celkem PC | — | qty × PC | readonly, computed | decimal |

**NC** je jediný editovatelný finanční sloupec. Vše ostatní je computed.

### 5.2 Responsivita / šířka

Tabulka bude široká. Řešení:
- Na menších obrazovkách skrýt "Celkem NC" a "VPN/MJ" (nechat jen NC, PC, Celkem PC)
- Nebo: horizontální scroll
- Nebo: finanční sloupce jako expandable řádek (accordion pod hlavním řádkem)

Rozhodnutí nechat na implementaci — hlavně musí být přítomny NC, PC a Celkem PC.

### 5.3 Barevné zvýraznění

- **NC** — normální (editovatelný input)
- **VPN/MJ** — šedý text (informativní)
- **PC** — tučný (= to co jde do skladu)
- **Celkem PC** — tučný

---

## FÁZE 6: FEATURE — "ZADAT CELKEM ZA ŘÁDEK"

### 6.1 Princip

Na faktuře od dodavatele je často jen celková cena za řádek (např. "Slad 100 kg = 2 000 Kč"), bez jednotkové ceny. Uživatel chce zadat 2 000 a systém dopočítá NC = 20 Kč/kg.

### 6.2 UI

Vedle sloupce NC přidat **toggle ikonu** (calculator nebo ↔):

**Režim A — Jednotková cena (default):**
```
NC: [20,00] Kč/kg    Celkem NC: 2 000 Kč
```
Input = NC (per MJ). Celkem NC = computed.

**Režim B — Celková cena:**
```
NC: 20,00 Kč/kg    Celkem NC: [2 000] Kč  ← input
```
Input = Celkem NC. NC = Celkem NC / množství (computed, readonly).

Přepínání: klik na ikonu 🔄 vedle NC sloupce. Tooltip: "Přepnout: zadat jednotkově / celkem"

### 6.3 Logika

```typescript
// Režim "celkem za řádek":
function onTotalPriceChange(totalPrice: number, qty: number): number {
  if (qty <= 0) return 0
  return Math.round((totalPrice / qty) * 10000) / 10000  // Na 4 desetinná místa
}

// Po přepnutí zpět do režimu "jednotková cena" — NC zůstane jak je
// Do DB jde VŽDY unit_price (NC per MJ) — režim "celkem" je čistě UI
```

### 6.4 Implementace

- **Žádná DB změna** — do DB jde vždy `unit_price` (NC per MJ)
- State per řádek: `priceInputMode: 'unit' | 'total'` (React state, ne DB)
- Default: 'unit'
- Při přepnutí na 'total': zobrazit input "Celkem NC", readonly NC
- Při přepnutí zpět: zobrazit input NC, readonly Celkem NC
- Při změně množství v režimu 'total': přepočítat NC = totalPrice / qty

---

## FÁZE 7: ÚPRAVA CONFIRM — CENA DO MOVEMENTS

### 7.1 Změna v confirmStockIssue()

V souboru `src/modules/stock-issues/actions.ts`, ve funkci `confirmStockIssue()`:

Pro příjemky — při vytváření stock_movements:

```typescript
// PŘED (stávající kód):
unitPrice: String(unitPrice)  // = line.unitPrice (NC)

// PO (nový kód):
unitPrice: String(Number(line.fullUnitPrice || line.unitPrice || 0))  // = PC (NC + VPN)
```

**A zároveň pro řádek příjemky:**

```typescript
// total_cost na řádku = qty × PC (ne qty × NC)
totalCost: String(qty * Number(line.fullUnitPrice || line.unitPrice || 0))
```

### 7.2 Změna total_cost na hlavičce

```typescript
// PŘED:
totalCost = documentTotalCost + additionalCost

// PO:
// additionalCost je už rozpuštěný do PC na řádcích
// total_cost na hlavičce = SUM(line.totalCost) kde totalCost = qty × PC
// VPN je SOUČÁSTÍ řádkových cen, ne NAVÍC
totalCost = documentTotalCost  // documentTotalCost už obsahuje VPN
// additionalCost pole backfill pro info: = SUM(receipt_costs.amount)
```

**POZOR:** Tohle je klíčová změna — VPN se neprčítává navíc, je rozpuštěný DO řádků. `total_cost` na hlavičce = SUM(qty × PC), bez dalšího přičítání.

### 7.3 Dopad na FIFO alokaci výdejek

Výdejka při FIFO čte `unit_price` z receipt movement (příjmového pohybu). Protože ten teď obsahuje PC (ne NC), výdejka automaticky pracuje s pořizovací cenou. **Žádná změna v allocation engine.**

---

## FÁZE 8: I18N

```jsonc
// cs/stockIssues.json — přidat/upravit:
{
  "costs": {
    "title": "Vedlejší náklady",
    "addCost": "Přidat náklad",
    "description": "Popis",
    "amount": "Částka",
    "allocation": "Rozpuštění",
    "allocationByValue": "Dle hodnoty",
    "allocationByQuantity": "Dle množství",
    "total": "Celkem VPN",
    "noCosts": "Žádné vedlejší náklady",
    "onlyReceipts": "Vedlejší náklady lze přidat pouze na příjemku"
  },
  "lines": {
    // Stávající + nové:
    "unitPrice": "NC",
    "unitPriceTooltip": "Nákupní cena (od dodavatele) za MJ",
    "lineTotalNc": "Celkem NC",
    "overheadPerUnit": "VPN/MJ",
    "overheadPerUnitTooltip": "Vedlejší pořizovací náklad na MJ",
    "fullUnitPrice": "PC",
    "fullUnitPriceTooltip": "Pořizovací cena = NC + VPN",
    "lineTotalPc": "Celkem PC",
    "togglePriceMode": "Přepnout: zadat jednotkově / celkem",
    "priceModeTotalLabel": "Celkem za řádek"
  },
  "summary": {
    "linesTotal": "Položky",
    "costsTotal": "VPN",
    "grandTotal": "Celkem (PC)"
  }
}
```

Anglické verze:
```jsonc
{
  "costs": {
    "title": "Additional costs",
    "addCost": "Add cost",
    "description": "Description",
    "amount": "Amount",
    "allocation": "Allocation",
    "allocationByValue": "By value",
    "allocationByQuantity": "By quantity",
    "total": "Total overhead",
    "noCosts": "No additional costs"
  },
  "lines": {
    "unitPrice": "Price",
    "lineTotalNc": "Total (net)",
    "overheadPerUnit": "OH/unit",
    "fullUnitPrice": "Full cost",
    "lineTotalPc": "Total (full)",
    "togglePriceMode": "Toggle: unit / total price entry"
  }
}
```

---

## FÁZE 9: MIGRACE STÁVAJÍCÍCH DAT

### 9.1 Existující příjemky s additionalCost > 0

```sql
-- Pro každou příjemku kde additional_cost > 0 a nemá receipt_costs:
INSERT INTO receipt_costs (tenant_id, stock_issue_id, description, amount, allocation)
SELECT 
  si.tenant_id,
  si.id,
  'Vedlejší náklady (migrace)',
  si.additional_cost,
  'by_value'
FROM stock_issues si
WHERE si.movement_type = 'receipt'
  AND COALESCE(si.additional_cost::decimal, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM receipt_costs rc WHERE rc.stock_issue_id = si.id
  );
```

### 9.2 Přepočet overhead na řádcích

Po migraci spustit `recalculateOverhead()` pro všechny dotčené příjemky. Ale pozor — potvrzené příjemky mají movements s původní cenou (NC bez VPN). **NEMĚNIT** ceny na existujících movements — migrace jen pro nové příjemky.

Pro existující příjemky: `overhead_per_unit` a `full_unit_price` se dopočítají, ale movements zůstávají s původní cenou.

---

## AKCEPTAČNÍ KRITÉRIA

### DB & Schema
1. [ ] Tabulka `receipt_costs` existuje s RLS
2. [ ] `stock_issue_lines.overhead_per_unit` a `full_unit_price` existují
3. [ ] Migrace existujících additionalCost > 0 do receipt_costs

### CRUD VPN
4. [ ] Přidání vedlejšího nákladu (popis, částka, rozpuštění)
5. [ ] Editace a mazání VPN (jen v draft stavu)
6. [ ] Po každé změně VPN se přepočítá overhead na řádcích

### Rozpuštění
7. [ ] Dle hodnoty: VPN rozpuštěno proporcionálně k hodnotě řádků (qty × NC)
8. [ ] Dle množství: VPN rozpuštěno proporcionálně k množství
9. [ ] Více VPN s různými režimy: overhead = součet alokací ze všech VPN
10. [ ] Haléřové vyrovnání: SUM(rozpuštěné) = SUM(VPN) na halíř

### UI — tab Náklady
11. [ ] Tab/sekce "Náklady" viditelný JEN na příjemce
12. [ ] Inline editovatelná tabulka VPN
13. [ ] Řádek: popis, částka, rozpuštění select, smazat
14. [ ] Sumář: Celkem VPN

### UI — finanční sloupce na řádcích
15. [ ] Sloupce: NC (input) | Celkem NC | VPN/MJ | PC | Celkem PC
16. [ ] NC editovatelný, ostatní readonly computed
17. [ ] PC = NC + VPN/MJ (vždy)
18. [ ] Celkem PC = qty × PC (vždy)
19. [ ] Sloupce VPN/MJ, PC, Celkem PC viditelné JEN na příjemce

### UI — sumář na hlavičce
20. [ ] Položky: X Kč | VPN: Y Kč | Celkem: Z Kč
21. [ ] Kontrola: Položky + VPN = Celkem (na halíř)

### Feature "zadat celkem"
22. [ ] Toggle ikona vedle NC na řádku příjemky
23. [ ] Režim "celkem": input pro celkovou cenu řádku, NC computed = celkem / qty
24. [ ] Přepnutí zpět: NC zůstane, input pro NC
25. [ ] Do DB jde VŽDY unit_price (NC per MJ)

### Confirm + movements
26. [ ] Při confirm příjemky: unit_price v movements = **PC** (ne NC)
27. [ ] total_cost na hlavičce = SUM(qty × PC), BEZ přičítání additionalCost navíc
28. [ ] Validace: SUM(qty × NC) + SUM(VPN) ≈ SUM(qty × PC) (tolerance 0,01)

### Edge cases
29. [ ] Řádek s NC = 0: VPN dle hodnoty přeskočí (0 podíl), dle množství funguje
30. [ ] Řádek s qty = 0: přeskočit v rozpuštění
31. [ ] Žádné VPN: overhead = 0, PC = NC (zpětná kompatibilita)
32. [ ] Smazání posledního VPN: overhead se vynuluje
33. [ ] Změna qty nebo NC na řádku: automatický přepočet overhead

### Obecné
34. [ ] `npm run build` bez chyb
35. [ ] i18n: cs + en
36. [ ] Výdejky: finanční sloupce VPN/PC NEZOBRAZOVAT (jen NC)

---

## PRIORITA IMPLEMENTACE

1. **DB migrace** (1.1–1.5) — tabulka, sloupce, RLS
2. **Backend: CRUD + recalculateOverhead()** (2.1–2.2) — jádro
3. **UI: tab Náklady** (4.1–4.3) — CRUD VPN
4. **UI: finanční sloupce na řádcích** (5.1–5.3) — NC, VPN, PC
5. **UI: sumář na hlavičce** (4.3) — Položky / VPN / Celkem
6. **Feature "zadat celkem"** (6.1–6.4) — toggle per řádek
7. **Confirm úprava** (7.1–7.3) — PC do movements
8. **Migrace dat** (9.1–9.2)
9. **i18n** (8)

---

## TECHNICKÉ POZNÁMKY

- **recalculateOverhead()** je klíčová funkce — volat po KAŽDÉ relevantní mutaci. Zvážit debounce na FE (aby se nevolala při každém keystroke v NC inputu). Doporučení: přepočet server-side při uložení řádku, ne při každé změně.
- **Haléřové vyrovnání** — rozdíl zaokrouhlení přidat na poslední řádek. Testovat s VPN 100 Kč rozdělenou na 3 řádky (33,33 + 33,33 + 33,34).
- **Rozpuštění "dle množství" s různými MJ** — potenciální problém pokud jeden řádek je v kg a druhý v kusech. Pro MVP ignorovat (brewery příjemky surovin mají typicky vše v kg/g). Případně upozornit usera.
- **Storno příjemky** — receipt_costs se stornují spolu s příjemkou (CASCADE). Movements zůstávají s PC.
- **Backfill additional_cost** — pro zpětnou kompatibilitu s existujícím kódem (např. CF z příjemky čte additionalCost). Postupně refaktorovat na SUM(receipt_costs).
- **Performance** — recalculateOverhead je O(lines × costs). Pro typickou příjemku (5–15 řádků, 1–3 VPN) zanedbatelné.

### Aktualizuj dokumentaci
- CHANGELOG.md
- PRODUCT-SPEC.md — sekce Sklad rozšířit o VPN
- CLAUDE.md — pokud relevantní
