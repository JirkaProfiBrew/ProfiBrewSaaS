# SPRINT 4 — OBCHOD (SALES + FINANCE)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 19.02.2026

---

## CÍL SPRINTU

Implementovat kompletní obchodní cyklus pivovaru: odběratelské objednávky se status workflow, zálohy za obaly (kegy, přepravky), vytvoření skladových výdejek z objednávek, automatické příjemky při ukončení várky dle nastavení provozovny, **výdej surovin na várku s vazbou na recept (rezervace + expedice)**, evidence příjmů a výdajů (cash flow) s vazbami na objednávky a doklady, šablony pro recurring platby, a zjednodušenou pokladnu pro taproom. Současně aktivovat automatický odpis přes obsahový poměr (base_item) a reserved_qty logiku.

**Časový odhad:** 2 týdny (T10-T11)

**Závisí na:** Sprint 3 (Sklad — warehouses, stock_issues, stock_movements, stock_status, FIFO engine, shops settings, items base_item)

---

## REFERENČNÍ DOKUMENTY

- `docs/SYSTEM-DESIGN.md` sekce 5.9 (Orders), 5.10 (Finance/CashFlow)
- `docs/PRODUCT-SPEC.md` sekce 6 (Modul Obchod), sekce 7 (Modul Finance)
- `docs/sprints/sprint-3-spec.md` — Fáze 3G (shops settings), Fáze 3H (items base_item), deferred items
- `CLAUDE.md` — pravidla kódování, dokumentační povinnosti

---

## ⚠️ PREREKVIZITA: AUDIT SPRINT 3

**PŘED zahájením Sprint 4 proveď audit:**

1. **CHANGELOG.md** — Sprint 3 musí mít status ✅ Done, všechny checkboxy `- [x]`
2. **PRODUCT-SPEC.md** — warehouses, stock_issues, lot tracking = ✅
3. **Shops settings** — stock_mode, cenotvorbové parametry, defaultní sklady musí existovat v DB
4. **Items base_item** — base_item_id + base_item_quantity sloupce musí existovat na items
5. **Stock status** — stock_status tabulka s quantity, reserved_qty musí fungovat
6. **FIFO engine** — confirmStockIssue + cancelStockIssue musí fungovat
7. **Counter per warehouse** — číslovací řady per sklad musí fungovat

---

## FÁZE 4A: DB SCHEMA — OBJEDNÁVKY A FINANCE

### 4A.1 Deposits (Zálohy za obaly)

**`drizzle/schema/deposits.ts`**

```sql
CREATE TABLE deposits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Keg 30L", "Keg 50L", "Přepravka"
  deposit_amount  DECIMAL NOT NULL,                -- Výše zálohy (Kč)
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

**Seed:** Při registraci tenanta vytvořit 3 defaultní zálohy:
- Keg 30L — 1500 Kč
- Keg 50L — 2000 Kč
- Přepravka — 200 Kč

### 4A.2 Orders (Objednávky)

**`drizzle/schema/orders.ts`**

```sql
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_number    TEXT NOT NULL,                    -- Z číslovací řady (OBJ-2026-0001)
  
  -- === PARTNER ===
  partner_id      UUID NOT NULL REFERENCES partners(id),
  contact_id      UUID REFERENCES contacts(id),    -- Kontaktní osoba
  
  -- === STATUS ===
  status          TEXT NOT NULL DEFAULT 'draft',
    -- 'draft' | 'confirmed' | 'in_preparation' | 'shipped' | 'delivered' | 'invoiced' | 'cancelled'
  
  -- === DATES ===
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_date   DATE,                            -- Požadované datum dodání
  shipped_date    DATE,                            -- Datum odeslání
  delivered_date  DATE,                            -- Datum skutečného dodání
  closed_date     DATE,                            -- Datum uzavření (invoiced/cancelled)
  
  -- === LOCATION ===
  shop_id         UUID REFERENCES shops(id),       -- Provozovna
  warehouse_id    UUID REFERENCES warehouses(id),  -- Sklad pro výdej
  
  -- === FINANCIALS ===
  total_excl_vat  DECIMAL DEFAULT 0,               -- Celkem bez DPH
  total_vat       DECIMAL DEFAULT 0,               -- DPH celkem
  total_incl_vat  DECIMAL DEFAULT 0,               -- Celkem s DPH
  total_deposit   DECIMAL DEFAULT 0,               -- Zálohy celkem
  currency        TEXT DEFAULT 'CZK',
  
  -- === REFERENCES ===
  stock_issue_id  UUID REFERENCES stock_issues(id), -- Vytvořená výdejka
  cashflow_id     UUID REFERENCES cashflows(id),    -- Napojený cash flow
  
  -- === NOTES ===
  notes           TEXT,                             -- Pro zákazníka (tisk)
  internal_notes  TEXT,                             -- Interní (netiskne se)
  
  -- === META ===
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, order_number)
);
```

### 4A.3 Order Items (Řádky objednávky)

```sql
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  
  -- === POLOŽKA ===
  item_id         UUID NOT NULL REFERENCES items(id),
  quantity        DECIMAL NOT NULL,
  unit_id         UUID REFERENCES units(id),
  
  -- === CENOTVORBA ===
  unit_price      DECIMAL NOT NULL,                -- Jednotková cena bez DPH
  vat_rate        DECIMAL DEFAULT 21,              -- DPH sazba (%)
  discount_pct    DECIMAL DEFAULT 0,               -- Sleva (%)
  total_excl_vat  DECIMAL,                         -- Celkem bez DPH (computed)
  total_vat       DECIMAL,                         -- DPH (computed)
  total_incl_vat  DECIMAL,                         -- Celkem s DPH (computed)
  
  -- === ZÁLOHA ZA OBAL ===
  deposit_id      UUID REFERENCES deposits(id),    -- Typ zálohy (keg, přepravka)
  deposit_qty     DECIMAL DEFAULT 0,               -- Počet obalů k záloze
  deposit_total   DECIMAL DEFAULT 0,               -- Záloha celkem (computed)
  
  -- === META ===
  notes           TEXT,
  sort_order      INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4A.4 CashFlow Categories (Kategorie příjmů/výdajů)

```sql
CREATE TABLE cashflow_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Prodej piva", "Nákup surovin"
  parent_id       UUID REFERENCES cashflow_categories(id), -- Hierarchie
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  is_system       BOOLEAN DEFAULT false,            -- Systémové = needitovatelné
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Seed** — systémové kategorie per tenant:

**Příjmy:**
- Prodej piva
  - Prodej sudové
  - Prodej lahvové
  - Prodej taproom
- Zálohy přijaté
- Ostatní příjmy

**Výdaje:**
- Nákup surovin
  - Slad
  - Chmel
  - Kvasnice
  - Ostatní suroviny
- Provozní náklady
  - Energie
  - Nájemné
  - Pojistka
  - Údržba
- Obaly a materiál
- Daně a poplatky
  - Spotřební daň
  - DPH
- Mzdy
- Ostatní výdaje

### 4A.5 CashFlows (Příjmy a výdaje)

```sql
CREATE TABLE cashflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  code            TEXT,                             -- CF-2026-001
  
  -- === TYP ===
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  category_id     UUID REFERENCES cashflow_categories(id),
  
  -- === FINANCE ===
  amount          DECIMAL NOT NULL,
  currency        TEXT DEFAULT 'CZK',
  
  -- === DATES ===
  date            DATE NOT NULL,                    -- Datum vystavení
  due_date        DATE,                             -- Splatnost
  paid_date       DATE,                             -- Datum platby
  
  -- === STATUS ===
  status          TEXT DEFAULT 'planned',            -- 'planned' | 'pending' | 'paid' | 'cancelled'
  
  -- === REFERENCES ===
  partner_id      UUID REFERENCES partners(id),
  order_id        UUID REFERENCES orders(id),
  stock_issue_id  UUID REFERENCES stock_issues(id),
  shop_id         UUID REFERENCES shops(id),
  
  -- === META ===
  description     TEXT,
  notes           TEXT,
  is_cash         BOOLEAN DEFAULT false,            -- Hotovostní operace (pokladna)
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4A.6 CashFlow Templates (Šablony pro recurring)

```sql
CREATE TABLE cashflow_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Nájem provozovny"
  
  -- === TEMPLATE DATA ===
  cashflow_type   TEXT NOT NULL,                    -- 'income' | 'expense'
  category_id     UUID REFERENCES cashflow_categories(id),
  amount          DECIMAL NOT NULL,
  description     TEXT,
  partner_id      UUID REFERENCES partners(id),
  
  -- === RECURRING ===
  frequency       TEXT NOT NULL,                    -- 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  day_of_month    INTEGER,                          -- 1-28 (den generování; max 28 kvůli únoru)
  start_date      DATE NOT NULL,
  end_date        DATE,                             -- NULL = bez konce
  next_date       DATE NOT NULL,                    -- Další plánované generování
  
  -- === META ===
  is_active       BOOLEAN DEFAULT true,
  last_generated  DATE,                             -- Poslední generovaný CF
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4A.7 Cash Desks (Pokladny)

```sql
CREATE TABLE cash_desks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,                    -- "Pokladna taproom"
  shop_id         UUID NOT NULL REFERENCES shops(id),
  current_balance DECIMAL DEFAULT 0,               -- Aktuální zůstatek
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### 4A.8 Číslovací řady — rozšíření seed

Přidat counter entity pro nového tenanta:
- `order`: prefix `OBJ`, include_year=true, padding=4 → `OBJ-2026-0001`
- `cashflow`: prefix `CF`, include_year=true, padding=4 → `CF-2026-0001`

### 4A.9 Migrace a indexy

```sql
-- === ALTER existující tabulky (Sprint 3) pro production issues ===

-- Vazba výdejového řádku na ingredienci receptu
ALTER TABLE stock_issue_lines
  ADD COLUMN recipe_item_id UUID REFERENCES recipe_items(id);

-- Příznak, že draft výdejka má aktivní rezervaci
ALTER TABLE stock_issues
  ADD COLUMN is_reserved BOOLEAN DEFAULT false;

-- Orders
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_partner ON orders(partner_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_date ON orders(tenant_id, order_date DESC);

-- Order Items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_item ON order_items(item_id);

-- CashFlows
CREATE INDEX idx_cashflows_tenant ON cashflows(tenant_id);
CREATE INDEX idx_cashflows_type ON cashflows(tenant_id, cashflow_type);
CREATE INDEX idx_cashflows_status ON cashflows(tenant_id, status);
CREATE INDEX idx_cashflows_date ON cashflows(tenant_id, date DESC);
CREATE INDEX idx_cashflows_partner ON cashflows(partner_id);

-- Categories
CREATE INDEX idx_cf_categories_tenant ON cashflow_categories(tenant_id);
CREATE INDEX idx_cf_categories_parent ON cashflow_categories(parent_id);

-- Deposits
CREATE INDEX idx_deposits_tenant ON deposits(tenant_id);
```

**RLS:** Standardní tenant izolace na všech tabulkách (WHERE tenant_id = auth.jwt()->>'tenant_id').

---

## FÁZE 4B: DEPOSITS (ZÁLOHY ZA OBALY)

### 4B.1 Modul struktura

```
src/modules/deposits/
├── components/
│   └── DepositManager.tsx         # Inline CRUD (Settings subtab nebo dialog)
├── config.ts
├── actions.ts                     # CRUD server actions
├── types.ts
└── index.ts
```

### 4B.2 UI

Zálohy jsou konfigurační entita — jednoduché CRUD, nejsou v hlavním sidebaru.

**Umístění:** Settings → nový subtab "Zálohy" (nebo jako sekce v Settings → Obecné)

| Pole | Typ | Validace |
|------|-----|----------|
| Název | text | required, min 2 znaky |
| Výše zálohy | currency (Kč) | required, > 0 |
| Aktivní | boolean | default true |

Inline tabulka s přidáním/editací přímo v řádku (jako counters). Žádný detail view — příliš jednoduchá entita.

---

## FÁZE 4C: ORDERS — BACKEND

### 4C.1 Server Actions

**`src/modules/orders/actions.ts`**

```typescript
// CRUD
export async function getOrders(filters?: OrderFilters): Promise<PaginatedResult<Order>>
export async function getOrder(id: string): Promise<OrderWithLines>
export async function createOrder(data: CreateOrderInput): Promise<Order>
export async function updateOrder(id: string, data: UpdateOrderInput): Promise<Order>
export async function deleteOrder(id: string): Promise<void>  // Jen draft

// ŘÁDKY
export async function addOrderItem(orderId: string, data: CreateOrderItemInput): Promise<OrderItem>
export async function updateOrderItem(id: string, data: UpdateOrderItemInput): Promise<OrderItem>
export async function removeOrderItem(id: string): Promise<void>

// STATUS WORKFLOW
export async function confirmOrder(id: string): Promise<Order>
export async function startPreparation(id: string): Promise<Order>
export async function shipOrder(id: string): Promise<Order>
export async function deliverOrder(id: string): Promise<Order>
export async function invoiceOrder(id: string): Promise<Order>
export async function cancelOrder(id: string, reason?: string): Promise<Order>

// STOCK VAZBA
export async function createStockIssueFromOrder(orderId: string): Promise<StockIssue>

// CASHFLOW VAZBA
export async function createCashFlowFromOrder(orderId: string): Promise<CashFlow>
```

### 4C.2 Status Workflow

```
draft → confirmed → in_preparation → shipped → delivered → invoiced
                                                             ↓
                                    ← ← ← ← ← ← ← ← ← cancelled
```

**Pravidla přechodů:**

| Z | Na | Akce | Podmínky |
|---|----|------|----------|
| draft | confirmed | confirmOrder() | Musí mít ≥1 řádek, partner vyplněn |
| draft | cancelled | cancelOrder() | Žádné podmínky |
| confirmed | in_preparation | startPreparation() | — |
| confirmed | cancelled | cancelOrder() | Pokud nebyla vytvořena výdejka |
| in_preparation | shipped | shipOrder() | Výdejka musí být potvrzená |
| shipped | delivered | deliverOrder() | — |
| delivered | invoiced | invoiceOrder() | Cash flow záznam vytvořen |
| jakýkoli (kromě invoiced) | cancelled | cancelOrder() | Storno výdejky pokud existuje |

**Při confirmOrder():**
1. Validace (řádky, partner, ceny)
2. Přepočítat totals (excl_vat, vat, incl_vat, deposit)
3. **Aktualizovat stock_status.reserved_qty** — přičíst požadovaná množství per item × warehouse
4. Nastavit status = confirmed

**Při cancelOrder():**
1. Pokud existuje stock_issue (výdejka) → stornovat ji (cancelStockIssue z Sprint 3)
2. **Odečíst reserved_qty** ze stock_status
3. Pokud existuje cashflow → stornovat (status = cancelled)
4. Nastavit status = cancelled, closed_date = now

### 4C.3 Reserved Quantity Logic

**Aktivace reserved_qty** (odloženo z Sprint 3):

- Při `confirmOrder()` → pro každý order_item: `stock_status.reserved_qty += quantity`
- Při `shipOrder()` (= výdejka potvrzena) → `reserved_qty -= quantity` (přesun z reserved do actual výdeje)
- Při `cancelOrder()` → `reserved_qty -= quantity`

**stock_status.available_qty** = quantity - reserved_qty (GENERATED column, už existuje z Sprint 3)

### 4C.4 createStockIssueFromOrder()

**Klíčová vazba obchod → sklad:**

```typescript
async function createStockIssueFromOrder(orderId: string): Promise<StockIssue> {
  const order = await getOrder(orderId)
  
  // 1. Vytvořit výdejku (draft)
  const issue = await createStockIssue({
    type: 'issue',
    purpose: 'sale',
    warehouse_id: order.warehouse_id || defaultWarehouse,
    partner_id: order.partner_id,
    order_id: order.id,
    date: new Date(),
  })
  
  // 2. Pro každý řádek objednávky vytvořit řádek výdejky
  //    Line VŽDY odpovídá tomu co se prodalo (= objednaná položka)
  //    Na výdejkách: requested_qty = požadované množství k výdeji
  //    actual_qty a missing_qty se dopočítají z movements po confirm
  for (const item of order.items) {
    await addStockIssueLine(issue.id, {
      item_id: item.itemId,          // Vždy objednaná položka (např. Plechovka 0,33L)
      requested_qty: item.quantity,   // Objednané množství (např. 5 ks)
      unit_price: item.unit_price,
    })
  }
  
  // 3. Uložit vazbu
  await updateOrder(orderId, { stock_issue_id: issue.id })
  
  return issue
}
```

**KRITICKÉ — Výdej dle stock_mode provozovny:**

Řádek výdejky vždy odpovídá objednané položce. Rozdíl je v tom, **odkud se fyzicky odepíše** — to řeší alokační engine při potvrzení výdejky (confirmStockIssue), ne při tvorbě řádků:

| stock_mode | Příklad objednávky | Line na výdejce | Alokace (FIFO/manual_lot) |
|------------|-------------------|-----------------|---------------------------|
| **packaged** | 5× Plechovka 0,33L | Plechovka 0,33L, qty=5 | Hledá receipt lines Plechovky 0,33L |
| **bulk** | 5× Plechovka 0,33L | Plechovka 0,33L, qty=5 | Hledá receipt lines **base_itemu** (Světlý ležák 12°), alloc qty = 5 × 0,33 = 1,65 L |
| **none** | — | Výdejka se nevytváří | — |

Princip: **line = co se prodalo, alokace = odkud se to fyzicky odepsalo.**

### 4C.5 Výdejový engine — rozšíření pro stock_mode

**Stávající FIFO engine (Sprint 3 patch)** vytváří movements s `receipt_line_id` a předpokládá stejný item na výdejovém a příjmovém řádku. V bulk režimu to neplatí — výdejka má prodejní položku, ale movements jdou na base_item.

**Úprava `confirmStockIssue()` — resolve efektivního itemu:**

```typescript
async function resolveIssueTarget(line: IssueLine, shop: Shop): Promise<{
  targetItemId: string   // Item, ze kterého se fyzicky odepíše
  targetQty: number      // Množství k odepsání
}> {
  const item = await getItem(line.item_id)
  
  if (shop.settings.stock_mode === 'bulk' && item.base_item_id) {
    // BULK: cross-item — line = Plechovka 0,33L, movements jdou na Světlý ležák
    return {
      targetItemId: item.base_item_id,
      targetQty: line.requested_qty * item.base_item_quantity,
    }
  }
  
  // PACKAGED (nebo položka bez base_item): přímý výdej
  return {
    targetItemId: line.item_id,
    targetQty: line.requested_qty,
  }
}
```

**Úprava `processFIFO()` — stock_mode aware:**

```typescript
async function processFIFO(
  issue: StockIssue,
  line: IssueLine,
  targetItemId: string,    // Může být base_item v bulk režimu
  targetQty: number        // Může být přepočítané množství
) {
  const receiptLines = await db.query(`
    SELECT sil.*, si.date
    FROM stock_issue_lines sil
    JOIN stock_issues si ON si.id = sil.stock_issue_id
    WHERE sil.item_id = $1              -- targetItemId (base_item v bulk)
      AND si.warehouse_id = $2
      AND si.type = 'receipt'
      AND si.status = 'confirmed'
      AND sil.remaining_qty > 0
    ORDER BY si.date ASC, sil.created_at ASC
    FOR UPDATE
  `, [targetItemId, issue.warehouse_id])
  
  let remaining = targetQty
  
  for (const rl of receiptLines) {
    if (remaining <= 0) break
    const take = Math.min(remaining, rl.remaining_qty)
    
    // Movement s vazbou na příjmový řádek (= šarži)
    await createMovement({
      stock_issue_id: issue.id,
      stock_issue_line_id: line.id,       // Výdejový řádek (Plechovka)
      item_id: targetItemId,              // Fyzicky odepsaný item (Ležák v bulk)
      warehouse_id: issue.warehouse_id,
      movement_type: 'issue',
      quantity: -take,
      unit_price: rl.unit_price,
      receipt_line_id: rl.id,             // Příjmový řádek (= šarže)
    })
    
    await updateLine(rl.id, {
      remaining_qty: sql`remaining_qty - ${take}`
    })
    
    remaining -= take
  }
  
  // Nedostatek → částečný výdej (viz Sprint 3 patch P4)
  const actualIssued = targetQty - remaining
  await updateStockStatus(issue.warehouse_id, targetItemId, -actualIssued)
}
```

**Úprava processManualAllocations() — bulk režim:**

```typescript
async function processManualAllocations(
  issue: StockIssue,
  line: IssueLine,
  targetItemId: string,    // Může být base_item
  targetQty: number
) {
  let totalIssued = 0
  
  for (const alloc of line.manual_allocations!) {
    const receiptLine = await getLine(alloc.receipt_line_id)
    
    await createMovement({
      stock_issue_id: issue.id,
      stock_issue_line_id: line.id,
      item_id: targetItemId,
      warehouse_id: issue.warehouse_id,
      movement_type: 'issue',
      quantity: -alloc.quantity,
      unit_price: receiptLine.unit_price,
      receipt_line_id: alloc.receipt_line_id,
    })
    
    await updateLine(alloc.receipt_line_id, {
      remaining_qty: sql`remaining_qty - ${alloc.quantity}`
    })
    
    totalIssued += alloc.quantity
  }
  
  await updateStockStatus(issue.warehouse_id, targetItemId, -totalIssued)
}
```

**LotSelectionDialog — bulk režim:**

Pokud stock_mode='bulk' a item má base_item:
- Dialog zobrazuje receipt lines **base_itemu** (ne prodejní položky)
- Požadované množství k výdeji = line.qty × item.base_item_quantity
- Label: "Výdej 5× Plechovka 0,33L → potřeba 1,65 L Světlý ležák 12°"
- manual_allocations odkazují na receipt_line_id base_itemu

### 4C.6 Reserved Quantity — stock_mode aware

Při confirmOrder() se rezervuje na **správném itemu** (stejný jako targetItemId ve výdejovém enginu):

```typescript
for (const orderItem of order.items) {
  const item = await getItem(orderItem.item_id)
  
  if (shop.settings.stock_mode === 'bulk' && item.base_item_id) {
    // Rezervovat base_item
    const reserveQty = orderItem.quantity * item.base_item_quantity
    await updateStockStatus(warehouse_id, item.base_item_id, 0, +reserveQty)
  } else {
    // Rezervovat přímo objednanou položku
    await updateStockStatus(warehouse_id, orderItem.item_id, 0, +orderItem.quantity)
  }
}
```

Analogicky při cancelOrder() — odečíst reserved_qty ze správného itemu.

Při shipOrder() (výdejka potvrzena → movements vytvořeny → stock_status.quantity sníženo):
- reserved_qty se sníží o totéž množství (přesun z "rezervováno" do "skutečně vydáno")

### 4C.7 createCashFlowFromOrder()

```typescript
async function createCashFlowFromOrder(orderId: string): Promise<CashFlow> {
  const order = await getOrder(orderId)
  
  return createCashFlow({
    cashflow_type: 'income',
    category_id: findSystemCategory('sales'),  // Prodej piva
    amount: order.total_incl_vat + order.total_deposit,
    date: order.order_date,
    due_date: order.delivery_date,
    partner_id: order.partner_id,
    order_id: order.id,
    description: `Objednávka ${order.order_number}`,
  })
}
```

### 4C.8 Přepočet totals na objednávce

```typescript
function recalculateOrderTotals(items: OrderItem[]): OrderTotals {
  let totalExclVat = 0
  let totalVat = 0
  let totalDeposit = 0
  
  for (const item of items) {
    const lineExclVat = item.quantity * item.unit_price * (1 - item.discount_pct / 100)
    const lineVat = lineExclVat * (item.vat_rate / 100)
    const lineDeposit = item.deposit_qty * (item.deposit?.deposit_amount || 0)
    
    totalExclVat += lineExclVat
    totalVat += lineVat
    totalDeposit += lineDeposit
  }
  
  return {
    total_excl_vat: round2(totalExclVat),
    total_vat: round2(totalVat),
    total_incl_vat: round2(totalExclVat + totalVat),
    total_deposit: round2(totalDeposit),
  }
}
```

**Přepočet se spouští:**
- Při přidání/editaci/smazání řádku
- Při confirmOrder() (finální přepočet)

---

## FÁZE 4D: ORDERS — FRONTEND

### 4D.1 Modul struktura

```
src/modules/orders/
├── components/
│   ├── OrderBrowser.tsx           # DataBrowser
│   ├── OrderDetail.tsx            # DetailView s taby
│   ├── OrderHeaderForm.tsx        # Hlavička objednávky
│   ├── OrderItemsTable.tsx        # Inline editovatelná tabulka řádků
│   ├── OrderItemDialog.tsx        # Dialog pro přidání/editaci řádku
│   ├── OrderStatusBadge.tsx       # Barevné statusové badgy
│   ├── OrderStatusActions.tsx     # Tlačítka pro workflow přechody
│   ├── OrderSummary.tsx           # Sumární panel (celkem, DPH, zálohy)
│   └── CreateStockIssueDialog.tsx # Dialog pro vytvoření výdejky
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts                      # Zod validace
└── index.ts
```

### 4D.2 OrderBrowser

**Route:** `/sales/orders`

**Sloupce:**

| Sloupec | Zdroj | Pozn. |
|---------|-------|-------|
| Číslo | order_number | Link na detail |
| Zákazník | partner.name | |
| Datum objednávky | order_date | |
| Datum dodání | delivery_date | |
| Stav | status | StatusBadge |
| Celkem s DPH | total_incl_vat | Formátováno s Kč |
| Zálohy | total_deposit | Formátováno s Kč |

**Quick filters:** Vše | Otevřené (draft+confirmed+in_preparation) | K dodání (shipped) | Uzavřené (delivered+invoiced) | Zrušené

**Akce:** + Objednávka (vytvoří draft, otevře detail)

**StatusBadge barvy:**
- draft → šedá
- confirmed → modrá
- in_preparation → žlutá
- shipped → oranžová
- delivered → zelená
- invoiced → zelená tmavá
- cancelled → červená

### 4D.3 OrderDetail

**Route:** `/sales/orders/[id]`

**Header:** Číslo objednávky + StatusBadge + OrderStatusActions

**OrderStatusActions** — kontextová tlačítka dle stavu:
- draft: [Potvrdit] [Zrušit]
- confirmed: [Připravit] [Vytvořit výdejku] [Zrušit]
- in_preparation: [Odeslat] (aktivní jen pokud výdejka je confirmed)
- shipped: [Doručeno]
- delivered: [Vytvořit cash flow] [Fakturovat]
- invoiced: (žádné akce)

**Taby:**

**Tab 1 — Hlavička:**

| Pole | Typ | Podmínky |
|------|-----|----------|
| Číslo objednávky | readonly | Auto-generované |
| Zákazník (partner) | relation → partners (is_customer=true) | required |
| Kontaktní osoba | relation → contacts (partner_id) | optional |
| Datum objednávky | date | default: dnes |
| Datum dodání | date | optional |
| Provozovna | relation → shops | optional |
| Sklad pro výdej | relation → warehouses | default z shops settings |
| Poznámka (pro zákazníka) | textarea | |
| Interní poznámka | textarea | |

Editovatelné jen v `draft` stavu. Po confirmed = readonly.

**Tab 2 — Řádky:**

Inline editovatelná tabulka (stejný vzor jako stock_issue_lines ze Sprint 3):

| Sloupec | Typ | Pozn. |
|---------|-----|-------|
| Položka | relation → items (is_sale_item=true) | Command lookup |
| Množství | decimal | required, > 0 |
| MJ | readonly (z item.unit) | |
| Jedn. cena | decimal | Předvyplní se z item.sale_price |
| Sleva % | decimal | default 0 |
| DPH % | decimal | default 21 |
| Celkem bez DPH | computed | readonly |
| Záloha typ | relation → deposits | optional |
| Záloha ks | decimal | default = quantity |
| Záloha Kč | computed | readonly |

Editovatelné jen v `draft` stavu.

**Sumární panel (OrderSummary)** — vpravo nebo pod tabulkou:
```
Celkem bez DPH:    12 500 Kč
DPH (21%):          2 625 Kč
─────────────────────────────
Celkem s DPH:      15 125 Kč
Zálohy za obaly:    4 500 Kč
═════════════════════════════
K úhradě celkem:   19 625 Kč
```

**Tab 3 — Výdejka:**
- Pokud stock_issue_id existuje → zobrazit detail výdejky (readonly) s linkem na `/stock/movements/[id]`
- Pokud neexistuje → tlačítko "Vytvořit výdejku" (aktivní od stavu confirmed)
- CreateStockIssueDialog: preview řádků, volba skladu, potvrzení
  - Pokud stock_mode='bulk': zobrazit přepočet → "5× Plechovka 0,33L → odepíše se 1,65 L Světlý ležák 12°"
  - Pokud stock_mode='packaged': zobrazit přímo → "5× Plechovka 0,33L"
  - Pokud stock_mode='none': tlačítko "Vytvořit výdejku" skryto, info "Provozovna nemá aktivní skladový režim"

**Tab 4 — Cash Flow:**
- Pokud cashflow_id existuje → zobrazit detail (readonly) s linkem na `/finance/cashflow/[id]`
- Pokud neexistuje → tlačítko "Vytvořit cash flow" (aktivní od stavu delivered)

### 4D.4 Create Flow

1. User klikne "+ Objednávka" → systém vytvoří draft s automatickým číslem
2. Redirect na OrderDetail
3. User vyplní zákazníka, přidá řádky
4. Přepočet sumáře probíhá real-time po každé změně řádku
5. User klikne "Potvrdit" → validace + přechod na confirmed

---

## FÁZE 4E: AUTOMATICKÉ PŘÍJEMKY PŘI UKONČENÍ VÁRKY

**Odloženo z Sprint 3 — implementujeme nyní.**

### 4E.1 Batch Completion Hook

Při změně stavu várky (batch) na `completed` (ukončení ležení) se spustí automatická logika dle konfigurace provozovny:

```typescript
async function onBatchCompleted(batchId: string): Promise<void> {
  const batch = await getBatch(batchId)
  const shop = await getShop(batch.shopId)
  const settings = shop.settings
  
  switch (settings.stock_mode) {
    case 'none':
      // Nic se neděje — jen ukončit várku
      break
      
    case 'bulk':
      await createBulkReceipt(batch, settings)
      break
      
    case 'packaged':
      await createPackagedReceipt(batch, settings)
      break
  }
}
```

### 4E.2 Režim "bulk" — naskladnit vcelku

```typescript
async function createBulkReceipt(batch: Batch, settings: ShopSettings): Promise<StockIssue> {
  // batch.recipe → najít base_production_item (items.is_production_item = true)
  const productionItem = await getProductionItemForRecipe(batch.recipeId)
  if (!productionItem) throw new Error('Receptura nemá přiřazenou výrobní položku')
  
  // Cena dle nastavení
  const price = await calculateBeerPrice(batch, productionItem, settings.beer_pricing_mode)
  
  // Vytvořit příjemku
  const receipt = await createStockIssue({
    type: 'receipt',
    purpose: 'production',
    warehouse_id: settings.default_warehouse_beer_id,
    batch_id: batch.id,
    date: new Date(),
  })
  
  // 1 řádek — celý objem z tanku
  // POZOR: na příjemkách requested_qty = skutečné přijaté množství (viz Sprint 3 patch v2)
  const qty = batch.actual_volume_l || batch.planned_volume_l
  await addStockIssueLine(receipt.id, {
    item_id: productionItem.id,
    requested_qty: qty,
    remaining_qty: qty,    // Inicializovat = celé množství dostupné k výdeji
    unit_price: price,
  })
  
  // Automaticky potvrdit
  await confirmStockIssue(receipt.id)
  
  return receipt
}
```

### 4E.3 Režim "packaged" — naskladnit stočené obaly

```typescript
async function createPackagedReceipt(batch: Batch, settings: ShopSettings): Promise<StockIssue> {
  // Z bottling tab (Sprint 2) — kolik čeho se nastáčelo
  const bottlingItems = await getBatchBottlingItems(batch.id)
  if (bottlingItems.length === 0) throw new Error('Várka nemá žádné stáčecí záznamy')
  
  const receipt = await createStockIssue({
    type: 'receipt',
    purpose: 'production',
    warehouse_id: settings.default_warehouse_beer_id,
    batch_id: batch.id,
    date: new Date(),
  })
  
  // Řádek per prodejní položka z bottling
  for (const bi of bottlingItems) {
    const price = await calculateBeerPrice(batch, bi.item, settings.beer_pricing_mode)
    
    // POZOR: na příjemkách requested_qty = skutečné přijaté množství (viz Sprint 3 patch v2)
    await addStockIssueLine(receipt.id, {
      item_id: bi.item_id,    // Prodejní položka (KEG 30L, PET 1.5L...)
      requested_qty: bi.quantity,
      remaining_qty: bi.quantity,  // Inicializovat = celé množství dostupné k výdeji
      unit_price: price,
    })
  }
  
  // Automaticky potvrdit
  await confirmStockIssue(receipt.id)
  
  return receipt
}
```

### 4E.4 Kalkulace ceny piva

```typescript
async function calculateBeerPrice(
  batch: Batch,
  item: Item,
  mode: 'fixed' | 'recipe_calc' | 'actual_costs'
): Promise<number> {
  switch (mode) {
    case 'fixed':
      return item.cost_price || 0  // Z karty položky
      
    case 'recipe_calc':
      // Z kalkulace receptury (recipe.cost_per_liter)
      const recipe = await getRecipe(batch.recipeId)
      return recipe.cost_per_liter || 0
      
    case 'actual_costs':
      // Skutečné náklady z varu (suroviny spotřebované + režie)
      // Součet cen surovin z výdejek vázaných na tuto várku
      // + overhead z shop settings
      const materialCost = await calculateBatchMaterialCost(batch.id)
      const shop = await getShop(batch.shopId)
      const overhead = shop.settings.overhead_czk + shop.settings.brew_cost_czk
      const overheadPct = materialCost * (shop.settings.overhead_pct / 100)
      const totalCost = materialCost + overhead + overheadPct
      const volume = batch.actual_volume_l || batch.planned_volume_l
      return volume > 0 ? totalCost / volume : 0  // Cena per litr
  }
}
```

### 4E.5 UI — Batch Detail rozšíření

Na stránce batch detail (Sprint 2) přidat:
- **Confirm dialog při ukončení** — zobrazit jaký režim naskladnění je nastaven a co se stane
- **Tab "Sklad"** — po ukončení zobrazit vytvořenou příjemku (link na stock_issue)
- Pokud `stock_mode = 'none'` → dialog jen informuje "Var bude ukončen bez naskladnění"

---

## FÁZE 4E-bis: VÝDEJ SUROVIN NA VÁRKU (PRODUCTION ISSUES)

Sládek potřebuje vydat suroviny ze skladu s vazbou na konkrétní várku a ingredience receptu. Řešení využívá **standardní stock_issue** s `purpose='production'` — žádné interní objednávky, žádné fake entity.

### Prerekvizita: Recipe Snapshot

Batch musí mít přiřazenou **kopii receptu** (viz samostatný pokyn "Snapshot receptu při vytvoření várky"). Production issue řádky odkazují na `recipe_items` této kopie přes `recipe_item_id`.

### 4Eb.1 DB schema (součást 4A.9)

Sloupce přidané v 4A.9:

```sql
-- Na stock_issue_lines — vazba na ingredienci receptu
ALTER TABLE stock_issue_lines
  ADD COLUMN recipe_item_id UUID REFERENCES recipe_items(id);

-- Na stock_issues — příznak aktivní rezervace
ALTER TABLE stock_issues
  ADD COLUMN is_reserved BOOLEAN DEFAULT false;
```

### 4Eb.2 createProductionIssue() — připravit suroviny (draft + rezervace)

```typescript
async function createProductionIssue(batchId: string): Promise<StockIssue> {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) throw new Error('Várka nemá přiřazený recept')
  
  const recipe = await getRecipe(batch.recipeId)  // Snapshot kopie
  const recipeItems = await getRecipeIngredients(batch.recipeId)
  const shop = await getShop(batch.shopId)
  
  // Poměr pro přepočet množství z receptu na objem várky
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
    // Přepočet: amountG z receptu je na batchSizeL, škálovat na skutečný objem
    const baseAmountG = parseFloat(ri.amountG) || 0
    const unitFactor = ri.unitToBaseFactor ? parseFloat(ri.unitToBaseFactor) : 1
    const scaledQty = (baseAmountG / unitFactor) * scaleFactor
    
    await addStockIssueLine(issue.id, {
      item_id: ri.itemId,
      requested_qty: scaledQty,
      recipe_item_id: ri.id,     // VAZBA na ingredienci receptu
    })
  }
  
  // Draft = rezervace
  await reserveProductionMaterials(issue.id)
  
  return issue
}
```

### 4Eb.3 reserveProductionMaterials() — reserved_qty při draft

```typescript
async function reserveProductionMaterials(issueId: string) {
  const issue = await getStockIssue(issueId)
  if (issue.purpose !== 'production' || issue.status !== 'draft') return
  if (issue.is_reserved) return  // Už rezervováno
  
  for (const line of issue.lines) {
    await incrementReservedQty(issue.warehouse_id, line.item_id, line.requested_qty)
  }
  
  await updateStockIssue(issueId, { is_reserved: true })
}

async function unreserveProductionMaterials(issueId: string) {
  const issue = await getStockIssue(issueId)
  if (!issue.is_reserved) return
  
  for (const line of issue.lines) {
    await incrementReservedQty(issue.warehouse_id, line.item_id, -line.requested_qty)
  }
  
  await updateStockIssue(issueId, { is_reserved: false })
}
```

**Integrace s confirmStockIssue():** Při confirm production issue s `is_reserved=true` — odečíst reserved_qty PŘED odečtením quantity (v jedné transakci):

```typescript
// V confirmStockIssue(), po FIFO alokaci:
if (issue.purpose === 'production' && issue.is_reserved) {
  await unreserveProductionMaterials(issue.id)
}
```

**Integrace s cancelStockIssue():** Při cancel draft production issue s `is_reserved=true`:

```typescript
// V cancelStockIssue():
if (issue.purpose === 'production' && issue.is_reserved && issue.status === 'draft') {
  await unreserveProductionMaterials(issue.id)
}
```

### 4Eb.4 directProductionIssue() — přímý výdej bez rezervace

Jedno tlačítko "Vydat suroviny" — vytvoří draft a rovnou confirm:

```typescript
async function directProductionIssue(batchId: string): Promise<StockIssue> {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) throw new Error('Várka nemá přiřazený recept')
  
  const recipe = await getRecipe(batch.recipeId)
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
  
  // BEZ rezervace — rovnou confirm
  // Prevalidace (částečný výdej dialog) proběhne na FE před voláním
  await confirmStockIssue(issue.id)
  
  return issue
}
```

### 4Eb.5 prefillFromBatch() — opačný směr (z výdejky na batch)

Na formuláři nové výdejky, pokud user vybere purpose="Výroba" a následně várku:

```typescript
async function prefillIssueFromBatch(issueId: string, batchId: string) {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) throw new Error('Várka nemá přiřazený recept')
  
  const recipe = await getRecipe(batch.recipeId)
  const recipeItems = await getRecipeIngredients(batch.recipeId)
  const scaleFactor = (batch.plannedVolumeL || recipe.batchSizeL) 
                      / (recipe.batchSizeL || 1)
  
  // Smazat existující řádky (pokud user měnil purpose/batch)
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

**UI flow na výdejce:**

1. User vytvoří novou výdejku
2. Vybere purpose = "Výroba" (z dropdownu)
3. Zobrazí se pole **"Várka"** — select z batches (jen planned / brewing / fermenting)
4. Po výběru várky → automaticky předvyplní řádky z recipe snapshot (škálované na objem)
5. User může editovat řádky (přidat/odebrat/změnit množství)
6. Uložit draft / Potvrdit

Pokud purpose ≠ "Výroba" → pole "Várka" se nezobrazuje, chování beze změny.

### 4Eb.6 Batch Detail — tab "Suroviny" redesign

Aktuálně: readonly seznam `getRecipeIngredients()`. Nově: přehled s vazbou na výdeje.

**Datový model tabu:**

```typescript
interface BatchIngredientRow {
  recipeItemId: string
  itemName: string
  category: string           // 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
  recipeQty: number          // Z receptu, škálované na objem várky
  unit: string               // MJ symbol
  reservedQty: number        // SUM(draft production issue lines pro tento recipe_item)
  issuedQty: number          // SUM(ABS(movements)) z confirmed production issues
  missingQty: number         // recipeQty - issuedQty (≥ 0)
  lots: Array<{              // Šarže použité pro tuto ingredienci
    lotNumber: string | null
    quantity: number
    receiptLineId: string
  }>
}
```

**Query:**

```typescript
async function getBatchIngredients(batchId: string): Promise<BatchIngredientRow[]> {
  const batch = await getBatch(batchId)
  if (!batch.recipeId) return []
  
  const recipe = await getRecipe(batch.recipeId)
  const recipeItems = await getRecipeIngredients(batch.recipeId)
  const scaleFactor = (batch.plannedVolumeL || recipe.batchSizeL) 
                      / (recipe.batchSizeL || 1)
  
  // Najít všechny production issues na tento batch
  const productionIssues = await db.query(`
    SELECT si.id, si.status, si.is_reserved
    FROM stock_issues si
    WHERE si.batch_id = $1 
      AND si.purpose = 'production'
      AND si.type = 'issue'
      AND si.status != 'cancelled'
  `, [batchId])
  
  const issueIds = productionIssues.map(i => i.id)
  
  // Agregovat per recipe_item_id
  const lineAggregates = issueIds.length > 0 ? await db.query(`
    SELECT 
      sil.recipe_item_id,
      -- Rezervované = draft lines z is_reserved issues
      SUM(CASE WHEN si.status = 'draft' AND si.is_reserved = true 
          THEN sil.requested_qty ELSE 0 END) as reserved_qty,
      -- Vydané = SUM movements z confirmed issues
      COALESCE(SUM(ABS(sm.quantity)), 0) as issued_qty
    FROM stock_issue_lines sil
    JOIN stock_issues si ON si.id = sil.stock_issue_id
    LEFT JOIN stock_movements sm ON sm.stock_issue_line_id = sil.id
    WHERE sil.stock_issue_id = ANY($1)
      AND sil.recipe_item_id IS NOT NULL
    GROUP BY sil.recipe_item_id
  `, [issueIds]) : []
  
  // Šarže per recipe_item_id (z movements)
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
  
  // Sestavit výstup
  return recipeItems.map(ri => {
    const baseAmountG = parseFloat(ri.amountG) || 0
    const unitFactor = ri.unitToBaseFactor ? parseFloat(ri.unitToBaseFactor) : 1
    const recipeQty = (baseAmountG / unitFactor) * scaleFactor
    
    const agg = lineAggregates.find(a => a.recipe_item_id === ri.id)
    const issuedQty = agg?.issued_qty || 0
    
    return {
      recipeItemId: ri.id,
      itemName: ri.itemName,
      category: ri.category,
      recipeQty,
      unit: ri.unitSymbol || 'g',
      reservedQty: agg?.reserved_qty || 0,
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

**UI tabulka:**

| Surovina | Kategorie | Recept | Rezervováno | Vydáno | Chybí | Šarže |
|----------|-----------|--------|-------------|--------|-------|-------|
| Plzeňský slad | Slad | 50 kg | 50 kg | 35 kg | **15 kg** | L-2026-001 (35 kg) |
| Apollo | Chmel | 0,5 kg | 0,5 kg | 0,5 kg | 0 kg | — |
| Safale S-189 | Kvasnice | 0,2 kg | 0 kg | 0 kg | **0,2 kg** | — |

- **Chybí** — červeně pokud > 0
- **Šarže** — klikatelné, link na Tracking detail
- Grouping per kategorie (collapsible)

**Akce na tabu:**

| Tlačítko | Zobrazit kdy | Akce |
|----------|-------------|------|
| "Rezervovat suroviny" | Žádný draft production issue existuje | `createProductionIssue()` |
| "Vydat suroviny" | Vždy (pokud recept má ingredience) | `directProductionIssue()` |
| "Zrušit rezervaci" | Existuje draft production issue s is_reserved | `cancelStockIssue()` na draft |

**Sekce "Výdejky" pod tabulkou:**

Seznam production issues navázaných na batch:

| Kód | Stav | Datum | Poznámka |
|-----|------|-------|----------|
| VD-S1-005 | ✅ Potvrzeno | 15.02.2026 | Link na výdejku |
| VD-S1-008 | 📝 Draft (rezervace) | 18.02.2026 | Link na výdejku |

### 4Eb.7 Výdejka formulář — purpose selection + batch prefill

Na formuláři nové/editace výdejky:

**Rozšíření formuláře:**

1. Pole **purpose** — select (existuje, ale jen v DB; nyní i v UI):
   - `sale` — Prodej (default)
   - `production` — Výroba
   - `transfer` — Převod
   - `writeoff` — Odpis
   - `other` — Ostatní

2. Pole **batch** — select, zobrazit JEN pokud purpose = `production`:
   - Options: batches ve stavu planned / brewing / fermenting
   - Label: "{batchNumber} — {recipeName}"
   - Po výběru → volat `prefillIssueFromBatch()`
   - Pokud user změní batch → přeptat "Přepsat řádky z nové várky?" → re-prefill

3. Po prefill: řádky jsou editovatelné — user může přidat/odebrat/změnit množství

**UX detail:** Pokud uživatel přijde z batch detail (klikl "Vydat suroviny"), výdejka se otevře s pre-nastaveným purpose=production a batch_id → rovnou prefilled.

### 4Eb.8 Tracking detail — sloupec Várka

V Tracking detailu (Sprint 3 patch, fáze P6.3) — tabulka "kde šarže skončila":

Přidat sloupec **Várka**:

```sql
SELECT sm.quantity, sm.created_at, si.code, si.purpose, 
       b.batch_number, b.id as batch_id    -- PŘIDAT
FROM stock_movements sm
JOIN stock_issues si ON si.id = sm.stock_issue_id
LEFT JOIN batches b ON b.id = si.batch_id   -- PŘIDAT
WHERE sm.receipt_line_id = :receipt_line_id
  AND sm.quantity < 0
ORDER BY sm.created_at ASC
```

| Datum výdeje | Výdejka | Účel | Várka | Množství |
|-------------|---------|------|-------|----------|
| 15.02.2026 | VD-S1-005 | Výroba | V-2026-003 (link) | 25 kg |
| 18.02.2026 | VD-S1-008 | Prodej | — | 10 kg |

### 4Eb.9 I18N

```jsonc
// src/i18n/messages/cs/batches.json — přidat:
{
  "ingredients": {
    "title": "Suroviny",
    "columns": {
      "ingredient": "Surovina",
      "category": "Kategorie",
      "recipe": "Recept",
      "reserved": "Rezervováno",
      "issued": "Vydáno",
      "missing": "Chybí",
      "lots": "Šarže"
    },
    "actions": {
      "reserve": "Rezervovat suroviny",
      "issue": "Vydat suroviny",
      "cancelReservation": "Zrušit rezervaci",
      "confirmReserve": "Rezervovat suroviny pro várku {batchNumber}?",
      "confirmIssue": "Vydat suroviny pro várku {batchNumber}?",
      "confirmCancelReserve": "Zrušit rezervaci surovin?"
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
  "prefillFromBatch": "Předvyplněno z receptu várky {batchNumber}"
}
```

Anglické verze analogicky.

---

## FÁZE 4F: CASHFLOW — BACKEND A FRONTEND

### 4F.1 Modul struktura

```
src/modules/cashflows/
├── components/
│   ├── CashFlowBrowser.tsx
│   ├── CashFlowDetail.tsx
│   ├── CashFlowForm.tsx
│   ├── CashFlowStatusBadge.tsx
│   ├── CashFlowSummaryPanel.tsx    # Sumář: příjmy/výdaje/saldo per období
│   ├── CategorySelect.tsx          # Hierarchický select kategorií
│   └── TemplateManager.tsx         # CRUD šablon
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts
└── index.ts
```

### 4F.2 CashFlowBrowser

**Route:** `/finance/cashflow`

**Sloupce:**

| Sloupec | Zdroj | Pozn. |
|---------|-------|-------|
| Kód | code | CF-2026-0001 |
| Datum | date | |
| Typ | cashflow_type | Příjem/Výdaj (badge) |
| Kategorie | category.name | |
| Popis | description | |
| Partner | partner.name | |
| Částka | amount | Zelená pro příjmy, červená pro výdaje |
| Stav | status | StatusBadge |

**Quick filters:** Vše | Příjmy | Výdaje | Plánované | Zaplacené

**SummaryPanel** (nad tabulkou):
```
Období: [Únor 2026 ▾]
Příjmy: 125 000 Kč | Výdaje: 87 500 Kč | Saldo: +37 500 Kč
```

### 4F.3 CashFlowDetail

**Route:** `/finance/cashflow/[id]`

**Formulář:**

| Pole | Typ | Pozn. |
|------|-----|-------|
| Kód | readonly | Auto |
| Typ | radio (Příjem / Výdaj) | required |
| Kategorie | hierarchický select | dle typu |
| Částka | currency | required, > 0 |
| Datum | date | required |
| Splatnost | date | optional |
| Datum platby | date | optional |
| Stav | select (planned/pending/paid/cancelled) | default: planned |
| Partner | relation → partners | optional |
| Popis | text | |
| Poznámka | textarea | |
| Hotovost | checkbox | Pro pokladnu |

**Cross-links** (readonly sekce dole):
- Objednávka: link na `/sales/orders/[id]` pokud order_id existuje
- Skladový doklad: link na `/stock/movements/[id]` pokud stock_issue_id existuje

### 4F.4 CashFlow Templates (Šablony)

**Route:** `/finance/cashflow/templates` nebo Settings → Cash Flow šablony

**TemplateManager:** DataBrowser šablon + detail formulář.

| Pole | Typ |
|------|-----|
| Název | text |
| Typ | radio (Příjem / Výdaj) |
| Kategorie | hierarchický select |
| Částka | currency |
| Partner | relation |
| Popis | text |
| Frekvence | select (weekly/monthly/quarterly/yearly) |
| Den v měsíci | number (1-28) |
| Začátek | date |
| Konec | date (optional) |

**Generování z šablon:**

```typescript
// Spouštět manuálně tlačítkem "Generovat plánované platby" 
// (v MVP ne automaticky přes cron — to je post-MVP)
async function generateFromTemplates(tenantId: string): Promise<CashFlow[]> {
  const templates = await getActiveTemplates(tenantId)
  const generated: CashFlow[] = []
  
  for (const t of templates) {
    while (t.next_date <= today() && (!t.end_date || t.next_date <= t.end_date)) {
      const cf = await createCashFlow({
        cashflow_type: t.cashflow_type,
        category_id: t.category_id,
        amount: t.amount,
        date: t.next_date,
        partner_id: t.partner_id,
        description: `${t.name} — ${formatDate(t.next_date)}`,
        status: 'planned',
      })
      generated.push(cf)
      
      // Posunout next_date
      t.next_date = advanceDate(t.next_date, t.frequency)
      await updateTemplate(t.id, { next_date: t.next_date, last_generated: today() })
    }
  }
  
  return generated
}
```

---

## FÁZE 4G: POKLADNA (CASH DESK)

### 4G.1 Zjednodušená implementace pro MVP

Pokladna v MVP = filtrovaný pohled na cashflows kde `is_cash = true` + pokladna entity (cash_desks) pro tracking zůstatku.

**Route:** `/finance/cashdesk`

**UI:**
- Select pokladna (pokud tenant má více pokladen)
- Aktuální zůstatek (velké číslo nahoře)
- **Příjem** / **Výdej** quick-action buttons
- Seznam dnešních operací (cashflows kde is_cash=true, shop=pokladna.shop)
- Denní přehled: příjmy / výdaje / zůstatek

**CashDeskTransaction dialog:**
- Typ: Příjem / Výdej
- Částka
- Popis (rychlé volby: "Prodej piva", "Drobný výdaj"...)
- Kategorie (předfiltrované)
→ Vytvoří cashflow se `is_cash = true, shop_id = cash_desk.shop_id`
→ Aktualizuje cash_desk.current_balance (±amount)

**Settings → Pokladny:** Jednoduchý CRUD (název, provozovna).

---

## FÁZE 4H: CASHFLOW CATEGORIES — SETTINGS UI

### 4H.1 CashFlow Categories Manager

**Route:** Settings → nový subtab "Kategorie CF"

Hierarchický strom kategorií (income a expense zvlášť):

```
📁 Příjmy
  ├─ Prodej piva
  │  ├─ Prodej sudové
  │  ├─ Prodej lahvové
  │  └─ Prodej taproom
  ├─ Zálohy přijaté
  └─ Ostatní příjmy

📁 Výdaje
  ├─ Nákup surovin
  │  ├─ Slad
  │  ├─ Chmel
  │  └─ ...
  └─ ...
```

**Akce:** Přidat kategorii, editovat název, přesunout (parent), deaktivovat. Systémové (is_system=true) = needitovatelné, ale user může přidat pod-kategorie.

---

## FÁZE 4I: NAVIGACE A SIDEBAR

### 4I.1 Sales modul sidebar

```
📦 Obchod (sales)
  📊 Přehled            /sales/overview         ← placeholder
  📋 Objednávky         /sales/orders
```

### 4I.2 Finance modul sidebar

```
💰 Finance (finance)
  📊 Přehled            /finance/overview       ← placeholder
  📋 Cash Flow          /finance/cashflow
  🏪 Pokladna           /finance/cashdesk
```

### 4I.3 Settings sidebar rozšíření

Přidat do Settings:
- Zálohy za obaly (deposits)
- Pokladny (cash desks)
- Kategorie CF (cashflow categories)

### 4I.4 Cross-module linky

- Objednávka → Partner (link na detail)
- Objednávka → Výdejka (link na stock issue detail)
- Objednávka → Cash flow (link na CF detail)
- Cash flow → Partner (link na detail)
- Cash flow → Objednávka (link na order detail)
- Batch (po ukončení) → Příjemka (link na stock issue)

---

## FÁZE 4J: I18N

**Nové soubory:**

- `src/i18n/messages/cs/orders.json`
- `src/i18n/messages/en/orders.json`
- `src/i18n/messages/cs/cashflows.json`
- `src/i18n/messages/en/cashflows.json`
- `src/i18n/messages/cs/deposits.json`
- `src/i18n/messages/en/deposits.json`

**Klíčové překlady:**
- Status workflow: draft, confirmed, in_preparation, shipped, delivered, invoiced, cancelled
- Typy: příjem/výdaj, income/expense
- Akce: potvrdit, připravit, odeslat, doručit, fakturovat, stornovat, vytvořit výdejku, vytvořit cash flow
- Zálohy: keg, přepravka, záloha
- Pokladna: příjem, výdej, zůstatek
- Měsíční sumář: příjmy, výdaje, saldo

---

## FÁZE 4K: DOKUMENTACE

### 4K.1 CHANGELOG.md

```markdown
## [0.4.0] — Sprint 4: Obchod + Finance
**Období:** T10-T11
**Status:** ✅ Done

### Přidáno
- [x] Orders — CRUD, řádky, DPH, slevy, zálohy za obaly
- [x] Order workflow — draft → confirmed → in_preparation → shipped → delivered → invoiced → cancelled
- [x] Vytvoření výdejky z objednávky (stock_mode-aware: bulk=cross-item alokace, packaged=přímá)
- [x] Reserved quantity — stock_mode-aware (rezervace na správném itemu)
- [x] Automatické příjemky při ukončení várky (none/bulk/packaged)
- [x] Kalkulace ceny piva (fixed/recipe_calc/actual_costs)
- [x] Výdej surovin na várku — draft s rezervací + přímý výdej, vazba na recipe_item
- [x] Batch detail tab "Suroviny" — přehled Recept/Rezervováno/Vydáno/Chybí/Šarže
- [x] Výdejka formulář — purpose select, batch prefill z receptu
- [x] Tracking detail — sloupec Várka (traceability surovina → batch)
- [x] Deposits — zálohy za obaly (kegy, přepravky)
- [x] CashFlows — příjmy, výdaje, kategorie, status workflow
- [x] CashFlow templates — šablony pro recurring platby
- [x] CashFlow categories — hierarchické kategorie (systémové + custom)
- [x] Cash desk — zjednodušená pokladna pro taproom
- [x] Navigace: Sales + Finance moduly v sidebaru
- [x] Cross-module linky: order↔partner, order↔stock_issue, order↔cashflow, batch↔receipt, batch↔production_issue
```

### 4K.2 PRODUCT-SPEC.md

Aktualizovat statusy:
- Orders: 📋 → ✅
- CashFlows: 📋 → ✅
- CashFlow templates: 📋 → ✅
- Cash desk: 📋 → ✅
- Stock issues → aktualizovat o automatické příjemky z batch
- Lot tracking → aktualizovat: traceability surovina↔batch přes production issues
- Batches → aktualizovat: tab suroviny s vazbou na výdeje, recipe snapshot

### 4K.3 CLAUDE.md

Aktualizovat scope: Sprint 4 completed. Orders, CashFlows, Deposits, CashDesk added to completed modules.

---

## AKCEPTAČNÍ KRITÉRIA

### Deposits
1. [x] CRUD záloh v Settings
2. [ ] 3 defaultní zálohy seed při registraci tenanta

### Orders
3. [x] Vytvoření objednávky s automatickým kódem (OBJ-2026-0001)
4. [x] Přidání řádků s items lookup (is_sale_item=true), cenami, slevou, DPH
5. [x] Záloha za obaly per řádek (deposit_id + deposit_qty)
6. [x] Sumární přepočet (excl_vat, vat, incl_vat, deposit) real-time
7. [x] Confirm order: validace, reserved_qty update, status = confirmed
8. [x] Vytvoření výdejky z objednávky — řádky odpovídají objednaným položkám
9. [x] Bulk režim: alokace jde na base_item s přepočtem množství (5× PET 0,33 = 1,65L base_item)
10. [x] Packaged režim: alokace jde přímo na objednanou položku
11. [ ] None režim: výdejka se nevytváří (tlačítko skryto)
12. [x] Vytvoření cash flow z objednávky
13. [ ] Cancel order: storno výdejky, storno reserved_qty (ze správného itemu), storno CF
14. [x] Kompletní workflow: draft → confirmed → shipped → delivered → invoiced
15. [x] Editace možná jen v draft stavu

### Automatické příjemky
16. [ ] Režim "none": ukončení várky bez skladového pohybu
17. [x] Režim "bulk": příjemka s base_production_item, množství = objem z tanku
18. [x] Režim "packaged": příjemka s prodejními položkami z bottling tab
19. [x] Cena piva dle nastavení (fixed / recipe_calc / actual_costs)
20. [ ] Batch detail: confirm dialog s informací o režimu, tab "Sklad" s odkazem na příjemku

### Výdej surovin na várku
21. [x] createProductionIssue: draft výdejka s řádky z recipe snapshot (škálované na objem)
22. [x] recipe_item_id na stock_issue_lines — vazba řádku na ingredienci receptu
23. [x] Rezervace: draft production issue → is_reserved=true, reserved_qty INCREMENT
24. [x] Unreserve: cancel draft → is_reserved=false, reserved_qty DECREMENT
25. [x] Confirm production issue: FIFO alokuje, odečte reserved_qty (pokud was reserved)
26. [x] directProductionIssue: vytvoří draft + rovnou confirm (bez rezervace)
27. [x] Batch detail tab "Suroviny": tabulka Recept/Rezervováno/Vydáno/Chybí/Šarže
28. [x] Batch detail tab "Suroviny": tlačítka Rezervovat/Vydat/Zrušit rezervaci
29. [x] Batch detail tab "Suroviny": seznam production issues (linky)
30. [x] Výdejka formulář: purpose select (sale/production/transfer/writeoff/other)
31. [x] Výdejka formulář: pokud purpose=production → batch select → prefill řádků z receptu
32. [x] Tracking detail: sloupec Várka s linkem na batch

### CashFlow
33. [x] CRUD cash flow s automatickým kódem
34. [x] Hierarchické kategorie (systémové + custom)
35. [x] Quick filters: příjmy/výdaje/plánované/zaplacené
36. [x] Sumární panel per období (příjmy/výdaje/saldo)
37. [x]Status workflow: planned → pending → paid → cancelled

### CashFlow Templates
38. [x] CRUD šablon s frekvencí (weekly/monthly/quarterly/yearly)
39. [x] Manuální generování plánovaných plateb z šablon
40. [x] next_date posun po generování

### Pokladna
41. [x] CRUD pokladen (název, provozovna)
42. [x] Quick příjem/výdej s aktualizací zůstatku
43. [x] Denní přehled operací
44. [x] Aktuální zůstatek

### Reserved Quantity
45. [x] confirmOrder rezervuje na správném itemu (base_item v bulk, přímo v packaged)
46. [x] shipOrder/cancelOrder odečte reserved_qty ze správného itemu
47. [x] available_qty = quantity - reserved_qty správně počítáno

### Obecné
48. [ ] Všechny texty přes i18n (cs + en)
49. [ ] TypeScript: strict mode, zero errors, no `any`
50. [ ] `npm run build` projde bez chyb
51. [ ] RLS policies na všech nových tabulkách
52. [ ] Cross-module linky fungují
53. [ ] Dokumentace aktualizována (CHANGELOG, PRODUCT-SPEC, CLAUDE.md)

---

## CO NEIMPLEMENTOVAT V SPRINT 4

- **Tisk/export objednávky** (PDF) — Sprint 9 (UX polish)
- **Ceníky a zákaznické slevy** — Phase 2 (post-MVP)
- **Fakturace** — integrace s účetním systémem = Phase 3
- **Automatické generování z šablon (cron)** — MVP jen manuální tlačítko
- **Vícenásobná měna** — MVP jen CZK
- **DPH přiznání** — mimo scope, řeší účetní systém
- **Hromadné operace** na objednávkách — post-MVP

---

## PRIORITA IMPLEMENTACE

1. **DB schema + migrace** (Fáze 4A) — všechny tabulky, RLS, indexy, seed + ALTER pro recipe_item_id, is_reserved
2. **Deposits** (Fáze 4B) — rychlé CRUD, prerekvizita pro orders
3. **CashFlow categories** (Fáze 4H) — seed systémových kategorií, prerekvizita pro CF
4. **Orders backend** (Fáze 4C) — HLAVNÍ PRÁCE: CRUD, workflow, reserved_qty, stock issue vazba, CF vazba
5. **Orders frontend** (Fáze 4D) — browser, detail, řádky, sumář, workflow buttons
6. **Automatické příjemky** (Fáze 4E) — batch completion hook, bulk/packaged režimy
7. **Výdej surovin na várku** (Fáze 4E-bis) — production issues, batch tab suroviny, výdejka prefill
8. **CashFlow** (Fáze 4F) — CRUD, browser, sumář, šablony
9. **Pokladna** (Fáze 4G) — zjednodušené cash desk
10. **Navigace + i18n + docs** (Fáze 4I, 4J, 4K)

---

## DOPORUČENÍ PRO SUBAGENTY

- **Subagent 1:** DB schema (4A) — všechny tabulky, migrace, RLS, indexy, seed (deposits, categories, counters) + ALTER stock_issue_lines, stock_issues
- **Subagent 2:** Orders (4C + 4D) — HLAVNÍ PRÁCE, backend + frontend, workflow, reserved_qty, stock issue/CF vazba
- **Subagent 3:** CashFlow (4F + 4G + 4H) — CF CRUD, categories, templates, pokladna
- **Subagent 4:** Automatické příjemky + Production issues (4E + 4E-bis) — batch completion hook, bulk/packaged, beer pricing, production issue engine, batch tab suroviny redesign, výdejka prefill
- **Main agent:** Deposits (4B), integrace, navigace (4I), i18n (4J), dokumentace (4K), review

---

## TECHNICKÉ POZNÁMKY

- **Order totals přepočet** — spouštět server-side při každé mutaci řádku. Nekešovat na klientovi.
- **Reserved qty** — MUSÍ být v DB transakci s confirmOrder/cancelOrder. Race condition = overbooking.
- **base_item přepočet** při tvorbě movements — testovat edge case: co když prodejní položka nemá base_item? → odepsat přímo.
- **Batch completion hook** — volat z existující batch status change logiky (Sprint 2). Přidat check na stock_mode PŘED změnou stavu.
- **CashFlow categories seed** — musí být idempotentní (ON CONFLICT DO NOTHING). Spustit při registraci i při migraci existujících tenantů.
- **Pokladna balance** — aktualizovat ATOMICKY s vytvořením cashflow. Transakce!
- **DPH výpočet** — pro MVP jen 21% (základní) a 12% (snížená). Sazby NEHARCODOVAT — uložit jako konstanty v konfiguraci.
- **Movements, ne allocations** — Sprint 3 patch zrušil stock_issue_allocations. Veškerá vazba výdej→příjem jde přes stock_movements.receipt_line_id. V Sprint 4 kódu NESMÍ být žádná reference na allocations tabulku.
- **Model množství na řádcích** — Příjemky: jen `requested_qty` (= skutečné množství) + `remaining_qty`. Výdejky: `requested_qty` (editovatelné) + `actual_qty` (computed z SUM movements) + `missing_qty` (computed = requested - actual). actual_qty a missing_qty se NEPERSISTUJÍ.
- **Částečný výdej** — Pokud sklad nemá dostatek, FIFO engine vydá co může. `missing_qty > 0` se zobrazí červeně. Prevalidace před confirm s dialogem pro usera (potvrdit částečný výdej / zrušit).
- **remaining_qty na příjemkových řádcích** — inicializovat = requested_qty při vytvoření. Snižovat v transakci při vytvoření výdejových movements. Zvyšovat při cancel výdejky.
- **Production issue reserved_qty** — MUSÍ být v DB transakci. Při confirm production issue s is_reserved=true: NEJDŘÍV unreserve (decrement reserved_qty), PAK FIFO alokace (decrement quantity). Opačné pořadí by dočasně zobrazilo záporné available_qty.
- **Recipe snapshot prerekvizita** — 4E-bis závisí na implementaci "Snapshot receptu při vytvoření várky". Bez snapshotu recipe_item_id odkazuje na originální recept a editace receptu rozbije vazby. Snapshot MUSÍ být implementován PŘED production issues.
- **Scale factor** — přepočet množství z receptu: `(batch.plannedVolumeL / recipe.batchSizeL) * recipeItem.amountG`. POZOR na jednotky — recipe_items.amountG je v gramech, ale unitToBaseFactor může konvertovat na kg/ml/ks. Výsledný scaledQty musí být v základní jednotce položky.
- **Vícenásobné production issues** — Na jednu várku může být víc výdejek (hlavní + doplňkový dry hop). getBatchIngredients() musí agregovat přes VŠECHNY production issues, ne jen první.
