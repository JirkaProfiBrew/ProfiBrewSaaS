# PIVOVARSKÉ VÝPOČTY — KOMPLETNÍ REFERENCE + PHASE B PATCH
## ProfiBrew.com | Verze: 1.0 | Datum: 01.03.2026

---

## DEFINICE OBJEMŮ

### Kotvící bod: batch_size_l = objem mladiny DO FERMENTORU

```
                    ZPĚTNĚ (kolik navařit)                    DOPŘEDU (kolik zbyde)
                    ←─────────────────────                    ─────────────────────→

Celková voda        hlavní nálev + vypláchová voda
    ↓
Pre-boil (sladina)  objem v kotli po scezení, PŘED varem
    ↓ odpar (evaporation) + ztráty kotel (trub)
Post-boil (mladina) objem PO chmelovaru, HORKÁ mladina
    ↓ ztráta whirlpool (hop trub, hot break)
DO FERMENTORU       ══════ BATCH_SIZE_L ══════                ← KOTVÍCÍ BOD
    ↓ ztráta fermentace (kvasnice, sediment)
Hotové pivo         výstav, před stáčením
```

---

## 1. PIPELINE — OBJEMOVÝ VÝPOČET

### 1.1 Nové parametry na brewing_systems

Stávající `kettle_loss_pct` se ROZDĚLÍ na dva nezávislé parametry:

| Parametr | Typ | Default | Popis |
|----------|-----|---------|-------|
| `evaporation_rate_pct_per_hour` | numeric | 8 | Odpar při varu (% objemu za hodinu) |
| `kettle_trub_loss_l` | numeric | 5 | Pevná ztráta v kotli (chmelový trub, horký kal) v litrech |
| `whirlpool_loss_pct` | numeric | 5 | Ztráta ve whirlpoolu (%) — beze změny |
| `fermentation_loss_pct` | numeric | 5 | Ztráta při fermentaci (%) — beze změny |
| `grain_absorption_l_per_kg` | numeric | 0.8 | Absorpce vody zrnem (L/kg sladu) — NOVÝ |
| `water_per_kg_malt` | numeric | 3.0 | Poměr vody hlavního nálevu k sladu (L/kg) — stávající |

**Odstranit:** `kettle_loss_pct` (nahrazeno evaporation_rate + kettle_trub_loss)

### 1.2 Pipeline výpočet

```typescript
interface VolumePipelineInput {
  batchSizeL: number;              // Kotvící bod = do fermentoru
  boilTimeMin: number;             // Doba varu v minutách (z receptury nebo konstant)
  evaporationRatePctPerHour: number; // Odpar %/hod
  kettleTrubLossL: number;         // Pevná ztráta kotel (L)
  whirlpoolLossPct: number;        // Ztráta whirlpool (%)
  fermentationLossPct: number;     // Ztráta fermentace (%)
}

function calculateVolumePipeline(input: VolumePipelineInput): VolumePipeline {
  const {
    batchSizeL,
    boilTimeMin,
    evaporationRatePctPerHour,
    kettleTrubLossL,
    whirlpoolLossPct,
    fermentationLossPct
  } = input;

  // ── ZPĚTNĚ od batch_size (do fermentoru) ──

  // Post-boil = do fermentoru + whirlpool ztráta
  const whirlpoolFactor = 1 - whirlpoolLossPct / 100;
  const postBoilL = whirlpoolFactor > 0
    ? batchSizeL / whirlpoolFactor
    : batchSizeL;

  // Pre-boil = post-boil + odpar + trub
  // odpar = pre-boil × evap_rate × (boil_time / 60)
  // post-boil = pre-boil - odpar - trub
  // post-boil = pre-boil - pre-boil × evap_rate × (boil_time/60) - trub
  // post-boil = pre-boil × (1 - evap_rate × boil_hours) - trub
  // pre-boil = (post-boil + trub) / (1 - evap_rate × boil_hours)
  const boilHours = boilTimeMin / 60;
  const evapFactor = 1 - (evaporationRatePctPerHour / 100) * boilHours;
  const preBoilL = evapFactor > 0
    ? (postBoilL + kettleTrubLossL) / evapFactor
    : postBoilL + kettleTrubLossL;

  // Odpar v litrech
  const evaporationL = preBoilL * (evaporationRatePctPerHour / 100) * boilHours;

  // ── DOPŘEDU od batch_size ──

  // Hotové pivo = batch_size - fermentační ztráta
  const finishedBeerL = batchSizeL * (1 - fermentationLossPct / 100);

  return {
    preBoilL: round1(preBoilL),
    postBoilL: round1(postBoilL),
    intoFermenterL: round1(batchSizeL),  // = batch_size (kotvící bod)
    finishedBeerL: round1(finishedBeerL),
    losses: {
      evaporationL: round1(evaporationL),
      kettleTrubL: round1(kettleTrubLossL),
      whirlpoolL: round1(postBoilL - batchSizeL),
      fermentationL: round1(batchSizeL - finishedBeerL),
      totalL: round1(preBoilL - finishedBeerL),
    },
  };
}
```

### 1.3 Příklad (1000 L várka, 90 min var, 8%/hod odpar)

```
Pre-boil:       1203 L
  Odpar (90min):  -144 L  (8%/hod × 1.5 hod × 1203 L)
  Trub kotel:       -5 L
Post-boil:      1054 L
  Whirlpool (5%):  -54 L
Do fermentoru:  1000 L  ← BATCH SIZE
  Fermentace (5%): -50 L
Hotové pivo:     950 L
─────────────────────────
Celkové ztráty:  253 L
```

---

## 2. OG — VÝPOČET PŘES PRE-BOIL S KONCENTRACÍ VAREM

### 2.1 Krok 1: Extrakce v pre-boil

```typescript
function calculateOG(
  ingredients: IngredientInput[],
  preBoilL: number,
  postBoilL: number,
  efficiencyPct: number
): number {
  if (preBoilL <= 0 || postBoilL <= 0) return 0;

  const efficiency = efficiencyPct / 100;

  // Celkový extrakt ze sladů (kg)
  const malts = ingredients.filter(
    i => i.category === "malt" || i.category === "adjunct"
  );

  const totalExtractKg = malts.reduce((sum, malt) => {
    const weightKg = toKg(malt);
    const extractFraction = (malt.extractPercent ?? 80) / 100;
    return sum + weightKg * extractFraction * efficiency;
  }, 0);

  // Krok 1: Pre-boil gravity (°Plato)
  // °P = extract_kg / (extract_kg + water_kg) × 100
  // water_kg ≈ preBoilL × 1 (hustota vody ≈ 1 kg/L pro zjednodušení)
  const preBoilPlato = totalExtractKg / (totalExtractKg + preBoilL) * 100;

  // Krok 2: Koncentrace varem
  // Extrakt se nemění, objem klesá → stupňovitost roste
  // post_boil_plato = extract_kg / (extract_kg + post_boil_water_kg) × 100
  // post_boil_water_kg = postBoilL - (totalExtractKg z roztoku)
  //
  // Zjednodušeně: poměrová koncentrace
  // OG_final = preBoilPlato × (preBoilL / postBoilL)
  //
  // Přesněji přes zachování hmotnosti extraktu:
  const postBoilWaterKg = postBoilL; // ≈ hustota mladiny blízká vodě
  const ogPlato = totalExtractKg / (totalExtractKg + postBoilWaterKg) * 100;

  return Math.round(ogPlato * 10) / 10;
}
```

### 2.2 Vysvětlení

1. **Extrakce**: Slad odevzdá extrakt v rmutovacím procesu. `extract_kg = Σ(malt_kg × extract% × efficiency)`
2. **Pre-boil**: Extrakt rozpuštěný v pre-boil objemu → pre-boil gravity
3. **Post-boil**: Varem se odpaří voda, extrakt zůstává → vyšší gravity
4. **OG = post-boil gravity** = gravity mladiny jdoucí do fermentoru (whirlpool nekoncentruje)

### 2.3 Poznámka k přesnosti

Zjednodušení: hustota sladiny ≈ hustota vody (1 kg/L). Pro sladinu 12°P je reálná hustota 1.048 kg/L → chyba ~5%. Pro MVP přijatelné. Přesný výpočet by vyžadoval iterativní řešení (hustota závisí na °P které počítáme).

---

## 3. IBU — TINSETH NA POST-BOIL OBJEM

### 3.1 Stávající implementace (úprava objemu)

```typescript
function calculateIBU(
  ingredients: IngredientInput[],
  postBoilL: number,     // ← ZMĚNA: byl volumeL (batch_size), nyní post-boil
  ogPlato: number
): number {
  // ... stávající Tinseth logika beze změny ...
  // Jen se mění vstupní objem na post-boil
}
```

### 3.2 Tinseth formula (reference, beze změny)

```
IBU = Σ (W_kg × U × alpha × 1,000,000) / V_postboil_L
U = bigness × boiltime_factor
bigness = 1.65 × 0.000125^(SG - 1)
boiltime_factor = (1 - e^(-0.04 × time_min)) / 4.15
```

**Poznámka:** SG pro utilization výpočet = post-boil SG (= OG). To je konzistentní — vyšší OG = nižší utilization.

---

## 4. EBC — MOREY NA BATCH SIZE

### 4.1 Stávající implementace (beze změny objemu)

```typescript
function calculateEBC(
  ingredients: IngredientInput[],
  batchSizeL: number       // = do fermentoru, kotvící bod
): number {
  // ... stávající Morey logika beze změny ...
}
```

EBC se počítá na finální objem v fermentoru. Barevné příspěvky sladů se "ředí" tímto objemem.

---

## 5. ABV — BALLING (BEZE ZMĚNY)

```typescript
function calculateABV(ogPlato: number, fgPlato: number): number {
  const denominator = 2.0665 - 0.010665 * ogPlato;
  if (denominator <= 0) return 0;
  return Math.round(Math.max(0, (ogPlato - fgPlato) / denominator) * 100) / 100;
}
```

Vstup: OG a FG v °Plato. Beze změny.

---

## 6. VÝPOČET POTŘEBY SLADU

### 6.1 Z target OG (design posuvník)

"Kolik kg sladu potřebuji, abych dosáhl target OG při daném objemu a efektivitě?"

```typescript
function calculateMaltRequired(
  targetOgPlato: number,     // Z design posuvníku
  preBoilL: number,          // Z pipeline
  postBoilL: number,         // Z pipeline
  efficiencyPct: number,     // Z brewing system / konstant
  avgExtractPct: number      // Z brewing system (extract_estimate) nebo průměr sladů
): number {
  if (targetOgPlato <= 0 || postBoilL <= 0) return 0;

  // Reverse výpočet z OG formula:
  // OG = extract_kg / (extract_kg + postBoilL) × 100
  // targetOgPlato/100 = extract_kg / (extract_kg + postBoilL)
  // targetOgPlato/100 × (extract_kg + postBoilL) = extract_kg
  // targetOgPlato/100 × postBoilL = extract_kg × (1 - targetOgPlato/100)
  // extract_kg = (targetOgPlato/100 × postBoilL) / (1 - targetOgPlato/100)

  const ogFraction = targetOgPlato / 100;
  if (ogFraction >= 1) return 0; // nesmysl

  const extractNeededKg = (ogFraction * postBoilL) / (1 - ogFraction);

  // malt_kg = extract_kg / (extract% × efficiency)
  const extractFraction = (avgExtractPct || 80) / 100;
  const efficiency = (efficiencyPct || 75) / 100;

  if (extractFraction <= 0 || efficiency <= 0) return 0;

  const maltKg = extractNeededKg / extractFraction / efficiency;

  return Math.round(maltKg * 100) / 100;
}
```

### 6.2 Porovnání v sidebar

```
Slad plán:   40.9 kg  (dle target OG 12.0°P)
Slad aktuál: 38.0 kg  (součet sladů v receptu)
Rozdíl:      -2.9 kg  🔴
```

---

## 7. VÝPOČET POTŘEBY VODY

### 7.1 Dva dílčí objemy

**Hlavní nálev (mash water / strike water):**
```
mash_water_L = malt_kg × water_per_kg_malt
```

Parametr `water_per_kg_malt` z brewing system (default 3.0 L/kg).
Typické hodnoty: 2.5–4.0 L/kg. Infuzní rmutování = vyšší, dekokční = nižší.

**Vypláchová voda (sparge water):**
```
grain_absorption_L = malt_kg × grain_absorption_l_per_kg
volume_after_mash_L = mash_water_L - grain_absorption_L
sparge_water_L = pre_boil_L - volume_after_mash_L
```

Logika: Po rmutování máme `mash_water - grain_absorption` litrů sladiny. Potřebujeme `pre_boil_L` v kotli. Vyplachem doplníme rozdíl.

**Celková voda:**
```
total_water_L = mash_water_L + sparge_water_L
```

### 7.2 Implementace

```typescript
interface WaterCalculation {
  mashWaterL: number;         // Hlavní nálev
  spargeWaterL: number;       // Vypláchová voda
  totalWaterL: number;        // Celkem
  grainAbsorptionL: number;   // Absorpce zrnem (informativní)
}

function calculateWater(
  maltKg: number,             // Celkové kg sladu (actual z receptu NEBO plan z target OG)
  preBoilL: number,           // Z pipeline
  waterPerKgMalt: number,     // Z brewing system (default 3.0)
  grainAbsorptionLPerKg: number // Z brewing system (default 0.8)
): WaterCalculation {
  if (maltKg <= 0 || preBoilL <= 0) {
    return { mashWaterL: 0, spargeWaterL: 0, totalWaterL: 0, grainAbsorptionL: 0 };
  }

  const mashWaterL = maltKg * waterPerKgMalt;
  const grainAbsorptionL = maltKg * grainAbsorptionLPerKg;
  const volumeAfterMashL = mashWaterL - grainAbsorptionL;

  // Sparge = kolik vody potřebujeme doplnit aby v kotli bylo pre_boil_L
  const spargeWaterL = Math.max(0, preBoilL - volumeAfterMashL);
  const totalWaterL = mashWaterL + spargeWaterL;

  return {
    mashWaterL: round1(mashWaterL),
    spargeWaterL: round1(spargeWaterL),
    totalWaterL: round1(totalWaterL),
    grainAbsorptionL: round1(grainAbsorptionL),
  };
}
```

### 7.3 Příklad (40 kg sladu, pre-boil 1203 L, 3.0 L/kg, absorpce 0.8 L/kg)

```
Hlavní nálev:   120.0 L  (40 × 3.0)
Absorpce zrnem:  32.0 L  (40 × 0.8)
Po rmutování:    88.0 L  (120 - 32)
Vypláchová voda: 1115.0 L  (1203 - 88)
Celkem voda:    1235.0 L  (120 + 1115)
```

### 7.4 Zobrazení v sidebar

```
── Voda ──
Hlavní nálev:    120.0 L
Vypláchová voda: 1115.0 L
Celkem:         1235.0 L
Absorpce zrnem:   32.0 L (informativní)
```

---

## 8. NÁKLADOVÁ KALKULACE (BEZE ZMĚNY)

Stávající `calculateCost()` + overhead logika z S4 patche zůstává beze změny.
Kalkulace per-surovina, pricing modes, režie — vše funguje.

---

## 9. BREWING SYSTEM SCHEMA — FINÁLNÍ PODOBA

### 9.1 Nové/změněné sloupce

```sql
-- NOVÉ sloupce
ALTER TABLE brewing_systems ADD COLUMN evaporation_rate_pct_per_hour NUMERIC DEFAULT 8;
ALTER TABLE brewing_systems ADD COLUMN kettle_trub_loss_l NUMERIC DEFAULT 5;
ALTER TABLE brewing_systems ADD COLUMN grain_absorption_l_per_kg NUMERIC DEFAULT 0.8;

-- ODSTRANIT (nahrazeno výše)
ALTER TABLE brewing_systems DROP COLUMN kettle_loss_pct;
```

### 9.2 Kompletní brewing_systems sloupce (po patchi)

| Sloupec | Typ | Default | Popis |
|---------|-----|---------|-------|
| `id` | uuid | PK | |
| `tenant_id` | uuid | FK | |
| `name` | text | | Název soustavy |
| `batch_size_l` | numeric | 100 | Cílový objem do fermentoru |
| `efficiency_pct` | numeric | 75 | Efektivita varny (%) |
| `kettle_volume_l` | numeric | 120 | Objem kotle |
| `evaporation_rate_pct_per_hour` | numeric | 8 | Odpar %/hod |
| `kettle_trub_loss_l` | numeric | 5 | Pevná ztráta kotel (L) |
| `whirlpool_loss_pct` | numeric | 5 | Ztráta whirlpool (%) |
| `fermenter_volume_l` | numeric | 120 | Objem fermentoru |
| `fermentation_loss_pct` | numeric | 5 | Ztráta fermentace (%) |
| `extract_estimate` | numeric | 80 | Průměrný extrakt sladu (%) |
| `water_per_kg_malt` | numeric | 3.0 | Voda hlavního nálevu (L/kg) |
| `grain_absorption_l_per_kg` | numeric | 0.8 | Absorpce vody zrnem (L/kg) |
| `water_reserve_l` | numeric | 10 | Rezerva vody (L) |
| `is_active` | boolean | true | |
| `created_at` | timestamptz | now() | |
| `updated_at` | timestamptz | now() | |

### 9.3 Migrace

Pokud `kettle_loss_pct` je na brewing_systems a má data:
1. Přidat nové sloupce s defaults
2. Zkusit odhadnout evaporation z kettle_loss: `evaporation_rate ≈ kettle_loss_pct` (hrubý odhad)
3. Dropnout `kettle_loss_pct`
4. Aktualizovat Drizzle schema

Pokud `kettle_loss_pct` ještě nemá reálná data (Phase A1 teprve implementuje):
1. Rovnou použít nové sloupce v Phase A1 specifikaci
2. Žádná migrace starých dat

---

## 10. BrewingSystemInput — AKTUALIZOVANÝ INTERFACE

```typescript
export interface BrewingSystemInput {
  batchSizeL: number;
  efficiencyPct: number;
  kettleVolumeL: number;
  evaporationRatePctPerHour: number;  // NOVÉ (místo kettleLossPct)
  kettleTrubLossL: number;            // NOVÉ
  whirlpoolLossPct: number;
  fermenterVolumeL: number;
  fermentationLossPct: number;
  extractEstimate: number;
  waterPerKgMalt: number;
  grainAbsorptionLPerKg: number;      // NOVÉ
  waterReserveL: number;
}

export const DEFAULT_BREWING_SYSTEM: BrewingSystemInput = {
  batchSizeL: 100,
  efficiencyPct: 75,
  kettleVolumeL: 120,
  evaporationRatePctPerHour: 8,
  kettleTrubLossL: 5,
  whirlpoolLossPct: 5,
  fermenterVolumeL: 120,
  fermentationLossPct: 5,
  extractEstimate: 80,
  waterPerKgMalt: 3.0,
  grainAbsorptionLPerKg: 0.8,
  waterReserveL: 10,
};
```

---

## 11. calculateAll() — AKTUALIZOVANÝ PODPIS A LOGIKA

```typescript
export function calculateAll(
  ingredients: IngredientInput[],
  batchSizeL: number,          // = do fermentoru (kotvící bod)
  boilTimeMin: number,         // Doba varu z receptury
  fgPlato?: number,            // Target FG (z design posuvníku)
  overhead?: OverheadInputs,
  brewingSystem?: BrewingSystemInput | null
): RecipeCalculationResult {
  const system = brewingSystem ?? DEFAULT_BREWING_SYSTEM;

  // 1. Pipeline
  const pipeline = calculateVolumePipeline({
    batchSizeL,
    boilTimeMin,
    evaporationRatePctPerHour: system.evaporationRatePctPerHour,
    kettleTrubLossL: system.kettleTrubLossL,
    whirlpoolLossPct: system.whirlpoolLossPct,
    fermentationLossPct: system.fermentationLossPct,
  });

  // 2. OG — přes pre-boil s koncentrací varem
  const og = calculateOG(
    ingredients,
    pipeline.preBoilL,
    pipeline.postBoilL,
    system.efficiencyPct
  );

  // 3. FG — z design targetu, nebo odhad 25% OG
  const fg = fgPlato ?? Math.round(og * 0.25 * 10) / 10;

  // 4. ABV
  const abv = calculateABV(og, fg);

  // 5. IBU — na post-boil objem
  const ibu = calculateIBU(ingredients, pipeline.postBoilL, og);

  // 6. EBC — na batch size (do fermentoru)
  const ebc = calculateEBC(ingredients, batchSizeL);

  // 7. Cost (beze změny)
  const { total: ingredientsCost, perItem } = calculateCost(ingredients);

  // 8. Overhead (beze změny)
  const oh = overhead ?? { overheadPct: 0, overheadCzk: 0, brewCostCzk: 0 };
  const ingredientOverheadCost = Math.round(ingredientsCost * oh.overheadPct) / 100;
  const totalProductionCost = Math.round(
    (ingredientsCost + ingredientOverheadCost + oh.brewCostCzk + oh.overheadCzk) * 100
  ) / 100;
  const costPerLiter = batchSizeL > 0
    ? Math.round((totalProductionCost / batchSizeL) * 100) / 100
    : 0;

  // 9. Potřeba sladu (z calculated OG, ne target)
  const maltActualKg = ingredients
    .filter(i => i.category === "malt" || i.category === "adjunct")
    .reduce((sum, m) => sum + toKg(m), 0);

  // 10. Voda
  const water = calculateWater(
    maltActualKg,
    pipeline.preBoilL,
    system.waterPerKgMalt,
    system.grainAbsorptionLPerKg
  );

  return {
    og, fg, abv, ibu, ebc,
    ingredientsCost,
    ingredientOverheadPct: oh.overheadPct,
    ingredientOverheadCost,
    brewCost: oh.brewCostCzk,
    overheadCost: oh.overheadCzk,
    totalProductionCost,
    costPerLiter,
    pricingMode: "calc_price",
    ingredients: perItem.map(i => ({ ...i, priceSource: "calc_price" })),
    costPrice: totalProductionCost,

    // Pipeline
    pipeline,

    // Slad
    maltActualKg: Math.round(maltActualKg * 100) / 100,

    // Voda
    water,

    // Metadata
    brewingSystemUsed: brewingSystem != null,
  };
}
```

---

## 12. RecipeCalculationResult — AKTUALIZOVANÝ

```typescript
export interface VolumePipeline {
  preBoilL: number;
  postBoilL: number;
  intoFermenterL: number;    // = batch_size (kotvící bod)
  finishedBeerL: number;
  losses: {
    evaporationL: number;    // Odpar při varu
    kettleTrubL: number;     // Pevná ztráta kotel
    whirlpoolL: number;
    fermentationL: number;
    totalL: number;
  };
}

export interface WaterCalculation {
  mashWaterL: number;
  spargeWaterL: number;
  totalWaterL: number;
  grainAbsorptionL: number;
}

export interface RecipeCalculationResult {
  // Pivovarské parametry (calculated ze surovin)
  og: number;
  fg: number;
  abv: number;
  ibu: number;
  ebc: number;

  // Nákladová kalkulace (beze změny)
  ingredientsCost: number;
  ingredientOverheadPct: number;
  ingredientOverheadCost: number;
  brewCost: number;
  overheadCost: number;
  totalProductionCost: number;
  costPerLiter: number;
  pricingMode: string;
  ingredients: { ... }[];
  costPrice: number;

  // Pipeline
  pipeline: VolumePipeline;

  // Slad
  maltActualKg: number;

  // Voda
  water: WaterCalculation;

  // Metadata
  brewingSystemUsed: boolean;
}
```

---

## 13. SIDEBAR ZOBRAZENÍ (aktualizace)

```
── Slad plán ──
Plán:    40.9 kg   (dle target OG z designu)
Aktuál:  38.0 kg   (součet sladů v receptu)
Rozdíl:  -2.9 kg   🔴

── Pipeline ──
Pre-boil (sladina):  1203 L
  Odpar (90 min):     -144 L  (8%/hod)
  Trub kotel:           -5 L
Post-boil (mladina): 1054 L
  Whirlpool (5%):      -54 L
Do fermentoru:       1000 L  ← batch size
  Fermentace (5%):     -50 L
Hotové pivo:          950 L

── Voda ──
Hlavní nálev:        120.0 L  (40 kg × 3.0 L/kg)
Vypláchová voda:    1115.0 L
Celkem:             1235.0 L
Absorpce zrnem:       32.0 L

── Náklady ──
Celkem: 2 850 Kč
Per litr: 2.85 Kč/L
Per hl: 285 Kč/hl
```

---

## 14. DOPAD NA EXISTUJÍCÍ SPECS

### Phase A1 (Brewing Systems)
- **Aktualizovat schema:** Nahradit `kettle_loss_pct` novými sloupci (`evaporation_rate_pct_per_hour`, `kettle_trub_loss_l`, `grain_absorption_l_per_kg`)
- Aktualizovat formulář brewing system detailu
- Aktualizovat visual blocks (zobrazit odpar a trub zvlášť)

### Phase B (Calculation Engine)
- **Kompletně nahrazeno tímto dokumentem** — nové pipeline, OG přes pre-boil, IBU na post-boil, voda split, explicitní odpar
- Starý Phase B spec je NEPLATNÝ

### Phase C (Recipe Designer UI)
- Sidebar aktualizovat na nový formát (pipeline s odparem, voda split)
- Design posuvníky: malt_required počítat z target OG (design) přes `calculateMaltRequired(targetOG, pipeline.preBoilL, pipeline.postBoilL, efficiency, extractEstimate)`

### Phase A4 patch (Constants tab)
- Aktualizovat tabulku konstant: přidat evaporation_rate, kettle_trub_loss, grain_absorption. Odstranit kettle_loss_pct

---

## AKCEPTAČNÍ KRITÉRIA

### Pipeline
1. [ ] batch_size_l = objem do fermentoru (kotvící bod)
2. [ ] Pre-boil počítán zpětně s explicitním odparem (evaporation_rate × boil_hours)
3. [ ] Kettle ztráta = odpar + trub (dva nezávislé parametry)
4. [ ] Post-boil → do fermentoru přes whirlpool ztrátu
5. [ ] Hotové pivo = batch_size × (1 - fermentation_loss)
6. [ ] Pipeline losses breakdown: evaporationL, kettleTrubL, whirlpoolL, fermentationL

### OG
7. [ ] OG počítán přes pre-boil (extrakce) → post-boil (koncentrace varem)
8. [ ] Efektivita z brewing system / konstant (ne hardcoded 75%)
9. [ ] Pre-boil a post-boil objemy z pipeline

### IBU
10. [ ] Tinseth na post-boil objem (ne batch_size)
11. [ ] SG pro utilization = calculated OG

### EBC
12. [ ] Morey na batch_size (do fermentoru)

### Slad
13. [ ] calculateMaltRequired() z target OG (design posuvník)
14. [ ] maltActualKg = součet sladů v receptu
15. [ ] Sidebar: porovnání plán vs aktuál

### Voda
16. [ ] Hlavní nálev = malt_kg × water_per_kg_malt
17. [ ] Absorpce zrnem = malt_kg × grain_absorption_l_per_kg
18. [ ] Vypláchová voda = pre_boil_L - (hlavní_nálev - absorpce)
19. [ ] Celkem = hlavní nálev + vypláchová voda

### Brewing system schema
20. [ ] evaporation_rate_pct_per_hour sloupec (default 8)
21. [ ] kettle_trub_loss_l sloupec (default 5)
22. [ ] grain_absorption_l_per_kg sloupec (default 0.8)
23. [ ] kettle_loss_pct ODSTRANĚN
24. [ ] Drizzle schema + migrace

### Integration
25. [ ] calculateAll() přijímá boilTimeMin parametr
26. [ ] calculateAndSaveRecipe() předává boilTimeMin z receptury
27. [ ] RecipeCalculationResult obsahuje pipeline, maltActualKg, water
28. [ ] Zpětná kompatibilita: stávající volání s default brewing system fungují

### Obecné
29. [ ] npm run build bez chyb
30. [ ] TypeScript: zero errors
