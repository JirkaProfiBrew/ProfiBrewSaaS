# SPRINT 6 — FÁZE A1: BREWING SYSTEMS (Varní soustavy)
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.1 | Datum: 27.02.2026

---

## CÍL

Implementovat novou entitu **Brewing System** (varní soustava) — kompletní popis varního zařízení pivovaru s objemy, ztrátami, konstantami a časy kroků. Varní soustava slouží jako základ pro kalkulační engine receptur (Sprint 7). Současně zjednodušit stávající `equipment` tabulku tak, aby obsahovala pouze nádoby studené zóny (fermentory, ležácké tanky, CKT).

**Závisí na:** Sprint 1 (Equipment), Sprint 2 (Batches, Recipes)

---

## KONTEXT

### Proč nová entita

Stávající `equipment` tabulka eviduje jednotlivé nádoby (fermentor, varna, CKT...). Pro kalkulace receptur potřebujeme ale celou **varní soupravu** jako celek — batch size, efektivita, ztráty v každém kroku, konstanty. To je jiná úroveň abstrakce:

- **Brewing System** = šablona pro výpočty (1 pivovar má typicky 1-2 soustavy)
- **Equipment** = konkrétní fyzická nádoba pro obsazení šaržemi (pivovar má N fermentorů)

### Vazby

- **Recipe** → `brewing_system_id` (pro výpočty objemů, ztrát, potřebného sladu)
- **Batch** → `equipment_id` (pro přiřazení ke konkrétnímu tanku — beze změny)
- **Batch** → `brewing_system_id` (zděděné z recipe, nebo přepsané)

---

## FÁZE A1.1: DB SCHEMA

### Nová tabulka `brewing_systems`

```sql
CREATE TABLE brewing_systems (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  shop_id           UUID REFERENCES shops(id),

  -- === HLAVIČKA ===
  name              TEXT NOT NULL,              -- "Zařízení Pancíř", "Testovací 50L"
  description       TEXT,                       -- Volný popis
  is_primary        BOOLEAN DEFAULT false,      -- Primární soustava (default pro nové recepty)
  batch_size_l      DECIMAL NOT NULL,           -- Objem mladiny (batch size) v litrech
  efficiency_pct    DECIMAL NOT NULL DEFAULT 75, -- Efektivita varny (%)

  -- === TEPLÁ ZÓNA — CHMELOVAR ===
  kettle_volume_l   DECIMAL,                   -- Celkový objem nádoby (chmelovarná pánev)
  kettle_loss_pct   DECIMAL DEFAULT 10,        -- Ztráta chmelovar (%)

  -- === TEPLÁ ZÓNA — WHIRLPOOL ===
  whirlpool_loss_pct DECIMAL DEFAULT 10,       -- Ztráta whirlpool (chmelové mláto, čerpání) (%)

  -- === STUDENÁ ZÓNA — FERMENTOR (schématický, pro vizualizaci a výpočty) ===
  fermenter_volume_l DECIMAL,                  -- Referenční objem fermentoru pro vizualizaci (ne konkrétní tank)
  fermentation_loss_pct DECIMAL DEFAULT 10,    -- Ztráta kvašení (%)

  -- === KONSTANTY ===
  extract_estimate   DECIMAL DEFAULT 0.80,     -- Odhadovaný extrakt sladu (0-1)
  water_per_kg_malt  DECIMAL DEFAULT 1.0,      -- Voda L/kg slad (hustota rmutu)
  water_reserve_l    DECIMAL DEFAULT 0,        -- Voda navíc — potrubí apod. (L)

  -- === ČASY KROKŮ (minuty) ===
  time_preparation   INTEGER DEFAULT 30,       -- Příprava (min)
  time_lautering     INTEGER DEFAULT 60,       -- Scezování (min)
  time_whirlpool     INTEGER DEFAULT 90,       -- Whirlpool a chlazení (min)
  time_transfer      INTEGER DEFAULT 15,       -- Přesun na kvašení (min)
  time_cleanup       INTEGER DEFAULT 60,       -- Úklid (min)
  -- Rmutování a chmelovar: čas vychází z receptu, ne ze zařízení

  -- === META ===
  notes             TEXT,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_brewing_systems_tenant ON brewing_systems(tenant_id, is_active);
CREATE UNIQUE INDEX idx_brewing_systems_primary ON brewing_systems(tenant_id) WHERE is_primary = true AND is_active = true;
```

**Poznámky:**
- `is_primary` — UNIQUE partial index zajistí max 1 primární per tenant
- Ztráty jsou v % — výpočet: `objem_po = objem_před × (1 - loss_pct/100)`
- `extract_estimate` — koeficient 0-1, typicky 0.75-0.85
- Časy rmutování a chmelovaru se NEUKLÁDAJÍ na brewing_system — pocházejí z receptu
- `fermenter_volume_l` — schématická hodnota pro vizualizaci a výpočet konečného objemu piva. Skutečné tanky jsou v `equipment` tabulce. Pivovar běžně používá CKT 2× větší než varna (double batch: 2 vary → 1 CKT).

### RLS

```sql
ALTER TABLE brewing_systems ENABLE ROW LEVEL SECURITY;

CREATE POLICY brewing_systems_tenant_isolation ON brewing_systems
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY brewing_systems_tenant_insert ON brewing_systems
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### Drizzle schema

**Soubor:** `drizzle/schema/brewing-systems.ts`

Definice dle SQL výše. Exportovat z `drizzle/schema/index.ts`.

---

## FÁZE A1.2: EQUIPMENT REFAKTOR

### Změny v `equipment`

**Odstranit typy** z `equipment_type`:
- `brewhouse` → migrovat do brewing_systems (nebo drop pokud seed data)
- `bottling_line` → drop (v MVP nepotřebujeme)
- `keg_washer` → drop (v MVP nepotřebujeme)

**Ponechat typy:**
- `fermenter` — Fermentor
- `brite_tank` — Ležácký tank
- `conditioning` — CKT (cylindrokónický tank)

### Migrace

```sql
-- 1. Smazat equipment záznamy s typy které odstraňujeme
DELETE FROM equipment WHERE equipment_type IN ('brewhouse', 'bottling_line', 'keg_washer');

-- 2. (Volitelně) přidat CHECK constraint
-- ALTER TABLE equipment ADD CONSTRAINT chk_equipment_type
--   CHECK (equipment_type IN ('fermenter', 'brite_tank', 'conditioning'));
-- POZOR: jen pokud žádné stávající batche nemají vazbu na smazané equipment
```

**⚠️ PŘED migrací zkontroluj:**
- Existují batche s `equipment_id` odkazujícím na brewhouse/bottling_line? → Pokud ano, nejdřív vyčisti vazby (set NULL).
- Seed data v `supabase/seed.sql` — aktualizovat tak, aby neobsahovaly smazané typy.

### Aktualizace equipment modulu

**`src/modules/equipment/types.ts`:**
```typescript
export type EquipmentType = "fermenter" | "brite_tank" | "conditioning";
// Odstranit: "brewhouse" | "bottling_line" | "keg_washer"
```

**`src/modules/equipment/config.ts`:**
- Quick filtry: odstranit Varny, Stáčecí
- Parametrický filtr: odstranit brewhouse, bottling_line, keg_washer z options
- Přejmenovat title: "Zařízení" → "Tanky" (nebo nechat "Zařízení" — rozhodne user)

**i18n (cs + en):**
- Odstranit překlady pro brewhouse, bottling_line, keg_washer
- Aktualizovat quick filter labels

---

## FÁZE A1.3: VAZBY NA STÁVAJÍCÍ ENTITY

### Recipe → Brewing System

```sql
ALTER TABLE recipes ADD COLUMN brewing_system_id UUID REFERENCES brewing_systems(id);
```

Na receptuře se vybírá brewing system → z něj se načtou objemy, ztráty, konstanty pro výpočty.

### Batch → Brewing System

```sql
ALTER TABLE batches ADD COLUMN brewing_system_id UUID REFERENCES brewing_systems(id);
```

Při vytvoření batche z receptury se `brewing_system_id` zkopíruje z recipe. Sládek může přepsat (jiná soustava pro konkrétní var).

### Drizzle schema update

Aktualizovat `drizzle/schema/recipes.ts` a `drizzle/schema/batches.ts` — přidat sloupec `brewingSystemId`.

---

## FÁZE A1.4: BACKEND — SERVER ACTIONS

**Soubor:** `src/modules/brewing-systems/actions.ts`

```typescript
'use server'

// === CRUD ===
export async function getBrewingSystems(filters?: { isActive?: boolean }): Promise<BrewingSystem[]>
export async function getBrewingSystem(id: string): Promise<BrewingSystem>
export async function createBrewingSystem(data: CreateBrewingSystemInput): Promise<BrewingSystem>
export async function updateBrewingSystem(id: string, data: UpdateBrewingSystemInput): Promise<BrewingSystem>
export async function deleteBrewingSystem(id: string): Promise<void>

// === HELPERS ===
export async function getPrimaryBrewingSystem(): Promise<BrewingSystem | null>
export async function setPrimaryBrewingSystem(id: string): Promise<void>
// → Odstraní is_primary z předchozího, nastaví na novém (transakce)

// === KALKULACE OBJEMŮ (read-only, pro budoucí recipe engine) ===
export function calculateVolumes(system: BrewingSystem): BrewingSystemVolumes
```

### Typ `BrewingSystemVolumes`

```typescript
interface BrewingSystemVolumes {
  batchSizeL: number           // = batch_size_l (cílový objem mladiny)
  preboilVolumeL: number       // = batchSizeL / (1 - kettleLossPct/100)
  postBoilVolumeL: number      // = batchSizeL (po chmelovaru = batch size)
  postWhirlpoolL: number       // = batchSizeL × (1 - whirlpoolLossPct/100)
  intoFermenterL: number       // = postWhirlpoolL
  finishedBeerL: number        // = intoFermenterL × (1 - fermentationLossPct/100)
}
```

**Poznámka k výpočtu:**
- `batch_size_l` = objem mladiny = objem PO chmelovaru
- `preboil` = objem PŘED chmelovarem (sladina) = batch_size / (1 - kettle_loss/100)
- Flow: Sladina (preboil) → −ztráta chmelovar → Mladina (batch_size) → −ztráta whirlpool → Do fermentoru → −ztráta kvašení → Hotové pivo

---

## FÁZE A1.5: FRONTEND — MODULE STRUCTURE

```
src/modules/brewing-systems/
├── components/
│   ├── BrewingSystemBrowser.tsx
│   ├── BrewingSystemDetail.tsx
│   ├── BrewingSystemForm.tsx
│   └── VesselBlock.tsx             -- Vizuální blok nádoby s dynamickým vybarvením
├── config.ts
├── actions.ts
├── hooks.ts
├── types.ts
├── schema.ts                       -- Zod validace
└── index.ts
```

### BrewingSystemBrowser

**Route:** `/brewery/brewing-systems`

**Sloupce list view:**

| Sloupec | Typ | Sortable |
|---------|-----|----------|
| Název | link | ✓ |
| Batch size (L) | number | ✓ |
| Efektivita (%) | number | ✓ |
| Hotové pivo (L) | number (computed) | ✓ |
| Provozovna | text | - |
| Primární | badge | - |

**Quick filtry:** Vše | Aktivní

**Card view:**
- Název (bold) + primární badge
- Batch size + efektivita
- Flow: batch size → hotové pivo (zkrácený)
- Provozovna

**Akce:** `+ Varní soustava` → navigace na vytvoření

### BrewingSystemDetail

**Route:** `/brewery/brewing-systems/[id]`

**Layout — dle Bubble reference (viz screenshot "Editace zařízení"):**

**Sekce 1: Hlavička**
- Primární zařízení (checkbox, nahoře)
- Název zařízení (text) + Popis zařízení (textarea) — vedle sebe
- Objem mladiny / batch size (L) — **editovatelné, zvýrazněné (žlutý input)**
- Efektivita varny (%) — editovatelné
- Provozovna (select)

**Sekce 2: Vizuální bloky — 3 vedle sebe (Chmelovar, Whirlpool, Fermentor)**

Tři bloky v řadě, každý s nadpisem a vizualizací nádob. Toto je klíčová UX komponenta — vizualizuje objemy a ztráty tak, aby uživatel intuitivně chápal, co který objem znamená.

#### Komponenta `VesselBlock.tsx`

Každý blok obsahuje:
- **Nadpis** (Chmelovar / Whirlpool / Fermentor)
- **Editovatelné parametry** (objem nádoby, ztráta %)
- **Vizualizaci nádob** — obdélníky ("nádoby") s dynamickým vybarvením

**Vizualizace nádob — princip:**
- Nádoba = obdélník s rámečkem (outline)
- Celkový objem nádoby = 100 % výšky obdélníku
- Obsah kapaliny = procentuální výška vybarvení dle computed objemu
- Výška vybarvení: `fill_pct = (objem_kapaliny / objem_nádoby) × 100%`
- Vybarvení se dynamicky mění při změně vstupních hodnot
- Pod nádobou: textový label s objemem v litrech

**Barvy kapalin — symbolizují skutečné barvy fáze výroby ležáku:**
- **Sladina / před chmelovarem:** tmavší žlutá/jantarová (sladina je tmavší)
- **Mladina po chmelovaru:** zlatavá žlutá (čistší po chmelovaru)
- **Mladina před zakvašením:** zlatavá žlutá (stejná jako po whirlpoolu)
- **Hotové pivo:** světle zlatá (nejsvětlejší, hotový produkt)

#### Blok 1: Chmelovar

```
Chmelovar
┌─────────────────────────────────────────────────┐
│ Celkový objem nádoby: [617,3] L                 │
│                                                   │
│  ┌──────┐   Ztráta      ┌──────┐                │
│  │██████│   chmelovar    │██████│                │
│  │██████│                │██████│                │
│  │██████│    [10] %      │██████│                │
│  │      │                │██████│                │
│  └──────┘                └──────┘                │
│  617 L                    556 L                   │
│  Sladina před             Mladina po              │
│  chmelovarem              chmelovaru              │
└─────────────────────────────────────────────────┘
```

- Editovatelné: celkový objem nádoby (L), ztráta (%)
- Levá nádoba: sladina = `preboilVolumeL`, fill% = preboil / kettle_volume
- Pravá nádoba: mladina = `batch_size_l`, fill% = batch_size / kettle_volume
- Barvy: levá = tmavší jantarová, pravá = zlatavá

#### Blok 2: Whirlpool

```
Whirlpool
┌─────────────────────────────────────────────────┐
│                                                   │
│          Ztráta whirlpool                        │
│          (chmelové mláto, čerpání)               │
│                                                   │
│              [10] %                               │
│                                                   │
└─────────────────────────────────────────────────┘
```

- Editovatelné: ztráta whirlpool (%)
- Jen textový blok, bez vizualizace nádob (whirlpool nemá vlastní nádobu — je to proces)
- Popisek: "chmelové mláto, čerpání"

#### Blok 3: Fermentor

```
Fermentor
┌─────────────────────────────────────────────────┐
│ Celkový objem nádoby: [800,0] L                 │
│                                                   │
│  ┌──────┐   Ztráta      ┌──────┐                │
│  │      │   kvašení      │      │                │
│  │██████│                │██████│                │
│  │██████│    [10] %      │██████│                │
│  │██████│                │██████│                │
│  └──────┘                └──────┘                │
│  500 L                    450 L                   │
│  Mladina před             Hotové pivo             │
│  zakvašením.                                      │
└─────────────────────────────────────────────────┘
```

- Editovatelné: celkový objem nádoby (L), ztráta kvašení (%)
- Levá nádoba: mladina do fermentoru = `intoFermenterL`, fill% = intoFermenter / fermenter_volume
- Pravá nádoba: hotové pivo = `finishedBeerL`, fill% = finishedBeer / fermenter_volume
- Barvy: levá = zlatavá, pravá = světle zlatá
- **Poznámka:** `fermenter_volume_l` je schématická/referenční hodnota pro vizualizaci. Skutečné přiřazení konkrétního tanku probíhá na úrovni šarže (batch → equipment_id). Na brewing_system slouží jen k tomu, aby vizualizace ukazovala naplnění nádoby.

#### Reaktivita vizualizace

Všechny computed hodnoty a výšky vybarvení se **přepočítávají v reálném čase** při změně jakéhokoliv vstupního parametru (batch_size, ztráty, objem nádoby). Uživatel vidí okamžitě dopad změny.

**Sekce 3: Konstanty**

| Pole | Hodnota | Jednotka |
|------|---------|----------|
| Odhadovaný extrakt sladu | 0,80 | (0-1) |
| Voda L/kg slad | 1,0 | L/kg |
| Voda navíc (potrubí apd.) | 0,0 | L |

**Sekce 4: Časy kroků**

| Krok | Čas (min) | Poznámka |
|------|-----------|----------|
| Příprava | 30 | (textové pole) |
| Rmutování | — | *Čas vychází z receptu* |
| Scezování | 60 | |
| Chmelovar | — | *Čas vychází z receptu* |
| Whirlpool a chlazení | 90 | |
| Přesun na kvašení | 15 | |
| Úklid | 60 | |

Poznámka: Rmutování a Chmelovar jsou readonly řádky s textem "Čas vychází z receptu" — uživatel si je nastavuje na receptuře, ne na zařízení.

**Sekce 5: Poznámky** (textarea)

---

## FÁZE A1.6: NAVIGACE

### Sidebar

Pod modul **Pivovar** přidat novou položku:

```
Pivovar:
  - Přehled
  - Partneři
  - Kontakty
  - Suroviny
  - Receptury
  - Vary
  - Varní soustavy    ← NOVÉ (/brewery/brewing-systems)
  - Tanky             ← přejmenované z "Zařízení" (/brewery/equipment)
```

**Alternativa:** Pokud "Tanky" zní divně, nechat "Zařízení" — ale z kontextu musí být jasné, že to jsou jen nádoby (fermentory, CKT), ne celé varní soupravy.

### Pages

```
src/app/[locale]/(dashboard)/brewery/brewing-systems/page.tsx
src/app/[locale]/(dashboard)/brewery/brewing-systems/[id]/page.tsx
src/app/[locale]/(dashboard)/brewery/brewing-systems/new/page.tsx
```

---

## FÁZE A1.7: I18N

### `src/i18n/messages/cs/brewing-systems.json`

```json
{
  "title": "Varní soustavy",
  "create": "+ Varní soustava",
  "columns": {
    "name": "Název",
    "batchSizeL": "Batch size (L)",
    "efficiencyPct": "Efektivita (%)",
    "finishedBeerL": "Hotové pivo (L)",
    "shopName": "Provozovna",
    "isPrimary": "Primární"
  },
  "quickFilters": {
    "all": "Vše",
    "active": "Aktivní"
  },
  "detail": {
    "title": "Varní soustava",
    "newTitle": "Nová varní soustava",
    "sections": {
      "header": "Základní údaje",
      "hotZone": "Teplá zóna",
      "constants": "Konstanty",
      "stepTimes": "Časy kroků",
      "notes": "Poznámky"
    },
    "fields": {
      "name": "Název zařízení",
      "description": "Popis zařízení",
      "isPrimary": "Primární zařízení",
      "batchSizeL": "Objem mladiny / batch size (L)",
      "efficiencyPct": "Efektivita varny (%)",
      "shopId": "Provozovna",
      "kettleVolumeL": "Celkový objem nádoby",
      "kettleLossPct": "Ztráta chmelovar (%)",
      "whirlpoolLossPct": "Ztráta whirlpool (%)",
      "fermenterVolumeL": "Celkový objem nádoby",
      "fermentationLossPct": "Ztráta kvašení (%)",
      "extractEstimate": "Odhadovaný extr. sladu",
      "waterPerKgMalt": "Voda L/kg slad",
      "waterReserveL": "Voda navíc (potrubí apd.)",
      "timePreparation": "Příprava",
      "timeLautering": "Scezování",
      "timeWhirlpool": "Whirlpool a chlazení",
      "timeTransfer": "Přesun na kvašení",
      "timeCleanup": "Úklid"
    },
    "hotZoneBlocks": {
      "kettle": "Chmelovar",
      "whirlpool": "Whirlpool",
      "fermenter": "Fermentor"
    },
    "stepTimesNote": "Čas vychází z receptu",
    "volumeLabels": {
      "preboil": "Sladina před chmelovarem",
      "postBoil": "Mladina po chmelovaru",
      "preWhirlpool": "Mladina před whirlpoolem",
      "intoFermenter": "Mladina před zakvašením",
      "finishedBeer": "Hotové pivo"
    },
    "actions": {
      "save": "Uložit",
      "delete": "Smazat",
      "cancel": "Storno"
    }
  }
}
```

### `src/i18n/messages/en/brewing-systems.json`

Analogicky v angličtině.

### Aktualizace equipment i18n

- cs: `"title": "Tanky"` (nebo ponechat "Zařízení")
- Odstranit překlady pro brewhouse, bottling_line, keg_washer

---

## FÁZE A1.8: SEED DATA

### `supabase/seed.sql` — doplnit

```sql
-- Brewing system pro test tenant
INSERT INTO brewing_systems (
  id, tenant_id, shop_id, name, description, is_primary,
  batch_size_l, efficiency_pct,
  kettle_volume_l, kettle_loss_pct,
  whirlpool_loss_pct,
  fermenter_volume_l, fermentation_loss_pct,
  extract_estimate, water_per_kg_malt, water_reserve_l,
  time_preparation, time_lautering, time_whirlpool, time_transfer, time_cleanup
) VALUES (
  gen_random_uuid(),
  '<test_tenant_id>',
  '<test_shop_id>',
  'Zařízení Pancíř',
  'Hlavní varní soustava 500L',
  true,
  500, 75,
  617.3, 10,
  10,
  800, 10,
  0.80, 1.0, 0,
  30, 60, 90, 15, 60
);
```

### Aktualizace stávajícího seed

- Odstranit equipment záznamy typu brewhouse, bottling_line, keg_washer
- Ponechat fermentory a CKT

---

## FÁZE A1.9: DOKUMENTACE

### CHANGELOG.md

```markdown
## Sprint 6 — Fáze A1: Brewing Systems
- [x] brewing_systems — nová entita (varní soustava s objemy, ztrátami, konstantami)
- [x] Equipment refaktor — zjednodušení na tanky (fermenter/brite_tank/conditioning)
- [x] Vazba recipes.brewing_system_id + batches.brewing_system_id
- [x] CRUD + browser + detail s vizuálním layoutem
- [x] Navigace: /brewery/brewing-systems
- [x] i18n: cs + en
```

### PRODUCT-SPEC.md

Aktualizovat sekci 4.6 Zařízení → rozdělit na:
- 4.6a Varní soustavy (brewing_systems) ✅
- 4.6b Tanky (equipment — fermentory, CKT) ✅

### CLAUDE.md

Sprint 6 Phase A1 completed. Brewing Systems module added.

---

## AKCEPTAČNÍ KRITÉRIA

### DB & Schema
1. [ ] Tabulka `brewing_systems` s RLS
2. [ ] Drizzle schema v `drizzle/schema/brewing-systems.ts`
3. [ ] `recipes.brewing_system_id` sloupec existuje (FK)
4. [ ] `batches.brewing_system_id` sloupec existuje (FK)
5. [ ] Seed data: 1 brewing system pro test tenant

### Equipment refaktor
6. [ ] Equipment záznamy typu brewhouse/bottling_line/keg_washer smazány
7. [ ] Equipment types omezeny na fermenter/brite_tank/conditioning
8. [ ] Equipment browser: quick filtry a parametrické filtry aktualizovány
9. [ ] Equipment i18n aktualizováno (smazány nepotřebné překlady)
10. [ ] Seed data aktualizován (žádné brewhouse/bottling_line záznamy)

### Brewing Systems CRUD
11. [ ] `getBrewingSystems()` — list s filtrem isActive
12. [ ] `getBrewingSystem(id)` — detail
13. [ ] `createBrewingSystem()` — vytvoření
14. [ ] `updateBrewingSystem()` — úprava
15. [ ] `deleteBrewingSystem()` — smazání (soft delete)
16. [ ] `getPrimaryBrewingSystem()` — vrátí primární
17. [ ] `setPrimaryBrewingSystem(id)` — přepne primární (transakce)
18. [ ] `calculateVolumes()` — výpočet flow objemů

### UI
19. [ ] BrewingSystemBrowser (list + card view)
20. [ ] BrewingSystemDetail s editovatelným formulářem
21. [ ] Vizuální bloky: 3 vedle sebe (chmelovar, whirlpool, fermentor)
22. [ ] VesselBlock: dynamické vybarvení výšky dle poměru objem/nádoba
23. [ ] VesselBlock: barvy kapalin odpovídají fázi výroby (tmavší sladina → světlejší pivo)
24. [ ] Computed objemy zobrazeny pod nádobami (readonly, v litrech)
25. [ ] Reaktivní přepočet — změna parametru okamžitě přepočítá vizualizaci
26. [ ] Sekce konstanty
27. [ ] Sekce časy kroků (rmutování + chmelovar jako readonly "z receptu")
28. [ ] Primární badge v browseru

### Navigace
29. [ ] Sidebar: "Varní soustavy" pod Pivovar
30. [ ] Sidebar: "Zařízení" přejmenováno / aktualizováno
31. [ ] Route: /brewery/brewing-systems, /brewery/brewing-systems/[id], /brewery/brewing-systems/new

### Obecné
32. [ ] i18n: cs + en
33. [ ] `npm run build` bez chyb
34. [ ] TypeScript: zero errors, no `any`
35. [ ] RLS policies na brewing_systems
36. [ ] Dokumentace aktualizována (CHANGELOG, PRODUCT-SPEC, CLAUDE.md)

---

## CO NEIMPLEMENTOVAT

- **Propojení recipe ↔ brewing system** (UI na receptuře) — to je scope S7 (recipe designer krok 1)
- **Kalkulace sladu/vody na receptuře** — scope S7
- **Kopie brewing system** — post-MVP
- **Import/export brewing systems** — post-MVP
- **Double batch / sloučení várek** — častá praxe (2 vary do 1 CKT), ale řeší se na úrovni batch, ne brewing system. Implementace v budoucím sprintu jako batch merge funkce.
- **Plánování kapacity** — přiřazení konkrétních kvasných nádob (equipment) k varkám, blokace po dobu kvašení, výpočet kapacity pivovaru z počtu nádob. Scope: modul Plánování (post-MVP).

---

## TECHNICKÉ POZNÁMKY

- **Ztráty v %** — vždy kladné číslo (10 = 10%). Výpočet: `after = before × (1 - loss/100)`.
- **batch_size_l** — klíčový parametr. Objem mladiny = objem PO chmelovaru. Sladina (před chmelovarem) je VĚTŠÍ.
- **is_primary UNIQUE** — partial unique index zajistí max 1 primární per tenant. Při `setPrimaryBrewingSystem()` nejdřív odeber stávající primární, pak nastav nový — v transakci.
- **Časy kroků** — rmutování a chmelovar nemají minuty na brewing_system, protože závisí na receptu. Zobrazit v UI jako readonly řádky s vysvětlujícím textem.
- **equipment_type cleanup** — při migraci NEJDŘÍV zkontrolovat FK vazby (batches.equipment_id). Pokud existují batche navázané na brewhouse, nastavit equipment_id = NULL před DELETE.
- **Sidebar rename** — pokud "Tanky" nevyhovuje, alternativa je ponechat "Zařízení" a brewing systems nazvat "Varní soustavy". Obojí je v sidebar viditelné.
- **fermenter_volume_l** — schématická/referenční hodnota pro vizualizaci na brewing_system. NESLOUŽÍ k přiřazení konkrétního tanku — to je equipment_id na batch. Pivovar může mít CKT různých velikostí; na brewing_system je typický/referenční objem pro výpočet konečného objemu piva.
- **VesselBlock implementace** — CSS/Tailwind. Nádoba = div s border, vnitřní div s background-color a výškou v %. Žádné SVG ani canvas — čistý CSS. Barvy: `amber-600` (sladina), `yellow-400` (mladina), `yellow-200` (hotové pivo) — nebo dle Tailwind palety, aby to odpovídalo screenshotu z Bubble.
