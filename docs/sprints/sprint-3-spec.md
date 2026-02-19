# SPRINT 3 — SKLAD (STOCK)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 18.02.2026

---

## CÍL SPRINTU

Implementovat kompletní skladový modul: sklady (warehouses), skladové doklady (příjemky a výdejky s řádky), atomické skladové pohyby, FIFO/LIFO alokace, materializovaný stav skladu a lot tracking surovin. Na konci sprintu musí pivovar umět: přijmout suroviny na sklad (příjemka), vydat zboží zákazníkovi (výdejka), vidět aktuální stav skladu per položka × sklad, a trasovat šarže surovin od dodavatele přes várku až k hotovému pivu.

**Časový odhad:** 2 týdny (T8-T9)

**Závisí na:** Sprint 1 (Items, Partners, Shops, Counters), Sprint 2 (Batches — vazba na výrobu)

---

## REFERENČNÍ DOKUMENTY

- `docs/SYSTEM-DESIGN.md` — sekce 5.8 (Inventory Management), 5.4 (Items — issue_mode), 5.3 (Shops/Equipment)
- `docs/PRODUCT-SPEC.md` — sekce 5.1 (Katalog položek), 5.2 (Skladové doklady), 5.3 (Stav skladu), 5.4 (Lot tracking)
- Bubble prototype screenshoty: `Browser_paramFilter.jpg` (Katalog položek s param filtrem)
- `CLAUDE.md` — pravidla kódování, dokumentační povinnosti

---

## ⚠️ PREREKVIZITA: DOCS AUDIT SPRINT 2

**PŘED zahájením Sprint 3 proveď audit dokumentace Sprint 2:**

1. **CHANGELOG.md** — Sprint 2 musí mít status ✅ Done, všechny checkboxy `- [x]`. Pokud nejsou zaškrtnuté, zaškrtni je dle skutečného stavu implementace.
2. **PRODUCT-SPEC.md** — Receptury a Šarže musí mít status ✅, ne 📋.
3. Pokud se implementace Sprint 2 odchýlila od specifikace, **aktualizuj PRODUCT-SPEC.md** aby odpovídal realitě.

---

## FÁZE 3A: DB SCHEMA — SKLADY A DOKLADY

### 3A.1 Warehouses

**Soubor:** `drizzle/schema/warehouses.ts`

```
warehouses
  id              UUID PK
  tenant_id       UUID NOT NULL FK → tenants
  shop_id         UUID FK → shops           -- Provozovna
  code            TEXT NOT NULL              -- "SUR", "HOT", "CELLAR"
  name            TEXT NOT NULL              -- "Sklad surovin", "Sklad hotových výrobků"
  is_excise_relevant  BOOLEAN DEFAULT false  -- Daňový sklad (pro spotřební daň)
  categories      TEXT[]                     -- Povolené kategorie ['suroviny', 'pivo', 'obaly']
  is_default      BOOLEAN DEFAULT false      -- Výchozí sklad pro příjemky
  is_active       BOOLEAN DEFAULT true
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
  UNIQUE(tenant_id, code)
```

**RLS:** Standardní tenant izolace (`tenant_id = auth.jwt()->>'tenant_id'`).

**Seed data (per tenant při registraci):**
- "Sklad surovin" (code: SUR, categories: ['suroviny'], is_default: true)
- "Sklad hotových výrobků" (code: HOT, categories: ['pivo', 'obaly'], is_excise_relevant: true)

### 3A.2 Stock Issues (Skladové doklady)

**Soubor:** `drizzle/schema/stock-issues.ts`

```
stock_issues
  id              UUID PK
  tenant_id       UUID NOT NULL FK → tenants
  code            TEXT NOT NULL              -- PR-2026-001 / VD-2026-001
  code_number     INTEGER
  code_prefix     TEXT
  counter_id      UUID FK → counters

  movement_type   TEXT NOT NULL              -- 'receipt' | 'issue'
  movement_purpose TEXT NOT NULL             -- 'purchase' | 'production_in' | 'production_out' |
                                             -- 'sale' | 'transfer' | 'inventory' | 'waste' | 'other'
  date            DATE NOT NULL
  status          TEXT DEFAULT 'draft'       -- 'draft' | 'confirmed' | 'cancelled'

  warehouse_id    UUID NOT NULL FK → warehouses
  partner_id      UUID FK → partners         -- Dodavatel/zákazník
  order_id        UUID FK → orders           -- Objednávka (Sprint 4, zatím NULL)
  batch_id        UUID FK → batches          -- Výrobní šarže
  season          TEXT                       -- Sezóna (volitelné)

  additional_cost DECIMAL DEFAULT 0          -- Vedlejší pořizovací náklady
  total_cost      DECIMAL DEFAULT 0          -- Celková hodnota dokladu

  notes           TEXT
  created_by      UUID FK → auth.users
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ
  UNIQUE(tenant_id, code)
```

### 3A.3 Stock Issue Lines (Řádky dokladu)

```
stock_issue_lines
  id              UUID PK
  tenant_id       UUID NOT NULL FK → tenants
  stock_issue_id  UUID NOT NULL FK → stock_issues ON DELETE CASCADE
  item_id         UUID NOT NULL FK → items
  line_no         INTEGER                    -- Pořadové číslo řádku
  requested_qty   DECIMAL NOT NULL           -- Požadované množství
  issued_qty      DECIMAL                    -- Skutečně vydané/přijaté
  missing_qty     DECIMAL                    -- Chybějící (requested - issued)
  unit_price      DECIMAL                    -- Jednotková cena
  total_cost      DECIMAL                    -- Celkem za řádek
  issue_mode_snapshot TEXT                   -- Snapshot FIFO/LIFO z položky v momentě vytvoření
  notes           TEXT
  sort_order      INTEGER DEFAULT 0
  created_at      TIMESTAMPTZ
```

### 3A.4 Stock Movements (Atomické pohyby)

```
stock_movements
  id              UUID PK
  tenant_id       UUID NOT NULL FK → tenants
  item_id         UUID NOT NULL FK → items
  warehouse_id    UUID NOT NULL FK → warehouses
  movement_type   TEXT NOT NULL              -- 'in' | 'out'
  quantity        DECIMAL NOT NULL           -- Kladná = příjem, záporná = výdej
  unit_price      DECIMAL                    -- Cena za jednotku

  stock_issue_id      UUID FK → stock_issues
  stock_issue_line_id UUID FK → stock_issue_lines
  order_id            UUID FK → orders       -- Sprint 4
  batch_id            UUID FK → batches
  lot_id              UUID FK → material_lots

  is_closed       BOOLEAN DEFAULT false      -- Uzavřený (plně alokovaný)
  date            DATE NOT NULL
  notes           TEXT
  created_at      TIMESTAMPTZ
```

**Indexy:**
```sql
CREATE INDEX idx_movements_tenant_item ON stock_movements(tenant_id, item_id, date);
CREATE INDEX idx_movements_tenant_warehouse ON stock_movements(tenant_id, warehouse_id, date);
CREATE INDEX idx_movements_open ON stock_movements(tenant_id, item_id, warehouse_id) WHERE is_closed = false AND movement_type = 'in';
```

### 3A.5 Stock Issue Allocations (FIFO/LIFO alokace)

```
stock_issue_allocations
  id                   UUID PK
  tenant_id            UUID NOT NULL FK → tenants
  stock_issue_line_id  UUID NOT NULL FK → stock_issue_lines
  source_movement_id   UUID NOT NULL FK → stock_movements  -- Z které příjemky
  quantity             DECIMAL NOT NULL
  unit_price           DECIMAL NOT NULL      -- Cena z příjmu
  created_at           TIMESTAMPTZ
```

### 3A.6 Stock Status (Materializovaný stav)

```
stock_status
  id              UUID PK
  tenant_id       UUID NOT NULL FK → tenants
  item_id         UUID NOT NULL FK → items
  warehouse_id    UUID NOT NULL FK → warehouses
  quantity        DECIMAL DEFAULT 0          -- Aktuální stav
  reserved_qty    DECIMAL DEFAULT 0          -- Rezervováno (draft výdejky)
  available_qty   DECIMAL GENERATED ALWAYS AS (quantity - reserved_qty) STORED
  updated_at      TIMESTAMPTZ
  UNIQUE(tenant_id, item_id, warehouse_id)
```

### 3A.7 Material Lots (Lot tracking surovin)

```
material_lots
  id                  UUID PK
  tenant_id           UUID NOT NULL FK → tenants
  item_id             UUID NOT NULL FK → items
  lot_number          TEXT NOT NULL           -- Číslo šarže dodavatele
  supplier_id         UUID FK → partners      -- Dodavatel
  received_date       DATE                    -- Datum příjmu
  expiry_date         DATE                    -- Expirace
  quantity_initial    DECIMAL                 -- Počáteční množství
  quantity_remaining  DECIMAL                 -- Zbývající množství
  unit_price          DECIMAL                 -- Nákupní cena
  properties          JSONB DEFAULT '{}'      -- Certifikát, analýza...
  notes               TEXT
  created_at          TIMESTAMPTZ
  updated_at          TIMESTAMPTZ
```

### 3A.8 Batch ↔ Material Lot vazba

```
batch_material_lots
  id              UUID PK
  tenant_id       UUID NOT NULL FK → tenants
  batch_id        UUID NOT NULL FK → batches
  lot_id          UUID NOT NULL FK → material_lots
  item_id         UUID NOT NULL FK → items
  quantity_used   DECIMAL NOT NULL
  created_at      TIMESTAMPTZ
```

### 3A.9 Migrace

**`drizzle/migrations/` — nová migrace:**

1. Vytvořit všechny tabulky výše
2. Vytvořit RLS policies (standardní tenant izolace na všech tabulkách)
3. Vytvořit indexy
4. Přidat číslovací řady do seed dat (viz 3A.10)

### 3A.10 Číslovací řady (Counter seed)

Přidat defaultní číslovací řady pro nové entity — buď do seed scriptu, nebo do registrace tenantu:

| Entita | Prefix | Příklad |
|--------|--------|---------|
| Příjemka (receipt) | PR | PR-2026-001 |
| Výdejka (issue) | VD | VD-2026-001 |

**⚠️ ZMĚNA ARCHITEKTURY: Číslovací řady jsou PER SKLAD, ne per tenant.**

Každý sklad má vlastní sekvenci pro příjemky a výdejky. Důvod: české pivovary jsou zvyklé na souvislé číselné řady v rámci jednoho skladu. Příjemka PRI10039126 jasně identifikuje sklad 1.

**Implementace:** Při vytvoření warehousu se automaticky vytvoří 2 countery:
- Příjemka: prefix = `PRI` + warehouse.code (např. `PRI1` pro sklad 1, `PRI2` pro sklad 2)
- Výdejka: prefix = `VYD` + warehouse.code (např. `VYD1`, `VYD2`)

**Vazba:** `counters` tabulka rozšířit o `warehouse_id` (FK → warehouses, nullable). Countery bez warehouse_id = globální per tenant (jako dosud pro partnery, položky atd.). Countery s warehouse_id = per sklad.

**Dopad na stock_issues:** Při vytvoření dokladu se kód generuje z counteru vázaného na vybraný sklad, ne z globálního tenant counteru.

**Migrace stávajících counterů:** Existující globální PR/VD countery se nemažou, jen se nepoužívají pokud existují warehouse-specifické. Fallback: pokud sklad nemá vlastní counter → použij globální.

---

## FÁZE 3B: WAREHOUSES MODUL

### 3B.1 Modul struktura

```
src/modules/warehouses/
├── components/
│   ├── WarehouseBrowser.tsx
│   └── WarehouseDetail.tsx
├── actions.ts              -- Server actions (CRUD)
├── config.ts               -- DataBrowser config
├── types.ts
└── index.ts
```

### 3B.2 WarehouseBrowser

**Stránka:** `src/app/[locale]/(dashboard)/settings/warehouses/page.tsx`

Sklady jsou v **Nastavení** (ne ve Stock modulu), protože jsou konfigurační entitou — stejně jako Provozovny a Číslovací řady.

**Přidat do sidebar navigace (settings modul):**
```
NASTAVENÍ
  Obecné
  Provozovny
  Sklady          ← NOVÉ
  Uživatelé
  Číslovací řady
```

**DataBrowser konfigurace:**
- Sloupce: Kód, Název, Provozovna, Daňový, Kategorie, Výchozí, Stav
- Quick filtry: Vše | Aktivní | Daňové
- Řazení: dle názvu
- Card view: NE (jen list)

### 3B.3 WarehouseDetail

**Stránka:** `src/app/[locale]/(dashboard)/settings/warehouses/[id]/page.tsx`

**Formulář (1 tab — Základní informace):**

| Pole | Typ | Validace |
|------|-----|----------|
| Kód | text (readonly po vytvoření) | required, unique per tenant |
| Název | text | required |
| Provozovna | relation → shops | optional |
| Daňový sklad | toggle | default: false |
| Kategorie | multiselect | options: suroviny, pivo, obaly, služby, ostatní |
| Výchozí sklad | toggle | max 1 per tenant |
| Aktivní | toggle | default: true |

**Byznys pravidla:**
- Při deaktivaci: kontrola zda stock_status nemá nenulový stav → varování
- Pouze 1 výchozí sklad per tenant (při nastavení nového výchozího → odnastavit starý)
- Kód needitovatelný po vytvoření (prevence referenční integrity)
- **Při vytvoření skladu:** automaticky vytvořit 2 countery (příjemka + výdejka) s prefixem odvozeným z kódu skladu
- **Zobrazit číslovací řady** na detail stránce (readonly info): aktuální prefix, ukázkové číslo, aktuální číslo — stejně jako v Bubble screenshotu

### 3B.4 Server Actions

**`src/modules/warehouses/actions.ts`:**

```typescript
'use server'
// Všechny akce dle vzoru Sprint 1 (partners, items)

export async function getWarehouses(filters?)
export async function getWarehouse(id: string)
export async function createWarehouse(data)
export async function updateWarehouse(id: string, data)
export async function deleteWarehouse(id: string)  // Soft delete: is_active = false
```

---

## FÁZE 3C: STOCK ISSUES — BACKEND (CORE BUSINESS LOGIC)

Tohle je **nejkritičtější** část celého sprintu. Skladové doklady obsahují komplexní byznys logiku: draft → confirm workflow, atomické pohyby, FIFO/LIFO alokaci a stock status synchronizaci.

### 3C.1 Server Actions

**Soubor:** `src/modules/stock-issues/actions.ts`

```typescript
'use server'

// === CRUD ===
export async function getStockIssues(filters?: StockIssueFilters)
export async function getStockIssue(id: string)           // Včetně lines
export async function createStockIssue(data: CreateStockIssueInput)
export async function updateStockIssue(id: string, data)  // Jen v draft stavu
export async function deleteStockIssue(id: string)        // Jen v draft stavu (soft delete)

// === LINES ===
export async function addStockIssueLine(issueId: string, data: CreateLineInput)
export async function updateStockIssueLine(lineId: string, data)
export async function removeStockIssueLine(lineId: string)

// === WORKFLOW ===
export async function confirmStockIssue(id: string)       // draft → confirmed
export async function cancelStockIssue(id: string)        // confirmed → cancelled (storno)

// === QUERIES ===
export async function getStockStatus(filters?: StockStatusFilters)
export async function getItemStockStatus(itemId: string)  // Stav per warehouse
```

### 3C.2 Confirm Stock Issue — Hlavní byznys logika

**`confirmStockIssue(id)` — nejdůležitější funkce celého sprintu:**

```
VSTUP: stock_issue v draft stavu

1. VALIDACE
   - Status musí být 'draft'
   - Musí mít alespoň 1 řádek
   - Všechny řádky musí mít issued_qty > 0
   - Pro výdejku (issue): kontrola dostupného množství na skladě

2. VYTVOŘIT STOCK MOVEMENTS
   Pro každý řádek (stock_issue_line):
   - Vytvořit 1 stock_movement:
     - movement_type: 'in' (příjemka) | 'out' (výdejka)
     - quantity: issued_qty (kladná pro in, záporná pro out)
     - unit_price: z řádku
     - date: z hlavičky dokladu
     - Vazby: stock_issue_id, stock_issue_line_id, batch_id, lot_id

3. FIFO/LIFO ALOKACE (jen pro výdejky!)
   Pro každý řádek výdejky:
   - Zjistit issue_mode z položky (FIFO default)
   - Načíst otevřené příjmové movements (is_closed=false) pro daný item+warehouse
   - Seřadit dle date: ASC (FIFO) nebo DESC (LIFO)
   - Alokovat issued_qty postupně přes příjmové movements
   - Vytvořit stock_issue_allocation záznamy
   - Pokud příjmový movement plně alokován → is_closed = true
   - Vypočítat vážený průměr ceny (pro total_cost na řádku)

4. AKTUALIZOVAT STOCK STATUS
   Pro každý řádek:
   - UPSERT do stock_status (tenant_id, item_id, warehouse_id)
   - Příjemka: quantity += issued_qty
   - Výdejka: quantity -= issued_qty
   - Přepočítat reserved_qty (pokud je třeba)

5. AKTUALIZOVAT DOKLAD
   - status = 'confirmed'
   - total_cost = SUM(lines.total_cost) + additional_cost

6. AKTUALIZOVAT LOT (pokud lot tracking)
   Pro příjemku s lotem:
   - lot.quantity_remaining += issued_qty (nemělo by nastat, lot se vytváří s příjemkou)
   Pro výdejku s lotem:
   - lot.quantity_remaining -= issued_qty

VÝSTUP: Potvrzený doklad, vytvořené movements, aktualizovaný stock_status
```

**Celá operace v DB TRANSAKCI** — pokud cokoliv selže, rollback celého potvrzení.

### 3C.3 Cancel Stock Issue — Storno

```
VSTUP: stock_issue v confirmed stavu

1. VYTVOŘIT PROTIPOHYBY
   Pro každý stock_movement vazaný na tento doklad:
   - Vytvořit nový movement s opačným znaménkem quantity
   - Pro výdejky: obnovit alokace (is_closed = false na zdrojových movements)

2. AKTUALIZOVAT STOCK STATUS
   - Příjemka storno: quantity -= issued_qty
   - Výdejka storno: quantity += issued_qty

3. ZRUŠIT ALOKACE
   - Smazat stock_issue_allocations pro tento doklad
   - Obnovit is_closed na zdrojových movements

4. AKTUALIZOVAT LOT
   - Opačná operace k confirm

5. AKTUALIZOVAT DOKLAD
   - status = 'cancelled'

CELÁ OPERACE V TRANSAKCI.
```

### 3C.4 FIFO/LIFO alokační engine

**Soubor:** `src/modules/stock-issues/lib/allocation-engine.ts`

```typescript
interface AllocationResult {
  allocations: {
    sourceMovementId: string
    quantity: number
    unitPrice: number
  }[]
  weightedAvgPrice: number
  totalCost: number
}

export async function allocateIssue(
  tx: Transaction,          // DB transakce
  tenantId: string,
  itemId: string,
  warehouseId: string,
  quantity: number,         // Kolik vydat
  issueMode: 'fifo' | 'lifo'
): Promise<AllocationResult>
```

**Algoritmus:**
1. SELECT otevřené příjmové movements (`movement_type = 'in' AND is_closed = false AND item_id = X AND warehouse_id = Y`)
2. ORDER BY date ASC (FIFO) nebo DESC (LIFO)
3. Iterovat, odebírat quantity dokud nevyčerpáno:
   - remaining_in_movement = movement.quantity - SUM(existující alokace na tento movement)
   - allocate = MIN(remaining, zbývá_vydat)
   - Pokud remaining_in_movement == allocate → is_closed = true
4. Pokud není dost na skladě → throw InsufficientStockError

### 3C.5 Stock Status sync helper

**Soubor:** `src/modules/stock-issues/lib/stock-status-sync.ts`

```typescript
export async function updateStockStatus(
  tx: Transaction,
  tenantId: string,
  itemId: string,
  warehouseId: string,
  quantityDelta: number    // Kladné = příjem, záporné = výdej
): Promise<void>
```

Použije UPSERT (`INSERT ... ON CONFLICT DO UPDATE`):
- Pokud záznam neexistuje → INSERT s quantity = delta
- Pokud existuje → UPDATE quantity = quantity + delta

---

## FÁZE 3D: STOCK ISSUES — FRONTEND

### 3D.1 Modul struktura

```
src/modules/stock-issues/
├── components/
│   ├── StockIssueBrowser.tsx
│   ├── StockIssueDetail.tsx
│   ├── StockIssueLineTable.tsx     -- Inline editable tabulka řádků
│   ├── StockIssueStatusBadge.tsx
│   ├── StockIssueConfirmDialog.tsx
│   ├── StockIssueCancelDialog.tsx
│   └── AddLineDialog.tsx           -- Dialog pro přidání řádku (item lookup)
├── lib/
│   ├── allocation-engine.ts
│   └── stock-status-sync.ts
├── actions.ts
├── config.ts
├── types.ts
└── index.ts
```

### 3D.2 StockIssueBrowser (Skladové pohyby)

**Stránka:** `src/app/[locale]/(dashboard)/stock/movements/page.tsx`

**DataBrowser konfigurace:**
- Sloupce: Kód, Typ (příjemka/výdejka badge), Účel, Datum, Sklad, Partner, Celkem, Stav
- Quick filtry: Vše | Příjemky | Výdejky | Draft | Potvrzené
- Parametrické filtry: datum od/do, sklad, partner, účel, stav
- Card view: NE (jen list — doklady nejsou vizuální)
- Řazení: dle data DESC (nejnovější nahoře)
- Create button: dropdown s dvěma volbami: "+ Příjemka" / "+ Výdejka"

**StatusBadge barvy:**
```
draft:      šedá (gray)
confirmed:  zelená (green)
cancelled:  červená (red)
```

**Movement type badge:**
```
receipt:    modrá (blue) — "Příjemka"
issue:      oranžová (orange) — "Výdejka"
```

**Movement purpose labels:**
```
purchase:        Nákup
production_in:   Výroba (příjem)
production_out:  Výroba (spotřeba)
sale:            Prodej
transfer:        Převod
inventory:       Inventura
waste:           Odpis
other:           Ostatní
```

### 3D.3 StockIssueDetail

**Stránka:** `src/app/[locale]/(dashboard)/stock/movements/[id]/page.tsx`

**Header:**
- Kód dokladu (automaticky generovaný)
- Status badge
- Akční tlačítka:
  - V draft stavu: `[Potvrdit] [Uložit] [Storno] [🗑] [✕]`
  - V confirmed stavu: `[Stornovat] [✕]` (readonly)
  - V cancelled stavu: `[✕]` (readonly)

**Tab 1: Hlavička**

| Pole | Typ | Validace | Poznámka |
|------|-----|----------|----------|
| Kód | text | readonly | Auto z číslovací řady |
| Typ pohybu | badge | readonly | Nastaveno při vytvoření |
| Účel | select | required | purchase/production_in/... |
| Datum | date | required | Default: today |
| Sklad | relation → warehouses | required | |
| Partner | relation → partners | optional | Dodavatel/zákazník |
| Šarže | relation → batches | optional | Vazba na výrobní šarži |
| Sezóna | text | optional | |
| Vedlejší náklady | currency | optional | Default: 0 |
| Poznámky | textarea | optional | |

**Editovatelnost:** Hlavička editovatelná POUZE v draft stavu. V confirmed/cancelled je readonly.

**Tab 2: Řádky (StockIssueLineTable)**

Inline editable tabulka:

| Sloupec | Typ | Poznámka |
|---------|-----|----------|
| # | auto | Pořadové číslo |
| Položka | relation lookup → items | Vyhledávání dle názvu/kódu |
| Požadované mn. | number | |
| Skutečné mn. | number | Default: = požadované |
| Chybějící | computed | requested - issued (pokud > 0) |
| Jedn. cena | currency | Pro příjemky: nákupní cena. Pro výdejky: vypočteno z FIFO |
| Celkem | computed | issued_qty × unit_price |
| Poznámka | text | |
| [🗑] | action | Smazat řádek |

**Tlačítko "+ Řádek"** (nad tabulkou)
- Otevře dialog s item lookup (Command/Combobox s vyhledáváním)
- Po výběru položky přidá řádek s defaultními hodnotami
- U výdejky: unit_price je readonly (vypočte se při potvrzení z FIFO)

**Řádek sumář** (pod tabulkou):
```
Mezisoučet: 12 500 Kč | Vedlejší náklady: 500 Kč | CELKEM: 13 000 Kč
```

**Tab 3: Pohyby (jen po potvrzení)**

Readonly tabulka vygenerovaných stock_movements:
- Sloupce: Datum, Položka, Směr (IN/OUT), Množství, Cena, Lot
- Viditelná pouze u confirmed/cancelled dokladů

**Tab 4: Alokace (jen u výdejek po potvrzení)**

Readonly tabulka FIFO/LIFO alokací:
- Sloupce: Řádek, Zdrojová příjemka (kód), Datum příjmu, Množství, Cena příjmu
- Viditelná pouze u confirmed výdejek

### 3D.4 Create flow

**Příjemka:**
1. User klikne "+ Příjemka"
2. Vytvoří se draft doklad (movement_type: 'receipt')
3. Auto-generovaný kód z číslovací řady (prefix PR)
4. User vyplní hlavičku (sklad, partner, datum)
5. Přidá řádky (položky + množství + cena)
6. Klikne Potvrdit → confirm dialog → vytvořit movements + aktualizovat stock status

**Výdejka:**
1. User klikne "+ Výdejka"
2. Vytvoří se draft doklad (movement_type: 'issue')
3. Auto-generovaný kód z číslovací řady (prefix VD)
4. User vyplní hlavičku (sklad, zákazník/šarže, datum)
5. Přidá řádky (položky + množství) — cena se dopočítá při potvrzení
6. Klikne Potvrdit → kontrola dostupnosti → confirm dialog → FIFO alokace → movements → stock status

### 3D.5 Confirm Dialog (StockIssueConfirmDialog)

```
╔══════════════════════════════════════╗
║  Potvrdit doklad PR-2026-003?        ║
║                                      ║
║  Potvrzením dokladu dojde k:         ║
║  • Vytvoření skladových pohybů       ║
║  • Aktualizaci stavu skladu          ║
║                                      ║
║  Tuto akci nelze vrátit zpět         ║
║  (pouze stornovat celý doklad).      ║
║                                      ║
║              [Zrušit]  [Potvrdit]    ║
╚══════════════════════════════════════╝
```

Pro výdejku navíc zobrazit kontrolu dostupnosti:
```
║  Kontrola dostupnosti:               ║
║  ✅ Chmel Apollo — 5 kg (sklad: 12)  ║
║  ✅ Slad plzeňský — 25 kg (sklad: 80)║
║  ❌ Lahev 0.5L — 200 ks (sklad: 150) ║
║                                      ║
║  ⚠️ Nedostatečné množství u 1 položky║
```

Pokud ❌ — zakázat potvrzení (nebo varování s možností override pro inventory purpose).

---

## FÁZE 3E: STOCK STATUS VIEW

### 3E.1 Stock Status Browser

**Stránka:** `src/app/[locale]/(dashboard)/stock/items/page.tsx`

**Pozor:** Tato stránka nahrazuje/rozšiřuje stávající Katalog položek ze Sprint 1. Katalog položek (`/stock/items`) nyní zobrazuje NAVÍC skladové informace.

**Rozšíření DataBrowser konfigurace o skladové sloupce:**

| Sloupec | Zdroj | Poznámka |
|---------|-------|----------|
| Kód | items.code | Stávající |
| Název | items.name | Stávající |
| Kategorie | items.stock_category | Stávající |
| Stav skladu | stock_status.quantity | NOVÉ — součet přes všechny sklady |
| Rezervováno | stock_status.reserved_qty | NOVÉ |
| Dostupné | stock_status.available_qty | NOVÉ |
| Prům. cena | computed | NOVÉ — vážený průměr z otevřených movements |

**Implementace:** LEFT JOIN items → stock_status (agregace přes všechny warehouses pro daný tenant).

**Quick filtry rozšířit:**
- Vše | Na pokladně | Výrobní | **Pod minimem** | **Nulový stav**

### 3E.2 Stock Status Detail Tab

Na **DetailView každé položky** (items/[id]) přidat nový tab:

**Tab: Stav skladu**

Tabulka per warehouse:
| Sklad | Množství | Rezervováno | Dostupné |
|-------|----------|-------------|----------|
| Sklad surovin | 50 kg | 5 kg | 45 kg |
| Sklad hotových | 0 | 0 | 0 |

Pod tabulkou: **Historie pohybů** — posledních 20 movements pro tuto položku:
| Datum | Doklad | Typ | Množství | Cena | Sklad |
|-------|--------|-----|----------|------|-------|
| 2026-03-15 | PR-2026-003 | IN | +25 kg | 45 Kč/kg | Sklad surovin |
| 2026-03-10 | VD-2026-001 | OUT | -5 kg | 42 Kč/kg | Sklad surovin |

Klik na doklad → navigace na detail dokladu.

---

## FÁZE 3F: LOT TRACKING

### 3F.1 Lot Tracking Browser

**Stránka:** `src/app/[locale]/(dashboard)/stock/tracking/page.tsx`

**Modul:**
```
src/modules/material-lots/
├── components/
│   ├── LotBrowser.tsx
│   ├── LotDetail.tsx
│   └── LotTraceabilityView.tsx
├── actions.ts
├── config.ts
├── types.ts
└── index.ts
```

**DataBrowser konfigurace:**
- Sloupce: Číslo lotu, Položka, Dodavatel, Datum příjmu, Expirace, Počáteční mn., Zbývající mn., Stav
- Quick filtry: Vše | S expiracemi (30 dní) | Vyčerpané
- Card view: NE
- Řazení: dle data příjmu DESC

**"Stav" (computed):**
```
active:     zelená — quantity_remaining > 0
exhausted:  šedá — quantity_remaining = 0
expiring:   žlutá — expiry_date within 30 days
expired:    červená — expiry_date < today
```

### 3F.2 LotDetail

**Stránka:** `src/app/[locale]/(dashboard)/stock/tracking/[id]/page.tsx`

**Tab 1: Základní informace**

| Pole | Typ | Poznámka |
|------|-----|----------|
| Číslo šarže | text | required |
| Položka | relation → items (is_brew_material=true) | required |
| Dodavatel | relation → partners (is_supplier=true) | optional |
| Datum příjmu | date | |
| Expirace | date | |
| Počáteční mn. | number | readonly po vytvoření |
| Zbývající mn. | number | readonly — aktualizuje se automaticky |
| Nákupní cena | currency | |
| Poznámky | textarea | |

**Tab 2: Vlastnosti (properties)**
- JSONB editor (klíč-hodnota páry)
- Příklady: certifikát, analýza, LOA (letter of analysis), obsah vlhkosti, barva

**Tab 3: Použití ve várkách (Traceability)**
- Tabulka z `batch_material_lots`:
  | Várka | Receptura | Datum vaření | Použité množství |
  |-------|-----------|-------------|------------------|
  | V-2026-001 | IPA 14° | 2026-03-10 | 5 kg |
  | V-2026-002 | Pale Ale | 2026-03-15 | 3 kg |

- Klik na várku → navigace na detail šarže

### 3F.3 Lot vytvoření při příjemce

Při vytvoření příjemky s účelem "purchase" a položkou kde `is_brew_material = true`:
- Nabídnout volitelné přiřazení/vytvoření lotu na řádku
- Dialog: "Přiřadit šarži dodavatele?" → číslo šarže, expirace
- Pokud ano: vytvořit `material_lot` a přiřadit `lot_id` na movement

**Toto je VOLITELNÉ** — surovinová příjemka funguje i bez lot trackingu.

### 3F.4 Lot vazba na várku

Na **BatchDetail** (Sprint 2) tab "Suroviny" přidat sloupec:
- **Lot** — select z material_lots pro daný item (kde quantity_remaining > 0)
- Při přiřazení: vytvořit záznam v `batch_material_lots`
- Snížit `lot.quantity_remaining`

Tohle propojení je základ traceability: **Dodavatel → Lot → Várka → Hotové pivo**.

---

## FÁZE 3G: SHOPS SETTINGS — SKLADOVÉ A CENOTVORBOVÉ PARAMETRY

### 3G.1 Rozšíření shops.settings JSONB

Na stávající `shops` tabulku (Sprint 1) rozšířit `settings` JSONB o nové klíče:

```jsonc
// shops.settings JSONB — nové klíče pro sklad/výrobu:
{
  // === REŽIM NASKLADNĚNÍ PIVA ===
  "stock_mode": "none" | "bulk" | "packaged",
  // "none"     = Pouze ukončit var, nenaskladňovat
  // "bulk"     = Naskladnit hotové pivo "vcelku" (v litrech jako base_production_item)
  // "packaged" = Naskladnit formou stočených obalů (prodejní položky z bottling)

  // === DEFAULTNÍ SKLADY PRO AUTOMATICKÉ OPERACE ===
  "default_warehouse_raw_id": "uuid",    // Sklad pro vyskladnění surovin na var
  "default_warehouse_beer_id": "uuid",   // Sklad pro naskladnění hotového piva

  // === CENOTVORBA SUROVIN ===
  "ingredient_pricing_mode": "calc_price" | "avg_stock" | "last_purchase",
  // "calc_price"     = Kalkulační cena ze skladové karty (items.calc_price)
  // "avg_stock"      = Průměrná skladová cena (z FIFO movements)
  // "last_purchase"  = Poslední nákupní cena (z poslední příjemky)

  // === CENOTVORBA HOTOVÉHO PIVA ===
  "beer_pricing_mode": "fixed" | "recipe_calc" | "actual_costs",
  // "fixed"          = Pevná cena ze skladové karty (items.calc_price)
  // "recipe_calc"    = Cena dle kalkulace receptu (recipe.cost_price)
  // "actual_costs"   = Skutečné náklady dle záznamů varu

  // === KALKULAČNÍ VSTUPY ===
  "overhead_pct": 20,         // % režie suroviny (přirážka k ceně surovin)
  "overhead_czk": 200,        // Režie v Kč (fixní náklady na várku)
  "brew_cost_czk": 300        // Náklady var v Kč (energie, práce...)
}
```

### 3G.2 UI — Settings → Provozovny → Detail → nový tab "Parametry"

Na stávající shop detail (Sprint 1) přidat **nový tab "Parametry"** (vedle "Základní informace"):

**Sekce: Ukončení varu a naskladnění piva**

| Pole | Typ | Poznámka |
|------|-----|----------|
| Režim naskladnění | radio group (3 volby) | none / bulk / packaged |
| Sklad pro vyskladnění surovin | relation → warehouses | default: sklad s is_default=true |
| Sklad pro naskladnění piva | relation → warehouses | default: sklad s is_excise_relevant=true |

**Sekce: Cena surovin pro kalkulaci**

| Pole | Typ | Poznámka |
|------|-----|----------|
| Zdroj ceny surovin | radio group (3 volby) | calc_price / avg_stock / last_purchase |

**Sekce: Cena piva pro příjem na sklad**

| Pole | Typ | Poznámka |
|------|-----|----------|
| Zdroj ceny piva | radio group (3 volby) | fixed / recipe_calc / actual_costs |

**Sekce: Vstupy pro kalkulaci ceny vyráběného piva**

| Pole | Typ | Poznámka |
|------|-----|----------|
| % režie suroviny | number (%) | default: 20 |
| Režie v Kč | currency | default: 0 |
| Náklady var v Kč | currency | default: 0 |

**Poznámka:** Tyto parametry se v Sprint 3 jen **konfigurují a ukládají**. Skutečná logika (automatické příjemky, kalkulace cen) se implementuje v Sprint 4/5. Sprint 3 jen připravuje datovou strukturu.

---

## FÁZE 3H: ITEMS — OBSAHOVÝ POMĚR (BASE ITEM RELATIONSHIP)

### 3H.1 Rozšíření items tabulky

Přidat 2 sloupce do `items` (migrace):

```sql
ALTER TABLE items ADD COLUMN base_item_id UUID REFERENCES items(id);
ALTER TABLE items ADD COLUMN base_item_quantity DECIMAL;
```

**Význam:**
- `base_item_id` — odkaz na základní výrobní položku (parent), např. "Světlý ležák 12°" (evidovaná v litrech)
- `base_item_quantity` — kolik jednotek základní položky tato prodejní položka obsahuje

**Příklad:**

| Prodejní položka | base_item | base_item_quantity | Efekt |
|------------------|-----------|--------------------|-------|
| Světlý ležák 12° PET 1,5L | Světlý ležák 12° | 1.5 | Prodej 1 ks = odepíše 1,5 L ze skladu |
| Světlý ležák 12° KEG 30L | Světlý ležák 12° | 30 | Prodej 1 ks = odepíše 30 L ze skladu |
| Světlý ležák 12° lahev 0,5L | Světlý ležák 12° | 0.5 | Prodej 1 ks = odepíše 0,5 L ze skladu |

### 3H.2 UI — Item Detail rozšíření

Na **DetailView položky** (items/[id]) tab "Základní informace" přidat sekci (viditelná jen když `is_sale_item = true`):

**Sekce: Obsahový poměr (vazba na základní položku)**

| Pole | Typ | Podmínka viditelnosti |
|------|-----|-----------------------|
| Základní položka | relation → items (kde is_base_production_item=true) | jen is_sale_item=true |
| Obsah (množství zákl. položky) | decimal | jen když base_item_id je vyplněno |

**Helptext:** "Kolik jednotek základní výrobní položky tato prodejní položka obsahuje. Při prodeji se ze skladu automaticky odepíše odpovídající množství základní položky."

### 3H.3 Validace

- `base_item_id` může být NULL (ne každá prodejní položka má vazbu)
- `base_item_quantity` musí být > 0 pokud `base_item_id` je vyplněno
- `base_item_id` nesmí odkazovat sama na sebe (circular reference)
- `base_item_id` musí odkazovat na položku kde `is_base_production_item = true`

### 3H.4 Dopad na budoucí sprinty

Tento datový model umožní v budoucnu:
- **Sprint 4/5 — automatické příjemky:** Při ukončení várky v režimu "packaged" systém ví, kolik litrů base_item je v každém KEGu/lahvi
- **Sprint 4 — pokladna/prodej:** Při prodeji PET 1,5L automaticky odepsat 1,5L ze skladu base_item
- **Sprint 4 — objednávky:** Při přípravě objednávky vypočítat potřebný objem z base_item

V Sprint 3 se jen **ukládá konfigurace** — žádná automatická logika odpisu.

---

## FÁZE 3I: NAVIGACE A SIDEBAR

### 3I.1 Stock modul sidebar

Stock modul sidebar dle `src/config/navigation.ts`:

```
SKLAD
  📦 Položky           /stock/items
  📊 Skladové pohyby   /stock/movements
  🎯 Tracking          /stock/tracking
  💰 Daňové pohyby     /stock/excise          ← placeholder (Sprint 5)
  📋 Měsíční podání    /stock/monthly-report   ← placeholder (Sprint 5)
```

### 3I.2 Settings sidebar rozšíření

```
NASTAVENÍ
  Obecné
  Provozovny
  Sklady              ← NOVÉ (Fáze 3B)
  Uživatelé
  Číslovací řady
```

### 3I.3 Placeholder stránky

Vytvořit placeholder pages pro Sprint 5 entity (aby sidebar nevedl na 404):

**`/stock/excise/page.tsx`:**
```typescript
export default function ExcisePage() {
  return <PlaceholderPage title="Daňové pohyby" description="Bude implementováno v Sprint 5" />
}
```

**`/stock/monthly-report/page.tsx`:** analogicky.

### 3I.4 Cross-module linky

Implementovat navigační propojení mezi moduly:

| Odkud | Kam | Trigger |
|-------|-----|---------|
| StockIssue detail → partner | /brewery/partners/[id] | Klik na partnera |
| StockIssue detail → item | /stock/items nebo /brewery/materials/[id] | Klik na položku v řádku |
| StockIssue detail → batch | /brewery/batches/[id] | Klik na šarži |
| Item detail → stock movements | /stock/movements?item=[id] | Tab "Stav skladu" |
| Lot detail → batch | /brewery/batches/[id] | Tab "Traceability" |
| Batch detail → lots | /stock/tracking/[id] | Tab "Suroviny" lot link |

---

## FÁZE 3J: I18N

### 3J.1 Nové překladové soubory

**`src/i18n/messages/cs/stock.json`:**
```json
{
  "warehouses": {
    "title": "Sklady",
    "create": "+ Sklad",
    "columns": {
      "code": "Kód",
      "name": "Název",
      "shop": "Provozovna",
      "isExciseRelevant": "Daňový",
      "categories": "Kategorie",
      "isDefault": "Výchozí"
    },
    "categories": {
      "suroviny": "Suroviny",
      "pivo": "Pivo",
      "obaly": "Obaly",
      "sluzby": "Služby",
      "ostatni": "Ostatní"
    }
  },
  "issues": {
    "title": "Skladové pohyby",
    "createReceipt": "+ Příjemka",
    "createIssue": "+ Výdejka",
    "receipt": "Příjemka",
    "issue": "Výdejka",
    "confirm": "Potvrdit",
    "cancel": "Stornovat",
    "status": {
      "draft": "Rozpracováno",
      "confirmed": "Potvrzeno",
      "cancelled": "Stornováno"
    },
    "purpose": {
      "purchase": "Nákup",
      "production_in": "Výroba (příjem)",
      "production_out": "Výroba (spotřeba)",
      "sale": "Prodej",
      "transfer": "Převod",
      "inventory": "Inventura",
      "waste": "Odpis",
      "other": "Ostatní"
    },
    "columns": {
      "code": "Kód",
      "type": "Typ",
      "purpose": "Účel",
      "date": "Datum",
      "warehouse": "Sklad",
      "partner": "Partner",
      "total": "Celkem",
      "status": "Stav"
    },
    "lines": {
      "item": "Položka",
      "requestedQty": "Požadované mn.",
      "issuedQty": "Skutečné mn.",
      "missingQty": "Chybějící",
      "unitPrice": "Jedn. cena",
      "totalCost": "Celkem",
      "note": "Poznámka",
      "addLine": "+ Řádek",
      "subtotal": "Mezisoučet",
      "additionalCost": "Vedlejší náklady"
    },
    "confirmDialog": {
      "title": "Potvrdit doklad",
      "message": "Potvrzením dokladu dojde k vytvoření skladových pohybů a aktualizaci stavu skladu. Tuto akci nelze vrátit zpět (pouze stornovat celý doklad).",
      "stockCheck": "Kontrola dostupnosti",
      "sufficient": "Dostatečný stav",
      "insufficient": "Nedostatečný stav"
    }
  },
  "lots": {
    "title": "Tracking",
    "create": "+ Šarže suroviny",
    "columns": {
      "lotNumber": "Číslo šarže",
      "item": "Položka",
      "supplier": "Dodavatel",
      "receivedDate": "Datum příjmu",
      "expiryDate": "Expirace",
      "quantityInitial": "Počáteční mn.",
      "quantityRemaining": "Zbývající mn.",
      "status": "Stav"
    },
    "status": {
      "active": "Aktivní",
      "exhausted": "Vyčerpaný",
      "expiring": "Blížící se expirace",
      "expired": "Expirovaný"
    },
    "traceability": "Použití ve várkách"
  },
  "stockStatus": {
    "quantity": "Stav skladu",
    "reserved": "Rezervováno",
    "available": "Dostupné",
    "avgPrice": "Prům. cena",
    "movements": "Historie pohybů"
  }
}
```

**`src/i18n/messages/en/stock.json`:** anglická verze (analogicky).

**Přidat import** do `src/i18n/request.ts`.

---

## FÁZE 3K: DOKUMENTACE

### 3K.1 CHANGELOG.md

Přidat Sprint 3 sekci:

```markdown
## [0.3.0] — Sprint 3: Sklad
**Období:** T8-T9
**Status:** ✅ Done

### Přidáno
- [x] Warehouses — CRUD, daňový/nedaňový, kategorie
- [x] Stock issues — příjemky, výdejky, řádky, draft/confirm/cancel workflow
- [x] Stock movements — atomické pohyby z potvrzení dokladů
- [x] FIFO/LIFO alokace — alokační engine při výdeji
- [x] Stock status — materializovaný stav skladu per item × warehouse
- [x] Material lots — lot tracking surovin
- [x] Batch ↔ lot vazba — traceability
- [x] Stock status na Items detail — tab s přehledem a historií
- [x] Číslovací řady per sklad (ne per tenant)
- [x] Shops settings — režim naskladnění, cenotvorba, defaultní sklady
- [x] Items base_item — obsahový poměr pro prodejní položky
- [x] Navigace: Stock modul sidebar, settings/warehouses, placeholder excise
```

### 3K.2 PRODUCT-SPEC.md

Aktualizovat status u entit:
- Warehouses: 📋 → ✅
- Stock issues: 📋 → ✅
- Stock movements: 📋 → ✅
- Material lots: 📋 → ✅
- Stock status: 📋 → ✅

### 3K.3 CLAUDE.md

Aktualizovat "Co je hotové" sekci o Sprint 3 scope.

---

## AKCEPTAČNÍ KRITÉRIA (Definition of Done)

### Sklady
1. [ ] CRUD warehouses funguje (vytvořit, editovat, deaktivovat)
2. [ ] Jen 1 výchozí sklad per tenant
3. [ ] Warehouse se zobrazuje v nastavení

### Skladové doklady — Příjemka
4. [ ] Vytvoření příjemky s automatickým kódem z řady
5. [ ] Přidání řádků s item lookup
6. [ ] Potvrzení příjemky vytvoří stock_movements (type: 'in')
7. [ ] Po potvrzení: stock_status se aktualizuje (quantity +)
8. [ ] Potvrzený doklad je readonly
9. [ ] Storno příjemky vytvoří protipohyby a sníží stock_status

### Skladové doklady — Výdejka
10. [ ] Vytvoření výdejky s automatickým kódem z řady
11. [ ] Kontrola dostupnosti v confirm dialogu
12. [ ] Potvrzení výdejky: FIFO alokace funguje (stock_issue_allocations vytvořeny)
13. [ ] Cena na řádku výdejky = vážený průměr z FIFO
14. [ ] Po potvrzení: stock_status se aktualizuje (quantity -)
15. [ ] Výdejka nemůže vydat víc než je na skladě (validace)
16. [ ] Storno výdejky obnoví stock_status + alokace

### Stock Status
17. [ ] Katalog položek (/stock/items) zobrazuje sloupce stav/rezervováno/dostupné
18. [ ] Detail položky má tab "Stav skladu" s per-warehouse přehledem
19. [ ] Detail položky má historii pohybů

### Lot Tracking
20. [ ] CRUD material_lots funguje
21. [ ] Lot browser zobrazuje stav (active/exhausted/expiring/expired)
22. [ ] Na lot detailu vidím použití ve várkách (traceability)
23. [ ] Při příjemce lze volitelně vytvořit lot
24. [ ] Na batch detail tab suroviny lze přiřadit lot

### Číslovací řady per sklad
25. [ ] Při vytvoření skladu se automaticky vytvoří 2 countery (příjemka + výdejka)
26. [ ] Kód dokladu se generuje z counteru vázaného na zvolený sklad
27. [ ] Různé sklady mají nezávislé číselné řady

### Shops Settings
28. [ ] Shop detail má tab "Parametry" s konfigurací režimu naskladnění
29. [ ] Ukládání cenotvorbových parametrů (ingredient_pricing_mode, beer_pricing_mode)
30. [ ] Konfigurace defaultních skladů per provozovna

### Items — obsahový poměr
31. [ ] Na detail prodejní položky (is_sale_item=true) lze nastavit base_item + quantity
32. [ ] Validace: base_item musí být is_base_production_item=true
33. [ ] Validace: base_item_quantity > 0 pokud base_item_id je vyplněno

### Obecné
34. [ ] Všechny texty přes i18n (cs + en)
35. [ ] TypeScript: strict mode, zero errors, no `any`
36. [ ] `npm run build` projde bez chyb
37. [ ] RLS policies na všech nových tabulkách
38. [ ] Cross-module linky fungují (doklad↔partner, doklad↔položka, lot↔várka)
39. [ ] Dokumentace aktualizována (CHANGELOG, PRODUCT-SPEC, CLAUDE.md)

---

## POZNÁMKY PRO CLAUDE CODE

### Co NEIMPLEMENTOVAT v Sprint 3
- **Excise tax** — daňové pohyby a měsíční podání přijdou ve Sprint 5 (vytvořit placeholder stránky)
- **Objednávky** — vazba stock_issue → order přijde ve Sprint 4 (FK sloupec existuje, ale nepoužívat)
- **Rezervace** — reserved_qty v stock_status zatím neimplementovat (přijde s objednávkami v Sprint 4)
- **Automatické příjemky při ukončení várky** — shops settings se v Sprint 3 jen konfigurují; skutečná logika (vytvoření příjemky z batch completion) přijde ve Sprint 4/5
- **Automatický odpis přes obsahový poměr** — base_item vazba se v Sprint 3 jen ukládá; automatický odpis při prodeji na pokladně přijde ve Sprint 4
- **Excise konfigurace na provozovnách** — celní úřad, číslo povolení atd. přijde ve Sprint 5

### Priorita implementace
1. DB schema + migrace (Fáze 3A) — základ pro vše, včetně items rozšíření a counters warehouse_id
2. Warehouses modul (Fáze 3B) — CRUD + automatické vytvoření counterů per sklad
3. Stock Issues backend (Fáze 3C) — KRITICKÁ byznys logika, confirm + cancel + FIFO
4. Stock Issues frontend (Fáze 3D) — dokladový detail s řádky
5. Stock Status (Fáze 3E) — rozšíření items browseru
6. Lot Tracking (Fáze 3F) — lot CRUD + traceability
7. Shops settings (Fáze 3G) — konfigurace per provozovna (jen ukládání, ne logika)
8. Items base_item (Fáze 3H) — obsahový poměr na prodejních položkách
9. Navigace (Fáze 3I) + i18n (Fáze 3J) + dokumentace (Fáze 3K)

### Doporučení pro subagenty
- **Subagent 1:** DB schema (3A) — všechny tabulky, migrace, RLS, indexy, counter warehouse_id rozšíření, items base_item sloupce
- **Subagent 2:** Warehouses (3B) — kompletní CRUD modul + automatická tvorba counterů per sklad
- **Subagent 3:** Stock Issues (3C + 3D) — HLAVNÍ PRÁCE, backend + frontend, confirm/cancel workflow, FIFO engine, counter per warehouse logika
- **Subagent 4:** Lot Tracking (3F) + Items base_item UI (3H) — lot modul, traceability, obsahový poměr na item detailu
- **Main agent:** Stock Status (3E), Shops settings (3G), integrace, navigace (3I), i18n (3J), dokumentace (3K), review

### Technické poznámky
- **Counter per warehouse** — rozšířit `counters` tabulku o nullable `warehouse_id` FK. Counter generation logic: při createStockIssue najdi counter kde `entity = 'stock_issue_receipt'` (nebo `_issue`) AND `warehouse_id = selected_warehouse`. Fallback na counter bez warehouse_id.
- **FIFO engine** je nejsložitější kus kódu — důkladně testovat edge cases (částečná alokace, prázdný sklad, storno po alokaci)
- **DB transakce** — confirm i cancel MUSÍ běžet v transakci (`db.transaction(async (tx) => { ... })`)
- **Stock status UPSERT** — použít Drizzle `onConflictDoUpdate` na unique constraint `(tenant_id, item_id, warehouse_id)`
- **Inline editing řádků** — použít shadcn Table s editovatelnými buňkami, NE Sheet/Dialog per řádek (příliš pomalé pro 10+ řádků)
- **Item lookup** v řádcích: shadcn `Command` s vyhledáváním (stejný pattern jako recipe_items ve Sprint 2)
- **Decimal precision** — všechna množství a ceny: DECIMAL(12, 4) v DB, zaokrouhlovat na 2 desetinná místa v UI
- **Navigace confirm dialog** — pokud user odchází z draft dokladu s neuloženými změnami → unsaved changes warning
