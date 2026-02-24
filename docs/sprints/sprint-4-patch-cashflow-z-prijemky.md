## Úkol: Generování CashFlow (výdaj) z příjemky

Příjemka surovin = nákup = finanční výdaj. Potřebujeme propojit příjemky s cash flow třemi způsoby:

1. **Ručně z příjemky** — button na detailu příjemky
2. **Ručně z CashFlow** — při tvorbě nového CF vybrat příjemku
3. **Automaticky** — nastavení v Settings

### Aktuální stav

- `cashflows.stock_issue_id` FK na `stock_issues(id)` **už existuje** — zatím se plní jen při tvorbě CF z objednávky
- CashFlow categories seed obsahuje "Nákup surovin" s podkategoriemi (Slad, Chmel, Kvasnice, Ostatní suroviny)
- Stock issues mají `movement_type` ('receipt' | 'issue') a `movement_purpose`

---

### 1. Funkce: createCashFlowFromReceipt()

**Soubor:** `src/modules/cashflows/actions.ts` (nebo nový `src/modules/stock-issues/actions.ts` rozšíření)

```typescript
async function createCashFlowFromReceipt(stockIssueId: string): Promise<CashFlow> {
  const receipt = await getStockIssue(stockIssueId)
  
  // Validace
  if (receipt.movementType !== 'receipt') throw new Error('Doklad není příjemka')
  if (receipt.status !== 'confirmed') throw new Error('Příjemka není potvrzena')
  
  // Kontrola duplicity — nesmí existovat aktivní CF na tuto příjemku
  const existingCF = await db.query(`
    SELECT id, code FROM cashflows 
    WHERE stock_issue_id = $1 AND status != 'cancelled' AND tenant_id = $2
  `, [stockIssueId, receipt.tenantId])
  if (existingCF.length > 0) {
    throw new Error(`K příjemce již existuje cash flow ${existingCF[0].code}`)
  }
  
  // Částka = totalCost z příjemky (SUM řádků × cena + additionalCost)
  const amount = calculateReceiptTotal(receipt)
  
  // Kategorie — z nastavení (auto_receipt_category_id) nebo default "Nákup surovin"
  const settings = await getShopSettings(receipt.shopId)
  const categoryId = settings?.auto_receipt_cf_category_id 
    || await getDefaultCategoryId(receipt.tenantId, 'expense', 'Nákup surovin')
  
  const cf = await createCashFlow({
    tenant_id: receipt.tenantId,
    cashflow_type: 'expense',
    category_id: categoryId,
    amount: amount,
    date: receipt.date,
    status: 'pending',          // Nákup proběhl, ještě nezaplaceno
    partner_id: receipt.partnerId,
    stock_issue_id: receipt.id,  // VAZBA
    description: `Nákup surovin — ${receipt.code}`,
    shop_id: receipt.shopId,
  })
  
  return cf
}
```

**Výpočet částky:**

```typescript
function calculateReceiptTotal(receipt: StockIssueWithLines): number {
  const linesTotal = receipt.lines.reduce((sum, line) => {
    return sum + (parseFloat(line.requestedQty) * (parseFloat(line.unitPrice) || 0))
  }, 0)
  return linesTotal + (parseFloat(receipt.additionalCost) || 0)
}
```

---

### 2. UI: Button na detailu příjemky

**Kde:** Detail stock issue (`StockIssueDetail.tsx`), sekce akcí / toolbar

**Podmínky zobrazení:**
- `movementType === 'receipt'`
- `status === 'confirmed'`

**Dva stavy:**

**a) Neexistuje CF:**
- Button: **"Vytvořit výdaj"** (ikona bankovky/CashFlow)
- Klik → `createCashFlowFromReceipt(issueId)` → navigace na detail CF
- Před vytvořením: confirm dialog s předvyplněnými údaji:
  ```
  Vytvořit finanční výdaj z příjemky {code}?
  
  Částka: {amount} Kč
  Partner: {partnerName}
  Kategorie: {categoryName}
  Stav: Nezaplaceno
  
  [Vytvořit] [Zrušit]
  ```

**b) Existuje CF:**
- Button: **"Otevřít výdaj"** (ikona link/open) → navigace na CF detail
- Tooltip: "CF-2026-XXX"

**Sekce cross-links** na detailu příjemky (analogicky k objednávce):
- Pokud existuje CF → zobrazit: "Cash flow: CF-2026-XXX (Nezaplaceno)" s linkem

---

### 3. UI: Výběr příjemky na CashFlow formuláři

**Kde:** CashFlowForm.tsx (`CashFlowDetail`)

**Rozšíření formuláře:**

Přidat pole **"Příjemka"** (stock_issue select):
- Zobrazit pokud `cashflow_type === 'expense'`
- Select z příjemek: `WHERE movement_type = 'receipt' AND status = 'confirmed'`
- Filtrovat jen příjemky **bez existujícího CF** (nemají aktivní cashflow vazbu)
- Label: "{code} — {partnerName} — {date} — {amount} Kč"
- Po výběru příjemky → **prefill**:
  - `amount` = totalCost příjemky
  - `partner_id` = příjemka.partner_id
  - `description` = "Nákup surovin — {code}"
  - `stock_issue_id` = příjemka.id
- Pole jsou editovatelná po prefill (user může upravit částku, kategorii atd.)

**Opačný směr — příjemka viditelná na CF detailu:**
- Pokud `stock_issue_id` je vyplněný → readonly sekce "Příjemka: PR-S1-XXX" s linkem
- Tohle už možná existuje jako "Skladový doklad" cross-link — ověřit a případně jen přejmenovat/rozšířit

---

### 4. Automatické generování — Shop Settings

**Kde:** Shop settings (Settings → Provozovny → detail)

**Nová nastavení:**

```typescript
// V shop settings (JSONB nebo nové sloupce)
{
  auto_create_cf_from_receipt: boolean,    // default: false
  auto_receipt_cf_category_id: UUID | null, // default: null (= systémová "Nákup surovin")
  auto_receipt_cf_status: 'planned' | 'pending',  // default: 'pending'
}
```

**UI v Settings → Provozovny → detail (nebo Settings → Finance):**

| Pole | Typ | Default | Popis |
|------|-----|---------|-------|
| Automaticky generovat výdaj z příjemky | toggle | false | Při potvrzení příjemky automaticky vytvoří CF |
| Kategorie pro automatický výdaj | select (CF categories, type=expense) | "Nákup surovin" | Kategorie přiřazená automatickým CF |
| Stav automatického výdaje | select: Plánováno / Nezaplaceno | Nezaplaceno | Výchozí stav vytvořeného CF |

**Implementace — hook při confirmStockIssue():**

V `confirmStockIssue()` (nebo v post-confirm hooku) přidat:

```typescript
// Na konci confirmStockIssue(), po vytvoření movements:
if (issue.movementType === 'receipt' && issue.movementPurpose === 'purchase') {
  const settings = await getShopSettings(issue.shopId)
  if (settings?.auto_create_cf_from_receipt) {
    try {
      await createCashFlowFromReceipt(issue.id)
    } catch (e) {
      // Log warning, ale neblokovat potvrzení příjemky
      console.warn(`Auto CF creation failed for receipt ${issue.id}:`, e)
    }
  }
}
```

**DŮLEŽITÉ:** Auto-generování jen pro `movement_purpose = 'purchase'` (nákup). Příjemky z výroby (production_in) nebo inventury NEMAJÍ generovat CF.

---

### 5. Storno vazba

**Při stornování příjemky:**
- Pokud existuje navázaný CF → upozornit: "K příjemce existuje cash flow {code}. Chcete ho také stornovat?"
  - Ano → stornovat CF (status = cancelled)
  - Ne → ponechat CF (user řeší ručně)

**Při stornování CF:**
- Vazba `stock_issue_id` zůstane (readonly reference), ale CF má status cancelled
- Příjemka není dotčena (CF storno neovlivňuje sklad)

---

### 6. I18N

```jsonc
// cs/stockIssues.json — přidat:
{
  "actions": {
    "createExpense": "Vytvořit výdaj",
    "openExpense": "Otevřít výdaj",
    "createExpenseConfirm": "Vytvořit finanční výdaj z příjemky {code}?",
    "expenseAmount": "Částka",
    "expenseCategory": "Kategorie",
    "expenseCreated": "Výdaj vytvořen",
    "expenseExists": "K příjemce již existuje výdaj"
  },
  "crossLinks": {
    "cashflow": "Cash flow"
  }
}

// cs/cashflows.json — přidat:
{
  "form": {
    "receiptSelect": "Příjemka",
    "receiptSelectHint": "Vyberte příjemku pro předvyplnění údajů",
    "receiptNone": "— bez příjemky —"
  },
  "crossLinks": {
    "receipt": "Příjemka"
  }
}

// cs/settings.json — přidat:
{
  "finance": {
    "autoCreateCfFromReceipt": "Automaticky generovat výdaj z příjemky",
    "autoReceiptCfCategory": "Kategorie pro automatický výdaj",
    "autoReceiptCfStatus": "Stav automatického výdaje"
  }
}
```

Anglické verze analogicky.

---

### 7. Akceptační kritéria

1. [ ] Button "Vytvořit výdaj" na detailu potvrzené příjemky (purpose=purchase)
2. [ ] Vytvoření CF s vazbou stock_issue_id, správnou částkou, partnerem, kategorií
3. [ ] Duplicitní kontrola — nelze vytvořit druhý CF na stejnou příjemku
4. [ ] Po vytvoření: button se změní na "Otevřít výdaj" s linkem na CF
5. [ ] Cross-link na detailu příjemky: "Cash flow: CF-XXX"
6. [ ] CashFlow formulář: pole "Příjemka" (jen pro výdaje)
7. [ ] Po výběru příjemky: prefill částky, partnera, popisu
8. [ ] Filtr: nabízí jen příjemky bez existujícího CF
9. [ ] Settings: toggle "Automaticky generovat výdaj z příjemky"
10. [ ] Settings: výběr kategorie a stavu pro automatický CF
11. [ ] Auto-generování: jen pro purpose=purchase, ne production_in/inventory
12. [ ] Storno příjemky: dotaz na storno navázaného CF
13. [ ] i18n: cs + en pro nové texty

---

### Priorita implementace

1. **createCashFlowFromReceipt()** — backend funkce
2. **Button na příjemce** — "Vytvořit výdaj" / "Otevřít výdaj"
3. **Cross-links** — obousměrné linky příjemka ↔ CF
4. **CashFlow formulář** — pole Příjemka + prefill
5. **Settings** — auto-generování toggle + kategorie
6. **Hook v confirmStockIssue()** — auto-generování
7. **Storno vazba**
8. **i18n**

---

### Technické poznámky

- **cashflows.stock_issue_id** — už existuje, jen se zatím plní jen z objednávek. Teď i z příjemek.
- **Výpočet částky** — SUM(lines.requested_qty × lines.unit_price) + additionalCost. Pozor: `unit_price` na příjemce může být NULL (u některých příjemek se cena nevyplňuje) → v takovém případě amount = 0 a user musí doplnit ručně.
- **movement_purpose filtr** — auto-generování JEN pro 'purchase'. Příjemky z výroby (production_in) nebo převodu (transfer) NESMÍ generovat CF.
- **Shop settings storage** — buď rozšířit existující `shops.settings` JSONB, nebo přidat sloupce. JSONB je flexibilnější.
- **Duplicita** — vždy kontrolovat `WHERE stock_issue_id = X AND status != 'cancelled'` před vytvořením.

### Aktualizuj dokumentaci
- CHANGELOG.md
- PRODUCT-SPEC.md — sekce Finance rozšířit o vazbu na příjemky
- CLAUDE.md — pokud relevantní
