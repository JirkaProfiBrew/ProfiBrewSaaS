# SPRINT 6 — FÁZE B: KALKULAČNÍ ENGINE
## Zadání pro Claude Code | ProfiBrew.com
### Verze: 1.0 | Datum: 27.02.2026

---

## CÍL

Rozšířit stávající kalkulační engine o napojení na varní soustavy (brewing systems). Výpočty musí využívat efektivitu varny a ztráty z brewing system místo hardcoded hodnot. Přidat objemovou pipeline (objem v každém kroku výroby), výpočet potřebného množství sladu a výpočet potřeby vody.

**Závisí na:** Phase A1 (brewing_systems tabulka), Phase A2 (brewing_system_id na recipes/batches)

---

## KONTEXT

### Co máme (Sprint 2 + S4 patch)

Stávající kalkulační funkce v `src/modules/recipes/utils.ts`:

| Funkce | Stav | Problém |
|--------|------|---------|
| `calculateOG()` | ✅ Funguje | Hardcoded efficiency 75%, ignoruje brewing system |
| `calculateIBU()` | ✅ Funguje | Používá batch volume, ne pre-boil volume |
| `calculateEBC()` | ✅ Funguje | OK |
| `calculateABV()` | ✅ Funguje | OK |
| `calculateCost()` | ✅ Funguje | OK |
| `calculateAll()` | ✅ Funguje | Nemá objemovou pipeline, nevrací slad/voda |

Server action `calculateAndSaveRecipe()` v `src/modules/recipes/actions.ts`:
- Načte ingredience, resolve ceny, zavolá `calculateAll()`, uloží snapshot
- Overhead z shop settings funguje

### Co chceme

1. **`calculateAll()` bere brewing system parametry** — efektivita, ztráty, objemy
2. **Objemová pipeline** — výstup zahrnuje objem v každém kroku (sladina → kettle → whirlpool → fermenter → hotové pivo)
3. **Výpočet potřeby sladu** — z target Plata + objemu + efektivity → celkový kg sladu
4. **Výpočet potřeby vody** — z kg sladu × water_per_kg_malt + water_reserve
5. **Recipe ↔ brewing system UI propojení** — select na receptuře pro výběr varní soustavy

---

## KROK 1: BREWING SYSTEM INPUT TYPE

### 1.1 Nový interface

**Soubor:** `src/modules/recipes/types.ts` (rozšířit)

```typescript
/**
 * Parametry varní soustavy pro výpočty.
 * Načtené z brewing_systems tabulky nebo NULL (= default hardcoded hodnoty).
 */
export interface BrewingSystemInput {
  /** Cílový objem várky v litrech (batch_size_l) */
  batchSizeL: number;
  /** Efektivita varny v % (efficiency_pct) — nahrazuje hardcoded 75% */
  efficiencyPct: number;
  /** Objem kotle v litrech (kettle_volume_l) */
  kettleVolumeL: number;
  /** Ztráta v kotli v % (kettle_loss_pct) — chmelové mláto, ztráty varem */
  kettleLossPct: number;
  /** Ztráta ve whirlpoolu v % (whirlpool_loss_pct) */
  whirlpoolLossPct: number;
  /** Schématický objem fermentoru v litrech (fermenter_volume_l) */
  fermenterVolumeL: number;
  /** Ztráta při fermentaci v % (fermentation_loss_pct) — kvasnice, sediment */
  fermentationLossPct: number;
  /** Odhadovaný extrakt sladu v % (extract_estimate) */
  extractEstimate: number;
  /** Voda na kg sladu v litrech (water_per_kg_malt) */
  waterPerKgMalt: number;
  /** Rezerva vody v litrech (water_reserve_l) */
  waterReserveL: number;
}
```

### 1.2 Default hodnoty (fallback bez brewing system)

```typescript
export const DEFAULT_BREWING_SYSTEM: BrewingSystemInput = {
  batchSizeL: 100,
  efficiencyPct: 75,
  kettleVolumeL: 120,
  kettleLossPct: 10,
  whirlpoolLossPct: 5,
  fermenterVolumeL: 120,
  fermentationLossPct: 5,
  extractEstimate: 80,
  waterPerKgMalt: 4,
  waterReserveL: 10,
};
```

---

## KROK 2: OBJEMOVÁ PIPELINE

### 2.1 Nová funkce `calculateVolumePipeline()`

**Soubor:** `src/modules/recipes/utils.ts`

```typescript
/**
 * Výpočet objemů přes celý výrobní proces.
 * 
 * Flow: Sladina (pre-boil) → Kettle (post-boil) → Whirlpool → Fermenter → Hotové pivo
 * 
 * Výchozí bod je požadovaný objem hotového piva (batch_size_l z receptury).
 * Objemy se počítají ZPĚTNĚ — od hotového piva směrem k pre-boil.
 * 
 * hotové_pivo = batch_size_l (cíl)
 * fermenter_in = hotové_pivo / (1 - fermentation_loss_pct/100)
 * whirlpool_out = fermenter_in
 * whirlpool_in = whirlpool_out / (1 - whirlpool_loss_pct/100)  
 * kettle_out = whirlpool_in
 * kettle_in (pre-boil) = kettle_out / (1 - kettle_loss_pct/100)
 */
export interface VolumePipeline {
  /** Objem sladiny před varem (pre-boil) */
  preBoilL: number;
  /** Objem po chmelovaru (post-boil = kettle out) */
  postBoilL: number;
  /** Objem po whirlpoolu (= do fermentoru) */
  intoFermenterL: number;
  /** Objem hotového piva (= batch_size_l cíl) */
  finishedBeerL: number;
  /** Ztráty breakdown */
  losses: {
    kettleL: number;        // litry ztracené v kotli
    whirlpoolL: number;     // litry ztracené ve whirlpoolu
    fermentationL: number;  // litry ztracené při fermentaci
    totalL: number;         // celkové ztráty
  };
}

export function calculateVolumePipeline(
  targetVolumeL: number,
  system: BrewingSystemInput
): VolumePipeline {
  const finishedBeerL = targetVolumeL;

  // Zpětný výpočet od hotového piva
  const fermLossFactor = 1 - system.fermentationLossPct / 100;
  const intoFermenterL = fermLossFactor > 0 ? finishedBeerL / fermLossFactor : finishedBeerL;

  const whirlpoolLossFactor = 1 - system.whirlpoolLossPct / 100;
  const postBoilL = whirlpoolLossFactor > 0 ? intoFermenterL / whirlpoolLossFactor : intoFermenterL;

  const kettleLossFactor = 1 - system.kettleLossPct / 100;
  const preBoilL = kettleLossFactor > 0 ? postBoilL / kettleLossFactor : postBoilL;

  return {
    preBoilL: round1(preBoilL),
    postBoilL: round1(postBoilL),
    intoFermenterL: round1(intoFermenterL),
    finishedBeerL: round1(finishedBeerL),
    losses: {
      kettleL: round1(preBoilL - postBoilL),
      whirlpoolL: round1(postBoilL - intoFermenterL),
      fermentationL: round1(intoFermenterL - finishedBeerL),
      totalL: round1(preBoilL - finishedBeerL),
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
```

---

## KROK 3: VÝPOČET POTŘEBY SLADU

### 3.1 Nová funkce `calculateMaltRequired()`

```typescript
/**
 * Výpočet celkového potřebného množství sladu v kg.
 * 
 * Vzorec:
 *   extract_needed_kg = (plato / 100) × pre_boil_volume_L × wort_density
 *   malt_kg = extract_needed_kg / (extract_estimate/100) / (efficiency/100)
 * 
 * Zjednodušeně (pro přibližný výpočet):
 *   wort_density ≈ 1 + plato/258 (kg/L)
 *   extract_needed = plato/100 × preBoilL × wort_density
 *   malt_kg = extract_needed / (extract/100) / (efficiency/100)
 * 
 * @param targetPlato - Cílové °Plato (OG)
 * @param preBoilVolumeL - Objem sladiny před varem (z volume pipeline)
 * @param system - Parametry varní soustavy
 * @returns Potřebné kg sladu celkem
 */
export function calculateMaltRequired(
  targetPlato: number,
  preBoilVolumeL: number,
  system: BrewingSystemInput
): number {
  if (targetPlato <= 0 || preBoilVolumeL <= 0) return 0;

  // Hustota sladiny (přibližně)
  const wortDensity = 1 + targetPlato / 258;

  // Potřebný extrakt v kg
  const extractNeededKg = (targetPlato / 100) * preBoilVolumeL * wortDensity;

  // Potřebný slad v kg
  const extractFraction = (system.extractEstimate || 80) / 100;
  const efficiencyFraction = (system.efficiencyPct || 75) / 100;

  if (extractFraction <= 0 || efficiencyFraction <= 0) return 0;

  const maltKg = extractNeededKg / extractFraction / efficiencyFraction;

  return Math.round(maltKg * 100) / 100;
}
```

---

## KROK 4: VÝPOČET POTŘEBY VODY

### 4.1 Nová funkce `calculateWaterRequired()`

```typescript
/**
 * Výpočet potřebného množství vody v litrech.
 * 
 * Vzorec:
 *   water_L = malt_kg × water_per_kg_malt + water_reserve_L
 * 
 * water_per_kg_malt: kolik litrů vody na 1 kg sladu (typicky 3-5 L/kg)
 * water_reserve_L: rezerva vody (výplachy, doplnění)
 * 
 * @param maltKg - Celkové kg sladu (z calculateMaltRequired)
 * @param system - Parametry varní soustavy
 * @returns Potřebné litry vody
 */
export function calculateWaterRequired(
  maltKg: number,
  system: BrewingSystemInput
): number {
  if (maltKg <= 0) return 0;

  const waterL = maltKg * (system.waterPerKgMalt || 4) + (system.waterReserveL || 0);

  return Math.round(waterL * 10) / 10;
}
```

---

## KROK 5: ROZŠÍŘENÍ calculateAll()

### 5.1 Nový podpis

```typescript
export function calculateAll(
  ingredients: IngredientInput[],
  volumeL: number,
  fgPlato?: number,
  overhead?: OverheadInputs,
  brewingSystem?: BrewingSystemInput | null  // NOVÝ parametr
): RecipeCalculationResult
```

### 5.2 Změny v calculateAll()

```typescript
export function calculateAll(
  ingredients: IngredientInput[],
  volumeL: number,
  fgPlato?: number,
  overhead?: OverheadInputs,
  brewingSystem?: BrewingSystemInput | null
): RecipeCalculationResult {
  // Použij brewing system nebo defaults
  const system = brewingSystem ?? DEFAULT_BREWING_SYSTEM;

  // 1. Objemová pipeline
  const pipeline = calculateVolumePipeline(volumeL, system);

  // 2. OG — použij efektivitu z brewing system (NE hardcoded 75%)
  const og = calculateOG(ingredients, volumeL, system.efficiencyPct / 100);

  // 3. FG — stávající logika (25% OG estimate)
  const fg = fgPlato ?? Math.round(og * 0.25 * 10) / 10;

  // 4. ABV
  const abv = calculateABV(og, fg);

  // 5. IBU — použít pre-boil objem pro přesnější výpočet
  //    (Tinseth formula se standardně počítá s post-boil, ale pre-boil 
  //     je přesnější pro utilization — záleží na implementaci)
  //    ZACHOVAT stávající chování: volumeL = batch/finished volume
  const ibu = calculateIBU(ingredients, volumeL, og);

  // 6. EBC
  const ebc = calculateEBC(ingredients, volumeL);

  // 7. Cost (beze změny)
  const { total: ingredientsCost, perItem } = calculateCost(ingredients);

  // 8. Overhead (beze změny)
  const oh = overhead ?? { overheadPct: 0, overheadCzk: 0, brewCostCzk: 0 };
  const ingredientOverheadCost = Math.round(ingredientsCost * oh.overheadPct) / 100;
  const totalProductionCost = Math.round(
    (ingredientsCost + ingredientOverheadCost + oh.brewCostCzk + oh.overheadCzk) * 100
  ) / 100;
  const costPerLiter = volumeL > 0
    ? Math.round((totalProductionCost / volumeL) * 100) / 100
    : 0;

  // 9. NOVÉ: Výpočet sladu a vody
  const maltRequiredKg = calculateMaltRequired(og, pipeline.preBoilL, system);
  const waterRequiredL = calculateWaterRequired(maltRequiredKg, system);

  return {
    // Stávající pole (beze změny)
    og, fg, abv, ibu, ebc,
    ingredientsCost,
    ingredientOverheadPct: oh.overheadPct,
    ingredientOverheadCost,
    brewCost: oh.brewCostCzk,
    overheadCost: oh.overheadCzk,
    totalProductionCost,
    costPerLiter,
    pricingMode: "calc_price",
    ingredients: perItem.map((i) => ({ ...i, priceSource: "calc_price" })),
    costPrice: totalProductionCost,

    // NOVÉ pole
    pipeline,
    maltRequiredKg,
    waterRequiredL,
    brewingSystemUsed: brewingSystem != null,
  };
}
```

### 5.3 Rozšíření RecipeCalculationResult

```typescript
export interface RecipeCalculationResult {
  // --- Stávající pivovarské parametry (beze změny) ---
  og: number;
  fg: number;
  abv: number;
  ibu: number;
  ebc: number;

  // --- Nákladová kalkulace (beze změny) ---
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

  // --- NOVÉ: Objemová pipeline ---
  pipeline: VolumePipeline;

  // --- NOVÉ: Výpočet surovin ---
  maltRequiredKg: number;       // Celkové potřebné kg sladu
  waterRequiredL: number;       // Celkové potřebné litry vody

  // --- NOVÉ: Metadata ---
  brewingSystemUsed: boolean;   // Zda se použil brewing system (true) nebo defaults (false)
}
```

**⚠️ ZPĚTNÁ KOMPATIBILITA:** Nová pole jsou přidána k existujícímu typu. Stávající kód, který čte jen `og`, `ibu`, `costPrice` atd. funguje beze změny. JSONB snapshot v DB bude mít nová pole navíc — to je OK, JSONB je schemaless.

---

## KROK 6: SERVER ACTION — NAPOJENÍ NA BREWING SYSTEM

### 6.1 Rozšíření calculateAndSaveRecipe()

V `src/modules/recipes/actions.ts`:

```typescript
export async function calculateAndSaveRecipe(
  recipeId: string
): Promise<RecipeCalculationResult> {
  return withTenant(async (tenantId) => {
    // 1. Load recipe (stávající)
    const recipe = ...;

    // 2. NOVÉ: Load brewing system (pokud je nastavený)
    let brewingSystemInput: BrewingSystemInput | null = null;
    if (recipe.brewingSystemId) {
      const bs = await db
        .select()
        .from(brewingSystems)
        .where(
          and(
            eq(brewingSystems.id, recipe.brewingSystemId),
            eq(brewingSystems.tenantId, tenantId)
          )
        )
        .limit(1);

      if (bs[0]) {
        brewingSystemInput = {
          batchSizeL: parseFloat(bs[0].batchSizeL) || 100,
          efficiencyPct: parseFloat(bs[0].efficiencyPct) || 75,
          kettleVolumeL: parseFloat(bs[0].kettleVolumeL) || 120,
          kettleLossPct: parseFloat(bs[0].kettleLossPct) || 10,
          whirlpoolLossPct: parseFloat(bs[0].whirlpoolLossPct) || 5,
          fermenterVolumeL: parseFloat(bs[0].fermenterVolumeL) || 120,
          fermentationLossPct: parseFloat(bs[0].fermentationLossPct) || 5,
          extractEstimate: parseFloat(bs[0].extractEstimate) || 80,
          waterPerKgMalt: parseFloat(bs[0].waterPerKgMalt) || 4,
          waterReserveL: parseFloat(bs[0].waterReserveL) || 10,
        };
      }
    }

    // 3. Load recipe items (stávající)
    // 4. Resolve ceny (stávající)
    // 5. Build ingredientInputs (stávající)
    // 6. Overhead (stávající)

    // 7. Výpočet — ROZŠÍŘENÝ
    const volumeL = recipe.batchSizeL ? parseFloat(recipe.batchSizeL) : 0;
    const fgPlato = recipe.fg ? parseFloat(recipe.fg) : undefined;

    const result = calculateAll(
      ingredientInputs,
      volumeL,
      fgPlato,
      overhead,
      brewingSystemInput  // NOVÝ parametr
    );

    // 8. Save snapshot (stávající — JSONB pojme nová pole automaticky)
    // 9. Update recipe (stávající)

    return result;
  });
}
```

### 6.2 Fallback logika

Pokud `recipe.brewing_system_id IS NULL`:
- `brewingSystemInput = null`
- `calculateAll()` použije `DEFAULT_BREWING_SYSTEM`
- Výsledek je zpětně kompatibilní (ale pipeline ukazuje defaultní ztráty)

Pokud `recipe.brewing_system_id` odkazuje na neexistující brewing system:
- Logovat warning
- Fallback na defaults

---

## KROK 7: RECIPE ↔ BREWING SYSTEM UI PROPOJENÍ

### 7.1 Select na receptuře

Na tabu **Základní údaje** receptury přidat:

```
Varní soustava: [-- Vyberte varní soustavu --] ▾
```

- Select z `brewing_systems` pro daný tenant
- Zobrazit: `{name} ({batch_size_l} L, {efficiency_pct}%)`
- Volitelné (nullable) — pivovar nemusí mít brewing system definovaný
- Při změně: přepočítat recepturu (zavolat `calculateAndSaveRecipe`)

### 7.2 Na detailu receptury zobrazit:

Pokud je brewing system vybraný, na tabu **Kalkulace** (nebo novém tabu **Výpočty**) zobrazit:

**Objemová pipeline:**
```
Pre-boil:    132.5 L
Post-boil:   119.2 L  (ztráta kotel: 13.3 L / 10%)
Do fermentoru: 113.2 L  (ztráta whirlpool: 6.0 L / 5%)
Hotové pivo:  107.6 L  (ztráta fermentace: 5.7 L / 5%)
─────────────────────────
Celkové ztráty: 24.9 L
```

**Potřeba surovin:**
```
Potřeba sladu: 28.8 kg  (dle Plato a efektivity varny)
Potřeba vody:  125.2 L  (28.8 kg × 4 L/kg + 10 L rezerva)
```

### 7.3 Pozice v UI

- **Select varní soustavy:** Tab "Základní údaje", pod "Pivní styl", před "Objem várky"
- **Objemová pipeline + potřeba surovin:** Tab "Kalkulace", nová sekce nad stávajícím výpočtem nákladů

---

## KROK 8: EXISTUJÍCÍ calculateOG() — PARAMETRIZACE

### 8.1 Aktuální stav

```typescript
export function calculateOG(
  ingredients: IngredientInput[],
  volumeL: number,
  efficiency: number = 0.75  // Hardcoded default
): number
```

### 8.2 Požadovaná změna

**Žádná změna podpisu.** Funkce už přijímá `efficiency` parametr. Změna je pouze v `calculateAll()`, kde se volá:

```typescript
// PŘED (hardcoded):
const og = calculateOG(ingredients, volumeL);

// PO (z brewing system):
const og = calculateOG(ingredients, volumeL, system.efficiencyPct / 100);
```

Všechny ostatní kalkulační funkce zůstávají beze změny.

---

## KROK 9: I18N

### 9.1 Rozšíření `src/i18n/messages/cs/recipes.json`

Přidat do existujícího souboru:

```json
{
  "form": {
    "brewingSystem": "Varní soustava",
    "brewingSystemPlaceholder": "Vyberte varní soustavu",
    "noBrewingSystem": "Bez varní soustavy (výchozí parametry)"
  },
  "calculation": {
    "pipeline": {
      "title": "Objemová pipeline",
      "preBoil": "Pre-boil (sladina)",
      "postBoil": "Post-boil (mladina)",
      "intoFermenter": "Do fermentoru",
      "finishedBeer": "Hotové pivo",
      "losses": "Ztráty",
      "kettleLoss": "Ztráta kotel",
      "whirlpoolLoss": "Ztráta whirlpool",
      "fermentationLoss": "Ztráta fermentace",
      "totalLoss": "Celkové ztráty"
    },
    "requirements": {
      "title": "Potřeba surovin",
      "maltRequired": "Potřeba sladu",
      "waterRequired": "Potřeba vody",
      "maltUnit": "kg",
      "waterUnit": "L"
    },
    "brewingSystemNote": "Výpočty dle varní soustavy: {name}",
    "defaultSystemNote": "Výchozí parametry (varní soustava nenastavena)"
  }
}
```

EN verze analogicky.

---

## KROK 10: DOKUMENTACE

### CHANGELOG.md

```markdown
## Sprint 6 — Fáze B: Kalkulační engine
- [x] BrewingSystemInput interface + DEFAULT_BREWING_SYSTEM
- [x] calculateVolumePipeline() — objemová pipeline se ztrátami
- [x] calculateMaltRequired() — výpočet potřebného sladu z target Plata
- [x] calculateWaterRequired() — výpočet potřeby vody
- [x] calculateAll() rozšíření o brewing system parametry
- [x] RecipeCalculationResult rozšíření (pipeline, maltRequiredKg, waterRequiredL)
- [x] calculateAndSaveRecipe() — napojení na brewing_systems tabulku
- [x] Recipe detail: select varní soustavy
- [x] Recipe kalkulace: zobrazení objemové pipeline a potřeby surovin
- [x] i18n rozšíření: cs + en
```

### PRODUCT-SPEC.md

Aktualizovat sekci receptur — kalkulační engine nyní zahrnuje objemovou pipeline a propojení s varní soustavou.

---

## AKCEPTAČNÍ KRITÉRIA

### Kalkulační funkce
1. [ ] `calculateVolumePipeline()` — správný zpětný výpočet objemů
2. [ ] Pipeline: preBoilL > postBoilL > intoFermenterL > finishedBeerL (vždy klesající)
3. [ ] Pipeline: `losses.totalL = preBoilL - finishedBeerL`
4. [ ] `calculateMaltRequired()` — vrací kg sladu pro daný target Plato
5. [ ] `calculateMaltRequired()` — nulový Plato → 0 kg
6. [ ] `calculateWaterRequired()` — vrací litry vody = maltKg × waterPerKg + reserve
7. [ ] `calculateOG()` — používá efektivitu z brewing system (ne hardcoded 75%)

### Integrace calculateAll()
8. [ ] `calculateAll()` přijímá volitelný `BrewingSystemInput`
9. [ ] `calculateAll()` bez brewing system → defaultní hodnoty (zpětná kompatibilita)
10. [ ] `calculateAll()` s brewing system → efektivita a ztráty z parametrů
11. [ ] `RecipeCalculationResult` obsahuje `pipeline`, `maltRequiredKg`, `waterRequiredL`
12. [ ] Stávající kód čtoucí `og`, `ibu`, `costPrice` funguje beze změny

### Server action
13. [ ] `calculateAndSaveRecipe()` — načte brewing system z recipe.brewing_system_id
14. [ ] Brewing system NULL → fallback na defaults
15. [ ] Brewing system vybraný → parametry z DB
16. [ ] JSONB snapshot obsahuje nová pole (pipeline, maltRequiredKg, waterRequiredL)

### UI
17. [ ] Recipe detail: select "Varní soustava" na tabu Základní údaje
18. [ ] Select zobrazuje brewing systems pro tenant s názvem a batch size
19. [ ] Změna brewing system → přepočet receptury
20. [ ] Recipe kalkulace: sekce "Objemová pipeline" s objemy a ztrátami
21. [ ] Recipe kalkulace: sekce "Potřeba surovin" s kg sladu a L vody
22. [ ] Pokud brewing system není vybraný → zobrazit poznámku "výchozí parametry"

### Obecné
23. [ ] i18n: cs + en
24. [ ] `npm run build` bez chyb
25. [ ] TypeScript: zero errors
26. [ ] Dokumentace aktualizována

---

## CO NEIMPLEMENTOVAT

- **Reverse kalkulace** (cílování IBU/EBC → kolik surovin) — vynecháno z MVP. Phase C bude mít pouze UI porovnání target vs. actual ("✅ v rozsahu" / "⚠️ mimo rozsah")
- **FG odhad z atenuace kvasnic** — zatím crude 25% OG estimate. Přesný výpočet z kvasničného profilu = post-MVP
- **Interaktivní přepočet** (změna objemu → proporcionální přepočet surovin) — Phase C scope
- **IBU z pre-boil vs post-boil objemu** — zachovat stávající chování (batch volume). Přesnější výpočet = budoucí optimalizace
- **Batch-level kalkulace** — Phase B je jen recipe-level. Batch má kopii receptu a přebírá výpočet. Batch-specific adjustments = post-MVP

---

## TECHNICKÉ POZNÁMKY

- **Zpětná kompatibilita je kritická.** Žádná existující funkce se nesmí rozbít. Nové parametry jsou optional, stávající volání fungují beze změny.
- **Pipeline výpočet je ZPĚTNÝ** — od finishedBeer (cíl) zpět k preBoil. To je pivovarský standard: "chci 100L hotového piva, kolik musím navařit?"
- **Efficiency 75% default** je zachován jako fallback. Reálné pivovary mají 65-85%.
- **Extract estimate 80%** je průměr pro plnohodnotný slad. Speciální slady mají 60-90%.
- **Water per kg malt 4 L/kg** je standardní poměr pro infuzní rmutování. Dekokční může být 3-3.5.
- **calculateAll() podpis:** Nový parametr je poslední, optional. Existující volání `calculateAll(ingredients, volumeL, fg, overhead)` funguje beze změny (brewingSystem = undefined → defaults).
- **JSONB snapshot:** Nová pole se prostě přidají do JSONB. Starší snapshoty bez pipeline/maltRequiredKg jsou validní — UI musí handlovat `pipeline === undefined`.
