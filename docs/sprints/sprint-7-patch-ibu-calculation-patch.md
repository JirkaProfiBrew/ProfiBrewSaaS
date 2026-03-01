# IBU VÝPOČET — PATCH SPEC
## ProfiBrew.com | Verze: 1.0 | Datum: 01.03.2026

---

## CÍL

Opravit IBU výpočet — rozlišit 6 fází chmelení s odpovídající utilization. Whirlpool a dry hop IBU závisí na teplotě. Přidat FWH a Mash hop. Nový parametr `whirlpool_temperature_c` na brewing_systems.

---

## AKTUÁLNÍ STAV (co je špatně)

```typescript
// utils.ts — calculateIBU()
if (boilTime <= 0) return sum;  // ← skipuje VŠECHNO s time=0
const utilization = tinsethUtilization(boilTime, sg);  // ← plný Tinseth pro VŠECHNO
```

| Fáze | Aktuální chování | Správně |
|------|------------------|---------|
| Boil | Tinseth(time, SG) | ✅ OK |
| FWH | Neexistuje jako stage | ❌ Chybí |
| Whirlpool | Plný Tinseth (jako var) | ❌ Nadhodnocuje 30-50% |
| Mash hop | Neexistuje jako stage | ❌ Chybí |
| Dry hop cold | IBU = 0 (time=0) | ✅ OK (náhodou) |
| Dry hop warm | IBU = 0 (time=0) | ❌ Měl by mít malý příspěvek |

---

## 6 HOP STAGES

### Definice

| Stage | DB value | Český název | Teplota | IBU model |
|-------|----------|-------------|---------|-----------|
| **Boil** | `boil` | Chmelovar | 100°C | Tinseth(time, SG) — standard |
| **FWH** | `fwh` | First Wort Hop | 100°C | Tinseth(boil_time) × 1.1 |
| **Whirlpool** | `whirlpool` | Whirlpool | 80–98°C (parametr) | Tinseth(time, SG) × temp_factor |
| **Mash hop** | `mash` | Rmutový chmel | 62–72°C | Tinseth(time, SG) × 0.3 |
| **Dry hop cold** | `dry_hop_cold` | Dry hop (studený) | < 20°C | 0 IBU |
| **Dry hop warm** | `dry_hop_warm` | Dry hop (teplý) | 20–30°C | Tinseth ekvivalent × temp_factor (nízký) |

### Stage → i18n

```json
{
  "stages": {
    "boil": "Chmelovar",
    "fwh": "First Wort Hop",
    "whirlpool": "Whirlpool",
    "mash": "Rmutový chmel",
    "dry_hop_cold": "Dry hop (studený)",
    "dry_hop_warm": "Dry hop (teplý)"
  }
}
```

---

## SCHEMA ZMĚNY

### 1. Nový sloupec na brewing_systems

```sql
ALTER TABLE brewing_systems ADD COLUMN whirlpool_temperature_c NUMERIC DEFAULT 85;
```

Drizzle:
```typescript
whirlpoolTemperatureC: numeric("whirlpool_temperature_c").default("85"),
```

### 2. Nový sloupec na recipe_items

```sql
ALTER TABLE recipe_items ADD COLUMN temperature_c NUMERIC;
```

Drizzle:
```typescript
temperatureC: numeric("temperature_c"),
```

Použití:
- **Boil**: ignoruje se (vždy 100°C)
- **FWH**: ignoruje se (vždy 100°C, čas = celý var)
- **Whirlpool**: default z `brewing_systems.whirlpool_temperature_c`, uživatel může overridnout per-chmel
- **Mash**: default 66°C (střed rmutovacího rozsahu), informativní — IBU faktor je fixní 0.3
- **Dry hop cold**: default 4°C
- **Dry hop warm**: default 20°C

### 3. Aktualizace use_stage enum

Stávající: `mash | boil | whirlpool | fermentation | dry_hop`

Nové: `mash | boil | fwh | whirlpool | dry_hop_cold | dry_hop_warm`

**Migrace:**
- `fermentation` → `dry_hop_cold` (stávající "fermentation" stage pro chmele = cold dry hop)
- `dry_hop` → `dry_hop_cold` (stávající dry_hop = cold)
- Přidat `fwh`, `dry_hop_warm`

```sql
-- Migrace existujících dat
UPDATE recipe_items SET use_stage = 'dry_hop_cold' WHERE category = 'hop' AND use_stage = 'fermentation';
UPDATE recipe_items SET use_stage = 'dry_hop_cold' WHERE category = 'hop' AND use_stage = 'dry_hop';

-- Default teploty pro existující záznamy
UPDATE recipe_items SET temperature_c = 4 WHERE category = 'hop' AND use_stage = 'dry_hop_cold' AND temperature_c IS NULL;
UPDATE recipe_items SET temperature_c = 85 WHERE category = 'hop' AND use_stage = 'whirlpool' AND temperature_c IS NULL;
```

**⚠️ POZOR:** Stage `fermentation` a `dry_hop` zůstávají validní pro NON-hop ingredience (přísady, kvasnice). Migrace se týká JEN `category = 'hop'`. Pro ne-chmelové ingredience zachovat stávající stages.

Finální enum pro chmele: `boil | fwh | whirlpool | mash | dry_hop_cold | dry_hop_warm`
Finální enum pro ostatní: `mash | boil | whirlpool | fermentation | dry_hop` (beze změny)

---

## IBU VÝPOČETNÍ MODEL

### Temperature factor

```typescript
/**
 * Teplotní faktor pro IBU utilization.
 * Lineární interpolace: 100°C = 1.0, 80°C = 0.0
 * Pod 80°C = 0 (žádná isomerizace).
 * 
 * Reálně isomerizace začíná kolem 79-80°C. Nad 100°C (dekokce) cap na 1.0.
 */
function temperatureFactor(tempC: number): number {
  if (tempC >= 100) return 1.0;
  if (tempC <= 80) return 0.0;
  return (tempC - 80) / 20;  // lineární 80→100 = 0→1
}
```

### IBU per stage

```typescript
interface HopInput {
  weightKg: number;
  alphaDecimal: number;    // alpha / 100
  useStage: string;        // boil | fwh | whirlpool | mash | dry_hop_cold | dry_hop_warm
  useTimeMin: number;      // čas v dané fázi (min)
  temperatureC?: number;   // teplota (pro whirlpool, dry_hop_warm)
}

interface IBUContext {
  postBoilL: number;       // objem pro Tinseth (post-boil)
  ogPlato: number;         // OG pro utilization
  boilTimeMin: number;     // celková doba varu (pro FWH)
  whirlpoolTempC: number;  // default teplota whirlpoolu z brewing system
}

function calculateHopIBU(hop: HopInput, ctx: IBUContext): number {
  if (hop.alphaDecimal <= 0 || hop.weightKg <= 0 || ctx.postBoilL <= 0) return 0;

  const sg = platoToSG(ctx.ogPlato);
  let ibu = 0;

  switch (hop.useStage) {
    case "boil": {
      // Standardní Tinseth
      if (hop.useTimeMin <= 0) return 0;
      const util = tinsethUtilization(hop.useTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL;
      break;
    }

    case "fwh": {
      // FWH: chmel přidaný při scezování, projde celým varem
      // Empiricky: ~10% více IBU než normální přidání na začátku varu
      // Model: Tinseth(boil_time) × 1.1
      const util = tinsethUtilization(ctx.boilTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL * 1.1;
      break;
    }

    case "whirlpool": {
      // Whirlpool: nižší teplota → nižší utilization
      // Tinseth(time) × temperature_factor(T)
      if (hop.useTimeMin <= 0) return 0;
      const tempC = hop.temperatureC ?? ctx.whirlpoolTempC;
      const tempFact = temperatureFactor(tempC);
      if (tempFact <= 0) return 0;
      const util = tinsethUtilization(hop.useTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL * tempFact;
      break;
    }

    case "mash": {
      // Mash hop: dlouhý kontakt, nízká teplota (62-72°C)
      // Fixní faktor 0.3 × Tinseth(time)
      // Typicky useTimeMin = 60 (celé rmutování)
      if (hop.useTimeMin <= 0) return 0;
      const util = tinsethUtilization(hop.useTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL * 0.3;
      break;
    }

    case "dry_hop_cold": {
      // Studený dry hop (< 20°C): žádná isomerizace
      ibu = 0;
      break;
    }

    case "dry_hop_warm": {
      // Teplý dry hop (biotransformace, 20-30°C)
      // Minimální isomerizace: temperature_factor × Tinseth(time)
      // Při 20°C → tempFactor = 0, ale empiricky 1-3 IBU
      // Model: flat 2 IBU per g/L alpha (empirický odhad)
      const tempC = hop.temperatureC ?? 20;
      if (tempC < 20) {
        ibu = 0;
      } else {
        // Empirický model: malý příspěvek
        // ~0.5 IBU per gram alpha acid per liter při 20-25°C
        // Zjednodušeně: Tinseth s temp faktorem, min threshold 20°C → faktor 0
        // Použijeme jiný přístup: fixní nízká utilization
        const lowUtil = 0.02 * (tempC - 20) / 10; // 0% při 20°C, 2% při 30°C
        ibu = (hop.weightKg * lowUtil * hop.alphaDecimal * 1_000_000) / ctx.postBoilL;
      }
      break;
    }

    default:
      ibu = 0;
  }

  return Math.round(ibu * 10) / 10;
}
```

### Aktualizovaná calculateIBU()

```typescript
/**
 * Calculate total IBU across all hop additions.
 * Now uses post-boil volume and stage-specific utilization.
 */
export function calculateIBU(
  ingredients: IngredientInput[],
  postBoilL: number,
  ogPlato: number,
  boilTimeMin: number,
  whirlpoolTempC: number = 85
): number {
  if (postBoilL <= 0) return 0;

  const ctx: IBUContext = { postBoilL, ogPlato, boilTimeMin, whirlpoolTempC };
  const hops = ingredients.filter(i => i.category === "hop");

  const totalIBU = hops.reduce((sum, hop) => {
    const hopInput: HopInput = {
      weightKg: toKg(hop),
      alphaDecimal: (hop.alpha ?? 0) / 100,
      useStage: hop.useStage ?? "boil",
      useTimeMin: hop.useTimeMin ?? 0,
      temperatureC: hop.temperatureC ?? undefined,
    };
    return sum + calculateHopIBU(hopInput, ctx);
  }, 0);

  return Math.round(totalIBU * 10) / 10;
}
```

### Rozšíření IngredientInput

```typescript
export interface IngredientInput {
  // ... stávající pole ...
  useStage?: string;          // NOVÉ: boil | fwh | whirlpool | mash | dry_hop_cold | dry_hop_warm
  temperatureC?: number;      // NOVÉ: teplota přidání (°C)
}
```

---

## IBU BREAKDOWN (pro UI)

```typescript
interface IBUBreakdown {
  boil: number;
  fwh: number;
  whirlpool: number;
  mash: number;
  dryHopCold: number;
  dryHopWarm: number;
  total: number;
}

function calculateIBUBreakdown(
  ingredients: IngredientInput[],
  postBoilL: number,
  ogPlato: number,
  boilTimeMin: number,
  whirlpoolTempC: number
): IBUBreakdown {
  const ctx: IBUContext = { postBoilL, ogPlato, boilTimeMin, whirlpoolTempC };
  const hops = ingredients.filter(i => i.category === "hop");

  const breakdown: IBUBreakdown = {
    boil: 0, fwh: 0, whirlpool: 0, mash: 0,
    dryHopCold: 0, dryHopWarm: 0, total: 0
  };

  for (const hop of hops) {
    const hopInput: HopInput = {
      weightKg: toKg(hop),
      alphaDecimal: (hop.alpha ?? 0) / 100,
      useStage: hop.useStage ?? "boil",
      useTimeMin: hop.useTimeMin ?? 0,
      temperatureC: hop.temperatureC ?? undefined,
    };
    const ibu = calculateHopIBU(hopInput, ctx);

    switch (hopInput.useStage) {
      case "boil": breakdown.boil += ibu; break;
      case "fwh": breakdown.fwh += ibu; break;
      case "whirlpool": breakdown.whirlpool += ibu; break;
      case "mash": breakdown.mash += ibu; break;
      case "dry_hop_cold": breakdown.dryHopCold += ibu; break;
      case "dry_hop_warm": breakdown.dryHopWarm += ibu; break;
    }
  }

  breakdown.total = breakdown.boil + breakdown.fwh + breakdown.whirlpool +
                    breakdown.mash + breakdown.dryHopCold + breakdown.dryHopWarm;

  // Round all
  for (const key of Object.keys(breakdown) as (keyof IBUBreakdown)[]) {
    breakdown[key] = Math.round(breakdown[key] * 10) / 10;
  }

  return breakdown;
}
```

---

## UI ZMĚNY

### HopTab — aktualizace stage selectu

Stávající stages pro chmele:
```
Rmut | Var | Whirlpool | Kvašení | Dry hop
```

Nové stages pro chmele:
```
Chmelovar | First Wort Hop | Whirlpool | Rmutový chmel | Dry hop (studený) | Dry hop (teplý)
```

### HopTab — teplota pole

Zobrazit pole `Teplota (°C)` na kartě chmele pokud stage je:
- **Whirlpool**: default z brewing system, editovatelný
- **Dry hop (teplý)**: default 20°C, editovatelný
- **Dry hop (studený)**: default 4°C, editovatelný (ale IBU = 0 vždy)
- **Ostatní stages**: nezobrazovat (fixní teplota)

### HopTab — IBU per chmel

Aktualizovat client-side IBU výpočet v `HopTab.tsx` na nový model (použít `calculateHopIBU()`).

### HopTab — sumární řádek

```
Celkem IBU: 42.3 | Cíl: 30–45 IBU ✅
  Chmelovar: 28.5 | FWH: 8.2 | Whirlpool: 4.8 | Mash: 0.8 | Dry hop: 0.0
```

### Calculation tab — IBU breakdown

Přidat breakdown do sekce Pivovarské parametry:
```
IBU:  42.3 / 30–45  ✅
  Chmelovar:    28.5  (67.4%)
  FWH:           8.2  (19.4%)
  Whirlpool:     4.8  (11.3%)
  Mash:          0.8   (1.9%)
  Dry hop:       0.0   (0.0%)
```

---

## INTEGRACE S calculateAll()

### Aktualizovaný podpis

```typescript
export function calculateAll(
  ingredients: IngredientInput[],
  batchSizeL: number,
  boilTimeMin: number,
  fgPlato?: number,
  overhead?: OverheadInputs,
  brewingSystem?: BrewingSystemInput | null
): RecipeCalculationResult {
  const system = brewingSystem ?? DEFAULT_BREWING_SYSTEM;

  // ... pipeline, OG ...

  // IBU — nový podpis s boilTimeMin a whirlpool teplotou
  const ibu = calculateIBU(
    ingredients,
    pipeline.postBoilL,
    og,
    boilTimeMin,
    system.whirlpoolTemperatureC  // NOVÉ
  );

  // IBU breakdown
  const ibuBreakdown = calculateIBUBreakdown(
    ingredients,
    pipeline.postBoilL,
    og,
    boilTimeMin,
    system.whirlpoolTemperatureC
  );

  // ... rest ...

  return {
    // ... stávající ...
    ibu,
    ibuBreakdown,  // NOVÉ
    // ...
  };
}
```

### BrewingSystemInput rozšíření

```typescript
export interface BrewingSystemInput {
  // ... stávající ...
  whirlpoolTemperatureC: number;  // NOVÉ (default 85)
}

export const DEFAULT_BREWING_SYSTEM: BrewingSystemInput = {
  // ... stávající ...
  whirlpoolTemperatureC: 85,
};
```

### RecipeCalculationResult rozšíření

```typescript
export interface RecipeCalculationResult {
  // ... stávající ...
  ibu: number;
  ibuBreakdown: IBUBreakdown;  // NOVÉ
  // ...
}
```

---

## KONSTANTY TAB — AKTUALIZACE

Přidat do tabulky konstant:

| Parametr | Soustava | Receptura |
|----------|----------|-----------|
| Teplota whirlpoolu (°C) | 85 | [85] |

---

## I18N

### Rozšíření stages

```json
{
  "ingredients": {
    "stages": {
      "boil": "Chmelovar",
      "fwh": "First Wort Hop",
      "whirlpool": "Whirlpool",
      "mash": "Rmutový chmel",
      "dry_hop_cold": "Dry hop (studený)",
      "dry_hop_warm": "Dry hop (teplý)"
    }
  },
  "designer": {
    "cards": {
      "temperature": "Teplota (°C)",
      "ibuBreakdown": "IBU rozpad",
      "boilIbu": "Chmelovar",
      "fwhIbu": "FWH",
      "whirlpoolIbu": "Whirlpool",
      "mashIbu": "Rmutový",
      "dryHopColdIbu": "Dry hop (st.)",
      "dryHopWarmIbu": "Dry hop (tep.)"
    }
  }
}
```

---

## PŘÍKLADY — OVĚŘENÍ VÝPOČTŮ

### Příklad 1: Klasický český ležák (100 L, 90 min var)

```
Žatecký poloranný červeňák  300g  alpha 3.7%  boil 60min
  Tinseth util(60, 1.048) = 0.232
  IBU = (0.3 × 0.232 × 0.037 × 1e6) / 105.3 = 24.5 IBU

Žatecký poloranný červeňák  100g  alpha 3.7%  boil 15min
  Tinseth util(15, 1.048) = 0.105
  IBU = (0.1 × 0.105 × 0.037 × 1e6) / 105.3 = 3.7 IBU

Žatecký poloranný červeňák  100g  alpha 3.7%  whirlpool 20min  T=85°C
  Tinseth util(20, 1.048) = 0.128
  temp_factor(85) = (85-80)/20 = 0.25
  IBU = (0.1 × 0.128 × 0.037 × 1e6) / 105.3 × 0.25 = 1.1 IBU

Celkem: 24.5 + 3.7 + 1.1 = 29.3 IBU
```

### Příklad 2: NEIPA (100 L, 60 min var, hodně whirlpool + dry hop)

```
Citra  200g  alpha 12%  boil 10min
  util = 0.085 → IBU = (0.2 × 0.085 × 0.12 × 1e6) / 105 = 19.4

Citra  300g  alpha 12%  whirlpool 30min  T=80°C
  util = 0.162, temp_factor(80) = 0.0
  IBU = 0  (80°C = hranice, žádná isomerizace)

Citra  300g  alpha 12%  whirlpool 30min  T=85°C
  util = 0.162, temp_factor(85) = 0.25
  IBU = (0.3 × 0.162 × 0.12 × 1e6) / 105 × 0.25 = 13.9

Galaxy  400g  alpha 14%  dry_hop_warm  5 dní  T=22°C
  lowUtil = 0.02 × (22-20)/10 = 0.004
  IBU = (0.4 × 0.004 × 0.14 × 1e6) / 105 = 2.1

Galaxy  200g  alpha 14%  dry_hop_cold  7 dní  T=4°C
  IBU = 0
```

---

## AKCEPTAČNÍ KRITÉRIA

### Schema
1. [ ] `brewing_systems.whirlpool_temperature_c` sloupec (default 85)
2. [ ] `recipe_items.temperature_c` sloupec (nullable)
3. [ ] Migrace: `fermentation` → `dry_hop_cold` pro chmele
4. [ ] Migrace: `dry_hop` → `dry_hop_cold` pro chmele
5. [ ] Drizzle schema aktualizováno

### IBU výpočet
6. [ ] Boil: standardní Tinseth (beze změny)
7. [ ] FWH: Tinseth(boil_time) × 1.1
8. [ ] Whirlpool: Tinseth(time) × temperature_factor(T)
9. [ ] Mash hop: Tinseth(time) × 0.3
10. [ ] Dry hop cold: 0 IBU
11. [ ] Dry hop warm: nízká utilization závislá na teplotě
12. [ ] temperature_factor: lineární 80°C→0, 100°C→1
13. [ ] calculateIBU() přijímá boilTimeMin a whirlpoolTempC
14. [ ] IBU na post-boil objem (ne batch_size)

### IBU breakdown
15. [ ] calculateIBUBreakdown() vrací breakdown per stage
16. [ ] RecipeCalculationResult obsahuje ibuBreakdown

### UI
17. [ ] HopTab: 6 stages v selectu (boil, fwh, whirlpool, mash, dry_hop_cold, dry_hop_warm)
18. [ ] HopTab: teplota pole viditelné pro whirlpool, dry_hop_cold, dry_hop_warm
19. [ ] HopTab: default teploty (whirlpool z brewing system, dry_hop_cold 4°C, dry_hop_warm 20°C)
20. [ ] HopTab: client-side IBU per chmel aktualizovaný na nový model
21. [ ] HopTab: sumární řádek s breakdown per fáze
22. [ ] Calculation tab: IBU breakdown

### Konstanty
23. [ ] Teplota whirlpoolu v tabulce konstant (overridovatelná per recipe)

### Obecné
24. [ ] i18n: cs + en (stages, temperature, breakdown)
25. [ ] npm run build bez chyb
26. [ ] TypeScript: zero errors
