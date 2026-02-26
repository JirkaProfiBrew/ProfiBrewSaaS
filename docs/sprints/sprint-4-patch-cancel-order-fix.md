# SPRINT 4 PATCH — Fix cancelOrder (výdejka + cashflow)

## ProfiBrew.com | sprint-4-patch-cancel-order-fix
### Datum: 26.02.2026

---

## PROBLÉM

`cancelOrder()` má dva kritické bugy:

1. **Výdejka se stornuje jen pokud je draft** — confirmed výdejka (zboží vydáno ze skladu) se ignoruje. Po stornování objednávky zůstane sklad odepsaný.
2. **CashFlow se nikdy nestornuje** — kód vůbec nekontroluje `orders.cashflowId`. Po stornování objednávky zůstane visící pohledávka.

**Poznámka:** S `reserved_qty` se v současné implementaci nepracuje. Objednávky nerezervují sklad — řeší se pouze saldo requirements vs. reálný stav skladu. Veškerý kód kolem `adjustReservedQtyForOrder()` ODSTRANIT.

---

## ŘEŠENÍ

### Nová logika cancelOrder()

```
cancelOrder(id, reason):
  1. BLOKOVAT pokud: invoiced, cancelled
  
  2. CASHFLOW CHECK (před jakoukoliv mutací):
     - pokud orders.cashflowId existuje:
       - načíst CF status
       - CF status = paid       → BLOKOVAT: return { error: "CASHFLOW_ALREADY_PAID" }
       - CF status = cancelled   → skip (už stornovaný)
       - CF status = planned/pending → bude stornován v kroku 4
  
  3. VÝDEJKA:
     - pokud orders.stockIssueId existuje:
       - načíst výdejku status
       - status = draft      → nastavit status=cancelled (stávající jednoduchá logika)
       - status = confirmed  → volat cancelStockIssue(stockIssueId)
                                (plný storno: counter-movements, obnova stock_status,
                                 obnova remaining_qty na příjmových řádcích)
       - status = cancelled  → skip
  
  4. CASHFLOW STORNO:
     - pokud orders.cashflowId existuje A CF status = planned/pending:
       - nastavit CF status = cancelled
  
  5. ORDER:
     - status = cancelled
     - closedDate = today
     - reason → připsat do internalNotes
```

---

## IMPLEMENTACE

### Krok 1: Úprava cancelOrder() v `src/modules/orders/actions.ts`

Nahradit celý obsah funkce `cancelOrder`:

```typescript
export async function cancelOrder(
  id: string,
  reason?: string
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const existing = await db
        .select({
          status: orders.status,
          internalNotes: orders.internalNotes,
          stockIssueId: orders.stockIssueId,
          cashflowId: orders.cashflowId,
        })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      const existingRow = existing[0];
      if (!existingRow) return { error: "NOT_FOUND" };
      if (existingRow.status === "invoiced")
        return { error: "ALREADY_INVOICED" };
      if (existingRow.status === "cancelled")
        return { error: "ALREADY_CANCELLED" };

      // ── PRE-CHECK: CashFlow ──────────────────────────────
      // Pokud existuje zaplacený CF, blokujeme storno objednávky.
      // User musí nejdřív stornovat CF ručně.
      let cfStatus: string | null = null;
      if (existingRow.cashflowId) {
        const cfRows = await db
          .select({ status: cashflows.status })
          .from(cashflows)
          .where(eq(cashflows.id, existingRow.cashflowId))
          .limit(1);
        cfStatus = cfRows[0]?.status ?? null;

        if (cfStatus === "paid") {
          return { error: "CASHFLOW_ALREADY_PAID" };
        }
      }

      const today = new Date().toISOString().slice(0, 10);
      const linkedStockIssueId = existingRow.stockIssueId;
      const linkedCashflowId = existingRow.cashflowId;

      // Append cancellation reason
      let newInternalNotes = existingRow.internalNotes;
      if (reason) {
        newInternalNotes = newInternalNotes
          ? `${newInternalNotes}\n[Cancelled] ${reason}`
          : `[Cancelled] ${reason}`;
      }

      // ── VÝDEJKA ──────────────────────────────────────────
      if (linkedStockIssueId) {
        const issueRows = await db
          .select({ status: stockIssues.status })
          .from(stockIssues)
          .where(eq(stockIssues.id, linkedStockIssueId))
          .limit(1);

        const issueStatus = issueRows[0]?.status;

        if (issueStatus === "draft") {
          // Jednoduchý cancel — žádné movements neexistují
          await db
            .update(stockIssues)
            .set({ status: "cancelled", updatedAt: sql`now()` })
            .where(eq(stockIssues.id, linkedStockIssueId));
        } else if (issueStatus === "confirmed") {
          // Plný storno — counter-movements, obnova stock_status
          await cancelStockIssue(linkedStockIssueId);
        }
        // status === "cancelled" → skip, už stornovaná
      }

      // ── CASHFLOW ─────────────────────────────────────────
      if (linkedCashflowId && (cfStatus === "planned" || cfStatus === "pending")) {
        await db
          .update(cashflows)
          .set({ status: "cancelled", updatedAt: sql`now()` })
          .where(eq(cashflows.id, linkedCashflowId));
      }

      // ── ORDER ────────────────────────────────────────────
      const updatedRows = await db
        .update(orders)
        .set({
          status: "cancelled",
          closedDate: today,
          internalNotes: newInternalNotes,
          updatedAt: sql`now()`,
        })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .returning();

      const updated = updatedRows[0];
      if (!updated) return { error: "UPDATE_FAILED" };
      return mapOrderRow(updated);
    } catch (err: unknown) {
      console.error("[cancelOrder] Error:", err);
      return { error: "CANCEL_FAILED" };
    }
  });
}
```

**DŮLEŽITÉ:**
- `cancelStockIssue()` se importuje z `@/modules/stock-issues/actions` — ta funkce už existuje a zvládá plný storno (counter-movements, stock_status reversal, remaining_qty obnova).
- `cancelStockIssue()` volat MIMO transakci objednávky — ta funkce si řídí vlastní transakci interně.
- Pořadí: nejdřív výdejka (vrátí zboží na sklad), pak CF, pak order.

### Krok 2: Odstranit reserved_qty logiku

V `cancelOrder()` **smazat** veškeré references na:
- `adjustReservedQtyForOrder()`
- `hasReservation` proměnnou
- jakýkoliv kód s `reserved_qty`

Totéž v `confirmOrder()` — pokud tam je `adjustReservedQtyForOrder()` call, **smazat**.

**Poznámka:** Funkci `adjustReservedQtyForOrder()` samotnou NEMAZAT — jen odstranit její volání z order workflow. Může být použita jinde nebo v budoucnu.

### Krok 3: Nová chybová hláška

`src/i18n/messages/cs/orders.json` — přidat do `messages`:
```json
"cashflowPaid": "Objednávku nelze stornovat — pohledávka {code} je zaplacená. Nejdříve stornujte pohledávku."
```

`src/i18n/messages/en/orders.json` — přidat do `messages`:
```json
"cashflowPaid": "Cannot cancel order — cash flow {code} is already paid. Cancel the cash flow first."
```

### Krok 4: UI — handling nového erroru

V komponentě `OrderDetail.tsx` (nebo kde se volá cancelOrder), přidat handling:

```typescript
const result = await cancelOrder(orderId, reason);
if ("error" in result) {
  switch (result.error) {
    case "CASHFLOW_ALREADY_PAID":
      toast.error(t("messages.cashflowPaid", { code: order.cashflowCode ?? "" }));
      break;
    case "ALREADY_INVOICED":
      toast.error(t("messages.alreadyInvoiced"));
      break;
    default:
      toast.error(t("messages.statusFailed"));
  }
  return;
}
toast.success(t("messages.cancelled"));
```

### Krok 5: Cancel dialog — rozšířit o info co se stane

Stávající cancel dialog je příliš jednoduchý. Rozšířit o dynamický popis dopadů:

```typescript
// V cancel dialogu — před potvrzením zobrazit:
function CancelOrderDialog({ order, onConfirm }) {
  const t = useTranslations("orders");
  
  const impacts: string[] = [];
  
  if (order.stockIssueId) {
    // Zjistit status výdejky
    if (stockIssueStatus === "confirmed") {
      impacts.push(t("cancelDialog.willReverseStockIssue"));
    } else if (stockIssueStatus === "draft") {
      impacts.push(t("cancelDialog.willCancelDraftIssue"));
    }
  }
  
  if (order.cashflowId && cfStatus !== "cancelled") {
    if (cfStatus === "paid") {
      // Blokováno — tlačítko disabled
      impacts.push(t("cancelDialog.blockedByCashflow"));
    } else {
      impacts.push(t("cancelDialog.willCancelCashflow"));
    }
  }

  return (
    <AlertDialog>
      {/* ... */}
      <AlertDialogDescription>
        {t("cancelDialog.description")}
        {impacts.length > 0 && (
          <ul className="mt-2 text-sm space-y-1">
            {impacts.map((impact, i) => (
              <li key={i}>• {impact}</li>
            ))}
          </ul>
        )}
      </AlertDialogDescription>
      {/* Tlačítko disabled pokud CF paid */}
    </AlertDialog>
  );
}
```

Nové i18n klíče v `cancelDialog`:

**CS:**
```json
"cancelDialog": {
  "title": "Stornovat objednávku?",
  "description": "Opravdu chcete stornovat tuto objednávku?",
  "willReverseStockIssue": "Výdejka bude stornována — zboží se vrátí na sklad",
  "willCancelDraftIssue": "Rozpracovaná výdejka bude zrušena",
  "willCancelCashflow": "Pohledávka bude stornována",
  "blockedByCashflow": "⚠️ Pohledávka je zaplacená — nejdříve ji stornujte",
  "confirm": "Stornovat",
  "cancel": "Zpět"
}
```

**EN:**
```json
"cancelDialog": {
  "title": "Cancel this order?",
  "description": "Are you sure you want to cancel this order?",
  "willReverseStockIssue": "Stock issue will be reversed — items returned to stock",
  "willCancelDraftIssue": "Draft stock issue will be cancelled",
  "willCancelCashflow": "Cash flow will be cancelled",
  "blockedByCashflow": "⚠️ Cash flow is already paid — cancel it first",
  "confirm": "Cancel Order",
  "cancel": "Go Back"
}
```

### Krok 6: Preload dat pro cancel dialog

Cancel dialog potřebuje znát status výdejky a CF PŘEDEM (aby mohl zobrazit dopady a případně disablovat tlačítko). Přidat helper:

```typescript
// src/modules/orders/actions.ts

export async function getCancelOrderPrecheck(
  orderId: string
): Promise<{
  canCancel: boolean;
  blockReason?: string;
  impacts: Array<{ type: "stock_issue" | "cashflow"; action: string; code?: string }>;
}> {
  return withTenant(async (tenantId) => {
    const order = await db
      .select({
        status: orders.status,
        stockIssueId: orders.stockIssueId,
        cashflowId: orders.cashflowId,
      })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
      .limit(1);

    const row = order[0];
    if (!row) return { canCancel: false, blockReason: "NOT_FOUND", impacts: [] };
    if (row.status === "invoiced")
      return { canCancel: false, blockReason: "ALREADY_INVOICED", impacts: [] };
    if (row.status === "cancelled")
      return { canCancel: false, blockReason: "ALREADY_CANCELLED", impacts: [] };

    const impacts: Array<{ type: "stock_issue" | "cashflow"; action: string; code?: string }> = [];

    // Check výdejka
    if (row.stockIssueId) {
      const issueRows = await db
        .select({ status: stockIssues.status, code: stockIssues.code })
        .from(stockIssues)
        .where(eq(stockIssues.id, row.stockIssueId))
        .limit(1);

      const issue = issueRows[0];
      if (issue && issue.status !== "cancelled") {
        impacts.push({
          type: "stock_issue",
          action: issue.status === "confirmed" ? "reverse" : "cancel_draft",
          code: issue.code,
        });
      }
    }

    // Check cashflow
    if (row.cashflowId) {
      const cfRows = await db
        .select({ status: cashflows.status, code: cashflows.code })
        .from(cashflows)
        .where(eq(cashflows.id, row.cashflowId))
        .limit(1);

      const cf = cfRows[0];
      if (cf && cf.status !== "cancelled") {
        if (cf.status === "paid") {
          return {
            canCancel: false,
            blockReason: "CASHFLOW_ALREADY_PAID",
            impacts: [{ type: "cashflow", action: "blocked_paid", code: cf.code }],
          };
        }
        impacts.push({
          type: "cashflow",
          action: "cancel",
          code: cf.code,
        });
      }
    }

    return { canCancel: true, impacts };
  });
}
```

**UI flow:**
1. User klikne "Stornovat objednávku"
2. Volá se `getCancelOrderPrecheck(orderId)`
3. Dialog se otevře s výsledkem:
   - `canCancel=false` → zobrazit důvod, tlačítko "Stornovat" disabled
   - `canCancel=true` → zobrazit impacts, tlačítko aktivní
4. User potvrdí → volá se `cancelOrder(orderId, reason)`

---

## AKCEPTAČNÍ KRITÉRIA

### Backend
- [ ] `cancelOrder()` stornuje confirmed výdejku (volá `cancelStockIssue()`)
- [ ] `cancelOrder()` stornuje planned/pending CF (nastaví status=cancelled)
- [ ] `cancelOrder()` BLOKUJE pokud CF status=paid → vrací `CASHFLOW_ALREADY_PAID`
- [ ] `cancelOrder()` NEOBSAHUJE žádný kód s reserved_qty / adjustReservedQtyForOrder
- [ ] `confirmOrder()` NEOBSAHUJE žádný kód s reserved_qty / adjustReservedQtyForOrder
- [ ] `getCancelOrderPrecheck()` vrací správné impacts pro všechny kombinace
- [ ] Pořadí operací: výdejka → CF → order (výdejka první = vrátí zboží)

### UI
- [ ] Cancel dialog zobrazuje dynamické dopady (co se stane)
- [ ] Cancel dialog s disabled tlačítkem pokud CF je paid + hláška s kódem CF
- [ ] Toast s chybovou hláškou obsahující kód CF při pokusu o storno s paid CF
- [ ] Po úspěšném stornování se refreshne celý order detail (výdejka i CF ukazují cancelled)

### i18n
- [ ] CS + EN klíče pro: cashflowPaid, willReverseStockIssue, willCancelDraftIssue, willCancelCashflow, blockedByCashflow

### Edge cases
- [ ] Storno draft objednávky bez výdejky a bez CF → jen status=cancelled ✅
- [ ] Storno confirmed objednávky s draft výdejkou → výdejka cancelled, order cancelled ✅
- [ ] Storno shipped objednávky s confirmed výdejkou → counter-movements, stock vrácen ✅
- [ ] Storno objednávky s pending CF → CF cancelled ✅
- [ ] Storno objednávky s paid CF → BLOKOVÁNO ✅
- [ ] Storno objednávky kde výdejka už byla stornovaná dříve → skip výdejku ✅
- [ ] Storno objednávky kde CF už byl stornovaný dříve → skip CF ✅
- [ ] Dvojité storno (race condition) → ALREADY_CANCELLED ✅
