# SPRINT 6 — FÁZE A2: EQUIPMENT REFAKTOR
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 27.02.2026

---

## CÍL

Zjednodušit modul `equipment` tak, aby obsahoval pouze **nádoby studené zóny** (fermentory, ležácké tanky, CKT). Typy teplé zóny (brewhouse) a podpůrná zařízení (bottling_line, keg_washer) se odstraňují — jejich funkci přebírá nová entita `brewing_systems` (viz fáze A1).

Současně přidat vazbu `brewing_system_id` na tabulky `recipes` a `batches`.

**Prerekvizita:** Fáze A1 (brewing_systems tabulka + CRUD) musí být hotová.

---

## KONTEXT

### Proč refaktor

Dosavadní `equipment` míchal dvě různé věci:
- **Varní soustava** (brewhouse) — šablona pro výpočty objemů/ztrát → přesunuto do `brewing_systems`
- **Nádoby** (fermenter, CKT, ležácký tank) — fyzické tanky pro přiřazení šarží

Po refaktoru `equipment` = jen nádoby, kam se dává pivo. Přiřazují se konkrétním šaržím (batch.equipment_id).

### Reálný provoz minipivovarů

- **CKT (cylindrokónický tank):** Nejčastější — kvašení i ležení v jedné nádobě
- **Spilka + ležácký tank:** Kvašení v otevřené spilce → přesun do ležáckého tanku
- **Double batch:** CKT bývá 2× objem varny, 2 vary se slévají do jednoho CKT

Equipment eviduje tyto fyzické nádoby se stavem (volný/obsazený) a kapacitou. Plánování obsazenosti a double batch se řeší na úrovni batch, ne equipment.

---

## KROK 1: DATABÁZOVÁ MIGRACE

### 1.1 Ověření FK vazeb (PŘED mazáním!)

```sql
-- Zjisti jestli existují batche navázané na equipment typu brewhouse/bottling_line/keg_washer
SELECT b.id, b.batch_number, b.status, e.name, e.equipment_type
FROM batches b
JOIN equipment e ON b.equipment_id = e.id
WHERE e.equipment_type IN ('brewhouse', 'bottling_line', 'keg_washer');
```

**Pokud query vrátí řádky:**
```sql
-- Odpoj batche od mazaných equipment záznamů
UPDATE batches SET equipment_id = NULL
WHERE equipment_id IN (
  SELECT id FROM equipment
  WHERE equipment_type IN ('brewhouse', 'bottling_line', 'keg_washer')
);
```

**Pokud query vrátí 0 řádků:** Můžeš rovnou mazat.

### 1.2 Smazání nepotřebných equipment záznamů

```sql
DELETE FROM equipment
WHERE equipment_type IN ('brewhouse', 'bottling_line', 'keg_washer');
```

### 1.3 Nové sloupce na recipes a batches

```sql
-- Vazba na brewing_systems
ALTER TABLE recipes ADD COLUMN brewing_system_id UUID REFERENCES brewing_systems(id);
ALTER TABLE batches ADD COLUMN brewing_system_id UUID REFERENCES brewing_systems(id);
```

### 1.4 Drizzle schema aktualizace

**`drizzle/schema/recipes.ts`** — přidat:
```typescript
brewingSystemId: uuid("brewing_system_id").references(() => brewingSystems.id),
```

**`drizzle/schema/batches.ts`** — přidat:
```typescript
brewingSystemId: uuid("brewing_system_id").references(() => brewingSystems.id),
```

Import `brewingSystems` z `./brewing-systems`.

### 1.5 Migrace

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

---

## KROK 2: EQUIPMENT TYPES

### 2.1 `src/modules/equipment/types.ts`

**Před:**
```typescript
export type EquipmentType =
  | "brewhouse"
  | "fermenter"
  | "brite_tank"
  | "conditioning"
  | "bottling_line"
  | "keg_washer";
```

**Po:**
```typescript
export type EquipmentType =
  | "fermenter"
  | "brite_tank"
  | "conditioning";
```

### 2.2 Ověř všechny importy/reference

Prohledej codebase na výskyty odstraněných typů:
```bash
grep -rn "brewhouse\|bottling_line\|keg_washer" src/ --include="*.ts" --include="*.tsx"
```

Každý výskyt uprav nebo odstraň.

---

## KROK 3: EQUIPMENT CONFIG

### 3.1 `src/modules/equipment/config.ts`

**Quick filtry — PŘED:**
```typescript
quickFilters: [
  { key: "all", label: "Vše", filter: {} },
  { key: "brewhouse", label: "Varny", filter: { equipmentType: "brewhouse" } },
  { key: "fermenter", label: "Fermentory", filter: { equipmentType: "fermenter" } },
  { key: "brite_tank", label: "Ležácké", filter: { equipmentType: "brite_tank" } },
  { key: "conditioning", label: "CKT", filter: { equipmentType: "conditioning" } },
  { key: "bottling_line", label: "Stáčecí", filter: { equipmentType: "bottling_line" } },
],
```

**Quick filtry — PO:**
```typescript
quickFilters: [
  { key: "all", label: "Vše", filter: {} },
  { key: "fermenter", label: "Fermentory", filter: { equipmentType: "fermenter" } },
  { key: "brite_tank", label: "Ležácké tanky", filter: { equipmentType: "brite_tank" } },
  { key: "conditioning", label: "CKT", filter: { equipmentType: "conditioning" } },
],
```

**Parametrický filtr equipmentType — PO:**
```typescript
{
  key: "equipmentType",
  label: "Typ",
  type: "select",
  options: [
    { value: "fermenter", label: "Fermentor" },
    { value: "brite_tank", label: "Ležácký tank" },
    { value: "conditioning", label: "CKT" },
  ],
},
```

**Title a create label** — ponechat "Zařízení" / "+ Zařízení" (nezměněno).

---

## KROK 4: EQUIPMENT BROWSER COMPONENT

### 4.1 `src/modules/equipment/components/EquipmentBrowser.tsx`

Odstraň z `equipmentTypeLabels` mapy:
```typescript
// SMAZAT:
brewhouse: t("equipmentType.brewhouse"),
bottling_line: t("equipmentType.bottling_line"),
keg_washer: t("equipmentType.keg_washer"),
```

**Ponechat:**
```typescript
const equipmentTypeLabels: Record<string, string> = {
  fermenter: t("equipmentType.fermenter"),
  brite_tank: t("equipmentType.brite_tank"),
  conditioning: t("equipmentType.conditioning"),
};
```

### 4.2 `src/modules/equipment/components/EquipmentForm.tsx` (nebo EquipmentDetail.tsx)

V selectu pro `equipmentType` odstraň smazané options:
```typescript
// Pouze tyto 3 typy v select/dropdown:
// fermenter — Fermentor
// brite_tank — Ležácký tank
// conditioning — CKT
```

---

## KROK 5: I18N

### 5.1 `src/i18n/messages/cs/equipment.json`

**Smazat klíče:**
```json
// Z quickFilters smazat:
"brewhouse": "Varny",
"bottling_line": "Stáčecí",

// Z equipmentType smazat:
"brewhouse": "Varna",
"bottling_line": "Stáčecí linka",
"keg_washer": "Myčka sudů"
```

**Výsledný stav quickFilters:**
```json
"quickFilters": {
  "all": "Vše",
  "fermenter": "Fermentory",
  "brite_tank": "Ležácké tanky",
  "conditioning": "CKT"
}
```

**Výsledný stav equipmentType:**
```json
"equipmentType": {
  "fermenter": "Fermentor",
  "brite_tank": "Ležácký tank",
  "conditioning": "CKT"
}
```

### 5.2 `src/i18n/messages/en/equipment.json`

Analogicky:

**Smazat klíče:**
```json
// Z quickFilters:
"brewhouse": "Brewhouses",
"bottling_line": "Bottling Lines",

// Z equipmentType:
"brewhouse": "Brewhouse",
"bottling_line": "Bottling Line",
"keg_washer": "Keg Washer"
```

**Výsledný stav quickFilters:**
```json
"quickFilters": {
  "all": "All",
  "fermenter": "Fermenters",
  "brite_tank": "Brite Tanks",
  "conditioning": "Conditioning Tanks"
}
```

**Výsledný stav equipmentType:**
```json
"equipmentType": {
  "fermenter": "Fermenter",
  "brite_tank": "Brite Tank",
  "conditioning": "Conditioning Tank"
}
```

---

## KROK 6: SEED DATA

### 6.1 `supabase/seed.sql`

**Odstraň** všechny INSERT do `equipment` s equipment_type = `brewhouse`, `bottling_line`, `keg_washer`.

**Ponechej** fermentory a CKT. Příklad aktualizovaného seedu:

```sql
-- Equipment — pouze nádoby studené zóny
INSERT INTO equipment (id, tenant_id, shop_id, name, equipment_type, volume_l, status, notes) VALUES
  (gen_random_uuid(), '<test_tenant_id>', '<test_shop_id>', 'CKT-1', 'conditioning', 1000, 'available', 'Cylindrokónický tank 1000L'),
  (gen_random_uuid(), '<test_tenant_id>', '<test_shop_id>', 'CKT-2', 'conditioning', 1000, 'available', 'Cylindrokónický tank 1000L'),
  (gen_random_uuid(), '<test_tenant_id>', '<test_shop_id>', 'Ležák-1', 'brite_tank', 500, 'available', 'Ležácký tank 500L'),
  (gen_random_uuid(), '<test_tenant_id>', '<test_shop_id>', 'Fermentor-1', 'fermenter', 500, 'available', 'Otevřená spilka 500L');
```

---

## KROK 7: SYSTEM-DESIGN.md AKTUALIZACE

### 7.1 Sekce equipment

Aktualizovat komentář u `equipment_type`:

**Před:**
```sql
equipment_type  TEXT NOT NULL,  -- 'brewhouse' | 'fermenter' | 'brite_tank' |
                                -- 'conditioning' | 'bottling_line' | 'keg_washer'
```

**Po:**
```sql
equipment_type  TEXT NOT NULL,  -- 'fermenter' | 'brite_tank' | 'conditioning'
                                -- (brewhouse → brewing_systems, bottling/keg removed)
```

### 7.2 Sekce batches

Přidat `brewing_system_id` do batches schema dokumentace.

### 7.3 Sekce recipes

Přidat `brewing_system_id` do recipes schema dokumentace.

---

## KROK 8: NAVIGACE (SIDEBAR)

### 8.1 Přidat "Varní soustavy" do sidebar

V konfiguraci sidebar (pravděpodobně `src/components/layout/sidebar-config.ts` nebo obdobný soubor) přidat novou položku pod modul Pivovar:

```
Pivovar:
  - Přehled          (/brewery/overview)
  - Partneři         (/brewery/partners)
  - Kontakty         (/brewery/contacts)
  - Suroviny         (/brewery/materials)
  - Receptury        (/brewery/recipes)
  - Vary             (/brewery/batches)
  - Varní soustavy   (/brewery/brewing-systems)    ← NOVÉ
  - Zařízení         (/brewery/equipment)           ← ponechat název
```

**Poznámka:** Ikona pro Varní soustavy — `Factory`, `Cog`, `Flame` nebo `Combine` z lucide-react. Zvolte co nejlépe pasuje.

---

## AKCEPTAČNÍ KRITÉRIA

### Databáze
1. [ ] Žádné equipment záznamy typu brewhouse/bottling_line/keg_washer v DB
2. [ ] Žádné batche s equipment_id odkazujícím na neexistující equipment
3. [ ] `recipes.brewing_system_id` sloupec existuje (FK na brewing_systems)
4. [ ] `batches.brewing_system_id` sloupec existuje (FK na brewing_systems)
5. [ ] Drizzle schema recipes.ts a batches.ts obsahují `brewingSystemId`

### TypeScript / Code
6. [ ] `EquipmentType` obsahuje pouze `fermenter | brite_tank | conditioning`
7. [ ] Žádné reference na `brewhouse`, `bottling_line`, `keg_washer` v src/ (grep = 0 výskytů)
8. [ ] Equipment browser: quick filtry pouze Vše/Fermentory/Ležácké tanky/CKT
9. [ ] Equipment parametrický filtr: pouze 3 typy
10. [ ] Equipment form/detail: select typ pouze 3 options

### i18n
11. [ ] CS: smazány překlady brewhouse/bottling_line/keg_washer
12. [ ] EN: smazány překlady brewhouse/bottling_line/keg_washer

### Seed & Docs
13. [ ] Seed data neobsahují brewhouse/bottling_line/keg_washer
14. [ ] Seed data obsahují CKT + ležácký tank + fermentor
15. [ ] SYSTEM-DESIGN.md aktualizován (equipment_type komentář, brewing_system_id na recipes + batches)

### Navigace
16. [ ] Sidebar obsahuje "Varní soustavy" se správnou route
17. [ ] "Zařízení" v sidebar zůstává funkční

### Build
18. [ ] `npm run build` bez chyb
19. [ ] TypeScript: zero errors, no `any`

---

## CO NEIMPLEMENTOVAT

- **UI pro výběr brewing_system na receptuře/šarži** — sloupec v DB existuje, ale select/dropdown bude v S7 (Recipe Designer krok 1)
- **Automatická kopie brewing_system_id z recipe na batch** — bude v S7 při refaktoru createBatch()
- **CHECK constraint na equipment_type** — nechceme blokovat případné budoucí typy
- **Přejmenování "Zařízení" na "Tanky"** — ponecháme "Zařízení", je to obecně srozumitelné

---

## TECHNICKÉ POZNÁMKY

- **Pořadí operací migrace:** 1) ověř FK, 2) odpoj batche pokud třeba, 3) DELETE equipment, 4) ALTER recipes/batches. NIKDY nemazat equipment před odpojením batchů.
- **Drizzle schema** — po editaci spustit `npx drizzle-kit generate` a ověřit vygenerovanou migraci.
- **Grep kontrola** — po dokončení spustit `grep -rn "brewhouse\|bottling_line\|keg_washer" src/ --include="*.ts" --include="*.tsx"` a ověřit 0 výskytů.
- **Sidebar config** — lokalizuj soubor kde se definuje navigace. Může být v `src/components/layout/`, `src/config/`, nebo `src/app/` — záleží na implementaci z S0.
