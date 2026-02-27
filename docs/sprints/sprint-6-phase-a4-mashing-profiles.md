# SPRINT 6 — FÁZE A4: RMUTOVACÍ PROFILY (Mashing Profiles CRUD)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 27.02.2026

---

## CÍL

Přidat kompletní CRUD pro rmutovací profily — browser, detail, editor kroků. Pivovar si musí umět vytvořit vlastní rmutovací profily (šablony) a editovat kroky (teplota, čas, typ). Systémové profily (tenant_id = NULL) zůstávají readonly.

**Závisí na:** Sprint 2 (stávající mashing_profiles tabulka + applyMashProfile akce)

---

## KONTEXT

### Co máme (Sprint 2)

- Tabulka `mashing_profiles` — 4 systémové profily s JSONB kroky
- Akce `applyMashProfile()` — načte profil do recipe_steps
- UI: "Načíst rmutovací profil" tlačítko na tabu Postup v receptuře
- Kroky: `[{name, temperature, time, type}]` kde type = mash_in | rest | decoction | mash_out

### Co chceme

- **Browser profilů** — přehled systémových + vlastních profilů
- **Detail profilu** — editace názvu, typu rmutování, popisu a interaktivní editor kroků
- **Editor kroků** — přidávání/editace/mazání/řazení kroků s teplotou a časem
- **Vizuální preview** — teplotní graf rmutovacího procesu (nice-to-have)
- **Vytváření z receptury** — "Uložit kroky jako profil" na receptuře

---

## KROK 1: SCHEMA ROZŠÍŘENÍ

### 1.1 Nové sloupce na mashing_profiles

```sql
ALTER TABLE mashing_profiles ADD COLUMN mashing_type TEXT;       -- 'infusion' | 'decoction' | 'step'
ALTER TABLE mashing_profiles ADD COLUMN description TEXT;         -- Delší popis profilu
ALTER TABLE mashing_profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
ALTER TABLE mashing_profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
```

**Drizzle schema** (`drizzle/schema/recipes.ts`) — rozšířit:

```typescript
export const mashingProfiles = pgTable("mashing_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),  // NULL = systémový
  name: text("name").notNull(),
  mashingType: text("mashing_type"),        // 'infusion' | 'decoction' | 'step'
  description: text("description"),          // Delší popis
  steps: jsonb("steps").notNull(),           // Array of MashStep
  notes: text("notes"),                      // Krátká poznámka
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
```

### 1.2 RLS aktualizace

Aktuální RLS musí umožnit:
- **READ:** systémové (tenant_id IS NULL) + vlastní (tenant_id = current_tenant)
- **WRITE:** pouze vlastní (tenant_id = current_tenant)

```sql
-- Pokud RLS na mashing_profiles ještě neexistuje:
ALTER TABLE mashing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY mashing_profiles_read ON mashing_profiles
  FOR SELECT USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

CREATE POLICY mashing_profiles_write ON mashing_profiles
  FOR ALL USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  ) WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  );
```

**⚠️ POZOR:** Ověřit jestli RLS na mashing_profiles už existuje (z Sprint 2). Pokud ano, upravit stávající policy. Pokud ne, vytvořit novou.

### 1.3 Migrace

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### 1.4 Aktualizace systémových profilů

Přidat `mashing_type` na existující systémové profily:

```sql
UPDATE mashing_profiles SET mashing_type = 'infusion' WHERE name = 'Jednokvasný infuzní';
UPDATE mashing_profiles SET mashing_type = 'infusion' WHERE name = 'Dvourastový infuzní';
UPDATE mashing_profiles SET mashing_type = 'decoction' WHERE name LIKE 'Český dekokční%';
```

---

## KROK 2: TYPES

### 2.1 `src/modules/mashing-profiles/types.ts` (nový modul)

```typescript
export type MashingType = "infusion" | "decoction" | "step";

export type MashStepType = "mash_in" | "rest" | "decoction" | "mash_out";

export interface MashStep {
  name: string;
  temperature: number;    // °C
  time: number;           // minuty
  type: MashStepType;
  notes?: string;
}

export interface MashingProfile {
  id: string;
  tenantId: string | null;
  name: string;
  mashingType: MashingType | null;
  description: string | null;
  steps: MashStep[];
  notes: string | null;
  isActive: boolean;
  isSystem: boolean;       // computed: tenantId === null
  createdAt: Date;
  updatedAt: Date;
}
```

---

## KROK 3: BACKEND ACTIONS

### 3.1 `src/modules/mashing-profiles/actions.ts`

```typescript
"use server"

// === LIST ===
export async function getMashingProfiles(): Promise<MashingProfile[]>
// Vrací: systémové (tenant_id NULL) + tenant vlastní
// Řazení: systémové první (sort by name), pak vlastní (sort by name)
// Filtr: is_active = true (nebo all pokud parametr)

// === DETAIL ===
export async function getMashingProfile(id: string): Promise<MashingProfile | null>
// Vrací profil pokud je systémový NEBO patří tenantovi

// === CREATE ===
export async function createMashingProfile(data: CreateMashingProfileInput): Promise<MashingProfile>
// Vždy nastaví tenant_id = current_tenant (uživatel nemůže vytvářet systémové)
// Validace: name required, steps musí mít alespoň 1 krok

// === UPDATE ===
export async function updateMashingProfile(id: string, data: UpdateMashingProfileInput): Promise<MashingProfile>
// Pouze vlastní profily (tenant_id = current_tenant)
// Systémové profily → throw error "Systémový profil nelze editovat"

// === DELETE ===
export async function deleteMashingProfile(id: string): Promise<void>
// Soft delete (is_active = false)
// Pouze vlastní profily
// Systémové → throw error

// === DUPLICATE ===
export async function duplicateMashingProfile(id: string): Promise<MashingProfile>
// Zkopíruje libovolný profil (systémový i vlastní) → nový vlastní
// Název: "{original.name} (kopie)"
// Nový profil má tenant_id = current_tenant

// === SAVE FROM RECIPE ===
export async function saveRecipeStepsAsProfile(
  recipeId: string,
  name: string
): Promise<MashingProfile>
// Načte mash kroky z recipe_steps (typ mash_in/rest/decoction/mash_out)
// Vytvoří nový profil s těmito kroky
// tenant_id = current_tenant
```

---

## KROK 4: FRONTEND — MODULE STRUCTURE

```
src/modules/mashing-profiles/
├── components/
│   ├── MashProfileBrowser.tsx
│   ├── MashProfileDetail.tsx
│   ├── MashProfileForm.tsx
│   ├── MashStepEditor.tsx          -- Interaktivní editor kroků
│   └── MashTemperatureChart.tsx    -- Vizuální teplotní graf (nice-to-have)
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts                       -- Zod validace
└── index.ts
```

### 4.1 MashProfileBrowser

**Route:** `/brewery/mashing-profiles`

**Sloupce list view:**

| Sloupec | Typ | Sortable |
|---------|-----|----------|
| Název | link | ✓ |
| Typ rmutování | badge | ✓ |
| Počet kroků | number | ✓ |
| Systémový | badge (ano/ne) | - |

**Quick filtry:** Vše | Systémové | Vlastní

**Card view:**
- Název (bold) + typ rmutování badge
- Systémový/Vlastní indikátor
- Kroky: zkrácený přehled (např. "52°C → 62°C → 72°C → 78°C")
- Popis (zkrácený)

**Akce:**
- `+ Rmutovací profil` → nový profil
- Na systémovém profilu: "Duplikovat" (vytvoří vlastní kopii)
- Na vlastním profilu: "Editovat", "Duplikovat", "Smazat"

### 4.2 MashProfileDetail

**Route:** `/brewery/mashing-profiles/[id]`

**Hlavička:**
- Název profilu (editovatelné — jen vlastní)
- Typ rmutování (select: Infuzní / Dekokční / Stupňový) — jen vlastní
- Popis (textarea) — jen vlastní
- Systémový badge (readonly, viditelné u systémových)
- Poznámky

**⚠️ Systémový profil:** Formulář je READONLY. Zobrazit banner: "Toto je systémový profil. Pro úpravu vytvořte kopii." + tlačítko "Duplikovat do vlastních".

### 4.3 MashStepEditor

Klíčová UX komponenta — interaktivní tabulka kroků profilu.

**Zobrazení:**

| # | Krok | Typ | Teplota (°C) | Čas (min) | Poznámka | Akce |
|---|------|-----|-------------|-----------|----------|------|
| 1 | Zapáření | mash_in | 52 | 10 | | ↑ ↓ ✕ |
| 2 | Bílkovinný rast | rest | 52 | 15 | | ↑ ↓ ✕ |
| 3 | 1. dekokce — odběr | decoction | 62 | 5 | | ↑ ↓ ✕ |
| 4 | 1. dekokce — var | decoction | 100 | 15 | | ↑ ↓ ✕ |
| 5 | Sacharifikační rast | rest | 72 | 30 | | ↑ ↓ ✕ |
| 6 | Odrmutování | mash_out | 78 | 10 | | ↑ ↓ ✕ |

**Interakce:**
- **Přidat krok:** Tlačítko "+ Krok" pod tabulkou → přidá prázdný řádek
- **Inline editace:** Klik na buňku → edit. Teplota = number input, čas = number input, typ = select, název = text
- **Řazení:** Drag & drop NEBO šipky ↑↓
- **Smazání:** Ikona ✕ na řádku (s potvrzením pokud > 1 krok)
- **Readonly mód:** Pro systémové profily — žádné akce, jen zobrazení

**Typ kroků select options:**
- `mash_in` — Zapáření
- `rest` — Rast (teplotní pauza)
- `decoction` — Dekokce (odběr + var)
- `mash_out` — Odrmutování

### 4.4 MashTemperatureChart (NICE-TO-HAVE)

Jednoduchý graf zobrazující teplotní průběh rmutování.

- X osa: čas (kumulativní minuty)
- Y osa: teplota (°C)
- Čára: spojnice bodů [kumulativní_čas, teplota] per krok
- Barevné rozlišení: rest = modrá, decoction = červená (var 100°C), mash_in/out = zelená

**Implementace:** Recharts (už v projektu) — simple LineChart. Pokud Recharts není v závislostech, použít SVG ručně.

**Scope:** Pokud zbude čas. Není blokující. Pokud ne, stačí tabulka kroků.

---

## KROK 5: INTEGRACE S RECEPTUROU

### 5.1 Stávající "Načíst rmutovací profil"

Aktuální flow na recipe steps tabu:
1. Klik "Načíst rmutovací profil"
2. Dialog se seznamem profilů
3. Výběr → applyMashProfile() → nahradí mash kroky

**Rozšíření:**
- V dialogu zobrazit typ rmutování a kroky (preview)
- Oddělit systémové a vlastní profily v seznamu
- Přidat odkaz "Spravovat profily" → navigace na `/brewery/mashing-profiles`

### 5.2 "Uložit kroky jako profil"

Nové tlačítko na recipe steps tabu (vedle "Načíst profil"):
1. Klik → dialog s inputem pro název profilu
2. Potvrzení → `saveRecipeStepsAsProfile(recipeId, name)`
3. Nový profil se vytvoří z aktuálních mash kroků receptury

---

## KROK 6: NAVIGACE

### Sidebar

Pod modul **Pivovar** přidat:

```
Pivovar:
  - Přehled
  - Partneři
  - Kontakty
  - Suroviny
  - Receptury
  - Vary
  - Varní soustavy         ← z A1
  - Rmutovací profily      ← NOVÉ
  - Zařízení
```

**Ikona:** `Thermometer`, `Flame`, nebo `Timer` z lucide-react

**Routes:**
- `/brewery/mashing-profiles` — browser
- `/brewery/mashing-profiles/[id]` — detail
- `/brewery/mashing-profiles/new` — nový profil

---

## KROK 7: I18N

### 7.1 `src/i18n/messages/cs/mashing-profiles.json` (nový)

```json
{
  "title": "Rmutovací profily",
  "create": "Rmutovací profil",
  "quickFilters": {
    "all": "Vše",
    "system": "Systémové",
    "custom": "Vlastní"
  },
  "columns": {
    "name": "Název",
    "mashingType": "Typ rmutování",
    "stepCount": "Kroků",
    "isSystem": "Systémový"
  },
  "mashingType": {
    "infusion": "Infuzní",
    "decoction": "Dekokční",
    "step": "Stupňový"
  },
  "stepType": {
    "mash_in": "Zapáření",
    "rest": "Rast",
    "decoction": "Dekokce",
    "mash_out": "Odrmutování"
  },
  "detail": {
    "title": "Detail profilu",
    "newTitle": "Nový rmutovací profil",
    "systemBanner": "Toto je systémový profil. Pro úpravu vytvořte kopii.",
    "duplicateToOwn": "Duplikovat do vlastních",
    "fields": {
      "name": "Název",
      "mashingType": "Typ rmutování",
      "description": "Popis",
      "notes": "Poznámky"
    },
    "actions": {
      "save": "Uložit",
      "delete": "Smazat",
      "duplicate": "Duplikovat",
      "cancel": "Zrušit"
    }
  },
  "steps": {
    "title": "Kroky rmutování",
    "add": "Krok",
    "empty": "Žádné kroky",
    "name": "Krok",
    "type": "Typ",
    "temperature": "Teplota (°C)",
    "time": "Čas (min)",
    "notes": "Poznámka",
    "deleteConfirm": "Opravdu smazat tento krok?"
  },
  "recipe": {
    "loadProfile": "Načíst rmutovací profil",
    "saveAsProfile": "Uložit kroky jako profil",
    "saveDialog": {
      "title": "Uložit jako rmutovací profil",
      "nameLabel": "Název profilu",
      "namePlaceholder": "Můj dekokční postup"
    },
    "manageProfiles": "Spravovat profily"
  }
}
```

### 7.2 EN verze

Analogicky.

---

## KROK 8: SEED DATA

### Aktualizace stávajících systémových profilů

Rozšířit seed v `scripts/seed-sprint2.mjs` a `src/lib/db/seed-beer-styles.ts`:

```typescript
const profiles = [
  {
    tenantId: null,
    name: "Jednokvasný infuzní",
    mashingType: "infusion",
    description: "Základní infuzní postup s jednou teplotní pauzou. Vhodný pro většinu světlých ležáků a jednoduchých receptur.",
    steps: [
      { name: "Zapáření", temperature: 62, time: 30, type: "mash_in" },
      { name: "Sacharifikační rast", temperature: 72, time: 30, type: "rest" },
      { name: "Odrmutování", temperature: 78, time: 10, type: "mash_out" },
    ],
    notes: "Základní infuzní postup — jednoduchý, vhodný pro většinu ležáků.",
  },
  {
    tenantId: null,
    name: "Dvourastový infuzní",
    mashingType: "infusion",
    description: "Dvourastový infuzní postup s bílkovinným rastem a dvěma sacharifikačními teplotami. Pro plnější tělo a lepší konverzi škrobů.",
    steps: [
      { name: "Bílkovinný rast", temperature: 52, time: 15, type: "rest" },
      { name: "Sacharifikační rast I", temperature: 62, time: 30, type: "rest" },
      { name: "Sacharifikační rast II", temperature: 72, time: 30, type: "rest" },
      { name: "Odrmutování", temperature: 78, time: 10, type: "mash_out" },
    ],
    notes: "Dvourastový infuzní postup — pro plnější tělo a lepší konverzi.",
  },
  {
    tenantId: null,
    name: "Český dekokční — jednomezový",
    mashingType: "decoction",
    description: "Klasický český jednomezový dekokční postup s jedním odběrem a varem. Tradice českého pivovarnictví.",
    steps: [
      { name: "Zapáření", temperature: 62, time: 20, type: "mash_in" },
      { name: "1. dekokce — odběr", temperature: 62, time: 5, type: "decoction" },
      { name: "1. dekokce — var", temperature: 100, time: 15, type: "decoction" },
      { name: "Sacharifikační rast", temperature: 72, time: 30, type: "rest" },
      { name: "Odrmutování", temperature: 78, time: 10, type: "mash_out" },
    ],
    notes: "Klasický český jednomezový dekokční postup.",
  },
  {
    tenantId: null,
    name: "Český dekokční — dvoumezový",
    mashingType: "decoction",
    description: "Tradiční český dvoumezový dekokční postup se dvěma odběry a vary. Maximální výtěžnost a plné tělo piva. Nejnáročnější na čas a energii.",
    steps: [
      { name: "Zapáření", temperature: 52, time: 10, type: "mash_in" },
      { name: "1. dekokce — odběr", temperature: 52, time: 5, type: "decoction" },
      { name: "1. dekokce — var", temperature: 100, time: 15, type: "decoction" },
      { name: "1. rast", temperature: 62, time: 20, type: "rest" },
      { name: "2. dekokce — odběr", temperature: 62, time: 5, type: "decoction" },
      { name: "2. dekokce — var", temperature: 100, time: 15, type: "decoction" },
      { name: "Sacharifikační rast", temperature: 72, time: 30, type: "rest" },
      { name: "Odrmutování", temperature: 78, time: 10, type: "mash_out" },
    ],
    notes: "Tradiční český dvoumezový dekokční postup — pro nejlepší výtěžnost.",
  },
];
```

**Strategie:** UPDATE existujících profilů (přidat mashing_type, description), ne INSERT nových. Idempotentní script.

---

## AKCEPTAČNÍ KRITÉRIA

### Schema
1. [ ] `mashing_profiles` má sloupce `mashing_type`, `description`, `is_active`, `updated_at`
2. [ ] Drizzle schema aktualizováno
3. [ ] RLS: systémové profily čitelné pro všechny, write jen vlastní
4. [ ] Stávající systémové profily mají `mashing_type` vyplněný

### CRUD
5. [ ] `getMashingProfiles()` — vrací systémové + vlastní
6. [ ] `createMashingProfile()` — vytvoření vlastního profilu
7. [ ] `updateMashingProfile()` — úprava vlastního, error na systémovém
8. [ ] `deleteMashingProfile()` — soft delete vlastního
9. [ ] `duplicateMashingProfile()` — kopie systémového i vlastního → nový vlastní
10. [ ] `saveRecipeStepsAsProfile()` — uloží mash kroky z receptury jako profil

### UI
11. [ ] MashProfileBrowser (list + card view)
12. [ ] Quick filtry: Vše / Systémové / Vlastní
13. [ ] MashProfileDetail s editovatelným formulářem
14. [ ] Systémový profil: readonly + banner + tlačítko "Duplikovat"
15. [ ] MashStepEditor: inline editace kroků (přidat/editovat/smazat/řadit)
16. [ ] Typ kroků: select s 4 možnostmi (mash_in/rest/decoction/mash_out)

### Integrace s recepturou
17. [ ] "Načíst rmutovací profil" dialog: preview kroků, oddělení systémových/vlastních
18. [ ] "Uložit kroky jako profil" tlačítko + dialog na recipe steps tabu
19. [ ] Odkaz "Spravovat profily" v dialogu

### Navigace
20. [ ] Sidebar: "Rmutovací profily" pod Pivovar
21. [ ] Routes: /brewery/mashing-profiles, /[id], /new

### Obecné
22. [ ] i18n: cs + en
23. [ ] `npm run build` bez chyb
24. [ ] TypeScript: zero errors
25. [ ] Dokumentace aktualizována (CHANGELOG, PRODUCT-SPEC)

---

## CO NEIMPLEMENTOVAT

- **MashTemperatureChart** — teplotní graf. Nice-to-have, pokud zbude čas. Není blokující.
- **Import profilů z Bubble** — systémové profily stačí 4 stávající. Pokud uživatel chce víc, vytvoří si.
- **Sdílení profilů mezi tenanty** — post-MVP (veřejná knihovna profilů)
- **Automatický výběr profilu dle beer stylu** — scope S7 (recipe designer krok 1)

---

## TECHNICKÉ POZNÁMKY

- **JSONB kroky:** Stávající formát `{name, temperature, time, type}` zachovat. Přidat volitelné `notes`. NEMĚNIT strukturu — kompatibilita s existujícími daty.
- **Systémové vs. vlastní:** Rozlišení čistě přes `tenant_id IS NULL`. Žádný extra flag `is_system` v DB — je to computed property.
- **Seed idempotence:** Při aktualizaci systémových profilů použít UPSERT nebo UPDATE WHERE name. Nikdy neduplikovat.
- **MashStepEditor:** Kroky se editují v paměti (React state), ukládají se celý JSONB array najednou při Save. Žádné per-step API calls.
- **Drag & drop řazení:** Pokud je v projektu `@dnd-kit` nebo podobná knihovna, použít. Pokud ne, stačí šipky ↑↓ (jednodušší).
