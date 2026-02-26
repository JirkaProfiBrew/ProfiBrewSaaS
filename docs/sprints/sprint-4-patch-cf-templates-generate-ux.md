# POKYN: Vylepšení CF šablon — generování s feedbackem

## ProfiBrew.com | UX rozšíření cashflow templates
### Datum: 26.02.2026

---

## PROBLÉM

Generování CF ze šablon nemá žádnou zpětnou vazbu — toast se nezobrazuje, user neví co se stalo. Navíc chybí přehled co bylo/bude vygenerováno. Chybí vazba `cashflows.template_id` (je v SYSTEM-DESIGN.md, ale ne v DB).

---

## ČÁST 1: DB MIGRACE

### 1.1 ALTER cashflows — template vazba

```sql
ALTER TABLE cashflows
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES cashflow_templates(id),
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cashflows_template ON cashflows(template_id);
```

| Pole | Typ | Popis |
|------|-----|-------|
| `template_id` | UUID FK → cashflow_templates | Ze které šablony CF vznikl |
| `is_recurring` | BOOLEAN | Příznak že jde o rekurentní platbu |

### 1.2 Drizzle schema

V `drizzle/schema/cashflows.ts` do definice `cashflows` tabulky přidat:

```typescript
templateId: uuid("template_id").references(() => cashflowTemplates.id),
isRecurring: boolean("is_recurring").default(false),
```

### 1.3 Rozšíření CashFlow types

V `src/modules/cashflows/types.ts`:
```typescript
export interface CashFlow {
  // ... stávající pole ...
  templateId: string | null;
  isRecurring: boolean;
}
```

Aktualizovat `mapCashFlowRow()` v `actions.ts`.

---

## ČÁST 2: OPRAVA generateFromTemplates()

### 2.1 Přidat template_id a is_recurring při generování

V `generateFromTemplates()` v `actions.ts` — upravit INSERT:

```typescript
await db.insert(cashflows).values({
  tenantId, code,
  cashflowType: template.cashflowType,
  categoryId:   template.categoryId ?? null,
  amount:       template.amount,
  currency:     "CZK",
  date:         nextDate,
  status:       "planned",
  partnerId:    template.partnerId ?? null,
  description:  template.description ?? null,
  isCash:       false,
  templateId:   template.id,        // NOVÉ
  isRecurring:  true,               // NOVÉ
});
```

### 2.2 Nová akce: generateFromTemplate() — per template

```typescript
/**
 * Generovat CF záznamy z JEDNÉ konkrétní šablony.
 * Vrací seznam vygenerovaných záznamů (pro zobrazení v UI).
 */
export async function generateFromTemplate(
  templateId: string
): Promise<{ generated: GeneratedCfItem[] } | { error: string }> {
  return withTenant(async (tenantId) => {
    const template = await db
      .select()
      .from(cashflowTemplates)
      .where(and(
        eq(cashflowTemplates.id, templateId),
        eq(cashflowTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!template[0]) return { error: "TEMPLATE_NOT_FOUND" };
    if (!template[0].isActive) return { error: "TEMPLATE_INACTIVE" };

    const tpl = template[0];
    const today = new Date().toISOString().slice(0, 10);
    const generated: GeneratedCfItem[] = [];
    let nextDate = tpl.nextDate;

    while (nextDate <= today) {
      if (tpl.endDate && nextDate > tpl.endDate) break;
      const code = await getNextNumber(tenantId, "cashflow");
      const inserted = await db.insert(cashflows).values({
        tenantId, code,
        cashflowType: tpl.cashflowType,
        categoryId:   tpl.categoryId ?? null,
        amount:       tpl.amount,
        currency:     "CZK",
        date:         nextDate,
        status:       "planned",
        partnerId:    tpl.partnerId ?? null,
        description:  tpl.description ?? null,
        isCash:       false,
        templateId:   tpl.id,
        isRecurring:  true,
      }).returning();

      if (inserted[0]) {
        generated.push({
          id: inserted[0].id,
          code: inserted[0].code ?? "",
          date: nextDate,
          amount: tpl.amount,
          cashflowType: tpl.cashflowType,
        });
      }
      nextDate = advanceDate(nextDate, tpl.frequency);
    }

    await db.update(cashflowTemplates).set({
      nextDate,
      lastGenerated: today,
      updatedAt: sql`now()`,
    }).where(and(
      eq(cashflowTemplates.id, templateId),
      eq(cashflowTemplates.tenantId, tenantId)
    ));

    return { generated };
  });
}

// Typ pro vygenerovaný záznam
export interface GeneratedCfItem {
  id: string;
  code: string;
  date: string;
  amount: string;
  cashflowType: string;
}
```

### 2.3 Nová akce: previewGeneration() — co se vygeneruje (bez uložení)

```typescript
/**
 * Preview — jaké CF záznamy by se vygenerovaly (bez uložení).
 * Pro jednu šablonu nebo pro všechny aktivní.
 */
export async function previewGeneration(
  templateId?: string
): Promise<PendingCfItem[]> {
  return withTenant(async (tenantId) => {
    const whereClause = templateId
      ? and(eq(cashflowTemplates.id, templateId), eq(cashflowTemplates.tenantId, tenantId), eq(cashflowTemplates.isActive, true))
      : and(eq(cashflowTemplates.tenantId, tenantId), eq(cashflowTemplates.isActive, true));

    const templates = await db.select().from(cashflowTemplates).where(whereClause);
    const today = new Date().toISOString().slice(0, 10);
    const pending: PendingCfItem[] = [];

    for (const tpl of templates) {
      let nextDate = tpl.nextDate;
      while (nextDate <= today) {
        if (tpl.endDate && nextDate > tpl.endDate) break;
        pending.push({
          templateId: tpl.id,
          templateName: tpl.name,
          date: nextDate,
          amount: tpl.amount,
          cashflowType: tpl.cashflowType,
          categoryId: tpl.categoryId,
        });
        nextDate = advanceDate(nextDate, tpl.frequency);
      }
    }

    return pending;
  });
}

export interface PendingCfItem {
  templateId: string;
  templateName: string;
  date: string;
  amount: string;
  cashflowType: string;
  categoryId: string | null;
}
```

### 2.4 Nová akce: getGeneratedCashFlows() — už vygenerované CF z šablony

```typescript
/**
 * Načíst CF záznamy vygenerované z dané šablony.
 */
export async function getGeneratedCashFlows(
  templateId: string
): Promise<CashFlow[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        // ... všechny cashflow sloupce + joiny (CategoryName, PartnerName) ...
        // Stejný SELECT jako v getCashFlows()
      })
      .from(cashflows)
      .leftJoin(cashflowCategories, eq(cashflows.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflows.partnerId, partners.id))
      .leftJoin(cashDesks, eq(cashflows.cashDeskId, cashDesks.id))
      .where(and(
        eq(cashflows.tenantId, tenantId),
        eq(cashflows.templateId, templateId)
      ))
      .orderBy(desc(cashflows.date));

    return rows.map(row => mapCashFlowRow(row, {
      categoryName: row.categoryName,
      partnerName: row.partnerName,
      cashDeskName: row.cashDeskName,
    }));
  });
}
```

### 2.5 Upravit stávající generateFromTemplates()

Stávající hromadná funkce — přidat `templateId` + `isRecurring` do INSERT a vrátit rozšířený výsledek:

```typescript
export async function generateFromTemplates(): Promise<
  { generated: number; items: GeneratedCfItem[] } | { error: string }
> {
  // ... stávající logika ...
  // Při INSERT přidat: templateId: template.id, isRecurring: true
  // Sbírat vygenerované items do pole pro zobrazení
  // Vrátit { generated: count, items: [...] }
}
```

---

## ČÁST 3: UI — DETAIL ŠABLONY (TABY)

### 3.1 Přestavba TemplateManager

Stávající `TemplateManager.tsx` má browser (tabulku šablon) + inline dialog pro editaci. Rozšířit o **detail šablony s taby** při kliknutí na řádek.

**Dvě možnosti implementace:**

A) **Expandovatelný řádek** (accordion pod řádkem tabulky) — jednodušší, inline
B) **Dialog / sheet** s taby — čistější, víc prostoru

**Doporučení:** Sheet (slide-in panel z pravé strany) — konzistentnější s DetailView patternem v ProfiBrew.

### 3.2 Sheet detail šablony — taby

Po kliknutí na řádek šablony se otevře sheet/dialog s 3 taby:

```
┌─────────────────────────────────────────────────────────────┐
│ Šablona: Nájem skladu                              [×]     │
│                                                             │
│ [Nastavení]  [Vygenerované]  [K vygenerování]              │
│ ─────────────────────────────────────────────────────       │
│                                                             │
│ ... obsah dle aktivního tabu ...                            │
│                                                             │
│                              [Vygenerovat]  [Zavřít]       │
└─────────────────────────────────────────────────────────────┘
```

**Tab 1: Nastavení** — stávající editační formulář (přesunout sem z dialogu)

**Tab 2: Vygenerované** — CF záznamy s `template_id = this template`
- Načíst přes `getGeneratedCashFlows(templateId)`
- Tabulka: Kód, Datum, Částka, Status, link na CF detail
- Prázdný stav: "Zatím nebyly vygenerovány žádné doklady"

**Tab 3: K vygenerování** — preview co se vygeneruje
- Načíst přes `previewGeneration(templateId)` při otevření tabu
- Tabulka: Datum, Částka, Typ — readonly, dynamicky generovaná
- Pokud nic k vygenerování: "Všechny doklady jsou aktuální" (nextDate > today)
- **Tlačítko "Vygenerovat"** — viditelné jen pokud je co generovat

### 3.3 Per-template "Vygenerovat" button

Tlačítko na tabu "K vygenerování" (nebo v footer sheetu):

```typescript
const handleGenerateFromTemplate = async () => {
  setIsGenerating(true);
  const result = await generateFromTemplate(templateId);
  if ("error" in result) {
    toast.error(t("templates.generateFailed"));
  } else if (result.generated.length === 0) {
    toast.info(t("templates.generateEmpty"));
  } else {
    toast.success(t("templates.generateSuccess", { count: result.generated.length }));
    // Refresh obou tabů
    mutateGenerated();
    mutatePending();
  }
  setIsGenerating(false);
};
```

---

## ČÁST 4: UI — HROMADNÉ GENEROVÁNÍ (BROWSER)

### 4.1 Tlačítko "Generovat platby" v header browseru

Stávající tlačítko zůstává, ale místo přímého volání `generateFromTemplates()` otevře **konfirmační dialog s preview**.

### 4.2 Preview dialog

```
┌─────────────────────────────────────────────────────────────┐
│ Generování plateb ze šablon                                 │
│                                                             │
│ K vygenerování: 5 dokladů                                   │
│                                                             │
│ Šablona              Datum        Částka     Typ            │
│ ───────────────────────────────────────────────────────      │
│ Nájem skladu         2026-01-15   15 000 Kč  Výdaj          │
│ Nájem skladu         2026-02-15   15 000 Kč  Výdaj          │
│ Pojistka             2026-01-01    8 000 Kč  Výdaj          │
│ Pojistka             2026-04-01    8 000 Kč  Výdaj          │
│ Odběr el. energie    2026-02-01    3 500 Kč  Výdaj          │
│                                                             │
│ Celkem: 49 500 Kč                                           │
│                                                             │
│                         [Zrušit]  [Vygenerovat 5 dokladů]  │
└─────────────────────────────────────────────────────────────┘
```

**Workflow:**
1. Klik na "Generovat platby" → otevře dialog
2. Dialog zavolá `previewGeneration()` (bez templateId = všechny)
3. Zobrazí tabulku + sumář
4. Pokud nic k vygenerování → "Všechny šablony jsou aktuální" + disabled button
5. Klik "Vygenerovat" → zavolá `generateFromTemplates()` s rozšířeným response

### 4.3 Progress a výsledek

Při generování:
- Tlačítko "Vygenerovat" → disabled + spinner
- Po dokončení: dialog se změní na **výsledek**

```
┌─────────────────────────────────────────────────────────────┐
│ ✅ Vygenerováno 5 dokladů                                   │
│                                                             │
│ Kód           Šablona           Datum        Částka         │
│ ───────────────────────────────────────────────────────      │
│ CF-2026-042   Nájem skladu      2026-01-15   15 000 Kč      │
│ CF-2026-043   Nájem skladu      2026-02-15   15 000 Kč      │
│ CF-2026-044   Pojistka          2026-01-01    8 000 Kč      │
│ CF-2026-045   Pojistka          2026-04-01    8 000 Kč      │
│ CF-2026-046   Odběr el.         2026-02-01    3 500 Kč      │
│                                                             │
│                                           [Zavřít]          │
└─────────────────────────────────────────────────────────────┘
```

**Po zavření:** refresh browseru šablon (nextDate se aktualizovaly).

---

## ČÁST 5: I18N

### 5.1 Rozšíření cashflows i18n

`src/i18n/messages/cs/cashflows.json` — do `templates`:
```json
{
  "templates": {
    "tabs": {
      "settings": "Nastavení",
      "generated": "Vygenerované",
      "pending": "K vygenerování"
    },
    "generated": {
      "empty": "Zatím nebyly vygenerovány žádné doklady",
      "code": "Kód",
      "date": "Datum",
      "amount": "Částka",
      "status": "Status"
    },
    "pending": {
      "empty": "Všechny doklady jsou aktuální",
      "templateName": "Šablona",
      "date": "Datum",
      "amount": "Částka",
      "type": "Typ"
    },
    "generateFromTemplate": "Vygenerovat",
    "bulkGenerate": {
      "title": "Generování plateb ze šablon",
      "pendingCount": "K vygenerování: {count} dokladů",
      "nothingToGenerate": "Všechny šablony jsou aktuální",
      "total": "Celkem",
      "confirm": "Vygenerovat {count} dokladů",
      "resultTitle": "Vygenerováno {count} dokladů",
      "close": "Zavřít"
    }
  }
}
```

`src/i18n/messages/en/cashflows.json`:
```json
{
  "templates": {
    "tabs": {
      "settings": "Settings",
      "generated": "Generated",
      "pending": "Pending"
    },
    "generated": {
      "empty": "No payments generated yet",
      "code": "Code",
      "date": "Date",
      "amount": "Amount",
      "status": "Status"
    },
    "pending": {
      "empty": "All payments are up to date",
      "templateName": "Template",
      "date": "Date",
      "amount": "Amount",
      "type": "Type"
    },
    "generateFromTemplate": "Generate",
    "bulkGenerate": {
      "title": "Generate Payments from Templates",
      "pendingCount": "To generate: {count} records",
      "nothingToGenerate": "All templates are up to date",
      "total": "Total",
      "confirm": "Generate {count} records",
      "resultTitle": "Generated {count} records",
      "close": "Close"
    }
  }
}
```

---

## ČÁST 6: AKCEPTAČNÍ KRITÉRIA

### DB & vazba
- [ ] `cashflows.template_id` — nový sloupec UUID FK → cashflow_templates
- [ ] `cashflows.is_recurring` — nový sloupec BOOLEAN default false
- [ ] Index na template_id
- [ ] Drizzle schema + types aktualizované
- [ ] `mapCashFlowRow()` vrací templateId a isRecurring

### Server actions
- [ ] `generateFromTemplates()` — INSERT s templateId + isRecurring
- [ ] `generateFromTemplates()` — vrací `{ generated: number, items: GeneratedCfItem[] }`
- [ ] `generateFromTemplate(templateId)` — per-template generování, vrací seznam
- [ ] `previewGeneration(templateId?)` — preview bez uložení (celý tenant nebo 1 šablona)
- [ ] `getGeneratedCashFlows(templateId)` — CF záznamy z dané šablony

### Detail šablony — sheet s taby
- [ ] Klik na řádek šablony → otevře sheet
- [ ] Tab "Nastavení" — editační formulář (přesunuto ze stávajícího dialogu)
- [ ] Tab "Vygenerované" — tabulka CF s template_id = this, link na CF detail
- [ ] Tab "K vygenerování" — dynamický preview (previewGeneration), readonly
- [ ] Tlačítko "Vygenerovat" na tabu "K vygenerování" — volá generateFromTemplate()
- [ ] Po vygenerování: refresh obou tabů + toast s počtem

### Hromadné generování — dialog
- [ ] Tlačítko "Generovat platby" v browseru → otevře preview dialog
- [ ] Dialog zobrazí tabulku pending items (previewGeneration bez templateId)
- [ ] Sumář: celkový počet + celková částka
- [ ] Pokud nic → "Všechny šablony jsou aktuální", button disabled
- [ ] Klik "Vygenerovat" → spinner → zavolá generateFromTemplates()
- [ ] Po dokončení: dialog se změní na výsledek (seznam vygenerovaných CF s kódy)
- [ ] Zavření → refresh browseru šablon

### Toast/feedback
- [ ] Per-template generování: toast "Vygenerováno X dokladů"
- [ ] Hromadné: kompletní feedback v dialogu (ne jen toast)
- [ ] Prázdné generování: info "Všechny doklady jsou aktuální"

---

## VAZBA NA OSTATNÍ

**NEMĚNÍ:** Logiku `advanceDate()`, frekvence, catch-up mechanismus — vše zůstává.
**OPRAVUJE:** Chybějící `template_id` na cashflows (dle SYSTEM-DESIGN.md).
**ROZŠIŘUJE:** UX generování — z "fire and forget" na plně transparentní workflow.
