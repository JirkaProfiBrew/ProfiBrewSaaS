# SPRINT 3 PATCH — Šarže = řádek příjemky
## ProfiBrew.com | Patch spec
### Verze: 1.0 | Datum: 19.02.2026

---

## PROBLÉM

Současný design má 3 oddělené entity pro jednu věc:
1. `stock_issue_lines` (řádek příjemky) — příjem 50 kg sladu
2. `material_lots` (šarže) — duplicitní záznam s číslem šarže a expirací
3. `stock_issue_allocations` — vazba výdeje na příjem

To znamená dvojí zadávání: uživatel vytvoří příjemku a pak musí ještě zvlášť založit šarži v agendě Tracking. Navíc LIFO mód je v pivovarství irelevantní.

## ŘEŠENÍ

**Hlavní premisa: šarže = řádek příjemky.**

1. Rozšířit `stock_issue_lines` o šaržové atributy (lot_number, expiry_date, lot_attributes)
2. Zrušit tabulku `material_lots` (nepoužívat, nemigrovat data)
3. Zjednodušit mód výdeje: FIFO + Ruční výběr šarže (drop LIFO, drop Průměr)
4. Agenda Tracking = readonly browser nad příjmovými řádky
5. FIFO engine beze změny (už pracuje s receipt lines)

**Odhad:** 3–5 hodin

---

## FÁZE P1: DB SCHEMA

### P1.1 ALTER stock_issue_lines

```sql
ALTER TABLE stock_issue_lines
  ADD COLUMN lot_number     TEXT,           -- Číslo šarže dodavatele (volitelné)
  ADD COLUMN expiry_date    DATE,           -- Datum expirace (volitelné)
  ADD COLUMN lot_attributes JSONB DEFAULT '{}'  -- Rozšířené atributy per typ suroviny
;
```

Tyto sloupce se vyplňují **jen na příjemkách** (stock_issue.type = 'receipt'). Na výdejkách zůstávají NULL.

**lot_attributes** — flexibilní JSONB per material_type:
- Slad: `{ "extractPercent": 80.5, "moisture": 4.2 }`
- Chmel: `{ "cropYear": 2025, "actualAlpha": 13.5 }`
- Kvasnice: `{ "generation": 3, "viability": 95 }`
- Obecné: `{ "note": "..." }`

### P1.2 Tabulka material_lots

Pokud existuje — **nechat** (nemazat migraci, neměnit schema). Pouze přestat používat v kódu. Pokud neexistuje — nevytvářet.

Totéž pro `batch_material_lots` — traceability jde přes alokace:
`batch → výdejka (purpose='production') → alokace → příjmový řádek (= šarže)`

### P1.3 ALTER items — issue_mode hodnoty

Změnit enum/validaci `issue_mode` na items:

| Stará hodnota | Nová hodnota | Akce |
|---------------|--------------|------|
| `fifo` | `fifo` | Beze změny |
| `lifo` | `fifo` | Migrace: UPDATE items SET issue_mode = 'fifo' WHERE issue_mode = 'lifo' |
| `average` | `manual_lot` | Migrace: UPDATE items SET issue_mode = 'manual_lot' WHERE issue_mode = 'average' |

**Nové povolené hodnoty:** `'fifo'` | `'manual_lot'`

Default zůstává `'fifo'`.

### P1.4 Migrace

```sql
-- 1. Rozšířit stock_issue_lines
ALTER TABLE stock_issue_lines
  ADD COLUMN IF NOT EXISTS lot_number TEXT,
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS lot_attributes JSONB DEFAULT '{}';

-- 2. Migrovat issue_mode na items
UPDATE items SET issue_mode = 'fifo' WHERE issue_mode = 'lifo';
UPDATE items SET issue_mode = 'manual_lot' WHERE issue_mode = 'average';

-- 3. Pokud existují material_lots data → přesunout lot_number a expiry do receipt lines
-- (jen pokud Sprint 3 již vytvořil a naplnil material_lots)
-- UPDATE stock_issue_lines sil
--   SET lot_number = ml.lot_number, expiry_date = ml.expiry_date
--   FROM material_lots ml
--   WHERE ml.receipt_line_id = sil.id;
-- Odkomentovat jen pokud material_lots má data.
```

---

## FÁZE P2: TYPES & VALIDACE

### P2.1 Aktualizovat types

```typescript
// src/modules/stock-issues/types.ts

// Přidat do StockIssueLine
interface StockIssueLine {
  // ... existující pole ...
  lot_number?: string | null
  expiry_date?: string | null  // ISO date
  lot_attributes?: Record<string, unknown>
}

// Rozšířené atributy per material_type
interface MaltLotAttributes {
  extractPercent?: number    // Skutečná výtěžnost (%)
  moisture?: number          // Vlhkost (%)
}

interface HopLotAttributes {
  cropYear?: number          // Rok sklizně
  actualAlpha?: number       // Skutečná alpha (%)
}

interface YeastLotAttributes {
  generation?: number        // Generace kvasnic
  viability?: number         // Životaschopnost (%)
}
```

### P2.2 Aktualizovat issue_mode na items

```typescript
// src/modules/items/types.ts
export const ISSUE_MODES = ['fifo', 'manual_lot'] as const
export type IssueMode = typeof ISSUE_MODES[number]
```

### P2.3 Zod validace

```typescript
// receipt line — rozšířit existující schema
const receiptLineSchema = existingSchema.extend({
  lot_number: z.string().max(100).optional().nullable(),
  expiry_date: z.string().date().optional().nullable(),
  lot_attributes: z.record(z.unknown()).optional().default({}),
})
```

---

## FÁZE P3: UI PŘÍJEMKY — ŠARŽOVÉ ATRIBUTY

### P3.1 Rozšířit řádek příjemky

Na formuláři řádku příjemky (StockIssueLineForm / dialog) přidat **volitelná pole**:

| Pole | Typ | Zobrazit kdy | Pozn. |
|------|-----|-------------|-------|
| Číslo šarže | text | Vždy (na příjemce) | Volitelné |
| Datum expirace | date picker | Vždy (na příjemce) | Volitelné |

Zobrazovat **jen na příjemkách** (stock_issue.type = 'receipt'). Na výdejkách nezobrazovat.

### P3.2 Rozšířené atributy per material_type

Pod hlavními poli řádku příjemky — **collapsible sekce** "Parametry šarže" (zobrazit jen pokud item.is_brew_material = true):

**Slad (material_type = 'malt'):**
| Pole | Typ | Label |
|------|-----|-------|
| extractPercent | decimal (%) | Skutečná výtěžnost |
| moisture | decimal (%) | Vlhkost |

**Chmel (material_type = 'hop'):**
| Pole | Typ | Label |
|------|-----|-------|
| cropYear | number (rok) | Rok sklizně |
| actualAlpha | decimal (%) | Skutečná alpha |

**Kvasnice (material_type = 'yeast'):**
| Pole | Typ | Label |
|------|-----|-------|
| generation | number | Generace |
| viability | decimal (%) | Životaschopnost |

Uložit jako JSONB v `lot_attributes`.

### P3.3 Inline zobrazení v tabulce řádků příjemky

Přidat do tabulky řádků příjemky sloupce:

| Sloupec | Šířka | Pozn. |
|---------|-------|-------|
| Šarže | 120px | lot_number, zobrazit jen pokud vyplněno |
| Expirace | 100px | expiry_date, formát dd.mm.yyyy |

Sloupce viditelné jen na příjemkách.

---

## FÁZE P4: UI ITEM DETAIL — MÓD VÝDEJE

### P4.1 Aktualizovat select mód výdeje

Na kartě položky (Item Detail → Skladové nastavení):

**Staré hodnoty:** FIFO | LIFO | Průměrná cena
**Nové hodnoty:** FIFO | Ruční výběr šarže

Select s 2 možnostmi:
- `fifo` → "FIFO" (helptext: "Systém automaticky vydává z nejstarší dostupné příjemky")
- `manual_lot` → "Ruční výběr šarže" (helptext: "Při výdeji si vyberete, z které příjemky/šarže chcete vydávat")

---

## FÁZE P5: UI VÝDEJKY — RUČNÍ VÝBĚR ŠARŽE

### P5.1 Dialog výběru šarží (LotSelectionDialog)

Nová komponenta `LotSelectionDialog.tsx`.

**Kdy se zobrazí:** Při přidání řádku na výdejku, pokud `item.issue_mode = 'manual_lot'`.

**Flow:**
1. User přidá položku na výdejku (vybere item, zadá požadované množství)
2. Pokud item.issue_mode = 'fifo' → standardní chování (FIFO engine alokuje automaticky při confirm)
3. Pokud item.issue_mode = 'manual_lot' → otevře se LotSelectionDialog

**Obsah dialogu:**

Tabulka dostupných příjmových řádků (receipt lines) pro daný item × warehouse:

| Sloupec | Zdroj | Pozn. |
|---------|-------|-------|
| Datum příjmu | stock_issue.date | |
| Příjemka | stock_issue.code | Link |
| Dodavatel | stock_issue.partner.name | |
| Šarže | lot_number | Může být prázdné |
| Expirace | expiry_date | Zvýraznit pokud < dnes (expired) |
| Přijato | requested_qty | |
| Zbývá | remaining_qty (computed) | |
| Cena | unit_price | Per MJ |
| **Vydat** | number input | User zadá množství |

**Query pro dostupné šarže:**
```sql
SELECT sil.*, si.date, si.code, si.partner_id, p.name as partner_name
FROM stock_issue_lines sil
JOIN stock_issues si ON si.id = sil.stock_issue_id
LEFT JOIN partners p ON p.id = si.partner_id
WHERE sil.item_id = :item_id
  AND si.warehouse_id = :warehouse_id
  AND si.type = 'receipt'
  AND si.status = 'confirmed'
  AND sil.remaining_qty > 0
ORDER BY si.date ASC, si.created_at ASC
```

**Validace:**
- Součet zadaných množství MUSÍ = požadované množství na výdejovém řádku
- Nelze zadat víc než remaining_qty per řádek
- Alespoň 1 řádek musí mít vydat > 0

**Výsledek:** Dialog vytvoří manuální alokace (stock_issue_allocations) místo automatických FIFO alokací.

### P5.2 Úprava FIFO engine

Stávající `confirmStockIssue()` → přidat check:

```typescript
async function confirmStockIssue(issueId: string) {
  const issue = await getStockIssue(issueId)
  
  for (const line of issue.lines) {
    const item = await getItem(line.item_id)
    
    if (item.issue_mode === 'manual_lot') {
      // Zkontrolovat že alokace už existují (vytvořené v LotSelectionDialog)
      const existingAllocations = await getAllocations(line.id)
      if (existingAllocations.length === 0) {
        throw new Error(`Položka "${item.name}" vyžaduje ruční výběr šarží`)
      }
      // Validovat: součet alokací = requested_qty
      const totalAllocated = sum(existingAllocations, 'quantity')
      if (totalAllocated !== line.requested_qty) {
        throw new Error(`Alokace pro "${item.name}" nesedí: ${totalAllocated} ≠ ${line.requested_qty}`)
      }
      // Nevolat FIFO — alokace jsou hotové
    } else {
      // FIFO — stávající logika
      await allocateFIFO(line)
    }
  }
  
  // Zbytek confirmStockIssue beze změny (movements, stock_status update...)
}
```

### P5.3 remaining_qty na příjmových řádcích

Potřebujeme rychle zjistit kolik z příjmového řádku zbývá. Dvě možnosti:

**Varianta A (computed):** `remaining_qty = requested_qty - SUM(allocations.quantity)`
→ Počítat za letu. Jednodušší, ale pomalejší při velkém objemu.

**Varianta B (materializované):** Přidat `remaining_qty` sloupec na `stock_issue_lines`, aktualizovat při alokaci.
→ Rychlejší čtení, nutná synchronizace.

**Doporučení:** Varianta B — přidat sloupec:

```sql
ALTER TABLE stock_issue_lines
  ADD COLUMN remaining_qty DECIMAL;
  
-- Backfill: pro příjemky = requested_qty - sum(alokací)
UPDATE stock_issue_lines sil
SET remaining_qty = sil.requested_qty - COALESCE(
  (SELECT SUM(a.quantity) FROM stock_issue_allocations a WHERE a.receipt_line_id = sil.id), 0
)
WHERE sil.id IN (
  SELECT sil2.id FROM stock_issue_lines sil2
  JOIN stock_issues si ON si.id = sil2.stock_issue_id
  WHERE si.type = 'receipt'
);
```

Aktualizovat v `confirmStockIssue()` a `cancelStockIssue()`:
```typescript
// Po vytvoření alokace:
await updateReceiptLine(allocation.receipt_line_id, {
  remaining_qty: sql`remaining_qty - ${allocation.quantity}`
})

// Po stornování:
await updateReceiptLine(allocation.receipt_line_id, {
  remaining_qty: sql`remaining_qty + ${allocation.quantity}`
})
```

---

## FÁZE P6: AGENDA TRACKING — READONLY BROWSER

### P6.1 Přesměrování agendy

Agenda "Tracking" v sidebaru Skladu (`/stock/tracking`) — **readonly DataBrowser** nad příjmovými řádky.

**Žádný CRUD** — data se vytváří přes příjemky, tady se jen prohlíží.

### P6.2 TrackingBrowser

**Sloupce:**

| Sloupec | Zdroj | Pozn. |
|---------|-------|-------|
| Příjemka | stock_issue.code | Link na příjemku |
| Datum příjmu | stock_issue.date | |
| Položka | item.name | |
| Dodavatel | stock_issue.partner.name | |
| Šarže | lot_number | |
| Expirace | expiry_date | Červeně pokud expired |
| Přijato | requested_qty + unit.symbol | |
| Zbývá | remaining_qty + unit.symbol | |
| Stav | computed badge | 🟢 Na skladě / 🟡 Částečně / 🔴 Vydáno / ⚫ Expirováno |

**Stav badge:**
- remaining_qty = requested_qty → 🟢 Na skladě
- remaining_qty > 0 && < requested_qty → 🟡 Částečně vydáno
- remaining_qty = 0 → 🔴 Vydáno
- expiry_date < dnes && remaining_qty > 0 → ⚫ Expirováno (varování)

**Quick filters:** Vše | Na skladě | Částečně vydáno | Vydáno | Expirováno

**Parametrický filtr:** Položka, Dodavatel, Sklad, Datum příjmu od-do, Šarže (text search)

### P6.3 Tracking Detail (klik na řádek)

Readonly pohled na jednu šarži (příjmový řádek) s historií:

**Hlavička:**
- Položka, Šarže, Expirace, Dodavatel, Datum příjmu, Příjemka (link)
- Přijato / Vydáno / Zbývá

**Rozšířené atributy** (z lot_attributes, pokud vyplněné):
- Výtěžnost: 80,5%, Vlhkost: 4,2% (pro slad)
- Rok sklizně: 2025, Alpha: 13,5% (pro chmel)

**Tabulka alokací — kde šarže skončila:**

| Datum výdeje | Výdejka | Účel | Várka | Množství |
|-------------|---------|------|-------|----------|
| 15.02.2026 | VD-S1-001 | Výroba | V-2026-003 | 25 kg |
| 18.02.2026 | VD-S1-003 | Prodej | — | 10 kg |

Linky na výdejky a várky.

---

## FÁZE P7: I18N

### P7.1 Nové/upravené překlady

```jsonc
// src/i18n/messages/cs/stockIssues.json — přidat:
{
  "lotNumber": "Číslo šarže",
  "expiryDate": "Datum expirace",
  "lotAttributes": "Parametry šarže",
  "lotAttributeLabels": {
    "extractPercent": "Skutečná výtěžnost (%)",
    "moisture": "Vlhkost (%)",
    "cropYear": "Rok sklizně",
    "actualAlpha": "Skutečná alpha (%)",
    "generation": "Generace",
    "viability": "Životaschopnost (%)"
  },
  "lotSelection": {
    "title": "Výběr šarží",
    "receiptDate": "Datum příjmu",
    "receiptCode": "Příjemka",
    "supplier": "Dodavatel",
    "received": "Přijato",
    "remaining": "Zbývá",
    "toIssue": "Vydat",
    "totalToAllocate": "Celkem k alokaci",
    "mismatch": "Součet neodpovídá požadovanému množství"
  }
}

// src/i18n/messages/cs/items.json — upravit:
{
  "issueMode": {
    "fifo": "FIFO",
    "manual_lot": "Ruční výběr šarže"
  },
  "issueModeHelp": {
    "fifo": "Systém automaticky vydává z nejstarší dostupné příjemky",
    "manual_lot": "Při výdeji ručně vyberete, z které příjemky/šarže chcete vydávat"
  }
}

// src/i18n/messages/cs/tracking.json — nový:
{
  "title": "Sledování šarží",
  "columns": {
    "receipt": "Příjemka",
    "receiptDate": "Datum příjmu",
    "item": "Položka",
    "supplier": "Dodavatel",
    "lotNumber": "Šarže",
    "expiryDate": "Expirace",
    "received": "Přijato",
    "remaining": "Zbývá",
    "status": "Stav"
  },
  "status": {
    "inStock": "Na skladě",
    "partial": "Částečně vydáno",
    "issued": "Vydáno",
    "expired": "Expirováno"
  },
  "quickFilters": {
    "all": "Vše",
    "inStock": "Na skladě",
    "partial": "Částečně vydáno",
    "issued": "Vydáno",
    "expired": "Expirováno"
  },
  "detail": {
    "title": "Detail šarže",
    "header": "Příjem",
    "attributes": "Parametry šarže",
    "allocations": "Výdeje z této šarže",
    "allocationColumns": {
      "date": "Datum výdeje",
      "issueCode": "Výdejka",
      "purpose": "Účel",
      "batch": "Várka",
      "quantity": "Množství"
    }
  }
}
```

Anglické verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### DB & Types
1. [ ] stock_issue_lines má sloupce lot_number, expiry_date, lot_attributes
2. [ ] stock_issue_lines má sloupec remaining_qty (materializovaný)
3. [ ] remaining_qty backfill proběhl správně pro existující příjemky
4. [ ] items.issue_mode povolené hodnoty: 'fifo' | 'manual_lot'
5. [ ] Existující LIFO/average záznamy migrovány na fifo/manual_lot
6. [ ] material_lots tabulka se nepoužívá (žádné nové reference v kódu)

### UI Příjemky
7. [ ] Řádek příjemky zobrazuje pole Šarže a Expirace
8. [ ] Collapsible sekce "Parametry šarže" zobrazuje atributy dle material_type
9. [ ] Na výdejkách se šaržové pole NEzobrazují

### UI Mód výdeje
10. [ ] Select na kartě položky nabízí jen FIFO a Ruční výběr šarže
11. [ ] Helptext popisuje chování každého módu

### Ruční výběr šarží
12. [ ] Při výdeji položky s issue_mode='manual_lot' se otevře LotSelectionDialog
13. [ ] Dialog zobrazuje dostupné příjemky se zbytkovým množstvím
14. [ ] User může rozdělit výdej přes více šarží
15. [ ] Validace: součet alokací = požadované množství
16. [ ] confirmStockIssue pro manual_lot neVolá FIFO, použije existující alokace
17. [ ] confirmStockIssue pro manual_lot vyhodí chybu pokud alokace chybí

### Tracking
18. [ ] Agenda Tracking zobrazuje readonly browser příjmových řádků
19. [ ] Quick filters: Na skladě / Částečně / Vydáno / Expirováno
20. [ ] Detail šarže zobrazuje alokace (kde šarže skončila) s linky
21. [ ] Expirované šarže vizuálně zvýrazněny

### Integrace
22. [ ] FIFO engine funguje beze změny pro issue_mode='fifo'
23. [ ] remaining_qty se aktualizuje při confirm i cancel stock issue
24. [ ] `npm run build` projde bez chyb
25. [ ] i18n: cs + en pro všechny nové texty

---

## PRIORITA IMPLEMENTACE

1. **DB migrace** (P1) — ALTER tables, migrovat issue_mode, backfill remaining_qty
2. **Types & validace** (P2) — aktualizovat typy, Zod schemas
3. **Item detail** (P4) — nový select mód výdeje (2 hodnoty)
4. **UI příjemky** (P3) — šaržová pole na řádcích příjemky
5. **remaining_qty logika** (P5.3) — aktualizace v confirm/cancel
6. **LotSelectionDialog** (P5.1, P5.2) — ruční výběr šarží při výdeji
7. **Tracking agenda** (P6) — readonly browser + detail
8. **i18n** (P7)

---

## DOPAD NA SPRINT 4

Žádný dopad na Sprint 4 spec. Objednávky vytvářejí výdejky standardně — FIFO/manual_lot logika se aplikuje transparentně při confirmStockIssue.

Batch traceability (Sprint 4, Fáze 4E) funguje přes:
`batch → výdejka (purpose='production') → alokace → příjmový řádek (= šarže)`
→ Není potřeba batch_material_lots tabulka.
