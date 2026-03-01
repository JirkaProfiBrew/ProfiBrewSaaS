# ŘÍZENÍ VARU — Implementační zadání
## Batch Lifecycle Management | ProfiBrew.com
### Verze: 1.0 | Datum: 01.03.2026

**Referenční dokumenty:**
- `outputs/batch-brew-management-concept.md` — schválený UX koncept
- `docs/SYSTEM-DESIGN.md` — stávající schema (batches, batch_steps, batch_measurements)
- `drizzle/schema/batches.ts` — Drizzle definice
- `src/modules/batches/` — stávající modul

**Scope:** MVP Fáze I — F1-F7 s varným listem (statický), tracking šarží, spotřební daň. BEZ online tracking (Fáze II).

---

## OBSAH

- Fáze A: Schema migrace + typy
- Fáze B: Společný shell (process bar, sidebar panely)
- Fáze C: F1 Plán + F2 Příprava
- Fáze D: F3 Varný list (statický režim)
- Fáze E: F4 Kvašení + F5 Ležení
- Fáze F: F6 Stáčení (integrace) + F7 Ukončeno
- Fáze G: Tracking šarží + spotřební daň sidebar

---

## FÁZE A: SCHEMA MIGRACE + TYPY

### A1: Rozšíření tabulky `batches`

```sql
-- Fáze lifecycle
ALTER TABLE batches ADD COLUMN current_phase TEXT DEFAULT 'plan';
-- 'plan' | 'preparation' | 'brewing' | 'fermentation' | 'conditioning' | 'packaging' | 'completed'

-- Timestamps per fáze
ALTER TABLE batches ADD COLUMN phase_history JSONB DEFAULT '{}';
-- { "plan": { "started_at": "...", "completed_at": "..." }, "brewing": { ... } }

-- Varný režim
ALTER TABLE batches ADD COLUMN brew_mode TEXT DEFAULT 'sheet';
-- 'sheet' | 'tracking'

-- Kvašení / Ležení plán
ALTER TABLE batches ADD COLUMN fermentation_days INTEGER;
ALTER TABLE batches ADD COLUMN conditioning_days INTEGER;
ALTER TABLE batches ADD COLUMN fermentation_start DATE;
ALTER TABLE batches ADD COLUMN conditioning_start DATE;
ALTER TABLE batches ADD COLUMN estimated_end DATE;

-- Equipment pro ležení (stávající equipment_id = kvasná nádoba)
ALTER TABLE batches ADD COLUMN conditioning_equipment_id UUID REFERENCES equipment(id);
```

### A2: Rozšíření tabulky `batch_steps`

Stávající tabulka je dobrý základ. Doplnit:

```sql
-- Rozlišení mash vs post-mash
ALTER TABLE batch_steps ADD COLUMN step_source TEXT DEFAULT 'recipe';
-- 'recipe' | 'system' — odkud krok pochází (mash profil vs brewing_system)

-- Ramp time (z UX-12)
ALTER TABLE batch_steps ADD COLUMN ramp_time_min INTEGER;

-- Hold time (přejmenování konceptuální — stávající time_min = hold time)
-- time_min zůstává (= hold/výdrž), ramp_time_min = náběh
-- Celkový čas kroku = ramp_time_min + time_min

-- Hop additions tracking (pro chmelovar)
ALTER TABLE batch_steps ADD COLUMN hop_additions JSONB;
-- [{ "item_name": "Premiant", "amount_g": 120, "add_at_min": 0, "actual_time": null, "confirmed": false }]
```

### A3: Rozšíření tabulky `batch_measurements`

Stávající tabulka je OK. Doplnit:

```sql
-- Přidat fázi kde měření vzniklo
ALTER TABLE batch_measurements ADD COLUMN phase TEXT;
-- 'brewing' | 'fermentation' | 'conditioning'

-- Přidat volume (pro zápisy objemů v průběhu vaření)
-- value_volume_l existuje? Pokud ne:
ALTER TABLE batch_measurements ADD COLUMN volume_l DECIMAL;
```

**Zkontrolovat:** Stávající sloupce `batch_measurements` — pokud `volume_l` a `phase` existují, ALTER nepotřeba. Viz SYSTEM-DESIGN.md — v originálu `volume_l` a `phase` nebyly, ale mohly být přidány v implementaci.

### A4: Tabulka `batch_lot_tracking` (tracking šarží — NOVÁ)

```sql
CREATE TABLE batch_lot_tracking (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL,               -- 'in' | 'out'
  item_id         UUID REFERENCES items(id),
  item_name       TEXT NOT NULL,               -- Denormalizováno pro rychlé zobrazení
  lot_number      TEXT,                        -- Číslo šarže suroviny / výstupní šarže
  amount          DECIMAL NOT NULL,
  unit            TEXT NOT NULL,               -- 'kg' | 'g' | 'l' | 'ks'
  receipt_id      UUID,                        -- Odkaz na skladový doklad (výdejka)
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_batch_lot_tenant ON batch_lot_tracking(tenant_id, batch_id);
```

### A5: TypeScript typy

**`src/modules/batches/types.ts`** — rozšířit:

```typescript
// Fáze batch lifecycle
export type BatchPhase =
  | "plan"
  | "preparation"
  | "brewing"
  | "fermentation"
  | "conditioning"
  | "packaging"
  | "completed";

// Povolené přechody fází
export const PHASE_TRANSITIONS: Record<BatchPhase, BatchPhase[]> = {
  plan: ["preparation"],
  preparation: ["brewing"],
  brewing: ["fermentation"],
  fermentation: ["conditioning"],
  conditioning: ["packaging"],
  packaging: ["completed"],
  completed: [], // Terminal
};

// Fáze metadata
export interface PhaseTimestamp {
  started_at: string | null;
  completed_at: string | null;
}

export type PhaseHistory = Partial<Record<BatchPhase, PhaseTimestamp>>;

// Brew step s ramp time
export interface BrewStep {
  id: string;
  stepType: string;
  brewPhase: string;          // 'mashing' | 'boiling' | 'post_boil'
  name: string;
  temperatureC: number | null;
  rampTimeMin: number | null; // Náběh
  timeMin: number | null;     // Výdrž (hold)
  autoSwitch: boolean;
  stepSource: "recipe" | "system";
  startTimePlan: string | null;
  startTimeReal: string | null;
  endTimeReal: string | null;
  actualDurationMin: number | null;
  hopAdditions: HopAddition[] | null;
  notes: string | null;
  sortOrder: number;
}

export interface HopAddition {
  itemName: string;
  amountG: number;
  addAtMin: number;          // Minut od začátku chmelovaru
  actualTime: string | null;
  confirmed: boolean;
}

// Lot tracking
export interface BatchLotEntry {
  id: string;
  direction: "in" | "out";
  itemId: string | null;
  itemName: string;
  lotNumber: string | null;
  amount: number;
  unit: string;
  receiptId: string | null;
  notes: string | null;
  createdAt: string;
}

// Batch detail rozšířený
export interface BatchLifecycle {
  batch: Batch;
  phase: BatchPhase;
  phaseHistory: PhaseHistory;
  brewSteps: BrewStep[];
  measurements: BatchMeasurement[];
  notes: BatchNote[];
  lotTracking: BatchLotEntry[];
  recipe: RecipeSnapshot | null;       // Snapshot receptury
  brewingSystem: BrewingSystem | null;
  exciseSummary: ExciseSummary | null;  // Souhrn daně
}
```

### A6: Drizzle schema aktualizace

**`drizzle/schema/batches.ts`** — přidat nové sloupce do `batches` table definition:
```typescript
currentPhase: text("current_phase").default("plan"),
phaseHistory: jsonb("phase_history").default({}),
brewMode: text("brew_mode").default("sheet"),
fermentationDays: integer("fermentation_days"),
conditioningDays: integer("conditioning_days"),
fermentationStart: date("fermentation_start"),
conditioningStart: date("conditioning_start"),
estimatedEnd: date("estimated_end"),
conditioningEquipmentId: uuid("conditioning_equipment_id").references(() => equipment.id),
```

Přidat novou tabulku `batchLotTracking` do schema.

**`drizzle/schema/batch-steps.ts`** — přidat:
```typescript
stepSource: text("step_source").default("recipe"),
rampTimeMin: integer("ramp_time_min"),
hopAdditions: jsonb("hop_additions"),
```

Spustit `npx drizzle-kit generate` a ověřit migraci.

### A7: Akceptační kritéria Fáze A

1. [ ] SQL migrace aplikována bez chyb
2. [ ] Drizzle schema synchronizováno
3. [ ] TypeScript typy rozšířeny (BatchPhase, BrewStep, BatchLotEntry, BatchLifecycle)
4. [ ] PHASE_TRANSITIONS definovány
5. [ ] Stávající batch CRUD nepoškozen (regresní test)
6. [ ] `npm run build` bez chyb

---

## FÁZE B: SPOLEČNÝ SHELL

### B1: Route struktura

**Nová route:** `/brewery/batches/[id]/brew`

```
src/app/[locale]/(dashboard)/brewery/batches/[id]/
  ├── page.tsx              ← Stávající BatchDetail (zachovat jako "Klasické zobrazení")
  └── brew/
      ├── page.tsx          ← Redirects to current phase
      ├── plan/page.tsx     ← F1
      ├── prep/page.tsx     ← F2
      ├── brewing/page.tsx  ← F3
      ├── ferm/page.tsx     ← F4
      ├── cond/page.tsx     ← F5
      ├── pack/page.tsx     ← F6
      └── done/page.tsx     ← F7
```

**`/brewery/batches/[id]/brew/page.tsx`:**
```typescript
// Server component — redirect na aktuální fázi
const batch = await getBatch(id);
redirect(`/brewery/batches/${id}/brew/${phaseToRoute(batch.currentPhase)}`);
```

**Helper:**
```typescript
const PHASE_ROUTES: Record<BatchPhase, string> = {
  plan: "plan",
  preparation: "prep",
  brewing: "brewing",
  fermentation: "ferm",
  conditioning: "cond",
  packaging: "pack",
  completed: "done",
};
```

### B2: BrewLayout — společný layout

**`src/app/[locale]/(dashboard)/brewery/batches/[id]/brew/layout.tsx`:**

Server component wrapper:
1. Načíst batch (včetně recipe, brewing_system)
2. Render `<BatchBrewShell>` s batch daty
3. `{children}` = obsah aktuální fáze

### B3: Komponenta `BatchBrewShell`

**`src/modules/batches/components/brew/BatchBrewShell.tsx`:**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ← Zpět na vary   [BeerGlass]  Var #45 — Ležák 13 na velikonoce    [Uložit] │
│                                Czech Premium Pale Lager                      │
│           OG 13.3°P | IBU 38 | EBC 10 | 120 L         Stav: Probíhá var    │
├──────────────────────────────────────────────────────────────────────────────┤
│  BatchPhaseBar                                                               │
│  ● Plán    ● Příprava    ◉ VAR    ○ Kvašení    ○ Ležení    ○ Stáčení    ○ ✓ │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                      [icons]│
│  {children}                                              Sidebar panel      │
│                                                          (kondicionálně)     │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Props:**
```typescript
interface BatchBrewShellProps {
  batch: Batch;
  recipe: RecipeSnapshot | null;
  brewingSystem: BrewingSystem | null;
  currentPhase: BatchPhase;
  phaseHistory: PhaseHistory;
  children: React.ReactNode;
}
```

### B4: Komponenta `BatchPhaseBar`

**`src/modules/batches/components/brew/BatchPhaseBar.tsx`:**

Horizontální stepper se 7 kroky.

```typescript
const PHASES: { key: BatchPhase; label: string; icon: LucideIcon; route: string }[] = [
  { key: "plan",          label: "Plán",      icon: ClipboardList, route: "plan" },
  { key: "preparation",   label: "Příprava",  icon: Package,       route: "prep" },
  { key: "brewing",       label: "Var",        icon: Flame,         route: "brewing" },
  { key: "fermentation",  label: "Kvašení",   icon: Droplets,      route: "ferm" },
  { key: "conditioning",  label: "Ležení",    icon: Beer,          route: "cond" },
  { key: "packaging",     label: "Stáčení",   icon: GlassWater,    route: "pack" },
  { key: "completed",     label: "Hotovo",    icon: CheckCircle2,  route: "done" },
];
```

**Stav každého kroku:**
- `completed` — zelená, kliknutelná
- `current` — accent barva, zvýrazněná
- `locked` — šedá, disabled (tooltip)

**Klik na completed → navigace na danou fázi** (read-only review mode, toast: "Zobrazujete historickou fázi").
Klik na locked → nic (tooltip: "Nejprve dokončete aktuální fázi").

### B5: Sidebar panely

**`src/modules/batches/components/brew/BrewSidebar.tsx`:**

Vertikální strip ikon na pravém okraji (jako v Bubble). Klik → otevře Sheet/Drawer z pravé strany.

```typescript
const SIDEBAR_PANELS = [
  { key: "recipe",     icon: ScrollText,  label: "Náhled receptu" },
  { key: "volumes",    icon: Droplets,    label: "Voda a objemy" },
  { key: "measured",   icon: Ruler,       label: "Naměřené hodnoty" },
  { key: "notes",      icon: StickyNote,  label: "Poznámky" },
  { key: "comparison", icon: BarChart3,   label: "Plán vs. skutečnost" },
  { key: "tracking",   icon: ArrowLeftRight, label: "Tracking šarží" },
  { key: "excise",     icon: Landmark,    label: "Spotřební daň" },
];
```

Použít shadcn `Sheet` (side="right"). Každý panel je samostatná komponenta:

- `SidebarRecipePreview` — kompaktní recept (slady %, chmele, kvasnice, rmutování)
- `SidebarVolumes` — pipeline: voda na vystírku, vyslazování, objemy po krocích
- `SidebarMeasured` — tabulka plán vs. skutečnost (objemy, OG, efektivita, ztráty)
- `SidebarNotes` — N poznámek (timestamp + text), formulář pro přidání
- `SidebarComparison` — tabulka všech kroků: plán/skutečný čas/odchylka
- `SidebarTracking` — viz Fáze G
- `SidebarExcise` — viz Fáze G

### B6: Server action — přechod fáze

**`src/modules/batches/actions.ts`** — přidat:

```typescript
export async function advanceBatchPhase(
  batchId: string,
  targetPhase: BatchPhase
): Promise<Batch> {
  return withTenant(async (tenantId) => {
    return db.transaction(async (tx) => {
      const batch = await loadBatch(tx, tenantId, batchId);
      const currentPhase = batch.currentPhase as BatchPhase;

      // Validace — pouze povolené přechody
      const allowed = PHASE_TRANSITIONS[currentPhase];
      if (!allowed.includes(targetPhase)) {
        throw new Error(`Cannot transition from ${currentPhase} to ${targetPhase}`);
      }

      // Aktualizovat phase_history
      const history = (batch.phaseHistory ?? {}) as PhaseHistory;
      if (history[currentPhase]) {
        history[currentPhase]!.completed_at = new Date().toISOString();
      }
      history[targetPhase] = {
        started_at: new Date().toISOString(),
        completed_at: null,
      };

      // Side effects dle přechodu
      const updates: Partial<typeof batches.$inferInsert> = {
        currentPhase: targetPhase,
        phaseHistory: history,
        updatedAt: sql`now()`,
      };

      // plan → preparation: žádné special effects (snapshot už existuje)
      // preparation → brewing: nastavit brew_date, generovat batch_steps
      if (targetPhase === "brewing") {
        updates.brewDate = sql`CURRENT_DATE`;
        await generateBrewSteps(tx, tenantId, batchId, batch);
      }
      // brewing → fermentation: nastavit fermentation_start
      if (targetPhase === "fermentation") {
        updates.fermentationStart = sql`CURRENT_DATE`;
      }
      // fermentation → conditioning: nastavit conditioning_start
      if (targetPhase === "conditioning") {
        updates.conditioningStart = sql`CURRENT_DATE`;
      }
      // packaging → completed: nastavit end_brew_date
      if (targetPhase === "completed") {
        updates.endBrewDate = sql`CURRENT_DATE`;
      }

      await tx.update(batches)
        .set(updates)
        .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)));

      return loadBatch(tx, tenantId, batchId);
    });
  });
}
```

### B7: Generování brew steps z receptury + brewing system

**`src/modules/batches/lib/generate-brew-steps.ts`:**

```typescript
export async function generateBrewSteps(
  tx: Transaction,
  tenantId: string,
  batchId: string,
  batch: BatchRow
): Promise<void> {
  // 1. Smazat stávající batch_steps pro tento batch
  await tx.delete(batchSteps)
    .where(and(eq(batchSteps.tenantId, tenantId), eq(batchSteps.batchId, batchId)));

  // 2. Načíst rmutovací kroky z recipe_steps (kde step_type IN mash types)
  const mashStepTypes = ["mash_in", "rest", "heat", "decoction", "mash_out"];
  const recipeStepRows = await tx.select().from(recipeSteps)
    .where(and(
      eq(recipeSteps.tenantId, tenantId),
      eq(recipeSteps.recipeId, batch.recipeId!),
      inArray(recipeSteps.stepType, mashStepTypes)
    ))
    .orderBy(asc(recipeSteps.sortOrder));

  // 3. Načíst brewing system časy
  const system = batch.brewingSystemId
    ? await loadBrewingSystem(tx, tenantId, batch.brewingSystemId)
    : null;

  const steps: NewBatchStep[] = [];
  let sortOrder = 0;
  let cumulativeMin = 0;
  const brewStart = batch.plannedDate ? new Date(`${batch.plannedDate}T${batch.plannedTime ?? "08:00"}`) : new Date();

  // 4. Příprava (z brewing_system)
  if (system?.timePreparation) {
    steps.push({
      tenantId, batchId, sortOrder: ++sortOrder,
      stepType: "preparation",
      brewPhase: "preparation",
      name: "Příprava",
      temperatureC: "20",
      timeMin: system.timePreparation,
      rampTimeMin: 0,
      stepSource: "system",
      startTimePlan: addMinutes(brewStart, cumulativeMin).toISOString(),
    });
    cumulativeMin += system.timePreparation;
  }

  // 5. Rmutovací kroky (z receptury)
  for (const rs of recipeStepRows) {
    const ramp = rs.rampTimeMin ?? 0;
    const hold = rs.timeMin ?? 0;
    steps.push({
      tenantId, batchId, sortOrder: ++sortOrder,
      stepType: rs.stepType,
      brewPhase: "mashing",
      name: rs.name,
      temperatureC: rs.temperatureC,
      timeMin: hold,
      rampTimeMin: ramp,
      stepSource: "recipe",
      autoSwitch: rs.stepType === "rest",  // Prodlevy = auto, ohřevy = manual
      startTimePlan: addMinutes(brewStart, cumulativeMin).toISOString(),
    });
    cumulativeMin += ramp + hold;
  }

  // 6. Post-mash kroky (z brewing_system)
  const postMashSteps: Array<{
    stepType: string; brewPhase: string; name: string;
    tempC: string | null; timeMin: number; info?: string;
  }> = [
    {
      stepType: "lautering", brewPhase: "boiling", name: "Scezování",
      tempC: "70", timeMin: system?.timeLautering ?? 60,
    },
    {
      stepType: "heat_to_boil", brewPhase: "boiling", name: "Ohřev na chmelovar",
      tempC: "100", timeMin: 30,  // Hardcoded, závisí na varně
    },
    {
      stepType: "boil", brewPhase: "boiling", name: "Chmelovar",
      tempC: "100", timeMin: getBoilTimeFromRecipe(batch), // Z receptury
    },
    {
      stepType: "whirlpool", brewPhase: "post_boil", name: "Whirlpool a chlazení",
      tempC: null, timeMin: system?.timeWhirlpool ?? 90,
    },
    {
      stepType: "transfer", brewPhase: "post_boil", name: "Přesun na kvašení",
      tempC: null, timeMin: system?.timeTransfer ?? 15,
    },
    {
      stepType: "cleanup", brewPhase: "post_boil", name: "Úklid",
      tempC: null, timeMin: system?.timeCleanup ?? 60,
    },
  ];

  for (const pm of postMashSteps) {
    const step: NewBatchStep = {
      tenantId, batchId, sortOrder: ++sortOrder,
      stepType: pm.stepType,
      brewPhase: pm.brewPhase,
      name: pm.name,
      temperatureC: pm.tempC,
      timeMin: pm.timeMin,
      rampTimeMin: 0,
      stepSource: "system",
      startTimePlan: addMinutes(brewStart, cumulativeMin).toISOString(),
    };

    // Pro chmelovar: přidat hop additions z recipe_items
    if (pm.stepType === "boil") {
      step.hopAdditions = await getHopAdditionsForBatch(tx, tenantId, batch.recipeId!);
    }

    steps.push(step);
    cumulativeMin += pm.timeMin;
  }

  // 7. Bulk insert
  if (steps.length > 0) {
    await tx.insert(batchSteps).values(steps);
  }

  // 8. Aktualizovat celkový čas na batch
  // (volitelně — zobrazit v UI z batch_steps)
}
```

### B8: Akceptační kritéria Fáze B

1. [ ] Route `/brewery/batches/[id]/brew` existuje a redirect na aktuální fázi
2. [ ] Route pro každou fázi (plan/prep/brewing/ferm/cond/pack/done)
3. [ ] `BatchBrewShell` — záhlaví + process bar + sidebar strip
4. [ ] `BatchPhaseBar` — 7 kroků, completed/current/locked stavy
5. [ ] Klik na completed fázi → navigace
6. [ ] 7 sidebar panelů (Sheet from right) s placeholder obsahem
7. [ ] `advanceBatchPhase()` — validovaný přechod s phase_history
8. [ ] `generateBrewSteps()` — mash z receptury + post-mash z brewing_system
9. [ ] Stávající `/brewery/batches/[id]` (klasický view) zachován
10. [ ] Odkaz "Řízení varu →" na klasickém detailu → `/brew`
11. [ ] Odkaz "Klasické zobrazení" v brew shellu → zpět na `/brewery/batches/[id]`
12. [ ] `npm run build` bez chyb

---

## FÁZE C: F1 PLÁN + F2 PŘÍPRAVA

### C1: F1 — Plán

**`src/modules/batches/components/brew/phases/PlanPhase.tsx`**

Tři sloupce (responsive: stack na mobile):

**Sloupec 1 — Receptura:**
- Název receptury (link na recept)
- Preview: OG, IBU, EBC, ABV, objem
- Slady (seznam s %)
- Chmele (seznam s g a čas)
- Kvasnice
- Odkaz "Upravit recepturu →" (pokud fáze = plan)

**Sloupec 2 — Časový plán:**
- Plánovaný datum + čas zahájení (editovatelný pokud current_phase = plan)
- Odhad rmutování (min) — z recipe_steps
- Odhad var celkem (min) — z recipe_steps + brewing_system times
- Kvašení (dny): input [default z receptury/kvasnice]
- Ležení (dny): input
- Odhadovaný konec: auto-calculated

**Sloupec 3 — Nádoby:**
- Kvasná nádoba: select z volných equipment (fermenter/conditioning)
- Ležácká nádoba: select z volných equipment
- Stav nádob: mini list (Tank X: Volný/Obsazený)

**Tlačítko:** `[Zahájit přípravu →]` → `advanceBatchPhase(id, "preparation")`

### C2: F2 — Příprava

**`src/modules/batches/components/brew/phases/PrepPhase.tsx`**

Dva sloupce:

**Sloupec 1 — Suroviny a sklad:**

Tabulka surovin z snapshot receptury:

| Položka | Recept | Sklad | Δ | Akce |
|---------|--------|-------|---|------|
| **Slad** | | | | |
| Český světlý | 21.2 kg | 259 kg | ✅ | |
| Vídeňský | 6.1 kg | 27 kg | ✅ | |
| **Chmel** | | | | |
| Žatecký červ. | 0.39 kg | 390 kg | ✅ | |
| **Kvasnice** | | | | |
| Saflager S-189 | 100 g | 0 g | 🔴 | |

Barva: `amount >= recipe` → zelená, jinak červená.

Tlačítko `[Vydat suroviny]`:
- Dialog s potvrzením
- Vytvoří skladový doklad (výdejka) s vazbou na batch
- Zapíše do `batch_lot_tracking` (direction = 'in')
- Tlačítko disabled pokud suroviny už vydány (status check)

**Sloupec 2 — Voda a objemy + Kroky vaření preview:**

Horní sekce: Pipeline z brewing_system kalkulace.

Dolní sekce: Preview kroků (readonly tabulka z recipe_steps + brewing_system):
```
# | Krok | °C | Čas
1   Příprava     20   30 min
2   Ohřev        52   20 min
3   Prodleva     52   10 min
...
    Celkem:          476 min (7h 56min)
```

**Tlačítko:** `[Zahájit var →]` → `advanceBatchPhase(id, "brewing")`
- Potvrzovací dialog: "Zahájit vaření? Kroky vaření budou vygenerovány."

### C3: Akceptační kritéria Fáze C

1. [ ] F1 Plán: tři sloupce (receptura, čas, nádoby)
2. [ ] F1: editace plánovaného data/času, kvašení/ležení dnů
3. [ ] F1: výběr nádob (select z volných)
4. [ ] F1: tlačítko "Zahájit přípravu" → přechod na F2
5. [ ] F2 Příprava: tabulka surovin vs. sklad (barevné indikátory)
6. [ ] F2: tlačítko "Vydat suroviny" → výdejka + lot tracking
7. [ ] F2: preview kroků vaření a objemů
8. [ ] F2: tlačítko "Zahájit var" → generování batch_steps + přechod na F3
9. [ ] Zamykání: v F2 nelze editovat F1 pole (plán je readonly v přípravě)
10. [ ] `npm run build` bez chyb

---

## FÁZE D: F3 — VARNÝ LIST (STATICKÝ REŽIM)

### D1: Struktura stránky

**`src/modules/batches/components/brew/phases/BrewingPhase.tsx`**

Hlavní obsah = varný list. Vertikální scroll, sekce oddělené horizontálními čarami.

### D2: Sekce — Kroky vaření

Tabulka `batch_steps` filtrovaná na brew_phase IN ('preparation', 'mashing', 'boiling', 'post_boil').

```
┌────┬──────────────────────┬────────┬──────────┬──────────┬──────┬──────────────┐
│ #  │ Krok                 │ Cíl °C │ Plán min │ Skut min │  Δ   │ Poznámka     │
├────┼──────────────────────┼────────┼──────────┼──────────┼──────┼──────────────┤
│  1 │ Příprava             │   20   │    30    │ [    ]   │      │              │
│  2 │ Ohřev Vystírka       │   52   │    20    │ [    ]   │      │              │
│  3 │ Prodleva Vystírka    │   52   │    10    │ [    ]   │      │              │
│  4 │ Ohřev Nižší cukr     │   63   │    15    │ [    ]   │      │              │
│  5 │ Prodleva Nižší cukr  │   63   │    25    │ [    ]   │      │              │
│ ...│                      │        │          │          │      │              │
│ 12 │ Chmelovar            │  100   │    90    │ [    ]   │      │              │
│ 13 │ Whirlpool + chlazení │        │    90    │ [    ]   │      │              │
│ 14 │ Přesun na kvašení    │        │    15    │ [    ]   │      │              │
│ 15 │ Úklid                │        │    60    │ [    ]   │      │              │
├────┴──────────────────────┴────────┴──────────┴──────────┴──────┴──────────────┤
│ Celkem:                              476 min    [    ] min  [Δ]               │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Interakce:**
- Sloupec "Skut min" = input (number), editovatelný
- Sloupec Δ = auto-calculated (skutečnost - plán), zelená pokud ≤0, červená pokud >0
- Vizuální oddělovače mezi fázemi (Rmutování / Scezování / Chmelovar / Whirlpool)
- Auto-save na blur (debounce 500ms) → `updateBatchStep(stepId, { actualDurationMin })`

### D3: Sekce — Chmelovar timer

Zobrazit jen pokud existuje krok stepType = "boil".

```
┌─── CHMELENÍ ──────────────────────────────────────────────────────────┐
│                                                                       │
│  ⏱️ Chmelovar stopky: [▶ Start]  00:00:00                            │
│                                                                       │
│  Chmel          │ Množství │ Přidat v min │ Skutečný čas │ ✓         │
│  ───────────────┼──────────┼──────────────┼──────────────┼────       │
│  Premiant       │  120 g   │   0 (start)  │ [         ]  │ ☐        │
│  Žatecký červ.  │  100 g   │  45           │ [         ]  │ ☐        │
│  Žatecký červ.  │  100 g   │  80 (10→konce)│ [         ]  │ ☐        │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

**Stopky:**
- Client-side timer (useState + setInterval)
- Tlačítko ▶ Start / ⏸ Pause / ⏹ Stop
- Při "Potvrdit" (☑) = zapsat `actualTime` na hop addition
- Countdown mode: odpočet od celkového chmelovaru (90:00 → 0:00)
- **Zvukový alarm:** 2 min před každým přidáním chmele (browser Notification API + Audio)

### D4: Sekce — Stopky

Tři nezávislé stopky (client-side):

```
┌─── STOPKY ────────────────────────────────────────────────────────────┐
│  [▶] Celkové:      00:00:00     [▶] Prodleva:   00:00:00            │
│  [▶] Chmelovar:    00:00:00                                          │
└───────────────────────────────────────────────────────────────────────┘
```

Komponenta `BrewTimer`:
```typescript
interface BrewTimerProps {
  label: string;
  onTick?: (seconds: number) => void;
}
```

### D5: Sekce — Měření

```
┌─── MĚŘENÍ ────────────────────────────────────────────────────────────┐
│                              Plán        Skutečnost                    │
│  Voda na vystírku (L)       106.1       [         ]                   │
│  Voda na vyslazování (L)     74.0       [         ]                   │
│  Objem před chmelov. (L)    149.8       [         ]                   │
│  Objem po chmelovaru (L)    134.8       [         ]                   │
│  Objem při zakvašení (L)    120.0       [         ]                   │
│  Hustota (°P)                13.3       [         ]                   │
│  Efektivita varny (%)        71.0       [  auto   ]                   │
│  Ztráta chmelovar (%)        10.0       [  auto   ]                   │
│  Ztráta whirlpool (%)        11.0       [  auto   ]                   │
└───────────────────────────────────────────────────────────────────────┘
```

"Plán" = z recipe calculation.
"Skutečnost" = input fields → ukládá do `batch_measurements` (measurement_type + value).
Efektivita, ztráty = auto-calculated z objemů a hustoty.

**Server action:**
```typescript
export async function saveBatchMeasurements(
  batchId: string,
  measurements: Array<{ type: string; value: number }>
): Promise<void>
```

### D6: Akce — přechod na kvašení

Tlačítko dole: `[Ukončit var — přejít na kvašení →]`

Potvrzovací dialog:
- "Vyplňte naměřené hodnoty před ukončením:"
- OG skutečnost (povinné)
- Objem do kvasné (povinné)
- `[Uložit a přejít na Kvašení]`

→ Uloží měření → `advanceBatchPhase(id, "fermentation")`

### D7: Akceptační kritéria Fáze D

1. [ ] Tabulka kroků vaření: plán vs. skutečnost, Δ, vizuální oddělovače
2. [ ] Editovatelné skutečné časy, auto-save
3. [ ] Chmelovar timer: stopky, hop additions s potvrzením
4. [ ] 3 nezávislé stopky (celkové, prodleva, chmelovar)
5. [ ] Sekce měření: plán vs. skutečnost, auto-calc efektivita/ztráty
6. [ ] Potvrzovací dialog při přechodu na kvašení (OG, objem povinné)
7. [ ] Hop additions uloženy do batch_steps.hop_additions JSONB
8. [ ] `npm run build` bez chyb

---

## FÁZE E: F4 KVAŠENÍ + F5 LEŽENÍ

### E1: Sdílená komponenta `FermentationPhase`

F4 i F5 mají stejnou strukturu, liší se jen labely a parametry.

**`src/modules/batches/components/brew/phases/FermentCondPhase.tsx`:**

```typescript
interface FermentCondPhaseProps {
  phase: "fermentation" | "conditioning";
  batch: Batch;
  equipment: Equipment | null;  // Přiřazená nádoba
  measurements: BatchMeasurement[];
  startDate: Date;
  plannedDays: number;
}
```

### E2: Layout

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Nádoba: Tank 1 (300L)     Kvasnice: Saflager S-189                        │
│  Zahájení: 1.3.2026        Plán: 7 dní → konec 8.3.2026                    │
│  Den: 3 / 7                                                                 │
│  [════════════●══════════════]                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Datum     │ Čas   │ Teplota °C │ Hustota °P │ pH   │ Pozn.     │ Akce     │
│  ──────────┼───────┼────────────┼────────────┼──────┼───────────┼──────    │
│  1.3.2026  │ 22:00 │  12.0      │  12.8      │      │ Zakvašení │ ✏️ 🗑️  │
│  2.3.2026  │ 08:00 │  12.5      │  12.1      │      │           │ ✏️ 🗑️  │
│  3.3.2026  │ 08:00 │  12.8      │   8.2      │ 4.3  │ Snížit t  │ ✏️ 🗑️  │
│                                                                              │
│  [+ Přidat měření]                                                           │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  [Přejít na ležení →]    nebo    [Přejít na stáčení →]                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### E3: Inline přidání měření

Dialog nebo inline row:
- Datum/čas (default: now)
- Teplota (°C)
- Hustota (°P)
- pH (volitelné)
- Poznámka

→ `createBatchMeasurement(batchId, { phase, measuredAt, temperatureC, gravityPlato, ph, notes })`

### E4: Progress bar

```typescript
const currentDay = daysBetween(startDate, now);
const progress = Math.min(currentDay / plannedDays * 100, 100);
const isOverdue = currentDay > plannedDays;
```

Barva: zelená pokud `currentDay <= plannedDays`, červená pokud překročeno.

### E5: Akceptační kritéria Fáze E

1. [ ] F4 Kvašení: info o nádobě, kvasnicích, progress bar
2. [ ] F4: tabulka měření (CRUD), inline přidání
3. [ ] F4: tlačítko přechodu na F5 (ležení)
4. [ ] F5 Ležení: stejná struktura jako F4
5. [ ] F5: tlačítko přechodu na F6 (stáčení)
6. [ ] Měření ukládána do batch_measurements s phase
7. [ ] `npm run build` bez chyb

---

## FÁZE F: F6 STÁČENÍ + F7 UKONČENO

### F1: F6 — Stáčení

Stávající modul stáčení zachovat. Zasadit do brew shellu:

- Zobrazit process bar v záhlaví
- Stávající stáčecí UI jako children
- Po dokončení stáčení → `advanceBatchPhase(id, "completed")`
- Výstupní šarže zapsat do `batch_lot_tracking` (direction = 'out')

### F2: F7 — Ukončeno

**`src/modules/batches/components/brew/phases/CompletedPhase.tsx`**

Tři sekce:

**Sekce 1 — Souhrn (recept vs. skutečnost):**

| Parametr | Recept | Skutečnost | Δ |
|----------|--------|------------|---|
| OG (°P) | 13.3 | 12.8 | -0.5 |
| FG (°P) | 3.3 | 3.1 | -0.2 |
| ABV (%) | 5.2 | 5.0 | -0.2 |
| IBU | 38 | 35 | -3 |
| EBC | 10 | 9 | -1 |
| Objem (L) | 120 | 125 | +5 |
| Efektivita (%) | 71.0 | 69.7 | -1.3 |

Barva Δ: zelená pokud |Δ| < threshold, červená jinak.

**Sekce 2 — Doporučené úpravy konstant:**

Pokud |Δ efektivita| > 2% nebo |Δ ztráta| > 2%:

```
⚠️ Efektivita varny: recept 71%, skutečnost 69.7%.
   Doporučení: nastavit efektivitu na 70% pro příští vaření.
   [Aplikovat na varní soustavu]
```

Tlačítko → `updateBrewingSystem(systemId, { efficiencyPct: newValue })` s potvrzením.

**Sekce 3 — Finance:**
- Náklady suroviny (z recipe calculation × actual amounts)
- Na litr
- Výnosy (z prodejů navázaných na batch — pokud existují)

**Akce:**
- `[Export PDF]` — post-MVP
- `[Duplikovat var]` — createBatch s kopií receptury
- `[Archivovat]` — batch.status = 'completed' (redundantní, ale explicitní)

### F3: Akceptační kritéria Fáze F

1. [ ] F6: stávající stáčecí modul zasazen do brew shellu
2. [ ] F6: po stáčení → přechod na F7, lot tracking (out)
3. [ ] F7: tabulka recept vs. skutečnost s Δ
4. [ ] F7: doporučené úpravy konstant (efektivita, ztráty)
5. [ ] F7: tlačítko "Aplikovat na varní soustavu"
6. [ ] F7: finance sekce (náklady, na litr)
7. [ ] `npm run build` bez chyb

---

## FÁZE G: TRACKING ŠARŽÍ + SPOTŘEBNÍ DAŇ SIDEBAR

### G1: Sidebar — Tracking šarží

**`src/modules/batches/components/brew/sidebar/SidebarTracking.tsx`**

Dva sekce:

**VSTUP (suroviny):**
Z `batch_lot_tracking` WHERE direction = 'in':

| Surovina | Množství | Šarže | Doklad |
|----------|----------|-------|--------|
| Český světlý | 21.2 kg | S-0045 | VYD-2026-012 |
| Vídeňský | 6.1 kg | S-0078 | VYD-2026-012 |
| ... | | | |

**VÝSTUP (pivo):**
Z `batch_lot_tracking` WHERE direction = 'out':

| Produkt | Množství | Šarže | Doklad |
|---------|----------|-------|--------|
| Ležák 13 — sud 50L | 2 ks | L-2026-045 | STA-2026-003 |
| Ležák 13 — lahev 0.5L | 50 ks | L-2026-045 | STA-2026-003 |

**Zápis vstupních šarží:**
Při výdeji surovin (F2 "Vydat suroviny"):
- Pro každou surovinu: najít lot_number z FIFO (stock_lots tabulka)
- Zapsat do batch_lot_tracking

**Zápis výstupních šarží:**
Při stáčení (F6):
- Pro každý výstupní produkt: zapsat do batch_lot_tracking
- lot_number = batch lot (generovaný z batche)

### G2: Sidebar — Spotřební daň

**`src/modules/batches/components/brew/sidebar/SidebarExcise.tsx`**

```
┌─── Spotřební daň ────────────────────────┐
│                                           │
│  Plánovaná daň:       1,680 Kč           │
│  Aktuální daň:        1,575 Kč           │
│  Rozdíl:               -105 Kč           │
│                                           │
│  ─── Pohyby ───────────────────────────  │
│                                           │
│  F3 Var:                                  │
│  + Příjem do skladu    120.0 L  1,680 Kč │
│  - Ztráta chmelovar     -5.0 L   -70 Kč │
│  - Ztráta whirlpool     -2.0 L   -28 Kč │
│                                           │
│  F4 Kvašení:                              │
│  - Ztráta kvašením      -3.0 L   -42 Kč │
│                                           │
│  F5 Ležení:                               │
│  - Ztráta ležením       -2.0 L   -28 Kč │
│                                           │
│  ─── Aktuální stav ─────────────────────  │
│  V daňovém skladu:    108.0 L            │
│  Daňová povinnost:    1,512 Kč           │
│                                           │
│  [Detail pohybů →]                        │
└───────────────────────────────────────────┘
```

**Logika:**
- Načíst excise movements navázané na batch (existující tabulka `excise_movements`)
- Sečíst příjmy a odpisy
- Vypočítat aktuální daňovou povinnost
- Sazba: z `excise_rates` tabulky (existující)

**Automatické excise movements:**
Při zápisu ztrát (objemy v měření F3-F5) automaticky generovat excise movement:
- `movement_type = 'loss'`
- `volume_hl` = ztráta v hl
- `batch_id` = aktuální batch
- Jen pro `is_excise_relevant` sklady

### G3: Server actions

```typescript
// Lot tracking
export async function getBatchLotTracking(batchId: string): Promise<BatchLotEntry[]>
export async function addBatchLotEntry(batchId: string, data: CreateLotEntryInput): Promise<BatchLotEntry>

// Excise pro batch
export async function getBatchExciseSummary(batchId: string): Promise<ExciseSummary>

interface ExciseSummary {
  plannedTaxCzk: number;
  currentTaxCzk: number;
  diffCzk: number;
  movements: ExciseMovement[];
  currentVolumeHl: number;
}
```

### G4: Akceptační kritéria Fáze G

1. [ ] Sidebar Tracking: vstupní šarže (suroviny s lot čísly)
2. [ ] Sidebar Tracking: výstupní šarže (pivo)
3. [ ] batch_lot_tracking tabulka s CRUD
4. [ ] Automatický zápis lot entries při výdeji surovin (F2)
5. [ ] Automatický zápis lot entries při stáčení (F6)
6. [ ] Sidebar Excise: plánovaná/aktuální daň, pohyby
7. [ ] Automatické excise movements při zápisu ztrát
8. [ ] Excise sidebar dostupný z každé fáze
9. [ ] `npm run build` bez chyb

---

## i18n

### CS — `batches.json` rozšíření:

```json
{
  "brew": {
    "title": "Řízení varu",
    "classicView": "Klasické zobrazení",
    "brewView": "Řízení varu",
    "phases": {
      "plan": "Plán",
      "preparation": "Příprava",
      "brewing": "Var",
      "fermentation": "Kvašení",
      "conditioning": "Ležení",
      "packaging": "Stáčení",
      "completed": "Hotovo"
    },
    "viewingHistorical": "Zobrazujete historickou fázi",
    "phaseLocked": "Nejprve dokončete aktuální fázi",
    "plan": {
      "recipe": "Receptura",
      "schedule": "Časový plán",
      "vessels": "Nádoby",
      "plannedStart": "Plánované zahájení",
      "estimatedMashing": "Odhad rmutování",
      "estimatedTotal": "Odhad celkem",
      "fermentationDays": "Kvašení (dny)",
      "conditioningDays": "Ležení (dny)",
      "estimatedEnd": "Odhadovaný konec",
      "startPrep": "Zahájit přípravu",
      "selectVessel": "Vyber nádobu",
      "vesselFree": "Volný",
      "vesselOccupied": "Obsazený"
    },
    "prep": {
      "ingredients": "Suroviny a sklad",
      "volumesPreview": "Voda a objemy",
      "stepsPreview": "Kroky vaření",
      "issueIngredients": "Vydat suroviny",
      "ingredientsIssued": "Suroviny vydány",
      "startBrewing": "Zahájit var",
      "confirmStartBrewing": "Zahájit vaření? Kroky vaření budou vygenerovány.",
      "stockSufficient": "Na skladě dostatečné množství",
      "stockInsufficient": "Na skladě nedostatečné množství"
    },
    "brewing": {
      "brewSheet": "Varný list",
      "onlineTracking": "Online tracking",
      "steps": "Kroky vaření",
      "stepName": "Krok",
      "targetTemp": "Cíl °C",
      "plannedMin": "Plán min",
      "actualMin": "Skut min",
      "delta": "Δ",
      "totalTime": "Celkem",
      "hopTimer": "Chmelení",
      "hopTimerStart": "Spustit stopky chmelovaru",
      "confirmHop": "Potvrdit přidání",
      "timers": "Stopky",
      "timerTotal": "Celkové",
      "timerRest": "Prodleva",
      "timerBoil": "Chmelovar",
      "measurements": "Měření",
      "planned": "Plán",
      "actual": "Skutečnost",
      "efficiency": "Efektivita varny",
      "finishBrewing": "Ukončit var — přejít na kvašení",
      "confirmFinish": "Vyplňte naměřené hodnoty před ukončením",
      "ogRequired": "OG skutečnost je povinné",
      "volumeRequired": "Objem do kvasné je povinný"
    },
    "fermentation": {
      "vessel": "Nádoba",
      "yeast": "Kvasnice",
      "started": "Zahájení",
      "day": "Den",
      "addMeasurement": "Přidat měření",
      "temperature": "Teplota (°C)",
      "gravity": "Hustota (°P)",
      "moveToConditioning": "Přesun na ležení",
      "moveToPackaging": "Přesun na stáčení"
    },
    "completed": {
      "summary": "Souhrn varu",
      "recipeVsActual": "Recept vs. skutečnost",
      "suggestedChanges": "Doporučené úpravy konstant",
      "applyToSystem": "Aplikovat na varní soustavu",
      "applyConfirm": "Aktualizovat varní soustavu s naměřenými hodnotami?",
      "finance": "Finance",
      "ingredientCost": "Náklady suroviny",
      "costPerLiter": "Na litr",
      "duplicateBatch": "Duplikovat var"
    },
    "sidebar": {
      "recipePreview": "Náhled receptu",
      "volumes": "Voda a objemy",
      "measured": "Naměřené hodnoty",
      "notes": "Poznámky",
      "comparison": "Plán vs. skutečnost",
      "tracking": "Tracking šarží",
      "excise": "Spotřební daň",
      "inputLots": "Vstupní šarže (suroviny)",
      "outputLots": "Výstupní šarže (pivo)",
      "plannedTax": "Plánovaná daň",
      "currentTax": "Aktuální daň",
      "exciseMovements": "Pohyby",
      "exciseCurrentVolume": "V daňovém skladu"
    }
  }
}
```

EN — odpovídající překlady.

---

## IMPLEMENTAČNÍ POŘADÍ

```
Fáze A (schema + typy)          — prerekvizita všeho
  ↓
Fáze B (shell + routing)        — prerekvizita UI
  ↓
Fáze C (F1 + F2)                — lze paralelně s D
  ↓
Fáze D (F3 varný list)          — jádro systému
  ↓
Fáze E (F4 + F5)                — jednodušší, rychlé
  ↓
Fáze F (F6 integrace + F7)      — finalizace
  ↓
Fáze G (tracking + excise)      — sidebary, propojení
```

Doporučení: **A → B → D → C → E → F → G** (začít jádrem — varný list, pak doplnit plán/přípravu).

---

## SOUHRNNÁ AKCEPTAČNÍ KRITÉRIA

### Funkční
1. [ ] 7 fází batch lifecycle s process barem
2. [ ] Přechody mezi fázemi s validací a side effects
3. [ ] F1 Plán: receptura, čas, nádoby
4. [ ] F2 Příprava: suroviny vs. sklad, výdej, preview kroků
5. [ ] F3 Varný list: kroky, stopky, chmelovar timer, měření
6. [ ] F4/F5: záznamy měření, progress bar
7. [ ] F6: stávající stáčení zasazeno do procesu
8. [ ] F7: souhrn recept vs. skutečnost, doporučené úpravy, finance
9. [ ] 7 sidebar panelů (recept, objemy, měření, poznámky, porovnání, tracking, excise)
10. [ ] Tracking šarží: vstup (suroviny) + výstup (pivo)
11. [ ] Spotřební daň sidebar s automatickými odpisy ztrát
12. [ ] Zpětný návrat do dokončených fází (editace historických údajů)
13. [ ] Stávající BatchDetail zachován jako "Klasické zobrazení"

### Technické
14. [ ] DB migrace (batches rozšíření, batch_lot_tracking)
15. [ ] Drizzle schema sync
16. [ ] generateBrewSteps() z receptury + brewing_system
17. [ ] advanceBatchPhase() s validací a side effects
18. [ ] i18n: cs + en kompletní
19. [ ] `npm run build` bez chyb
20. [ ] TypeScript: zero errors

---

*Implementační zadání schváleno. Referenční koncept: outputs/batch-brew-management-concept.md*
