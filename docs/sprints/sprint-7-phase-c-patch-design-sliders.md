# RECIPE DESIGNER — PATCH: 3-SEKČNÍ LAYOUT S AKTIVNÍMI POSUVNÍKY
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 27.02.2026

---

## CÍL

Přestrukturovat stávající recipe designer ze 2 sekcí (Cíl receptury + taby) na 3 sekce:

1. **DESIGN** — aktivní posuvníky pro definici cílových parametrů piva
2. **PROVEDENÍ** — technické parametry výroby (collapsible)
3. **EDITOR** — taby beze změny (Slady, Chmel, Kvasnice, Ostatní, Rmutování, Konstanty, Kalkulace)

Klíčová změna: **pasivní červené progress bary → aktivní posuvníky**. Sládek nejdřív NAVRHNE pivo (design), pak SKLÁDÁ suroviny (editor). Sidebar porovnává "design vs. realita".

---

## SOUČASNÝ STAV (co měníme)

Z přiloženého screenshotu:

```
[Záhlaví] ← BeerGlass | Název | Duplikovat | Archivovat | Uložit
[Feedback bar] OG ████ 18.6  IBU ████ 56  EBC ░░░░ 0  ABV ████ 7.4%  Slad plán ████ 38.0 kg
[Cíl receptury ▼] Název, Kód, Styl, Soustava, Profil, Objem, Status, Položka, Doba varu, Kvašení, Dokvašování, Trvanlivost
[Taby] Slady | Chmel | Kvasnice | Ostatní | Rmutování | Konstanty | Kalkulace
[Sidebar] Cíl receptury, Pivovarské parametry, Slad plán, Pipeline, Voda, Náklady
```

---

## NOVÝ LAYOUT

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← [BeerGlass ████ dynamická EBC]  Světlý ležák 12°P                     │
│    Czech Premium Pale Lager                    Duplikovat Archivovat Uložit│
├──────────────────────────────────────────────────────────────────────────┤
│  SEKCE 1: DESIGN PIVA                                                    │
│                                                                          │
│  Styl: [Pale Lager — Czech Premium Pale Lager ▾]    Batch size: [100] L │
│                                                                          │
│  OG  ═══════════●═══════════  [12.0] °P  (1.048 SG)                    │
│      ░░░░░░░▓▓▓▓▓▓▓▓▓░░░░░░  10.9–14.7                                │
│                                                                          │
│  FG  ════════●══════════════  [ 3.3] °P  (1.013 SG)                    │
│      ░░░░░▓▓▓▓▓▓░░░░░░░░░░░  2.6–4.3                                  │
│                                                                          │
│  IBU ════════════●══════════  [  35]                                     │
│      ░░░░░░░▓▓▓▓▓▓▓▓▓░░░░░░  30–45                                    │
│                                                                     S    │
│  EBC ═════●═════════════════  [   8]       [BeerGlass mini ██]      I    │
│      ░░░▓▓▓▓▓▓░░░░░░░░░░░░░  6.9–11.8                             D    │
│                                                                     E    │
│  ABV:  5.2%  (readonly — vypočteno z OG a FG)                      B    │
│                                                                     A    │
├──────────────────────────────────────────────────────────────────────R────┤
│  SEKCE 2: PROVEDENÍ (collapsible ▼)                                      │
│  Název, Kód, Status, Soustava, Profil, Položka, Doba varu,              │
│  Kvašení, Dokvašování, Trvanlivost                                       │
├──────────────────────────────────────────────────────────────────────────┤
│  SEKCE 3: EDITOR                                                         │
│  [ Slady (2) │ Chmel (3) │ Kvasnice │ Ostatní │ Rmutování (4) │         │
│    Konstanty │ Kalkulace ]                                               │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │  [obsah aktivního tabu — beze změny]                             │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## ZMĚNA 1: SEKCE DESIGN PIVA

### 1.1 Nahrazuje: Feedback bar (červené progress bary)

**Odstranit** stávající sticky feedback bar s pasivními progress bary (OG ████ 18.6 ...).

**Nahradit** sekcí Design piva — aktivní posuvníky s num inputy.

### 1.2 Obsah sekce Design

| Prvek | Typ | Popis |
|-------|-----|-------|
| Pivní styl | select | Přesunout ze sekce Cíl → sem. Výběr stylu nastaví rozsahy na posuvnících |
| Batch size | number input + "L" | Přesunout ze sekce Cíl → sem |
| OG posuvník | range slider + number input | Target stupňovitost v °Plato. Vedle zobrazit SG (1.xxx) |
| FG posuvník | range slider + number input | Target koncová stupňovitost v °Plato. Vedle zobrazit SG |
| IBU posuvník | range slider + number input | Target hořkost |
| EBC posuvník | range slider + number input | Target barva. Vedle mini BeerGlass s dynamickou barvou |
| ABV | readonly text | Vypočteno z OG a FG: `ABV = (OG - FG) / (2.0665 - 0.010665 × OG)` |

### 1.3 Posuvník — vizuální specifikace

Každý posuvník (OG, FG, IBU, EBC):

```
Label  ═══════════●═══════════  [value] jednotka  (sekundární)
       ░░░░░░░▓▓▓▓▓▓▓▓▓░░░░░░  min–max stylu
```

**Komponenty posuvníku:**

1. **Track** (celá délka) — šedý/neutrální (např. `bg-gray-200`)
2. **Style range zone** (pozadí) — vyšrafovaný nebo ztmavený pás ukazující rozsah zvoleného stylu (`▓▓▓▓`). Pokud styl není zvolen → nezobrazovat
3. **Thumb** (●) — tahatelný kulatý ukazatel, aktuální target hodnota
4. **Number input** — vpravo od posuvníku, editovatelný. Synchronizovaný s thumbem (změna inputu = posun thumbu a naopak)
5. **Sekundární hodnota** — readonly text vedle inputu:
   - OG: zobrazit `(1.048 SG)` — Plato → SG konverze
   - FG: zobrazit `(1.013 SG)` — Plato → SG konverze
   - IBU: nic
   - EBC: mini `<BeerGlass>` s dynamickou barvou
6. **Rozsah stylu** — pod trackem menším textem: `10.9–14.7` (z beer_style.og_min / og_max)

**Barevné kódování thumbu/hodnoty:**
- **Zelená** (#22c55e / `text-green-600`): hodnota je v rozsahu stylu
- **Oranžová** (#f59e0b / `text-amber-500`): hodnota je do 15% mimo rozsah
- **Červená** (#ef4444 / `text-red-500`): hodnota je > 15% mimo rozsah
- **Neutrální** (default): žádný styl vybraný

**Rozsahy posuvníků (min/max trackové limity):**

| Parametr | Track min | Track max | Step |
|----------|-----------|-----------|------|
| OG (°P) | 0 | 30 | 0.1 |
| FG (°P) | 0 | 15 | 0.1 |
| IBU | 0 | 120 | 1 |
| EBC | 2 | 80 | 1 |

### 1.4 Interakce při výběru stylu

Uživatel vybere pivní styl →
1. Posuvníky se nastaví na **střed rozsahu** stylu (pokud aktuální hodnota je 0 nebo mimo rozsah)
2. Style range zone se zobrazí na pozadí všech posuvníků
3. ABV se přepočítá
4. BeerGlass v záhlaví se přebarví dle EBC středu

Pokud posuvníky UŽ MAJÍ hodnoty (editace existující receptury) → **nenastavovat na střed**, jen zobrazit range zone.

### 1.5 BeerGlass dynamická barva

**V záhlaví stránky** (velký, vedle názvu receptury):
- EBC z posuvníku → `ebcToColor(ebc)` → fill barva BeerGlass
- Plynulá interpolace barev (16 referenčních bodů z Phase A3)
- Real-time při posouvání EBC slideru

**Vedle EBC posuvníku** (mini, inline):
- Menší BeerGlass (`size="sm"`) — stejná dynamická barva
- Poskytuje okamžitý vizuální feedback přímo u posuvníku

### 1.6 ABV readonly výpočet

```typescript
// Balling formula — STEJNÁ jako v utils.ts
const abv = (og - fg) / (2.0665 - 0.010665 * og);
```

Zobrazit: `ABV: 5.2%` — readonly text, přepočítává se při změně OG nebo FG posuvníku. Client-side, žádný server call.

### 1.7 Uložení design hodnot

Hodnoty z posuvníků se ukládají na `recipes`:
- `og` (°P) — target OG z posuvníku
- `fg` (°P) — target FG z posuvníku
- `target_ibu` (number) — **NOVÝ SLOUPEC** (nebo reuse `ibu` s rozlišením target vs calculated)
- `target_ebc` (number) — **NOVÝ SLOUPEC** (nebo reuse `ebc` s rozlišením target vs calculated)
- `batch_size_l` (L) — z batch size inputu
- `beer_style_id` — z výběru stylu

**⚠️ DŮLEŽITÉ:** Stávající `ibu` a `ebc` sloupce na recipes se aktuálně plní z kalkulace (`calculateAndSaveRecipe`). Pro design potřebujeme rozlišit **target** (co sládek chce) vs **calculated** (co vychází ze surovin).

**Řešení — nové sloupce:**

```sql
ALTER TABLE recipes ADD COLUMN target_ibu NUMERIC;
ALTER TABLE recipes ADD COLUMN target_ebc NUMERIC;
```

- `og`, `fg` = target (z posuvníků design sekce) — stávající sloupce, ZMĚNA VÝZNAMU
- `target_ibu`, `target_ebc` = target (z posuvníků design sekce) — NOVÉ
- `ibu`, `ebc` = calculated (z `calculateAndSaveRecipe`) — stávající, BEZ ZMĚNY

Sidebar porovnává: `target_ibu` vs `ibu`, `target_ebc` vs `ebc`, `og` (target) vs `og` (calculated).

**Alternativa (jednodušší):** Pokud je nepraktické mít target/calculated OG ve stejném sloupci, přidat `target_og` a `target_fg` taky. Rozhodnutí na implementátorovi dle aktuálního stavu kódu.

---

## ZMĚNA 2: SEKCE PROVEDENÍ

### 2.1 Nahrazuje: Sekce "Cíl receptury"

Přejmenovat "Cíl receptury" → **"Provedení"**

### 2.2 Pole přesunout PRYČ z Provedení (jsou v Design):
- ~~Pivní styl~~ → sekce Design
- ~~Cílový objem (L)~~ → sekce Design (Batch size)

### 2.3 Pole ZŮSTÁVAJÍ v Provedení:
- Název receptury
- Kód
- Status (draft/active/archived)
- Varní soustava (select)
- Načíst rmutovací profil (select)
- Výrobní položka (select)
- Doba varu (min)
- Kvašení (dní)
- Dokvašování (dní)
- Trvanlivost (dní)

### 2.4 Layout

Collapsible sekce — **sbalená** by default u existující receptury (sládek většinu času pracuje v Design + Editor, ne tady).

```
▼ Provedení
┌─────────────────────────────────────────────────────────┐
│ Název: [Světlý ležák 12°P]  Kód: [R-001]  Status: [▾] │
│ Soustava: [Produkční 500L ▾]  Profil: [Český dekokční ▾]│
│ Výr. položka: [it00006 ▾]    Doba varu: [90] min       │
│ Kvašení: [7] dní  Dokvašování: [28] dní  Trvanlivost: [90]│
└─────────────────────────────────────────────────────────┘
```

---

## ZMĚNA 3: SIDEBAR — DESIGN VS. REALITA

### 3.1 Stávající sidebar obsah (co měníme)

Aktuální sidebar:
```
Cíl receptury          ← PŘEJMENOVAT
  Cíl: Czech Premium...
  Cílový objem: 100 L
  Výchozí parametry

Pivovarské parametry   ← PŘEFORMÁTOVAT
  ⊘ OG   18.6 / 10.9–14.7
  ⊘ FG    4.7 / 3.3–4.3
  ...

Slad plán              ← ZACHOVAT
Pipeline               ← ZACHOVAT
Voda                   ← ZACHOVAT
Náklady                ← ZACHOVAT (přesunout dolů)
```

### 3.2 Nový sidebar obsah

```
┌───────────────────────────┐
│  🎯 Design vs. Realita    │
│                           │
│  ── Parametry ──          │
│           Design  Recept  │
│  OG (°P): 12.0   12.5  ✅│
│  FG (°P):  3.3    3.1  ✅│
│  ABV (%):  5.2    5.2  ✅│
│  IBU:       35      38  ✅│
│  EBC:        8      14  ⚠️│
│                           │
│  ── Slad plán ──          │
│  Plán:   40.9 kg         │
│  Aktuál: 38.0 kg         │
│  Rozdíl: -2.9 kg  🔴     │
│                           │
│  ── Pipeline ──           │
│  Pre-boil:    123.1 L    │
│  Post-boil:   110.8 L    │
│  Do fermentoru: 105.3 L  │
│  Hotové pivo:  100.0 L   │
│                           │
│  ── Voda ──               │
│  Potřeba: 174 L           │
│                           │
│  ── Náklady ──            │
│  Celkem: 2 850 Kč         │
│  Per litr: 28.50 Kč       │
└───────────────────────────┘
```

**Klíčová změna:** Sekce "Pivovarské parametry" nyní ukazuje DVA sloupce:
- **Design** = target hodnoty z posuvníků (co sládek chce)
- **Recept** = calculated hodnoty z `calculateAll()` (co vychází ze surovin)
- **Status ikona**: ✅ calculated v rozsahu ±5% od design targetu, ⚠️ ±5–15%, 🔴 >15%

### 3.3 Aktualizace sidebaru v reálném čase

- **Design sloupec** se mění při posouvání posuvníků (client-side, okamžitě)
- **Recept sloupec** se mění při změně surovin (client-side přepočet, debounce 300ms)
- Statusové ikony se přepočítávají průběžně

---

## ZMĚNA 4: SEKCE EDITOR (TABY)

### 4.1 Beze změny

Taby zůstávají jak jsou: Slady | Chmel | Kvasnice | Ostatní | Rmutování | Konstanty | Kalkulace

Žádné změny v obsahu tabů v rámci tohoto patche.

---

## NOVÁ KOMPONENTA: DesignSlider

### 5.1 Soubor

`src/modules/recipes/components/DesignSlider.tsx`

### 5.2 Props

```typescript
interface DesignSliderProps {
  /** Label (OG, FG, IBU, EBC) */
  label: string;
  /** Aktuální target hodnota */
  value: number;
  /** Callback při změně */
  onChange: (value: number) => void;
  /** Track minimum */
  min: number;
  /** Track maximum */
  max: number;
  /** Krok posuvníku */
  step: number;
  /** Rozsah stylu [min, max] — pokud null, nezobrazovat zone */
  styleRange: [number, number] | null;
  /** Jednotka pro zobrazení (°P, IBU, EBC) */
  unit?: string;
  /** Sekundární zobrazení (SG konverze, mini BeerGlass) */
  secondary?: React.ReactNode;
  /** Calculated hodnota z receptu (pro zobrazení pod posuvníkem) */
  calculatedValue?: number;
}
```

### 5.3 Vizuální struktura

```
OG   ════════════════●════════════════  [12.0] °P   (1.048 SG)
     ░░░░░░░░░▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  10.9–14.7
                              ▲ recept: 12.5
```

- **Hlavní track**: HTML `<input type="range">` nebo custom SVG/div
- **Style range overlay**: Absolutně pozicovaný div nad trackem, poloprůhledný — zelený/teal pás
- **Thumb**: Custom styled (kulatý, bílý s barevným okrajem)
- **Number input**: `<input type="number">` synchronizovaný s range
- **Secondary**: slot pro SG text nebo mini BeerGlass
- **Calculated marker** (optional): Malý trojúhelník nebo čárka pod trackem ukazující kde je calculated hodnota z receptu — vizuální porovnání "kde chci" vs "kde jsem"

### 5.4 Barevná logika thumbu

```typescript
function getSliderColor(value: number, styleRange: [number, number] | null): string {
  if (!styleRange) return "gray"; // žádný styl
  const [min, max] = styleRange;
  const range = max - min;
  if (value >= min && value <= max) return "green";
  const distance = value < min ? min - value : value - max;
  if (distance <= range * 0.15) return "amber";
  return "red";
}
```

### 5.5 SG konverze (pro OG/FG sekundární zobrazení)

```typescript
function platoToSG(plato: number): string {
  if (plato <= 0) return "1.000";
  const sg = 1 + plato / (258.6 - 227.1 * (plato / 258.2));
  return sg.toFixed(3);
}
```

Zobrazit vedle OG inputu: `(1.048 SG)` — readonly text, přepočítává se při změně posuvníku.

---

## SCHEMA ZMĚNY

### 6.1 Nové sloupce na recipes

```sql
ALTER TABLE recipes ADD COLUMN target_ibu NUMERIC;
ALTER TABLE recipes ADD COLUMN target_ebc NUMERIC;
```

Drizzle schema:
```typescript
targetIbu: numeric("target_ibu"),
targetEbc: numeric("target_ebc"),
```

### 6.2 Význam sloupců po patchi

| Sloupec | Zdroj | Popis |
|---------|-------|-------|
| `og` | Design posuvník | Target OG v °P (co sládek chce) |
| `fg` | Design posuvník | Target FG v °P (co sládek chce) |
| `target_ibu` | Design posuvník | Target IBU (co sládek chce) |
| `target_ebc` | Design posuvník | Target EBC (co sládek chce) |
| `ibu` | calculateAndSaveRecipe() | Calculated IBU (co vychází ze surovin) |
| `ebc` | calculateAndSaveRecipe() | Calculated EBC (co vychází ze surovin) |
| `abv` | calculateAndSaveRecipe() | Calculated ABV |
| `batch_size_l` | Design input | Objem várky v litrech |
| `beer_style_id` | Design select | Zvolený pivní styl |

**⚠️ OG/FG:** Stávající `og` a `fg` sloupce se mění z "calculated" na "target/design" hodnoty. `calculateAndSaveRecipe()` JIŽ NEBUDE přepisovat `og` a `fg` — ty jsou nyní vstup od uživatele, ne výstup kalkulace. Calculated OG/FG zůstávají v JSONB snapshot (`recipe_calculations.data`).

**Update calculateAndSaveRecipe():**
```typescript
// PŘED patche:
await db.update(recipes).set({
  og: String(result.og),     // ← přepisovalo target
  fg: String(result.fg),     // ← přepisovalo target
  abv: String(result.abv),
  ibu: String(result.ibu),
  ebc: String(result.ebc),
  costPrice: String(result.totalProductionCost),
});

// PO patchi:
await db.update(recipes).set({
  // og, fg — NEPŘEPISOVAT (jsou to target hodnoty z designu)
  abv: String(result.abv),
  ibu: String(result.ibu),
  ebc: String(result.ebc),
  costPrice: String(result.totalProductionCost),
});
```

---

## FLOW PRO NOVOU RECEPTURU

1. Klik "+ Receptura" → navigace na `/brewery/recipes/new`
2. Design sekce je prázdná — posuvníky na 0, žádný styl
3. Sládek vybere pivní styl → posuvníky se nastaví na střed rozsahu stylu, BeerGlass se přebarví
4. Sládek nastaví batch size
5. Sládek jemně doladí posuvníky (OG, FG, IBU, EBC) dle svých představ
6. Sládek rozbalí Provedení → vyplní název, soustavu, profil, časy
7. Sládek přejde do Editoru → skládá suroviny
8. Sidebar ukazuje real-time porovnání design vs. calculated
9. Uložit → persist všech hodnot

## FLOW PRO EXISTUJÍCÍ RECEPTURU

1. Klik na recepturu → navigace na `/brewery/recipes/[id]`
2. Design sekce zobrazuje uložené target hodnoty na posuvnících
3. Provedení je sbalené
4. Editor ukazuje suroviny
5. Sidebar porovnává design vs. calculated

---

## I18N ROZŠÍŘENÍ

Přidat do `src/i18n/messages/cs/recipes.json`:

```json
{
  "designer": {
    "design": {
      "title": "Design piva",
      "batchSize": "Objem várky",
      "batchSizeUnit": "L",
      "ogLabel": "OG",
      "ogUnit": "°P",
      "fgLabel": "FG",
      "fgUnit": "°P",
      "ibuLabel": "IBU",
      "ebcLabel": "EBC",
      "abvLabel": "ABV",
      "abvReadonly": "Vypočteno z OG a FG",
      "gravityFormat": "({sg} SG)",
      "styleRange": "{min}–{max}",
      "noStyle": "Styl nevybrán"
    },
    "execution": {
      "title": "Provedení"
    },
    "sidebar": {
      "title": "Design vs. Realita",
      "designColumn": "Design",
      "recipeColumn": "Recept",
      "match": "Odpovídá",
      "slightlyOff": "Mírně mimo",
      "outOfRange": "Mimo"
    }
  }
}
```

Přejmenovat stávající `"target"` klíče na `"execution"` kde je to relevantní.

---

## AKCEPTAČNÍ KRITÉRIA

### Design sekce
1. [ ] Výběr pivního stylu v Design sekci (přesunuto z Provedení)
2. [ ] Batch size input v Design sekci (přesunuto z Provedení)
3. [ ] OG posuvník + number input, synchronizované, range 0–30 °P, step 0.1
4. [ ] FG posuvník + number input, synchronizované, range 0–15 °P, step 0.1
5. [ ] IBU posuvník + number input, synchronizované, range 0–120, step 1
6. [ ] EBC posuvník + number input, synchronizované, range 2–80, step 1
7. [ ] Style range zone viditelná na posuvnících (zelený pás dle stylu)
8. [ ] Barevné kódování thumbu: zelená (v rozsahu), oranžová (mírně mimo), červená (daleko)
9. [ ] ABV readonly — přepočítává se z OG a FG v reálném čase
10. [ ] OG/FG: sekundární SG zobrazení (1.xxx) vedle inputu
11. [ ] EBC: mini BeerGlass vedle posuvníku s dynamickou barvou
12. [ ] BeerGlass v záhlaví stránky dynamicky mění barvu dle EBC
13. [ ] Výběr stylu → posuvníky na střed rozsahu (jen pokud aktuální hodnota je 0)
14. [ ] Calculated marker na posuvnících (trojúhelník/čárka ukazující calc. hodnotu)

### Schema
15. [ ] `target_ibu` sloupec na recipes
16. [ ] `target_ebc` sloupec na recipes
17. [ ] `calculateAndSaveRecipe()` NEPŘEPISUJE `og` a `fg` (ty jsou target)
18. [ ] Drizzle schema + migrace

### Provedení sekce
19. [ ] Přejmenováno z "Cíl receptury" na "Provedení"
20. [ ] Collapsible, sbalené by default u existující receptury
21. [ ] Obsahuje: Název, Kód, Status, Soustava, Profil, Položka, Doba varu, Kvašení, Dokvašování, Trvanlivost
22. [ ] NEobsahuje: Styl, Objem (ty jsou v Design)

### Sidebar
23. [ ] Přejmenování na "Design vs. Realita"
24. [ ] Dvousloupcové porovnání: Design (target) | Recept (calculated) pro OG, FG, ABV, IBU, EBC
25. [ ] Statusové ikony: ✅ ±5%, ⚠️ ±5–15%, 🔴 >15%
26. [ ] Slad plán, Pipeline, Voda, Náklady — beze změny

### Editor taby
27. [ ] Taby beze změny (tento patch nemění obsah tabů)

### Obecné
28. [ ] i18n: cs + en
29. [ ] `npm run build` bez chyb
30. [ ] TypeScript: zero errors
31. [ ] Dokumentace aktualizována

---

## CO NEIMPLEMENTOVAT (V TOMTO PATCHI)

- **Změny obsahu tabů** — taby zůstávají jak jsou
- **Drag & drop karty** — separátní patch
- **Interaktivní přepočet objemu** — separátní patch
- **Reverse kalkulace** — žádná. Posuvníky = target. Realita = ze surovin. Jen porovnání.
- **Vazba ABV ↔ OG/FG** — ABV je readonly derivát, ne vstup
