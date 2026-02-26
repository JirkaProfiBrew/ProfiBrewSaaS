# SPRINT 5 — DAŇOVÝ SKLAD (EXCISE TAX)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 24.02.2026

---

## CÍL SPRINTU

Implementovat zákonnou evidenci spotřební daně z piva: automatické generování daňových pohybů z běžných skladových operací na daňově relevantních skladech, konfiguraci sazeb dle kategorie pivovaru, měsíční podání pro celní správu a přehledový dashboard stavu daňového skladu. Na konci sprintu musí pivovar vidět: kolik piva je v daňovém skladu, jaké daňové pohyby proběhly, kolik činí daňová povinnost za měsíc, a mít připravené podklady pro měsíční hlášení.

**Časový odhad:** 1 týden (T5, 2.–6.3.2026)

**Závisí na:** Sprint 3 (Sklad — warehouses.is_excise_relevant, stock_issues, stock_movements), Sprint 4 (Obchod — orders/výdejky, batch completion + auto-příjemky, packaging_loss_l)

---

## REFERENČNÍ DOKUMENTY

- `docs/SYSTEM-DESIGN.md` sekce 5.11 (Excise Tax)
- `docs/PRODUCT-SPEC.md` sekce 5.5 (Spotřební daň)
- `CLAUDE.md` — pravidla kódování, dokumentační povinnosti

---

## ⚠️ PREREKVIZITA: AUDIT SPRINT 4

**PŘED zahájením Sprint 5 proveď audit:**

1. **CHANGELOG.md** — Sprint 4 musí mít status ✅ Done
2. **PRODUCT-SPEC.md** — Orders, CashFlows, CashDesk = ✅
3. **warehouses.is_excise_relevant** — sloupec existuje, UI toggle na detail skladu funguje
4. **batch completion hook** — onBatchCompleted() funguje, createPackagedReceipt/createBulkReceipt fungují
5. **batches.packaging_loss_l** — sloupec existuje (nebo bude z S4 patche)
6. **batches.excise_relevant_hl, excise_reported_hl, excise_status** — sloupce existují v DB
7. **items.is_excise_relevant** — sloupec existuje
8. **Placeholder stránky** `/stock/excise` a `/stock/monthly-report` existují (Sprint 3)

---

## ZÁKONNÝ KONTEXT

### Spotřební daň z piva v ČR

- **Povinná** pro všechny pivovary vyrábějící pivo nad 0,5 % ABV
- **Daňový bod** = okamžik vzniku daňové povinnosti (výroba nebo propuštění z daňového skladu)
- **Sazba** = závisí na **kategorii pivovaru** (dle ročního výstavu) a **stupňovitosti** piva (°P)
- **Základní sazba** (nad 200 000 hl/rok): 32 Kč za 1 °P na 1 hl
- **Snížené sazby** pro malé pivovary (do 10 000 hl = 50% ze základní sazby)
- **Měsíční podání** celní správě — do 25. dne následujícího měsíce
- **Pivo v daňovém skladu** = podmíněné osvobození od daně (daň se neplatí dokud se nepropustí)

### Kategorie pivovarů

| Kategorie | Roční výstav | Sazba (% ze základní) |
|-----------|-------------|----------------------|
| A | do 10 000 hl | 50 % |
| B | 10 001 – 50 000 hl | 60 % |
| C | 50 001 – 100 000 hl | 70 % |
| D | 100 001 – 200 000 hl | 80 % |
| E | nad 200 000 hl | 100 % |

**Naši zákazníci** (200–5 000 hl) = **kategorie A** (50 % = 16 Kč za 1 °P na 1 hl).

### Příklad výpočtu

```
Pivo: Světlý ležák 12°P, objem 3 hl, kategorie A
Daň = 3 hl × 12 °P × 16 Kč = 576 Kč
```

---

## FÁZE 5A: DB SCHEMA

### 5A.1 Excise Settings (tenant level)

Rozšíření `tenants.settings` JSONB (nebo nová tabulka `excise_config`):

```typescript
// V tenants.settings JSONB — nové klíče:
{
  excise_enabled: boolean,             // default: true
  excise_brewery_category: 'A' | 'B' | 'C' | 'D' | 'E',  // default: 'A'
  excise_tax_point: 'production' | 'release',               // default: 'production'
  excise_plato_source: 'batch_measurement' | 'recipe' | 'manual',  // default: 'batch_measurement'
  excise_loss_norm_pct: number,        // default: 1.5 (% povolená technologická ztráta)
}
```

### 5A.2 Excise Rates (sazby)

```sql
CREATE TABLE excise_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),  -- NULL = systémové (výchozí CZ sazby)
  category        TEXT NOT NULL,                 -- 'A' | 'B' | 'C' | 'D' | 'E'
  rate_per_plato_hl DECIMAL NOT NULL,           -- Kč za 1 °P na 1 hl
  valid_from      DATE NOT NULL,                 -- Platnost od
  valid_to        DATE,                          -- NULL = aktuálně platná
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_excise_rates_category ON excise_rates(category, valid_from);
```

**Seed** — aktuální CZ sazby (2025/2026):

| Kategorie | Sazba (Kč/°P/hl) |
|-----------|------------------|
| A | 16,00 |
| B | 19,20 |
| C | 22,40 |
| D | 25,60 |
| E | 32,00 |

### 5A.3 Excise Movements (daňové pohyby)

Rozšíření stávajícího schema z SYSTEM-DESIGN.md:

```sql
CREATE TABLE excise_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),

  -- === VAZBY ===
  batch_id        UUID REFERENCES batches(id),
  stock_issue_id  UUID REFERENCES stock_issues(id),    -- NOVÉ: vazba na skladový doklad
  warehouse_id    UUID REFERENCES warehouses(id),       -- NOVÉ: daňový sklad

  -- === TYP POHYBU ===
  movement_type   TEXT NOT NULL,
    -- 'production'   = příjem z výroby (batch completed → excise sklad)
    -- 'release'      = propuštění do volného oběhu (výdej z excise skladu, prodej)
    -- 'loss'         = ztráta (technologická — stáčení, manko)
    -- 'destruction'  = zničení pod dohledem (prošlé pivo, kontaminace)
    -- 'transfer_in'  = příjem převodem z jiného daňového skladu
    -- 'transfer_out' = výdej převodem do jiného daňového skladu
    -- 'adjustment'   = ruční korekce

  -- === OBJEM A DAŇ ===
  volume_hl       DECIMAL NOT NULL,                -- Objem v hektolitrech (vždy kladné)
  direction       TEXT NOT NULL,                   -- 'in' | 'out' (příjem/výdej z daňového skladu)
  plato           DECIMAL,                         -- Stupňovitost °P
  plato_source    TEXT,                            -- 'batch_measurement' | 'recipe' | 'manual'
  tax_rate        DECIMAL,                         -- Sazba v okamžiku pohybu (snapshot)
  tax_amount      DECIMAL,                         -- Vypočtená daň = volume_hl × plato × tax_rate

  -- === OBDOBÍ A STATUS ===
  date            DATE NOT NULL,
  period          TEXT NOT NULL,                    -- '2026-03' (rok-měsíc, automaticky z date)
  status          TEXT DEFAULT 'draft',             -- 'draft' | 'confirmed' | 'reported'

  -- === META ===
  description     TEXT,                            -- Auto-generovaný popis
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_excise_movements_tenant_period ON excise_movements(tenant_id, period);
CREATE INDEX idx_excise_movements_batch ON excise_movements(batch_id);
CREATE INDEX idx_excise_movements_issue ON excise_movements(stock_issue_id);
```

### 5A.4 Excise Monthly Reports (měsíční podání)

```sql
CREATE TABLE excise_monthly_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  period          TEXT NOT NULL,                    -- '2026-03'

  -- === SUMARIZACE ===
  opening_balance_hl  DECIMAL DEFAULT 0,           -- Počáteční stav (= konečný stav minulého měsíce)
  production_hl       DECIMAL DEFAULT 0,           -- Příjmy z výroby
  transfer_in_hl      DECIMAL DEFAULT 0,           -- Příjmy převodem
  release_hl          DECIMAL DEFAULT 0,           -- Propuštění (výdeje)
  transfer_out_hl     DECIMAL DEFAULT 0,           -- Výdeje převodem
  loss_hl             DECIMAL DEFAULT 0,           -- Ztráty
  destruction_hl      DECIMAL DEFAULT 0,           -- Zničení
  adjustment_hl       DECIMAL DEFAULT 0,           -- Korekce
  closing_balance_hl  DECIMAL DEFAULT 0,           -- Konečný stav

  -- === DAŇ ===
  total_tax           DECIMAL DEFAULT 0,           -- Celková daň k úhradě
  tax_details         JSONB,                       -- Rozpad dle stupňovitosti: [{plato, volume_hl, tax}]

  -- === STATUS ===
  status          TEXT DEFAULT 'draft',             -- 'draft' | 'submitted' | 'accepted'
  submitted_at    TIMESTAMPTZ,
  submitted_by    UUID REFERENCES auth.users(id),

  -- === META ===
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, period)
);
```

### 5A.5 RLS

```sql
ALTER TABLE excise_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY excise_rates_tenant ON excise_rates
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE excise_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY excise_movements_tenant ON excise_movements
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

ALTER TABLE excise_monthly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY excise_monthly_reports_tenant ON excise_monthly_reports
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 5A.6 Drizzle schema

Soubor: `drizzle/schema/excise.ts`

Implementovat všechny tabulky dle SQL výše. Export z `drizzle/schema/index.ts`.

---

## FÁZE 5B: BACKEND — AUTOMATICKÉ GENEROVÁNÍ POHYBŮ

### 5B.1 Princip

Daňové pohyby vznikají **automaticky** z běžných skladových operací na excise-relevant skladech. Uživatel nemusí zadávat ručně.

### 5B.2 Hook: confirmStockIssue() → excise movement

V `confirmStockIssue()` (soubor `src/modules/stock-issues/actions.ts`), na konci po vytvoření movements:

```typescript
// Po úspěšném potvrzení dokladu:
if (warehouse.isExciseRelevant) {
  await createExciseMovementFromStockIssue(issue, warehouse)
}
```

Logika `createExciseMovementFromStockIssue()`:

```typescript
async function createExciseMovementFromStockIssue(
  issue: StockIssueWithLines,
  warehouse: Warehouse
): Promise<ExciseMovement | null> {
  const settings = await getTenantExciseSettings(issue.tenantId)
  if (!settings.excise_enabled) return null

  // Pouze pro položky s is_excise_relevant = true
  const exciseLines = issue.lines.filter(line => line.item?.isExciseRelevant)
  if (exciseLines.length === 0) return null

  // Celkový objem v HL
  const totalVolumeL = exciseLines.reduce((sum, line) => {
    return sum + (Number(line.requestedQty) || 0)
  }, 0)
  const volumeHl = totalVolumeL / 100  // L → hl

  if (volumeHl === 0) return null

  // Typ pohybu dle typu dokladu
  let movementType: string
  let direction: string

  if (issue.movementType === 'receipt') {
    // Příjemka na excise sklad
    if (issue.movementPurpose === 'production_in') {
      movementType = 'production'
      direction = 'in'
    } else if (issue.movementPurpose === 'transfer') {
      movementType = 'transfer_in'
      direction = 'in'
    } else {
      return null  // Ostatní příjemky (nákup surovin) nejsou excise relevantní
    }
  } else if (issue.movementType === 'issue') {
    // Výdejka z excise skladu
    if (issue.movementPurpose === 'sale') {
      movementType = 'release'
      direction = 'out'
    } else if (issue.movementPurpose === 'waste') {
      movementType = 'destruction'
      direction = 'out'
    } else if (issue.movementPurpose === 'transfer') {
      movementType = 'transfer_out'
      direction = 'out'
    } else {
      movementType = 'release'  // Default pro ostatní výdeje
      direction = 'out'
    }
  } else {
    return null
  }

  // Stupňovitost — z batch, recipe, nebo manual
  const plato = await resolveExcisePlato(issue, settings)

  // Sazba
  const rate = await getCurrentExciseRate(issue.tenantId, settings.excise_brewery_category)

  // Daň (jen pro výdeje = propuštění)
  const taxAmount = direction === 'out' && movementType === 'release'
    ? volumeHl * (plato || 0) * (rate?.rate_per_plato_hl || 0)
    : 0

  return await createExciseMovement({
    tenantId: issue.tenantId,
    batchId: issue.batchId,
    stockIssueId: issue.id,
    warehouseId: warehouse.id,
    movementType,
    direction,
    volumeHl,
    plato,
    platoSource: settings.excise_plato_source,
    taxRate: rate?.rate_per_plato_hl || 0,
    taxAmount,
    date: issue.date,
    period: issue.date.substring(0, 7),  // '2026-03'
    status: 'confirmed',
    description: generateExciseDescription(movementType, issue),
  })
}
```

### 5B.3 Hook: packaging_loss_l → excise loss

Při uložení stáčení (saveBottlingData z S4 patche), pokud `packaging_loss_l > 0` a batch je na excise-relevant skladu:

```typescript
async function createExciseLossFromPackaging(batch: Batch): Promise<ExciseMovement | null> {
  const lossL = Number(batch.packagingLossL) || 0
  if (lossL <= 0) return null  // Jen ztráty, ne přebytky

  const settings = await getTenantExciseSettings(batch.tenantId)
  if (!settings.excise_enabled) return null

  const lossHl = lossL / 100
  const plato = await resolveBatchPlato(batch, settings)
  const rate = await getCurrentExciseRate(batch.tenantId, settings.excise_brewery_category)

  // Technologická ztráta — bez daně (do normy)
  // Nad normu by se dodaňovalo — v MVP neřešíme
  return await createExciseMovement({
    tenantId: batch.tenantId,
    batchId: batch.id,
    movementType: 'loss',
    direction: 'out',
    volumeHl: lossHl,
    plato,
    platoSource: settings.excise_plato_source,
    taxRate: 0,
    taxAmount: 0,
    date: new Date().toISOString().substring(0, 10),
    period: new Date().toISOString().substring(0, 7),
    status: 'confirmed',
    description: `Technologická ztráta — stáčení ${batch.batchNumber}`,
  })
}
```

### 5B.4 Hook: cancelStockIssue() → storno excise movement

Při stornování skladového dokladu na excise-relevant skladu:

```typescript
// V cancelStockIssue(), po vytvoření protipohybů:
if (warehouse.isExciseRelevant) {
  const exciseMovement = await getExciseMovementByStockIssueId(issue.id)
  if (exciseMovement) {
    // Vytvořit protipohyb (opačný direction)
    await createExciseMovement({
      ...exciseMovement,
      direction: exciseMovement.direction === 'in' ? 'out' : 'in',
      movementType: 'adjustment',
      description: `Storno: ${exciseMovement.description}`,
      taxAmount: -exciseMovement.taxAmount,
    })
  }
}
```

### 5B.5 Resolve stupňovitost

```typescript
async function resolveExcisePlato(
  issue: StockIssueWithLines,
  settings: ExciseSettings
): Promise<number | null> {
  // 1. Pokud je na dokladu batch → zkusit z batch
  if (issue.batchId) {
    const batch = await getBatch(issue.batchId)
    return resolveBatchPlato(batch, settings)
  }

  // 2. Z položek (items.plato)
  const exciseItems = issue.lines.filter(l => l.item?.isExciseRelevant)
  if (exciseItems.length > 0 && exciseItems[0].item?.plato) {
    return Number(exciseItems[0].item.plato)
  }

  return null  // Manuálně doplní uživatel
}

async function resolveBatchPlato(batch: Batch, settings: ExciseSettings): Promise<number | null> {
  switch (settings.excise_plato_source) {
    case 'batch_measurement':
      return Number(batch.ogActual) || Number(batch.recipe?.og) || null
    case 'recipe':
      return Number(batch.recipe?.og) || null
    case 'manual':
      return null  // User doplní na excise pohybu
  }
}
```

### 5B.6 Sazba lookup

```typescript
async function getCurrentExciseRate(
  tenantId: string,
  category: string
): Promise<ExciseRate | null> {
  const today = new Date().toISOString().substring(0, 10)

  // 1. Tenant-specific sazby
  let rate = await db.query(`
    SELECT * FROM excise_rates
    WHERE (tenant_id = $1 OR tenant_id IS NULL)
      AND category = $2
      AND valid_from <= $3
      AND (valid_to IS NULL OR valid_to >= $3)
      AND is_active = true
    ORDER BY tenant_id NULLS LAST, valid_from DESC
    LIMIT 1
  `, [tenantId, category, today])

  return rate[0] || null
}
```

---

## FÁZE 5C: BACKEND — EXCISE CRUD + MONTHLY REPORT

### 5C.1 Server Actions

**Soubor:** `src/modules/excise/actions.ts`

```typescript
'use server'

// === EXCISE MOVEMENTS ===
export async function getExciseMovements(filters?: ExciseMovementFilters): Promise<PaginatedResult<ExciseMovement>>
export async function getExciseMovement(id: string): Promise<ExciseMovement>
export async function createExciseMovement(data: CreateExciseMovementInput): Promise<ExciseMovement>
export async function updateExciseMovement(id: string, data: UpdateExciseMovementInput): Promise<ExciseMovement>
export async function deleteExciseMovement(id: string): Promise<void>  // Jen draft + ruční

// === MONTHLY REPORTS ===
export async function getMonthlyReports(filters?: ReportFilters): Promise<ExciseMonthlyReport[]>
export async function getMonthlyReport(id: string): Promise<ExciseMonthlyReport>
export async function generateMonthlyReport(period: string): Promise<ExciseMonthlyReport>
export async function submitMonthlyReport(id: string): Promise<ExciseMonthlyReport>

// === SAZBY ===
export async function getExciseRates(): Promise<ExciseRate[]>

// === DASHBOARD DATA ===
export async function getExciseDashboard(): Promise<ExciseDashboardData>

// === HELPERS (volané z jiných modulů) ===
export async function createExciseMovementFromStockIssue(issue, warehouse): Promise<ExciseMovement | null>
export async function createExciseLossFromPackaging(batch): Promise<ExciseMovement | null>
```

### 5C.2 generateMonthlyReport()

```typescript
async function generateMonthlyReport(period: string): Promise<ExciseMonthlyReport> {
  // 1. Pokud report pro toto období existuje ve stavu draft → aktualizovat
  // Pokud submitted/accepted → error (nelze přegenerovat)
  const existing = await getReportByPeriod(period)
  if (existing?.status !== 'draft' && existing) {
    throw new Error(`Report za ${period} je již odeslaný`)
  }

  // 2. Načíst opening balance (= closing z předchozího měsíce)
  const prevPeriod = getPreviousPeriod(period)
  const prevReport = await getReportByPeriod(prevPeriod)
  const openingBalance = prevReport?.closing_balance_hl || 0

  // 3. Sumarizovat excise_movements za období
  const movements = await getExciseMovements({ period, status: 'confirmed' })

  const productionHl = sumByType(movements, 'production')
  const transferInHl = sumByType(movements, 'transfer_in')
  const releaseHl = sumByType(movements, 'release')
  const transferOutHl = sumByType(movements, 'transfer_out')
  const lossHl = sumByType(movements, 'loss')
  const destructionHl = sumByType(movements, 'destruction')
  const adjustmentHl = sumNetAdjustments(movements)

  const closingBalance = openingBalance
    + productionHl + transferInHl
    - releaseHl - transferOutHl - lossHl - destructionHl
    + adjustmentHl

  // 4. Daň — rozpad dle stupňovitosti
  const releaseMovements = movements.filter(m => m.movementType === 'release')
  const taxDetails = groupByPlato(releaseMovements)
  const totalTax = taxDetails.reduce((s, d) => s + d.tax, 0)

  // 5. Upsert report
  const reportData = {
    tenantId,
    period,
    openingBalanceHl: openingBalance,
    productionHl,
    transferInHl,
    releaseHl,
    transferOutHl,
    lossHl,
    destructionHl,
    adjustmentHl,
    closingBalanceHl: closingBalance,
    totalTax,
    taxDetails,
    status: 'draft',
  }

  if (existing) {
    return await updateMonthlyReport(existing.id, reportData)
  } else {
    return await createMonthlyReport(reportData)
  }
}
```

---

## FÁZE 5D: FRONTEND — BROWSER DAŇOVÝCH POHYBŮ

### 5D.1 Modul struktura

```
src/modules/excise/
├── components/
│   ├── ExciseMovementBrowser.tsx
│   ├── ExciseMovementDetail.tsx
│   ├── MonthlyReportBrowser.tsx
│   ├── MonthlyReportDetail.tsx
│   ├── ExciseDashboardCard.tsx
│   └── ExciseSettingsForm.tsx
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts
└── index.ts
```

### 5D.2 ExciseMovementBrowser

**Route:** `/stock/excise`

**Sloupce:**

| Sloupec | Zdroj | Pozn. |
|---------|-------|-------|
| Datum | date | |
| Typ | movement_type | Badge s barvou |
| Směr | direction | ↑ Příjem (zelená) / ↓ Výdej (červená) |
| Objem (hl) | volume_hl | Formátováno na 2 des. místa |
| °P | plato | |
| Daň | tax_amount | Jen pokud > 0 |
| Várka | batch.batchNumber | Link |
| Doklad | stock_issue.code | Link |
| Sklad | warehouse.name | |
| Stav | status | Badge |

**Quick filtry:** Vše | Příjmy | Výdeje | Za tento měsíc | Za minulý měsíc

**Filtry:** Období (rok-měsíc), Typ pohybu, Sklad, Stav

### 5D.3 ExciseMovementDetail

**Route:** `/stock/excise/[id]`

**Formulář:**

| Pole | Typ | Pozn. |
|------|-----|-------|
| Datum | date | required |
| Typ pohybu | select | production/release/loss/destruction/transfer_in/transfer_out/adjustment |
| Směr | auto-computed | Dle typu pohybu |
| Objem (hl) | decimal | required, > 0 |
| Stupňovitost (°P) | decimal | Auto z batch/recipe, editovatelná |
| Zdroj °P | readonly text | "Z měření" / "Z receptury" / "Ruční" |
| Sazba | readonly decimal | Auto z excise_rates |
| Daň | readonly computed | volume × plato × sazba (jen pro release) |
| Várka | relation → batches | optional |
| Skladový doklad | relation → stock_issues | optional |
| Sklad | relation → warehouses (is_excise_relevant) | required |
| Popis | text | Auto-generovaný, editovatelný |
| Poznámka | textarea | |
| Stav | select | draft / confirmed |

**Auto-generated pohyby** (z hooků) mají status = confirmed a jsou editovatelné jen omezeně (plato, notes). Nelze měnit objem, typ, vazby.

**Ruční pohyby** (type = adjustment) — plně editovatelné v draft stavu.

Tlačítko **"+ Ruční pohyb"** na browseru — pro korekce a ruční záznamy.

---

## FÁZE 5E: FRONTEND — MĚSÍČNÍ PODÁNÍ

### 5E.1 MonthlyReportBrowser

**Route:** `/stock/monthly-report`

**Sloupce:**

| Sloupec | Zdroj | Pozn. |
|---------|-------|-------|
| Období | period | "Březen 2026" (lokalizovaný) |
| Poč. stav (hl) | opening_balance_hl | |
| Výroba (hl) | production_hl | Zelená |
| Propuštění (hl) | release_hl | Červená |
| Ztráty (hl) | loss_hl | Oranžová |
| Kon. stav (hl) | closing_balance_hl | Tučné |
| Daň (Kč) | total_tax | Tučné |
| Stav | status | Badge |

**Akce:** Tlačítko "Vygenerovat report" — select období (měsíc/rok) → `generateMonthlyReport()`.

### 5E.2 MonthlyReportDetail

**Route:** `/stock/monthly-report/[id]`

**Layout — dvě sekce:**

**Sekce 1: Bilance (přehled)**

```
┌─────────────────────────────────────────────┐
│ Měsíční podání — Březen 2026                │
│                                             │
│ Počáteční stav:        15,50 hl             │
│ + Výroba:             +12,00 hl             │
│ + Příjem převodem:     +0,00 hl             │
│ - Propuštění:          -8,30 hl             │
│ - Výdej převodem:      -0,00 hl             │
│ - Ztráty:              -0,20 hl             │
│ - Zničení:             -0,00 hl             │
│ ± Korekce:             +0,00 hl             │
│ ─────────────────────────────               │
│ Konečný stav:          19,00 hl             │
│                                             │
│ DAŇ K ÚHRADĚ:       2 649,60 Kč            │
└─────────────────────────────────────────────┘
```

**Sekce 2: Rozpad daně dle stupňovitosti**

| °P | Objem (hl) | Sazba | Daň (Kč) |
|----|-----------|-------|----------|
| 10 | 2,30 | 16,00 | 368,00 |
| 12 | 6,00 | 16,00 | 1 152,00 |
| 14 | — | 16,00 | — |
| **Celkem** | **8,30** | | **2 649,60** |

**Sekce 3: Seznam pohybů** (readonly tabulka pohybů za období, link na detail)

**Akce:**
- **Přegenerovat** — draft: přepočítat ze všech confirmed pohybů za období
- **Odeslat** — draft → submitted (potvrzení, nelze měnit)
- **Zpět do draftu** — submitted → draft (pro opravu)

---

## FÁZE 5F: FRONTEND — NASTAVENÍ

### 5F.1 Excise Settings

**Kde:** Settings → nová sekce "Spotřební daň" (nebo Settings → Obecné → nová sekce)

**Formulář:**

| Pole | Typ | Default | Popis |
|------|-----|---------|-------|
| Evidence spotřební daně | toggle | true | Zapnout/vypnout celý modul |
| Kategorie pivovaru | select (A–E) | A | Dle ročního výstavu |
| Daňový bod | radio: Výroba / Propuštění | Výroba | Kdy vzniká daňový pohyb |
| Zdroj stupňovitosti | radio: Měření / Receptura / Ruční | Měření | Odkud se bere °P |
| Norma technologických ztrát | number (%) | 1,5 | Povolená ztráta bez dodanění |

**Sekce: Aktuální sazby** (readonly tabulka)

| Kategorie | Sazba | Platnost od |
|-----------|-------|-------------|
| A (do 10 000 hl) | 16,00 Kč/°P/hl | 1.1.2024 |
| B (10 001–50 000) | 19,20 Kč/°P/hl | 1.1.2024 |
| ... | | |

Vaše kategorie: **A** → aktuální sazba: **16,00 Kč/°P/hl**

---

## FÁZE 5G: AKTUALIZACE BATCH

### 5G.1 Batch detail — excise info

Na batch detail (existující) přidat sekci / card (viditelná pokud excise_enabled):

```
Spotřební daň
  Objem:        1,20 hl
  Stupňovitost: 12 °P
  Stav:         Evidováno ✅ (link na excise movement)
```

### 5G.2 Aktualizace batches.excise_* polí

Při vytvoření excise movement z batch completion:

```typescript
await updateBatch(batchId, {
  exciseRelevantHl: volumeHl,
  exciseStatus: 'recorded',  // 'none' | 'recorded' | 'reported'
})
```

Po submit monthly reportu:
```typescript
// Pro všechny batche v reportovaném období:
await updateBatch(batchId, { exciseStatus: 'reported' })
```

---

## FÁZE 5H: NAVIGACE

### 5H.1 Sidebar — nahradit placeholder stránky

Stávající placeholder stránky (`/stock/excise`, `/stock/monthly-report`) nahradit funkčními stránkami.

```
SKLAD
  📦 Položky
  📊 Skladové pohyby
  🎯 Tracking
  💰 Daňové pohyby        ← ExciseMovementBrowser
  📋 Měsíční podání       ← MonthlyReportBrowser
```

---

## FÁZE 5I: I18N

```jsonc
// src/i18n/messages/cs/excise.json
{
  "movements": {
    "title": "Daňové pohyby",
    "create": "Ruční pohyb",
    "columns": {
      "date": "Datum",
      "movementType": "Typ",
      "direction": "Směr",
      "volumeHl": "Objem (hl)",
      "plato": "°P",
      "taxAmount": "Daň (Kč)",
      "batchNumber": "Várka",
      "stockIssueCode": "Doklad",
      "warehouseName": "Sklad",
      "status": "Stav"
    },
    "movementType": {
      "production": "Výroba",
      "release": "Propuštění",
      "loss": "Ztráta",
      "destruction": "Zničení",
      "transfer_in": "Příjem převodem",
      "transfer_out": "Výdej převodem",
      "adjustment": "Korekce"
    },
    "direction": {
      "in": "Příjem",
      "out": "Výdej"
    },
    "status": {
      "draft": "Rozpracováno",
      "confirmed": "Potvrzeno",
      "reported": "Nahlášeno"
    },
    "quickFilters": {
      "all": "Vše",
      "in": "Příjmy",
      "out": "Výdeje",
      "thisMonth": "Tento měsíc",
      "lastMonth": "Minulý měsíc"
    },
    "detail": {
      "title": "Daňový pohyb",
      "newTitle": "Nový daňový pohyb",
      "fields": {
        "date": "Datum",
        "movementType": "Typ pohybu",
        "volumeHl": "Objem (hl)",
        "plato": "Stupňovitost (°P)",
        "platoSource": "Zdroj °P",
        "taxRate": "Sazba (Kč/°P/hl)",
        "taxAmount": "Daň (Kč)",
        "batchId": "Várka",
        "stockIssueId": "Skladový doklad",
        "warehouseId": "Sklad",
        "description": "Popis",
        "notes": "Poznámka"
      },
      "platoSource": {
        "batch_measurement": "Z měření na várce",
        "recipe": "Z receptury",
        "manual": "Ruční zadání"
      },
      "autoGenerated": "Automaticky vygenerováno ze skladového dokladu"
    }
  },
  "reports": {
    "title": "Měsíční podání",
    "generate": "Vygenerovat report",
    "regenerate": "Přegenerovat",
    "submit": "Odeslat",
    "backToDraft": "Vrátit do rozpracování",
    "columns": {
      "period": "Období",
      "openingBalance": "Poč. stav (hl)",
      "production": "Výroba (hl)",
      "release": "Propuštění (hl)",
      "loss": "Ztráty (hl)",
      "closingBalance": "Kon. stav (hl)",
      "totalTax": "Daň (Kč)",
      "status": "Stav"
    },
    "status": {
      "draft": "Rozpracováno",
      "submitted": "Odesláno",
      "accepted": "Přijato"
    },
    "detail": {
      "title": "Měsíční podání",
      "balance": {
        "title": "Bilance",
        "opening": "Počáteční stav",
        "production": "Výroba",
        "transferIn": "Příjem převodem",
        "release": "Propuštění",
        "transferOut": "Výdej převodem",
        "loss": "Ztráty",
        "destruction": "Zničení",
        "adjustment": "Korekce",
        "closing": "Konečný stav",
        "taxDue": "Daň k úhradě"
      },
      "taxBreakdown": {
        "title": "Rozpad daně dle stupňovitosti",
        "plato": "°P",
        "volume": "Objem (hl)",
        "rate": "Sazba",
        "tax": "Daň (Kč)",
        "total": "Celkem"
      },
      "movements": {
        "title": "Pohyby za období"
      }
    },
    "generateDialog": {
      "title": "Vygenerovat měsíční report",
      "selectPeriod": "Vyberte období",
      "confirm": "Vygenerovat",
      "cancel": "Zrušit"
    }
  },
  "settings": {
    "title": "Spotřební daň",
    "enabled": "Evidence spotřební daně",
    "breweryCategory": "Kategorie pivovaru",
    "breweryCategoryHelp": "Dle ročního výstavu",
    "taxPoint": "Daňový bod",
    "taxPointProduction": "Výroba (ukončení várky)",
    "taxPointRelease": "Propuštění (výdej z daňového skladu)",
    "platoSource": "Zdroj stupňovitosti",
    "platoSourceMeasurement": "Měření na várce (OG)",
    "platoSourceRecipe": "Z receptury",
    "platoSourceManual": "Ruční zadání",
    "lossNorm": "Norma technologických ztrát (%)",
    "currentRates": "Aktuální sazby",
    "yourCategory": "Vaše kategorie",
    "yourRate": "Vaše sazba",
    "categories": {
      "A": "A — do 10 000 hl/rok",
      "B": "B — 10 001–50 000 hl/rok",
      "C": "C — 50 001–100 000 hl/rok",
      "D": "D — 100 001–200 000 hl/rok",
      "E": "E — nad 200 000 hl/rok"
    }
  },
  "batch": {
    "exciseTitle": "Spotřební daň",
    "volume": "Objem",
    "plato": "Stupňovitost",
    "exciseStatus": {
      "none": "Neevidováno",
      "recorded": "Evidováno",
      "reported": "Nahlášeno"
    }
  }
}
```

Anglické verze analogicky.

---

## FÁZE 5J: DOKUMENTACE

### 5J.1 CHANGELOG.md

```markdown
## Sprint 5 — Daňový sklad (Spotřební daň)
- [x] Excise movements — automatické generování z příjemek/výdejek na excise skladech
- [x] Excise rates — sazby dle kategorie pivovaru (seed CZ 2024)
- [x] Monthly reports — měsíční podání s bilancí a rozpadem daně
- [x] Packaging loss → excise loss (technologická ztráta)
- [x] Excise settings — konfigurace per tenant
- [x] Batch excise info — objem, °P, stav evidování
- [x] Browser + detail daňových pohybů
- [x] Browser + detail měsíčních podání
- [x] Navigace: /stock/excise, /stock/monthly-report (nahrazení placeholderů)
```

### 5J.2 PRODUCT-SPEC.md

Aktualizovat sekci 5.5 Spotřební daň: 📋 → ✅

### 5J.3 CLAUDE.md

Sprint 5 completed. Excise module added.

---

## AKCEPTAČNÍ KRITÉRIA

### DB & Schema
1. [ ] Tabulka `excise_rates` s RLS a seed daty (CZ sazby)
2. [ ] Tabulka `excise_movements` s RLS
3. [ ] Tabulka `excise_monthly_reports` s RLS
4. [ ] Drizzle schema v `drizzle/schema/excise.ts`

### Automatické generování
5. [ ] Potvrzení příjemky na excise sklad (purpose=production_in) → excise movement type=production
6. [ ] Potvrzení výdejky z excise skladu (purpose=sale) → excise movement type=release
7. [ ] Potvrzení výdejky z excise skladu (purpose=waste) → excise movement type=destruction
8. [ ] Packaging loss > 0 → excise movement type=loss
9. [ ] Storno dokladu → excise adjustment (protipohyb)
10. [ ] Pohyby na ne-excise skladech NEvytváří excise movements
11. [ ] Položky kde is_excise_relevant=false se NEZAPOČÍTÁVAJÍ do excise objemu

### Výpočet daně
12. [ ] Daň = volume_hl × plato × sazba (jen pro release)
13. [ ] Sazba dle kategorie pivovaru z excise_rates
14. [ ] Stupňovitost: priorita batch_measurement → recipe → manual
15. [ ] Sazba snapshot na pohybu (neměnit zpětně při změně sazeb)

### UI — Browser pohybů
16. [ ] DataBrowser s quick filtry (vše/příjmy/výdeje/tento měsíc/minulý měsíc)
17. [ ] Detail pohybu: editovatelné plato a notes, readonly rest (pro auto-generated)
18. [ ] Ruční pohyb (adjustment): plně editovatelný formulář

### UI — Měsíční podání
19. [ ] Browser podání
20. [ ] Generování reportu za vybrané období
21. [ ] Detail: bilance (opening → closing), rozpad daně dle °P, seznam pohybů
22. [ ] Status workflow: draft → submitted → (draft zpět)
23. [ ] Přegenerování draft reportu (aktualizace dat)

### UI — Settings
24. [ ] Konfigurace: enabled, kategorie, tax point, plato source, loss norm
25. [ ] Readonly tabulka aktuálních sazeb

### Batch integrace
26. [ ] Batch detail: excise info card (objem, °P, stav)
27. [ ] batches.excise_relevant_hl a excise_status se plní automaticky

### Obecné
28. [ ] i18n: cs + en
29. [ ] `npm run build` bez chyb
30. [ ] TypeScript: zero errors, no `any`
31. [ ] RLS policies na všech nových tabulkách
32. [ ] Dokumentace aktualizována (CHANGELOG, PRODUCT-SPEC, CLAUDE.md)

---

## CO NEIMPLEMENTOVAT V SPRINT 5

- **Export ve formátu celní správy** (XML/PDF) — post-MVP, TBD formát
- **Dodanění nadnormativních ztrát** — v MVP ztráty = bez daně
- **Historické sazby** (změna sazeb v průběhu roku) — MVP = jedna aktuální sada
- **Vracení daně** (export, zničení pod dohledem celní správy) — post-MVP
- **Přesun mezi subjekty** (zajišťovací list) — post-MVP
- **Automatické podání** (API celní správy) — neexistuje standardní API

---

## PRIORITA IMPLEMENTACE

1. **DB schema + migrace** (5A) — tabulky, RLS, seed sazby
2. **Excise settings** (5F) — konfigurace per tenant
3. **Automatické generování** (5B) — hooky v confirmStockIssue, packaging loss
4. **Excise CRUD** (5C) — server actions, monthly report generování
5. **Browser daňových pohybů** (5D) — DataBrowser + detail
6. **Měsíční podání** (5E) — browser + detail + generování
7. **Batch integrace** (5G) — excise info card
8. **Navigace** (5H) — nahradit placeholdery
9. **i18n + docs** (5I, 5J)

---

## TECHNICKÉ POZNÁMKY

- **volume_hl** — vždy kladné číslo. Směr určuje `direction` (in/out). Nepracovat se zápornými objemy.
- **period** — formát `YYYY-MM`, automaticky z `date`. Použít `date.substring(0, 7)`.
- **Seed sazby** — idempotentní (ON CONFLICT DO NOTHING). tenant_id = NULL = systémové.
- **Storno** — vytvoří nový excise movement type=adjustment s opačným direction. Nemazat původní.
- **Přepočet daně** — jen pro `release` (propuštění). Výroba, ztráty, převody = tax_amount = 0.
- **L → hl** — vždy / 100. Dát pozor na zaokrouhlení (2 des. místa pro hl).
- **excise_rates.valid_to = NULL** — znamená aktuálně platná (bez konce platnosti).
- **Opening balance** prvního měsíce — nastavit ručně v nastavení nebo 0 (nový pivovar).
- **Excise movement status 'reported'** — nastaví se po submit monthly reportu (hromadný update pro všechny confirmed pohyby v období).

### Aktualizuj dokumentaci
- CHANGELOG.md
- PRODUCT-SPEC.md — sekce 5.5
- CLAUDE.md
