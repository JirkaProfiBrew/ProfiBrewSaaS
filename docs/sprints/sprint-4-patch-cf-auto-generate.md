# SPRINT 4 PATCH — Automatické generování CF ze šablon

## ProfiBrew.com | sprint-4-patch-cf-auto-generate
### Datum: 26.02.2026

**Prerekvizita:** sprint-4-patch-cf-templates-generate-ux je implementovaný.

---

## PROBLÉM

Šablony CF generují doklady jen při ručním kliknutí. Chceme možnost automatického generování — user zapne "generovat automaticky" na šabloně a systém sám každý den vytvoří splatné doklady. Na dashboardu se zobrazí info o vygenerovaných dokladech.

---

## ŘEŠENÍ

```
pg_cron (denně 6:00 CET)
  → HTTP POST /api/cron/generate-cf?secret=...
    → pro každého tenanta: generateFromTemplates() (jen auto_generate=true)
      → uložit výsledek do auto_generation_log
        → dashboard zobrazí "Dnes vygenerováno X dokladů"
```

---

## ČÁST 1: DB MIGRACE

### 1.1 ALTER cashflow_templates — auto_generate flag

```sql
ALTER TABLE cashflow_templates
  ADD COLUMN IF NOT EXISTS auto_generate BOOLEAN DEFAULT false;
```

**Drizzle schema** (`drizzle/schema/cashflows.ts`):
```typescript
// V definici cashflowTemplates přidat:
autoGenerate: boolean("auto_generate").default(false),
```

### 1.2 Nová tabulka: auto_generation_log

```sql
CREATE TABLE IF NOT EXISTS cf_auto_generation_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  run_date    DATE NOT NULL,
  generated   INTEGER NOT NULL DEFAULT 0,
  details     JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_cf_auto_gen_tenant_date
  ON cf_auto_generation_log(tenant_id, run_date);
```

| Pole | Typ | Popis |
|------|-----|-------|
| `run_date` | DATE | Den běhu (unique per tenant) |
| `generated` | INTEGER | Počet vygenerovaných dokladů |
| `details` | JSONB | `[{ templateName, code, date, amount }]` — pro zobrazení na dashboardu |

**Unique index** na `(tenant_id, run_date)` — max 1 záznam na den na tenanta (upsert).

**Drizzle schema:**
```typescript
export const cfAutoGenerationLog = pgTable(
  "cf_auto_generation_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    runDate: date("run_date").notNull(),
    generated: integer("generated").notNull().default(0),
    details: jsonb("details").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_cf_auto_gen_tenant_date").on(table.tenantId, table.runDate),
  ]
);
```

---

## ČÁST 2: ROZŠÍŘENÍ ŠABLONY — UI

### 2.1 Nové pole na formuláři šablony

Na tab "Nastavení" (ze sprint-4-patch-cf-templates-generate-ux) přidat:

| Pole | Label CZ | Label EN | Typ | Default |
|------|---------|---------|-----|---------|
| `auto_generate` | Generovat automaticky | Auto-generate | toggle/checkbox | false |

**Helptext CZ:** "Doklady se automaticky vytvoří každý den ráno. Ruční generování zůstává k dispozici."
**Helptext EN:** "Records are automatically created every morning. Manual generation remains available."

### 2.2 Template types

V `src/modules/cashflows/types.ts`:
```typescript
export interface CashFlowTemplate {
  // ... stávající pole ...
  autoGenerate: boolean;
}
```

Aktualizovat `mapTemplateRow()`, `createTemplate()`, `updateTemplate()`.

### 2.3 Badge v browseru šablon

Na řádku šablony v tabulce — pokud `autoGenerate=true`, zobrazit badge:

```typescript
{tpl.autoGenerate && <Badge variant="outline" className="text-xs">Auto</Badge>}
```

---

## ČÁST 3: SERVER ACTION — autoGenerateForAllTenants()

### 3.1 Nová funkce pro cron

```typescript
// src/modules/cashflows/actions.ts

/**
 * Automatické generování CF ze šablon pro VŠECHNY tenanty.
 * Voláno z API cron route. NEPOUŽÍVÁ withTenant() — iteruje přes tenanty.
 */
export async function autoGenerateForAllTenants(): Promise<{
  tenantsProcessed: number;
  totalGenerated: number;
}> {
  // 1. Najdi všechny tenanty, kteří mají alespoň 1 aktivní auto_generate šablonu
  const tenantIds = await db
    .selectDistinct({ tenantId: cashflowTemplates.tenantId })
    .from(cashflowTemplates)
    .where(
      and(
        eq(cashflowTemplates.isActive, true),
        eq(cashflowTemplates.autoGenerate, true)
      )
    );

  const today = new Date().toISOString().slice(0, 10);
  let totalGenerated = 0;

  for (const { tenantId } of tenantIds) {
    // 2. Načti auto_generate šablony pro tohoto tenanta
    const templates = await db
      .select()
      .from(cashflowTemplates)
      .where(
        and(
          eq(cashflowTemplates.tenantId, tenantId),
          eq(cashflowTemplates.isActive, true),
          eq(cashflowTemplates.autoGenerate, true)
        )
      );

    const generatedItems: Array<{
      templateName: string;
      code: string;
      date: string;
      amount: string;
    }> = [];

    for (const tpl of templates) {
      let nextDate = tpl.nextDate;
      while (nextDate <= today) {
        if (tpl.endDate && nextDate > tpl.endDate) break;

        const code = await getNextNumber(tenantId, "cashflow");
        await db.insert(cashflows).values({
          tenantId,
          code,
          cashflowType: tpl.cashflowType,
          categoryId: tpl.categoryId ?? null,
          amount: tpl.amount,
          currency: "CZK",
          date: nextDate,
          status: "planned",
          partnerId: tpl.partnerId ?? null,
          description: tpl.description ?? null,
          isCash: false,
          templateId: tpl.id,
          isRecurring: true,
        });

        generatedItems.push({
          templateName: tpl.name,
          code,
          date: nextDate,
          amount: tpl.amount,
        });

        nextDate = advanceDate(nextDate, tpl.frequency);
      }

      // Aktualizovat šablonu
      await db
        .update(cashflowTemplates)
        .set({ nextDate, lastGenerated: today, updatedAt: sql`now()` })
        .where(eq(cashflowTemplates.id, tpl.id));
    }

    // 3. Uložit log (upsert — pokud cron běží 2× za den, přepíše)
    if (generatedItems.length > 0) {
      await db
        .insert(cfAutoGenerationLog)
        .values({
          tenantId,
          runDate: today,
          generated: generatedItems.length,
          details: generatedItems,
        })
        .onConflictDoUpdate({
          target: [cfAutoGenerationLog.tenantId, cfAutoGenerationLog.runDate],
          set: {
            generated: sql`excluded.generated`,
            details: sql`excluded.details`,
          },
        });
    }

    totalGenerated += generatedItems.length;
  }

  return { tenantsProcessed: tenantIds.length, totalGenerated };
}
```

**Poznámka:** Tato funkce NEPOUŽÍVÁ `withTenant()` — je volaná z cron route bez user session. Iteruje přes tenanty přímo. Tenant context pro `getNextNumber()` se nastavuje explicitně (buď parametrem, nebo přes `SET app.tenant_id`).

### 3.2 Řešení tenant contextu pro getNextNumber()

`getNextNumber()` pravděpodobně používá `withTenant()` interně. Dvě řešení:

**A) Přidat variantu s explicitním tenantId:**
```typescript
export async function getNextNumberForTenant(
  tenantId: string,
  entity: string
): Promise<string> {
  // Stejná logika jako getNextNumber, ale s explicitním tenantId
  await db.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
  return getNextNumber(tenantId, entity);
}
```

**B) Nastavit tenant context v transakci:**
```typescript
await db.transaction(async (tx) => {
  await tx.execute(sql`SET LOCAL app.tenant_id = ${tenantId}`);
  // ... generování pro tohoto tenanta ...
});
```

**Doporučení:** Varianta B — celý tenant processing obalit do transakce s SET LOCAL.

---

## ČÁST 4: API ROUTE — CRON ENDPOINT

### 4.1 API route

```typescript
// src/app/api/cron/generate-cf/route.ts

import { NextRequest, NextResponse } from "next/server";
import { autoGenerateForAllTenants } from "@/modules/cashflows/actions";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest) {
  // 1. Ověření secret
  const authHeader = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const providedSecret = authHeader?.replace("Bearer ", "") ?? querySecret;

  if (!CRON_SECRET || providedSecret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 2. Spustit generování
    const result = await autoGenerateForAllTenants();

    console.log(
      `[cron/generate-cf] Processed ${result.tenantsProcessed} tenants, ` +
      `generated ${result.totalGenerated} cashflows`
    );

    return NextResponse.json({
      ok: true,
      tenantsProcessed: result.tenantsProcessed,
      totalGenerated: result.totalGenerated,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/generate-cf] Error:", err);
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 500 }
    );
  }
}

// GET pro health check / pg_cron kompatibilitu
export async function GET(req: NextRequest) {
  return POST(req);
}
```

### 4.2 Environment variable

```env
# .env / .env.local
CRON_SECRET=<random-32-char-string>
```

Přidat do dokumentace (CLAUDE.md) jako required env var.

---

## ČÁST 5: SUPABASE pg_cron SETUP

### 5.1 Enable pg_cron extension

V Supabase Dashboard → Database → Extensions → zapnout `pg_cron`.

Nebo SQL:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### 5.2 Naplánovat job

```sql
-- Denně v 6:00 CET (5:00 UTC v zimě, 4:00 UTC v létě)
-- Použijeme 5:00 UTC jako kompromis
SELECT cron.schedule(
  'generate-cf-daily',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url := 'https://<APP_DOMAIN>/api/cron/generate-cf',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'
  );
  $$
);
```

**Prerekvizita:** Extension `pg_net` musí být zapnutá (pro HTTP volání z DB). V Supabase je dostupná standardně.

### 5.3 Alternativa: Supabase Edge Function

Pokud `pg_net` není dostupná nebo preferuješ Edge Functions:

```typescript
// supabase/functions/generate-cf/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async () => {
  const res = await fetch(
    `${Deno.env.get("APP_URL")}/api/cron/generate-cf?secret=${Deno.env.get("CRON_SECRET")}`
  );
  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
});
```

Naplánovat přes pg_cron:
```sql
SELECT cron.schedule(
  'generate-cf-daily',
  '0 5 * * *',
  $$SELECT extensions.http_post(...)$$  -- nebo invoke edge function
);
```

### 5.4 Monitoring

Ověření že cron běží:
```sql
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

---

## ČÁST 6: DASHBOARD — NOTIFIKACE

### 6.1 Server action: getTodayAutoGenerationInfo()

```typescript
/**
 * Načíst info o dnešním automatickém generování pro dashboard.
 */
export async function getTodayAutoGenerationInfo(): Promise<{
  generated: number;
  details: Array<{ templateName: string; code: string; date: string; amount: string }>;
} | null> {
  return withTenant(async (tenantId) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(cfAutoGenerationLog)
      .where(
        and(
          eq(cfAutoGenerationLog.tenantId, tenantId),
          eq(cfAutoGenerationLog.runDate, today)
        )
      )
      .limit(1);

    if (!rows[0] || rows[0].generated === 0) return null;

    return {
      generated: rows[0].generated,
      details: rows[0].details as Array<{
        templateName: string;
        code: string;
        date: string;
        amount: string;
      }>,
    };
  });
}
```

### 6.2 Dashboard komponenta

Na hlavním dashboardu (Řídící panel) přidat info card — zobrazit jen pokud dnešní log existuje:

```typescript
// src/modules/dashboard/components/AutoCfNotification.tsx

export function AutoCfNotification() {
  const [info, setInfo] = useState<{ generated: number; details: ... } | null>(null);
  const t = useTranslations("cashflows");

  useEffect(() => {
    getTodayAutoGenerationInfo().then(setInfo);
  }, []);

  if (!info) return null;

  return (
    <Alert>
      <BanknoteIcon className="size-4" />
      <AlertTitle>
        {t("autoGenerate.todayTitle", { count: info.generated })}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 text-sm">
          {info.details.map((d, i) => (
            <li key={i}>
              {d.templateName}: {d.code} — {d.date} — {formatCZK(d.amount)} Kč
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
```

**Pozice na dashboardu:** V sekci "Nejbližší úkoly a upozornění" (nebo jako samostatná card nad sekcemi).

---

## ČÁST 7: I18N

`src/i18n/messages/cs/cashflows.json`:
```json
{
  "templates": {
    "autoGenerate": "Generovat automaticky",
    "autoGenerateHelp": "Doklady se automaticky vytvoří každý den ráno"
  },
  "autoGenerate": {
    "todayTitle": "Automaticky vygenerováno {count} dokladů",
    "badge": "Auto"
  }
}
```

`src/i18n/messages/en/cashflows.json`:
```json
{
  "templates": {
    "autoGenerate": "Auto-generate",
    "autoGenerateHelp": "Records are automatically created every morning"
  },
  "autoGenerate": {
    "todayTitle": "{count} records auto-generated today",
    "badge": "Auto"
  }
}
```

---

## ČÁST 8: FILTRACE — ruční vs auto generování

### 8.1 Změna stávajícího generateFromTemplates()

Stávající ruční `generateFromTemplates()` **nesmí** generovat šablony s `autoGenerate=true` — jinak by se generovaly dvakrát (ručně + cronem).

**Řešení:** Přidat filtr:
```typescript
// V generateFromTemplates() — ruční:
const templates = await db
  .select()
  .from(cashflowTemplates)
  .where(
    and(
      eq(cashflowTemplates.tenantId, tenantId),
      eq(cashflowTemplates.isActive, true),
      eq(cashflowTemplates.autoGenerate, false)  // NOVÉ: jen manuální
    )
  );
```

**Per-template generateFromTemplate()** — ten generuje vždy (user explicitně klikl), bez ohledu na auto_generate flag.

### 8.2 Preview — zobrazení auto šablon

V `previewGeneration()` (bez templateId = hromadný preview) — zobrazit **všechny** šablony, ale u auto označit badge "Auto — vygeneruje se automaticky". Hromadný "Vygenerovat" button generuje jen manuální.

---

## ČÁST 9: AKCEPTAČNÍ KRITÉRIA

### DB
- [ ] `cashflow_templates.auto_generate` — BOOLEAN default false
- [ ] `cf_auto_generation_log` — nová tabulka s unique(tenant_id, run_date)
- [ ] Drizzle schema aktualizované

### UI šablony
- [ ] Toggle "Generovat automaticky" na formuláři šablony
- [ ] Badge "Auto" v browseru šablon u auto_generate=true
- [ ] Helptext pod togglem

### Server actions
- [ ] `autoGenerateForAllTenants()` — iteruje tenanty, generuje z auto_generate šablon
- [ ] Ukládá výsledek do cf_auto_generation_log (upsert per tenant/day)
- [ ] `getTodayAutoGenerationInfo()` — pro dashboard notifikaci
- [ ] `generateFromTemplates()` — filtruje auto_generate=false (jen manuální)
- [ ] `generateFromTemplate(id)` — generuje vždy (explicitní akce)

### API route
- [ ] `POST /api/cron/generate-cf` — secured přes CRON_SECRET
- [ ] Volá autoGenerateForAllTenants()
- [ ] Loguje výsledek do console
- [ ] GET varianta pro health check

### pg_cron
- [ ] pg_cron extension zapnuta
- [ ] Job naplánovaný denně 5:00 UTC
- [ ] HTTP call na API route s CRON_SECRET
- [ ] Dokumentace setup postupu

### Dashboard
- [ ] Notifikace "Dnes vygenerováno X dokladů" pokud existuje dnešní log
- [ ] Seznam vygenerovaných dokladů (template name + code + částka)
- [ ] Nezobrazí se pokud dnešní log neexistuje nebo generated=0

### Filtrace
- [ ] Ruční hromadné generování nespouští auto_generate šablony
- [ ] Per-template generování funguje vždy (manuální klik)
- [ ] Preview ukazuje všechny, ale s rozlišením auto/manuální
