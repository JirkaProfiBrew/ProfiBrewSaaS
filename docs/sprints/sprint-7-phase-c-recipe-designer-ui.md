# SPRINT 7 — FÁZE C: RECIPE DESIGNER UI
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 27.02.2026

---

## CÍL

Kompletně nový UI pro tvorbu a editaci receptur. Nahrazuje stávající FormSection/taby z Sprint 2. Dvoustupňový layout: horní collapsible sekce (cíl + parametry) a spodní editor se 7 sub-taby. Real-time feedback panel s progress bary. Drag & drop karty surovin. Snapshot receptury při vytváření várky.

**Závisí na:** Phase A (brewing systems, beer styles, mash profiles), Phase B (kalkulační engine s pipeline)

---

## ARCHITEKTURA

### Layout stránky `/brewery/recipes/[id]`

```
┌─────────────────────────────────────────────────────────┐
│  FEEDBACK BAR (vždy viditelný, kompaktní)               │
│  OG ████░░ 12.5°P  IBU ██████ 38  EBC ███░░ 14  ABV 5.2% │
├─────────────────────────────────────────────────────────┤
│  KROK 1: CÍL + SOUSTAVA (collapsible ▼)                │
│  ┌───────────────────────────────────────────────────┐  │
│  │ Styl: [Czech Premium Pale Lager ▾]                │  │
│  │ Soustava: [Produkční 500L ▾]  Profil: [Dekokční ▾]│  │
│  │ Objem: [500] L   OG cíl: [12.0] °P               │  │
│  │ Sladu potřeba: 98.5 kg   Vody potřeba: 404 L     │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  KROK 2: EDITOR                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Slady │ Chmel │ Kvasnice │ Ostatní │ Rmutování │    │
│  │ Konstanty │ Kalkulace                            │    │
│  ├─────────────────────────────────────────────────┤    │
│  │                                                  │    │
│  │  [obsah aktivního tabu]                          │ S  │
│  │                                                  │ I  │
│  │                                                  │ D  │
│  │                                                  │ E  │
│  │                                                  │ B  │
│  │                                                  │ A  │
│  │                                                  │ R  │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

**Na širokém displeji (≥1280px):** Sidebar vpravo s detailním feedback panelem (pipeline, slad plan/actual, target ranges).

**Na užším displeji (<1280px):** Bez sidebaru, jen kompaktní feedback bar nahoře.

---

## KROK 1: CÍL + SOUSTAVA (HORNÍ SEKCE)

### 1.1 Layout

Collapsible sekce (default: rozbalená pro novou recepturu, sbalená pro existující).

**Pole:**

| Pole | Typ | Zdroj |
|------|-----|-------|
| Název receptury | text input | recipes.name |
| Kód | text (auto z číslovací řady) | recipes.code |
| Pivní styl | select + BeerGlass preview | beer_styles (s group filter) |
| Varní soustava | select | brewing_systems pro tenant |
| Rmutovací profil | select | mashing_profiles (systémové + vlastní) |
| Cílový objem (L) | number input | recipes.batch_size_l |
| Cílové OG (°P) | number input | recipes.og (target) |
| Status | select (draft/active/archived) | recipes.status |
| Položka výroby | select | items kde is_production_item |
| Trvanlivost (dní) | number | recipes.shelf_life_days |
| Doba kvašení (dní) | number | recipes.duration_fermentation_days |
| Doba dokvašování (dní) | number | recipes.duration_conditioning_days |

### 1.2 Automatické výpočty při změně

**Při výběru pivního stylu:**
- Předvyplnit target ranges do feedback panelu (IBU min/max, EBC min/max, OG min/max, FG min/max, ABV min/max)
- Předvyplnit cílové OG z style.og_min (pokud není vyplněno)

**Při výběru varní soustavy:**
- Předvyplnit cílový objem z brewing_system.batch_size_l (pokud není vyplněno)
- Přepočítat pipeline (objemy a ztráty)
- Přepočítat potřebu sladu a vody

**Při výběru rmutovacího profilu:**
- Aplikovat kroky profilu do recipe_steps (přes stávající `applyMashProfile()`)
- Zobrazit kroky na tabu Rmutování

**Při změně objemu:**
- Dialog: "Objem receptury se změnil z {old}L na {new}L. Přepočítat množství surovin proporcionálně?"
- Ano → proporcionální přepočet všech recipe_items (amount × new/old)
- Ne → přepočítat jen výpočty (OG/IBU/EBC se změní protože objem je jiný)
- Obě varianty → přepočítat pipeline, potřebu sladu, potřebu vody

### 1.3 Flow pro novou recepturu

1. Klik "+ Receptura" na browser → navigace na `/brewery/recipes/new`
2. Krok 1 je rozbalený, krok 2 prázdný
3. Uživatel vyplní: název, styl, soustavu, profil, objem, OG
4. Klik "Pokračovat" → uloží recepturu (draft), rozbalí krok 2, sbalí krok 1
5. Krok 1 zůstává přístupný (klik na collapsible header → rozbalit)

### 1.4 Flow pro existující recepturu

1. Klik na recepturu v browser → navigace na `/brewery/recipes/[id]`
2. Krok 1 je sbalený (viditelný jako kompaktní řádek: "Czech Premium Pale Lager | 500L | Produkční soustava")
3. Krok 2 je rozbalený s daty
4. Klik na krok 1 header → rozbalit pro editaci

---

## KROK 2: EDITOR (SPODNÍ SEKCE)

### 2.0 Sub-taby

```
[ Slady ] [ Chmel ] [ Kvasnice ] [ Ostatní ] [ Rmutování ] [ Konstanty ] [ Kalkulace ]
```

Badge na tabu: počet položek (Slady: 4, Chmel: 3, ...). Rmutování: počet kroků. Kalkulace: žádný badge.

---

### 2.1 Tab SLADY

#### Drag & drop karty

Každý slad = karta:

```
┌──────────────────────────────────────────┐
│ ⋮⋮  Český světlý (plzeňský)         ✕   │
│     Značka: Sladovny Hodonice            │
│                                          │
│  Množství: [25.0] kg    EBC: 3.5        │
│  Extrakt:  80%          Podíl: 86.2%     │
│                                          │
│  Příspěvek: EBC 2.8 | Extract 20.0 kg   │
└──────────────────────────────────────────┘
```

**Pole na kartě:**
- Item select (filtr: category = malt, is_brew_material = true)
- Množství + jednotka
- EBC (readonly, z item)
- Extrakt % (readonly, z item)
- Podíl % na celku (computed: tento_kg / celkový_kg × 100)
- Příspěvek k EBC a extraktu (computed)

**Interakce:**
- `+ Přidat slad` — přidá prázdnou kartu
- Drag & drop pro změnu pořadí (řazení vizuální, sort_order)
- ✕ pro odebrání (s potvrzením)
- Inline editace množství → okamžitý přepočet feedback panelu

**Sumární řádek pod kartami:**

```
Celkem: 29.0 kg | Plán: 28.8 kg | Přebývá: 0.2 kg ⚠️
Barva: 14.2 EBC | Cíl: 7–14 EBC ✅
Extraktivita: 79.3%
```

- "Plán" = `maltRequiredKg` z Phase B engine (potřeba sladu dle OG a efektivity)
- "Celkem" = součet kg všech sladů
- Barevné kódování: zelená (v rozsahu), oranžová (mírně mimo), červená (daleko mimo)

### 2.2 Tab CHMEL

Karty chmelů:

```
┌──────────────────────────────────────────┐
│ ⋮⋮  Žatecký poloranný červeňák      ✕   │
│     Alpha: 3.7%                          │
│                                          │
│  Množství: [350] g    Fáze: [Chmelovar ▾]│
│  Čas varu: [60] min                      │
│                                          │
│  Příspěvek: 18.5 IBU (48.7% z celku)    │
└──────────────────────────────────────────┘
```

**Pole na kartě:**
- Item select (filtr: category = hop)
- Množství (g) + jednotka
- Alpha % (readonly, z item)
- Fáze: Chmelovar | Whirlpool | Dry hop (select)
- Čas varu (min) — jen pro Chmelovar a Whirlpool
- Příspěvek IBU (computed z Tinseth) + % podíl

**Sumární řádek:**

```
Celkem IBU: 38.2 | Cíl: 30–45 IBU ✅
Chmelovar: 32.1 IBU | Whirlpool: 4.5 IBU | Dry hop: 1.6 IBU
```

### 2.3 Tab KVASNICE

Jednodušší layout — typicky 1 kvasnice:

```
┌──────────────────────────────────────────┐
│ ⋮⋮  Safale S-189                     ✕   │
│     Typ: Spodní kvašení                  │
│                                          │
│  Množství: [2] balení    Atenuace: 81%   │
│                                          │
│  Odhadované FG: 2.3 °P → ABV: 5.2%      │
└──────────────────────────────────────────┘
```

**Pole:**
- Item select (filtr: category = yeast)
- Množství + jednotka
- Atenuace % (readonly, z item — pokud vyplněno)
- Odhadované FG + ABV (informační, NEPOUŽÍVÁ se pro výpočet — Phase C jen zobrazí, nemění logiku FG odhadu)

### 2.4 Tab OSTATNÍ

Karty pro adjunkty a přísady:

```
┌──────────────────────────────────────────┐
│ ⋮⋮  Pomerančová kůra               ✕   │
│                                          │
│  Množství: [20] g    Fáze: [Chmelovar ▾]│
│  Čas: [15] min                           │
│  Poznámka: sušená, přidat posledních 15m │
└──────────────────────────────────────────┘
```

**Pole:**
- Item select (filtr: category = adjunct | other)
- Množství + jednotka
- Fáze (mash/boil/whirlpool/fermentation)
- Čas (min)
- Poznámka (text)

### 2.5 Tab RMUTOVÁNÍ

Přebírá MashStepEditor z Phase A4 — tabulka kroků s inline editací.

**Rozdíl oproti A4 standalone:**
- Edituje `recipe_steps` (ne mashing_profiles.steps)
- Tlačítko "Načíst profil" → dialog se seznamem profilů → nahradí kroky
- Tlačítko "Uložit jako profil" → uloží aktuální kroky jako nový mashing_profile
- Real-time: celkový čas rmutování se zobrazuje ve feedback panelu

**Nice-to-have:** Teplotní graf (MashTemperatureChart z A4 spec) — pokud byl implementován.

### 2.6 Tab KONSTANTY

Per-recipe overrides parametrů z varní soustavy.

**Layout:**

```
Zdroj hodnot: Varní soustava "Produkční 500L" [Změnit]
⚠️ Upravené hodnoty přepisují varní soustavu jen pro tuto recepturu.

┌─────────────────────────────────────────────────┐
│ Parametr              │ Soustava │ Receptura    │
├───────────────────────┼──────────┼──────────────┤
│ Efektivita varny (%)  │ 75       │ [75]         │
│ Ztráta kotel (%)      │ 10       │ [10]         │
│ Ztráta whirlpool (%)  │ 5        │ [5]          │
│ Ztráta fermentace (%) │ 5        │ [5]          │
│ Extrakt sladu (%)     │ 80       │ [80]         │
│ Voda L/kg sladu       │ 4.0      │ [4.0]        │
│ Rezerva vody (L)      │ 10       │ [10]         │
│ Čas chmelovaru (min)  │ —        │ [60]         │
└───────────────────────┴──────────┴──────────────┘

[Obnovit z varní soustavy]  — reset na defaults
```

**Chování:**
- Defaultně: hodnoty z brewing_system (pokud vybraný), jinak DEFAULT_BREWING_SYSTEM
- Uživatel může přepsat per-recipe → uloží se na recepturu
- Sloupec "Soustava" = readonly reference
- Sloupec "Receptura" = editovatelný input
- Vizuálně zvýraznit hodnoty odlišné od soustavy (bold/jiná barva)
- "Obnovit z varní soustavy" = reset na hodnoty z brewing_system

**Ukládání:** Nový JSONB sloupec na recipes:

```sql
ALTER TABLE recipes ADD COLUMN constants_override JSONB;
```

```typescript
// Typ
interface RecipeConstantsOverride {
  efficiencyPct?: number;
  kettleLossPct?: number;
  whirlpoolLossPct?: number;
  fermentationLossPct?: number;
  extractEstimate?: number;
  waterPerKgMalt?: number;
  waterReserveL?: number;
  boilTimeMin?: number;
}
```

**Integrace s kalkulačním enginem:** Při `calculateAndSaveRecipe()`:
1. Načti brewing_system parametry
2. Pokud `recipe.constants_override` existuje → merge (override má přednost)
3. Výsledný `BrewingSystemInput` použij pro výpočty

### 2.7 Tab KALKULACE

Zobrazuje výsledky kalkulačního enginu + nákladovou kalkulaci.

**Sekce 1: Objemová pipeline**

```
Pre-boil (sladina):  617.3 L
  ↓ Ztráta kotel:     -61.7 L (10%)
Post-boil (mladina):  555.6 L
  ↓ Ztráta whirlpool: -27.8 L (5%)
Do fermentoru:        527.8 L
  ↓ Ztráta fermentace: -27.8 L (5%)
Hotové pivo:          500.0 L
──────────────────────────────
Celkové ztráty:       117.3 L (19.0%)
```

Vizuálně: vertikální flow se šipkami a barevnými bloky (podobně jako VesselBlock z A1).

**Sekce 2: Potřeba surovin**

```
Potřeba sladu:  98.5 kg (dle OG 12.0°P a efektivity 75%)
Aktuální slad:  99.0 kg (z receptury)
Rozdíl:         +0.5 kg ⚠️

Potřeba vody:   404.0 L (98.5 kg × 4.0 L/kg + 10 L)
```

**Sekce 3: Pivovarské parametry**

```
                Receptura    Cíl (styl)     Status
OG (°P):       12.5         11.2 – 13.8    ✅
FG (°P):        3.1          2.6 – 4.0     ✅
ABV (%):        5.2          4.0 – 5.4     ✅
IBU:           38.2         30 – 45        ✅
EBC:           14.2          7 – 14        ⚠️ mírně nad
```

**Sekce 4: Nákladová kalkulace**

```
Suroviny celkem:        2 850 Kč
  Slady:                1 920 Kč
  Chmel:                  680 Kč
  Kvasnice:               180 Kč
  Ostatní:                 70 Kč
Režie surovin (5%):       143 Kč
Náklady var:              500 Kč
Režie fix:                200 Kč
─────────────────────────────────
Celkem výroba:          3 693 Kč
Cena za litr:             7.39 Kč/L
Cena za hl:              738.60 Kč/hl
```

**Sekce 5: Rozpad nákladů per surovina** (expandable tabulka)

| Surovina | Množství | MJ | Cena/MJ | Celkem | Zdroj ceny |
|----------|----------|-----|---------|--------|------------|
| Český světlý | 25.0 | kg | 22.00 | 550 Kč | Kalk. cena |
| Mnichovský | 3.0 | kg | 28.00 | 84 Kč | Průměrná |
| ... | | | | | |

---

## FEEDBACK PANEL

### 3.1 Kompaktní bar (vždy viditelný)

Sticky header pod navigation:

```
┌─────────────────────────────────────────────────────────────────┐
│ OG ████████░░ 12.5/12.0°P  IBU █████░░░ 38/35  EBC ███████░ 14/12  ABV 5.2%  Slad: 99/98.5kg │
└─────────────────────────────────────────────────────────────────┘
```

Každý parametr: progress bar + číslo (actual/target).

**Barevné kódování progress barů:**
- **Zelená** (#22c55e): hodnota je v rozsahu stylu (min ≤ value ≤ max)
- **Oranžová** (#f59e0b): hodnota je do 10% mimo rozsah
- **Červená** (#ef4444): hodnota je > 10% mimo rozsah
- **Šedá** (#94a3b8): žádný styl vybraný (bez target range)

**Progress bar výpočet:**
- 0% = 0 (nebo min parametru)
- 100% = max z target range stylu
- Aktuální hodnota = pozice ukazatele
- Na baru viditelné "target zone" (vyšrafovaný nebo tmavší pás)

### 3.2 Detail sidebar (na ≥1280px)

Pravý panel (šířka ~300px), sticky scroll:

```
┌───────────────────────┐
│  🎯 Cíl receptury     │
│                       │
│  Styl: Czech Premium  │
│  Objem: 500 L         │
│  Soustava: Produkční  │
│                       │
│  ── Parametry ──      │
│  OG:  12.5 / 12.0°P ✅│
│  IBU: 38.2 / 30-45  ✅│
│  EBC: 14.2 / 7-14   ⚠️│
│  ABV: 5.2  / 4-5.4  ✅│
│  FG:  3.1  / 2.6-4  ✅│
│                       │
│  ── Slad ──           │
│  Plán:   98.5 kg      │
│  Aktuál: 99.0 kg      │
│  Rozdíl: +0.5 kg  ⚠️  │
│                       │
│  ── Pipeline ──       │
│  Pre-boil:  617 L     │
│  Post-boil: 556 L     │
│  Fermenter: 528 L     │
│  Hotové:    500 L     │
│                       │
│  ── Voda ──           │
│  Potřeba: 404 L       │
│                       │
│  ── Náklady ──        │
│  Celkem: 3 693 Kč     │
│  Per litr: 7.39 Kč    │
└───────────────────────┘
```

### 3.3 Real-time přepočet

Feedback panel se přepočítává okamžitě při:
- Změně množství suroviny (debounce 300ms)
- Přidání/odebrání suroviny
- Změně objemu
- Změně brewing system nebo konstant

**Implementace:** Client-side výpočty z `utils.ts` (pure functions). Žádné server calls pro real-time preview. Server save (`calculateAndSaveRecipe`) až při explicitním uložení.

---

## SNAPSHOT RECEPTURY NA VÁRCE

**⚠️ UŽ IMPLEMENTOVÁNO** — snapshot logika (duplikace receptury při vytvoření várky, is_snapshot, source_recipe_id) je hotová ze Sprint 2. Tato fáze jen zajistí kompatibilitu nového designeru se snapshoty:

- RecipeDesigner musí fungovat i pro snapshot receptury (otevřený z batch detailu)
- RecipeBrowser musí nadále filtrovat snapshoty (`is_snapshot = false`)
- Nový sloupec `constants_override` se musí kopírovat při vytváření snapshotu (rozšířit existující snapshot logiku)

---

## DRAG & DROP IMPLEMENTACE

### 5.1 Knihovna

Použít `@dnd-kit/core` + `@dnd-kit/sortable` (standard pro React D&D). Pokud už je v projektu jiná D&D knihovna, použít tu.

### 5.2 Pattern

```typescript
import { DndContext, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";

// Wrapper
<DndContext onDragEnd={handleDragEnd} collisionDetection={closestCenter}>
  <SortableContext items={ingredients} strategy={verticalListSortingStrategy}>
    {ingredients.map((item) => (
      <SortableIngredientCard key={item.id} ingredient={item} />
    ))}
  </SortableContext>
</DndContext>

// Card
function SortableIngredientCard({ ingredient }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: ingredient.id });
  // ... render card with drag handle
}
```

### 5.3 Drag handle

Každá karta má `⋮⋮` ikonu vlevo nahoře = drag handle. Zbytek karty je klikatelný pro editaci.

---

## MODULE STRUCTURE

```
src/modules/recipes/
├── components/
│   ├── RecipeBrowser.tsx           -- Stávající (mírné úpravy - filtr snapshots)
│   ├── RecipeDesigner.tsx          -- NOVÝ: hlavní layout (krok 1 + krok 2 + feedback)
│   ├── RecipeTargetSection.tsx     -- NOVÝ: Krok 1 (collapsible)
│   ├── RecipeEditor.tsx            -- NOVÝ: Krok 2 wrapper (sub-taby)
│   ├── RecipeFeedbackBar.tsx       -- NOVÝ: kompaktní bar (sticky header)
│   ├── RecipeFeedbackSidebar.tsx   -- NOVÝ: detail sidebar (≥1280px)
│   ├── tabs/
│   │   ├── MaltTab.tsx             -- NOVÝ: drag & drop karty sladů
│   │   ├── HopTab.tsx              -- NOVÝ: drag & drop karty chmelů
│   │   ├── YeastTab.tsx            -- NOVÝ: karty kvasnic
│   │   ├── AdjunctTab.tsx          -- NOVÝ: karty ostatních surovin
│   │   ├── MashTab.tsx             -- NOVÝ: wrapper pro MashStepEditor
│   │   ├── ConstantsTab.tsx        -- NOVÝ: per-recipe overrides
│   │   └── CalculationTab.tsx      -- NOVÝ: výsledky + pipeline + náklady
│   ├── cards/
│   │   ├── IngredientCard.tsx      -- NOVÝ: base sortable card
│   │   ├── MaltCard.tsx            -- NOVÝ
│   │   ├── HopCard.tsx             -- NOVÝ
│   │   ├── YeastCard.tsx           -- NOVÝ
│   │   └── AdjunctCard.tsx         -- NOVÝ
│   ├── RecipeDetail.tsx            -- DEPRECATED (nahrazuje RecipeDesigner)
│   └── RecipeForm.tsx              -- DEPRECATED (nahrazuje RecipeTargetSection)
├── config.ts
├── actions.ts                      -- Rozšířit o snapshot logiku
├── hooks.ts
│   ├── useRecipeCalculation.ts     -- NOVÝ: client-side real-time výpočet
│   └── useVolumeResize.ts          -- NOVÝ: dialog pro přepočet surovin
├── types.ts                        -- Rozšířit
├── utils.ts                        -- Beze změny (Phase B)
├── schema.ts
└── index.ts
```

---

## STÁVAJÍCÍ KÓD — CO SE STANE

| Soubor | Akce |
|--------|------|
| RecipeDetail.tsx | DEPRECATED — nahrazeno RecipeDesigner.tsx |
| RecipeForm.tsx | DEPRECATED — nahrazeno RecipeTargetSection.tsx |
| RecipeBrowser.tsx | UPRAVIT — přidat filtr `is_snapshot = false` |
| actions.ts | ROZŠÍŘIT — snapshot logika, constants override |
| utils.ts | BEZE ZMĚNY — Phase B je hotové |
| types.ts | ROZŠÍŘIT — ConstantsOverride, snapshot fields |

**⚠️ NEMAZAT stávající soubory dokud nový UI není plně funkční.** Přejmenovat na `*.deprecated.tsx` a pak smazat v cleanup fázi.

---

## I18N

### Rozšíření `src/i18n/messages/cs/recipes.json`

```json
{
  "designer": {
    "target": {
      "title": "Cíl receptury",
      "collapsed": "{style} | {volume}L | {system}",
      "continue": "Pokračovat k editoru"
    },
    "feedback": {
      "og": "OG",
      "ibu": "IBU",
      "ebc": "EBC",
      "abv": "ABV",
      "fg": "FG",
      "maltPlan": "Slad plán",
      "maltActual": "Slad aktuál",
      "inRange": "V rozsahu",
      "slightlyOff": "Mírně mimo",
      "outOfRange": "Mimo rozsah",
      "noStyle": "Styl nevybrán"
    },
    "volumeChange": {
      "title": "Změna objemu receptury",
      "message": "Objem se změnil z {old}L na {new}L. Přepočítat množství surovin proporcionálně?",
      "recalculate": "Ano, přepočítat",
      "keepAmounts": "Ne, ponechat množství"
    },
    "tabs": {
      "malts": "Slady",
      "hops": "Chmel",
      "yeast": "Kvasnice",
      "adjuncts": "Ostatní",
      "mashing": "Rmutování",
      "constants": "Konstanty",
      "calculation": "Kalkulace"
    },
    "cards": {
      "amount": "Množství",
      "brand": "Značka",
      "contribution": "Příspěvek",
      "share": "Podíl",
      "phase": "Fáze",
      "boilTime": "Čas varu",
      "alpha": "Alpha",
      "attenuation": "Atenuace",
      "estimatedFg": "Odhadované FG",
      "note": "Poznámka",
      "addMalt": "Přidat slad",
      "addHop": "Přidat chmel",
      "addYeast": "Přidat kvasnice",
      "addAdjunct": "Přidat přísadu"
    },
    "constants": {
      "title": "Konstanty výpočtu",
      "source": "Zdroj hodnot: Varní soustava \"{name}\"",
      "noSystem": "Žádná varní soustava (výchozí hodnoty)",
      "overrideWarning": "Upravené hodnoty přepisují varní soustavu jen pro tuto recepturu.",
      "resetToSystem": "Obnovit z varní soustavy",
      "paramHeader": "Parametr",
      "systemHeader": "Soustava",
      "recipeHeader": "Receptura",
      "efficiency": "Efektivita varny (%)",
      "kettleLoss": "Ztráta kotel (%)",
      "whirlpoolLoss": "Ztráta whirlpool (%)",
      "fermentationLoss": "Ztráta fermentace (%)",
      "extractEstimate": "Extrakt sladu (%)",
      "waterPerKg": "Voda L/kg sladu",
      "waterReserve": "Rezerva vody (L)",
      "boilTime": "Čas chmelovaru (min)"
    },
    "calculation": {
      "pipelineTitle": "Objemová pipeline",
      "requirementsTitle": "Potřeba surovin",
      "parametersTitle": "Pivovarské parametry",
      "costTitle": "Nákladová kalkulace",
      "costBreakdown": "Rozpad nákladů per surovina",
      "totalProduction": "Celkem výroba",
      "perLiter": "Cena za litr",
      "perHl": "Cena za hl"
    },
    "snapshot": {
      "badge": "Kopie receptury",
      "viewOriginal": "Zobrazit originál",
      "compareOriginal": "Porovnat s originálem"
    }
  }
}
```

EN verze analogicky.

---

## AKCEPTAČNÍ KRITÉRIA

### Krok 1 (Cíl + Soustava)
1. [ ] Collapsible horní sekce s poli: název, styl, soustava, profil, objem, OG
2. [ ] Nová receptura: krok 1 rozbalený, krok 2 prázdný
3. [ ] Existující receptura: krok 1 sbalený, krok 2 s daty
4. [ ] Výběr stylu → předvyplní target ranges do feedback panelu
5. [ ] Výběr soustavy → předvyplní objem, přepočítá pipeline
6. [ ] Výběr profilu → aplikuje rmutovací kroky
7. [ ] Změna objemu → dialog "Přepočítat suroviny?" → Ano/Ne

### Krok 2 (Editor)
8. [ ] 7 sub-tabů: Slady, Chmel, Kvasnice, Ostatní, Rmutování, Konstanty, Kalkulace
9. [ ] Badge s počtem položek na každém tabu
10. [ ] Tab Slady: drag & drop karty s množstvím, EBC, extraktem, podílem
11. [ ] Tab Slady: sumární řádek (celkem kg vs plán, barva vs cíl)
12. [ ] Tab Chmel: drag & drop karty s množstvím, alpha, fází, IBU příspěvkem
13. [ ] Tab Chmel: sumární řádek (celkem IBU vs cíl, breakdown per fáze)
14. [ ] Tab Kvasnice: karty s množstvím, atenuací
15. [ ] Tab Ostatní: karty s množstvím, fází, poznámkou
16. [ ] Tab Rmutování: MashStepEditor + "Načíst profil" + "Uložit jako profil"
17. [ ] Tab Konstanty: tabulka soustava vs receptura, editovatelné overrides
18. [ ] Tab Konstanty: "Obnovit z varní soustavy" reset
19. [ ] Tab Kalkulace: pipeline, potřeba surovin, parametry vs cíl, náklady

### Feedback panel
20. [ ] Kompaktní bar vždy viditelný (sticky) s progress bary pro OG, IBU, EBC, ABV, slad
21. [ ] Progress bary: zelená/oranžová/červená dle target range ze stylu
22. [ ] Šedé bary pokud styl není vybrán
23. [ ] Detail sidebar na ≥1280px s pipeline, slad plán/actual, náklady
24. [ ] Real-time přepočet (client-side, debounce 300ms)

### Snapshot kompatibilita
25. [ ] `recipes.constants_override` JSONB sloupec přidán
26. [ ] Existující snapshot logika kopíruje i `constants_override`
27. [ ] RecipeDesigner funguje pro snapshot receptury (otevřený z batch detailu)
28. [ ] RecipeBrowser nadále filtruje snapshoty (is_snapshot = false)

### Drag & drop
29. [ ] @dnd-kit/core + @dnd-kit/sortable nainstalováno
30. [ ] Drag handle (⋮⋮) na každé kartě suroviny
31. [ ] Přeřazení → aktualizuje sort_order

### Obecné
32. [ ] Stávající RecipeDetail/RecipeForm DEPRECATED (ne smazáno)
33. [ ] i18n: cs + en
34. [ ] `npm run build` bez chyb
35. [ ] TypeScript: zero errors
36. [ ] Dokumentace aktualizována

---

## CO NEIMPLEMENTOVAT

- **Reverse kalkulace** (zadej IBU → dopočti chmele) — jen vizuální porovnání target vs actual
- **FG výpočet z atenuace kvasnic** — zobrazit jako informační, nepoužívat pro výpočet
- **Side-by-side porovnání snapshot vs originál** — nice-to-have, ne blokující
- **Tisk/export receptury** — post-MVP
- **Import receptury z BeerXML/BeerJSON** — post-MVP
- **Verze receptury** (history) — post-MVP, snapshot řeší jen várku
