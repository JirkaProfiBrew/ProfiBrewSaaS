# Sprint: Generování kroků varu + PrepPhase zobrazení

## Kontext

Soubor `src/modules/batches/lib/generate-brew-steps.ts` již existuje a generuje `batch_steps`.
Aktuální problém: rmutovací kroky jsou přebírány 1:1 z `recipe_steps` bez vložení přechodových
ohřevů. Výsledné celkové časy jsou špatně spočítané. PrepPhase má pouze kompaktní view.

---

## ČÁST 1 — Oprava `generateBrewSteps()` (back-end)

### 1.1 Cílová sekvence kroků

Funkce musí generovat kroky v tomto pořadí:

```
[Příprava]                    ← brewing_system.time_preparation
[Ohřev Výstirka]              ← ramp do prvního rmutovacího kroku
[Prodleva Výstirka / rast N]  ← rmutovací krok (hold)
[Ohřev na rast N+1]           ← ramp mezi rasty
[Prodleva rast N+1]           ← rmutovací krok (hold)
... opakovat pro každý krok rmutovacího profilu ...
[Scezování]                   ← brewing_system.time_lautering
[Ohřev na chmelovar]          ← pevně 30 min (nebo z budoucího system pole)
[Chmelovar]                   ← recipe.boil_time_min
[Whirlpool a chlazení]        ← brewing_system.time_whirlpool
[Přesun na kvašení]           ← brewing_system.time_transfer
[Úklid]                       ← brewing_system.time_cleanup
```

### 1.2 Logika generování ohřevů

Pro každý rmutovací krok (z `recipe_steps` seřazeno dle `sort_order`):

**Krok A — Ohřev (nový, vkládáme před každý rast/mash_out):**
```typescript
// Vypočítej rampTime:
const rampTime = step.rampTimeMin > 0
  ? step.rampTimeMin
  : Math.abs(step.targetTemperatureC - previousTemperatureC);  // 1°C = 1 min

// Pokud rampTime > 0, vlož "Ohřev" krok
if (rampTime > 0) {
  steps.push({
    stepType: "heat",
    brewPhase: "mashing",
    name: `Ohřev ${step.targetTemperatureC}°C`,
    temperatureC: step.targetTemperatureC.toString(),
    timeMin: rampTime,
    rampTimeMin: 0,
    stepSource: "recipe",
    autoSwitch: true,  // ohřevy přepínají automaticky
    startTimePlan: addMinutes(brewStart, cumulativeMin),
  });
  cumulativeMin += rampTime;
}
```

**Krok B — Prodleva (hold, původní krok):**
```typescript
steps.push({
  stepType: step.stepType,  // "rest" | "mash_in" | "mash_out" | "decoction"
  brewPhase: "mashing",
  name: step.name,
  temperatureC: step.targetTemperatureC?.toString(),
  timeMin: step.holdTimeMin ?? step.timeMin ?? 0,
  rampTimeMin: 0,  // ramp je nyní samostatný krok výše
  stepSource: "recipe",
  autoSwitch: step.stepType === "rest" || step.stepType === "mash_out",
  startTimePlan: addMinutes(brewStart, cumulativeMin),
});
cumulativeMin += step.holdTimeMin ?? step.timeMin ?? 0;
```

**Startovní teplota pro výpočet prvního ohřevu:**
- Výchozí = 20°C (pokojová teplota)
- Po každém zpracovaném kroku: `previousTemperatureC = step.targetTemperatureC`

### 1.3 Zdroj rmutovacích kroků

Aktuálně funkce čte kroky z `recipe_steps` tabulky. Toto zůstává.

Pole která potřebujeme na každém kroku:
- `rampTimeMin` — čas náběhu (může být 0 nebo null)
- `holdTimeMin` / `timeMin` — čas výdrže (pro hold krok)
- `targetTemperatureC` — cílová teplota (pro výpočet ohřevu bez náběhu)
- `stepType` — typ kroku
- `name` — název
- `sortOrder`

**Pokud sloupec `hold_time_min` na `recipe_steps` neexistuje**, použij `time_min` jako fallback.
Pokud sloupec `target_temperature_c` na `recipe_steps` neexistuje, přejmenuj čtení z `temperature_c`.

### 1.4 Oprava `getRecipeStepsForBatch`

Zkontroluj SQL query v `generate-brew-steps.ts` — musí vracet:
```typescript
{
  sortOrder: number,
  stepType: string,
  name: string,
  targetTemperatureC: number | null,  // pozor: může být uloženo jako string (decimal)
  rampTimeMin: number | null,
  holdTimeMin: number | null,  // nebo timeMin
  timeMin: number | null,
}
```

Přidej parsování čísel: `Number(row.targetTemperatureC) || 0`.

### 1.5 Výstup funkce — rozšíření

Funkce `generateBrewSteps()` aktuálně vrací `void` (ukládá do DB).
Přidej návratovou hodnotu:

```typescript
export async function generateBrewSteps(
  batchId: string
): Promise<{ brewStart: Date; brewEnd: Date; totalMinutes: number }> {
  // ... stávající logika ...
  // Na konci:
  return {
    brewStart,
    brewEnd: addMinutes(brewStart, cumulativeMin),
    totalMinutes: cumulativeMin,
  };
}
```

### 1.6 Čistý preview bez uložení do DB — nová funkce

Pro výpočet a zobrazení kroků **bez zápisu** do DB (potřeba v F1 Plán a F2 Příprava):

```typescript
// src/modules/batches/lib/generate-brew-steps.ts

export interface BrewStepPreview {
  sortOrder: number;
  stepType: string;
  brewPhase: string;
  name: string;
  temperatureC: number | null;
  timeMin: number;
  startTimePlan: Date;
  hopAdditions?: HopAddition[];
}

export async function previewBrewSteps(
  batchId: string,
  tx?: PgTransaction  // optional, pro volání z within transaction
): Promise<{
  steps: BrewStepPreview[];
  brewStart: Date;
  brewEnd: Date;
  totalMinutes: number;
}> {
  // Stejná logika jako generateBrewSteps, ale bez INSERT do batch_steps
  // Čte batch, recipe, brewing_system, recipe_steps, hop_additions
  // Vrátí vypočítané kroky jako pole objektů
}
```

**Server action wrapper** (přidej do `src/modules/batches/actions.ts`):

```typescript
export async function getBrewStepPreview(
  batchId: string
): Promise<{
  steps: BrewStepPreview[];
  brewStart: Date;
  brewEnd: Date;
  totalMinutes: number;
} | null>
```

---

## ČÁST 2 — F1 Plán: oprava výpočtu celkového času

### 2.1 Kde se zobrazuje

`src/modules/batches/components/brew/phases/PlanPhase.tsx`
Sekce "Časový plán" — pole "Odhad var celkem (min)".

### 2.2 Oprava výpočtu

Zavolej `getBrewStepPreview(batchId)` (nová server action z části 1.6).
Výstup: `totalMinutes` → zobraz jako `{h}h {m}min`.

Nahraď stávající hrubý výpočet (pokud existuje) voláním preview funkce.

Zobraz také:
- **Začátek varu**: `batch.plannedDate` (editovatelný datetime input)
- **Odhadovaný konec varu**: `brewEnd` z preview (readonly, přepočítá se po změně `plannedDate`)
- **Celkový čas varu**: `totalMinutes` z preview

### 2.3 Trigger přepočtu

Při změně `plannedDate` (datum/čas zahájení): zavolej `getBrewStepPreview` znovu a aktualizuj `brewEnd`.
Implementuj jako `useEffect` nebo server action s revalidací.

---

## ČÁST 3 — F2 Příprava: dva režimy zobrazení

### 3.1 Toggle kompaktní / plné zobrazení

V `PrepPhase.tsx` přidej state:
```typescript
const [viewMode, setViewMode] = useState<"compact" | "full">("compact");
```

Toggle tlačítko (ikona nebo text) v hlavičce sekce kroků:
- Kompaktní: `LayoutList` ikona (Lucide)
- Plné: `LayoutGrid` ikona (Lucide)

### 3.2 Kompaktní zobrazení (stávající, opravit časy)

Existující tabulka v pravém sloupci (`Kroky vaření` sekce):

| # | Krok | °C | Čas |
|---|------|----|-----|
| 1 | Příprava | 20 | 30 min |
| 2 | Ohřev 52°C | 52 | 20 min |
| 3 | Bílkovinný rast | 52 | 15 min |
| ... | | | |
| N | Úklid | — | 60 min |
| **Celkem** | | | **7h 56min** |

**Oprava**: Načti kroky přes `getBrewStepPreview()` místo stávajícího výpočtu.
Tím pádem budou časy správně (včetně ohřevů).

Zobraz summary řádek:
- Celkový čas: `totalMinutes` → formát `Xh Ymin`
- Začátek: `brewStart` → `dd.MM.yyyy HH:mm`
- Konec: `brewEnd` → `dd.MM.yyyy HH:mm`

### 3.3 Plné zobrazení (nové)

**Layout**: Přepni layout — suroviny minimalizuj, kroky rozšiř na celou šířku (nebo 2/3).

**Minimalizace surovin**: Collapse panel do accordion/summary:
- Zavřený stav: zobrazí jen `Suroviny vydány ✅` nebo `⚠️ Suroviny vydány částečně`
- Otevřít lze kliknutím (zachová funkčnost)

**Plný step timeline** — vertikální seznam kroků stylem podobným Bubble printscreenu:

```
Komponenta: <BrewStepTimeline steps={steps} brewStart={brewStart} />
```

Pro každý krok zobraz:
```
[čas zahájení]  [název kroku]         [teplota]  [délka]
  21:27          Příprava               20 °C      20 min
  21:47          Ohřev 52°C             52 °C      20 min
  22:07          Bílkovinný rast        52 °C      15 min
  22:22          Ohřev 63°C             63 °C      15 min  ← Auto
  ...
  01:08          Chmelovar             100 °C      90 min
    └─ 01:08       Premiant 120 g                  [isFirst]
    └─ 01:53       Žatecký červenák 100 g
    └─ 02:28       Žatecký červenák 100 g
  ...
```

**Hop additions** (`hopAdditions` JSONB z batch_steps.hop_additions):
- Zobraz jako odsazené sub-řádky pod krokem "Chmelovar"
- Formát: `čas přidání  |  název chmel  |  množství`

**Checkbox "Auto"**:
- Zobraz pro každý krok checkbox (readonly v přípravě, editovatelný ve varu)
- `autoSwitch = true` → zaškrtnuto

**Spodní summary** (pod timeline):
```
Konec varu (plán):   02.03.26  5:23
Kvašení (dny):       7
Ležení (dny):        21
Konec (celkem):      29.3.2026
```

### 3.4 Datový tok pro PrepPhase

```typescript
// Server component nebo useSWR hook
const { steps, brewStart, brewEnd, totalMinutes } = await getBrewStepPreview(batchId);
const batch = await getBatch(batchId);
// fermentationDays = batch.fermentationDays ?? 7
// conditioningDays = batch.conditioningDays ?? 21
// finalEnd = addDays(brewEnd, fermentationDays + conditioningDays)
```

---

## ČÁST 4 — i18n

Přidej do `src/i18n/messages/cs/batches.json` (nebo příslušný namespace):

```json
{
  "brew": {
    "steps": {
      "viewCompact": "Kompaktní",
      "viewFull": "Plné zobrazení",
      "totalTime": "Celkový čas varu",
      "brewStart": "Začátek varu",
      "brewEnd": "Konec varu",
      "fermentationEnd": "Konec (celkem)",
      "stepTypes": {
        "heat": "Ohřev",
        "preparation": "Příprava",
        "lautering": "Scezování",
        "heat_to_boil": "Ohřev na chmelovar",
        "boil": "Chmelovar",
        "whirlpool": "Whirlpool a chlazení",
        "transfer": "Přesun na kvašení",
        "cleanup": "Úklid"
      }
    }
  }
}
```

Analogicky EN.

---

## ČÁST 5 — Akceptační kritéria

### Back-end (generate-brew-steps.ts)

1. [ ] Pro rmutovací profil se 4 rasty (52/63/72/78°C) funkce generuje 8+ kroků (ohřev + prodleva pro každý rast)
2. [ ] Ohřev krok má `stepType = "heat"`, `brewPhase = "mashing"`, `autoSwitch = true`
3. [ ] Pokud `rampTimeMin > 0` na recipe_step → použije se jako čas ohřevu
4. [ ] Pokud `rampTimeMin = 0` nebo null → čas ohřevu = `|targetTemp - prevTemp|` minut
5. [ ] Startovní teplota pro první ohřev = 20°C
6. [ ] Celkový čas = součet všech kroků (rmutování + system kroky)
7. [ ] `previewBrewSteps()` vrací kroky bez zápisu do DB
8. [ ] `generateBrewSteps()` vrací `{ brewStart, brewEnd, totalMinutes }`

### F1 Plán

9. [ ] "Celkový čas varu" zobrazuje správnou hodnotu (včetně ohřevů)
10. [ ] "Odhadovaný konec varu" se přepočítá po změně `plannedDate`

### F2 Příprava — Kompaktní view

11. [ ] Tabulka kroků načítá data přes `previewBrewSteps()` (ne starý výpočet)
12. [ ] Ohřev kroky jsou viditelné jako samostatné řádky
13. [ ] Celkový čas v patičce sedí (= suma všech kroků)
14. [ ] Formát: `7h 56min`

### F2 Příprava — Plné view

15. [ ] Toggle button přepíná kompaktní ↔ plné zobrazení
16. [ ] Plné view: suroviny collapsed (accordion/summary)
17. [ ] Timeline zobrazuje všechny kroky s `startTimePlan` ve formátu `HH:mm`
18. [ ] Hop additions jsou viditelné jako sub-řádky pod Chmelovárem s časem přidání
19. [ ] Checkbox "Auto" odpovídá `autoSwitch` hodnotě
20. [ ] Spodní summary: konec varu, kvašení/ležení dny, datum konce celkem
21. [ ] Žádné tlačítko "Zahájit var" v plném view (jen v kompaktním zůstane, nebo vyřešíme v F3)

### Obecné

22. [ ] `npm run build` bez TypeScript chyb
23. [ ] Žádná regrese v existující BrewingPhase (F3)

---

## ČÁST 6 — Soubory k úpravě / vytvoření

### Upravit:
- `src/modules/batches/lib/generate-brew-steps.ts` — přepracovat logiku rmutovacích kroků, přidat `previewBrewSteps()`
- `src/modules/batches/actions.ts` — přidat `getBrewStepPreview()` server action
- `src/modules/batches/components/brew/phases/PlanPhase.tsx` — opravit výpočet celkového času
- `src/modules/batches/components/brew/phases/PrepPhase.tsx` — toggle + plné view
- `src/i18n/messages/cs/batches.json` — nové klíče
- `src/i18n/messages/en/batches.json` — nové klíče

### Vytvořit:
- `src/modules/batches/components/brew/BrewStepTimeline.tsx` — plné zobrazení kroků
- `src/modules/batches/types.ts` nebo rozšíř existující — `BrewStepPreview` interface

---

## POZNÁMKY PRO IMPLEMENTACI

**Pořadí implementace:**
1. Nejdřív `previewBrewSteps()` — čistá pure funkce bez DB zápisů
2. Pak oprava `generateBrewSteps()` — používá stejnou logiku + INSERT
3. Pak F1 Plán — závisí na `previewBrewSteps`
4. Pak PrepPhase kompaktní fix — závisí na `previewBrewSteps`
5. Nakonec `BrewStepTimeline` + full view

**Pozor na typy**: `targetTemperatureC` v recipe_steps je uloženo jako `DECIMAL` → přijde jako string z Drizzle. Vždy parsuj přes `Number()`.

**Pozor na prázdný profil**: Pokud batch nemá rmutovací kroky (žádné `recipe_steps` s brewPhase = mashing), funkce musí stále generovat system kroky (příprava, scezování, ...).

**`hopAdditions` JSONB** na `batch_steps`: struktura `{ itemName: string, amountG: number, addAtMin: number }[]` — toto pole je generováno v stávající `getHopAdditionsForBatch()` a ukládáno do kroku Chmelovar. Při preview použij stejnou logiku pro zobrazení, ale bez DB.
