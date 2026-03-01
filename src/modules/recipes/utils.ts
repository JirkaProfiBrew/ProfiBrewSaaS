/**
 * Brewing calculation utilities — pure functions, no server dependency.
 *
 * Formulas used:
 * - OG (Plato): from malt extract through pre-boil, concentrated by boil
 * - IBU (Tinseth): hop utilization based on boil time and wort gravity, on post-boil volume
 * - EBC (Morey): color estimate from malt color contributions, on batch size
 * - ABV (Balling): alcohol by volume from OG and FG in Plato
 * - Cost: sum of ingredient costs based on amount and unit price
 */

import type { RecipeCalculationResult, BrewingSystemInput, VolumePipeline, WaterCalculation, IBUBreakdown } from "./types";
import { DEFAULT_BREWING_SYSTEM } from "./types";

// ── Input interface ─────────────────────────────────────────

export interface IngredientInput {
  category: string;
  amountG: number;                 // amount in the recipe unit (legacy name, now unit-agnostic)
  unitToBaseFactor?: number | null; // factor to convert recipe unit → base unit (kg); null = already base unit; 0.001 = g→kg
  stockUnitToBaseFactor?: number | null; // factor to convert stock unit → base unit (kg); 1 = stock unit IS base unit; null = no stock unit
  stockUnitSymbol?: string | null; // stock unit symbol (e.g. "kg" for hops, "g" for yeast); null = use recipe unit
  alpha?: number | null;           // hop alpha acid %
  ebc?: number | null;             // malt color EBC
  extractPercent?: number | null;  // malt extract %
  costPrice?: number | null;       // cost per stock unit (NOT per kg — e.g. yeast: 4 CZK/g)
  useTimeMin?: number | null;      // boil time (for hops)
  useStage?: string;               // boil | fwh | whirlpool | mash | dry_hop_cold | dry_hop_warm
  temperatureC?: number;           // temperature in °C (for whirlpool, dry_hop_warm)
  itemId: string;
  recipeItemId?: string;           // unique recipe_items.id — for matching snapshot ↔ UI
  name: string;
}

export interface OverheadInputs {
  overheadPct: number;
  overheadCzk: number;
  brewCostCzk: number;
}

/**
 * Convert ingredient amount to kg using the unit's toBaseFactor.
 * - factor present (e.g. 0.001 for grams): amountG * factor → kg
 * - factor null: unit IS the base unit (kg), amount already in kg
 */
function toKg(ingredient: IngredientInput): number {
  const factor = ingredient.unitToBaseFactor;
  if (factor != null && factor !== 0) {
    return ingredient.amountG * factor;
  }
  // null/0 = already in base unit (kg for weight)
  return ingredient.amountG;
}

// ── Helpers ─────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function platoToSG(plato: number): number {
  if (plato <= 0) return 1.0;
  return 1 + plato / (258.6 - 227.1 * (plato / 258.2));
}

// ── Volume pipeline ─────────────────────────────────────────

/**
 * Calculate volumes through the entire brewing process.
 * Anchor point: batchSizeL = volume INTO FERMENTER.
 *
 * Backward (how much to brew):
 *   post-boil = batchSize / (1 - whirlpool%)
 *   pre-boil = (post-boil + kettleTrub) / (1 - evapRate * boilHours)
 *
 * Forward (how much remains):
 *   finishedBeer = batchSize * (1 - fermentation%)
 */
export function calculateVolumePipeline(
  batchSizeL: number,
  boilTimeMin: number,
  system: BrewingSystemInput
): VolumePipeline {
  // Backward from batch_size (into fermenter)
  const whirlpoolFactor = 1 - system.whirlpoolLossPct / 100;
  const postBoilL = whirlpoolFactor > 0
    ? batchSizeL / whirlpoolFactor
    : batchSizeL;

  const boilHours = boilTimeMin / 60;
  const evapFactor = 1 - (system.evaporationRatePctPerHour / 100) * boilHours;
  const preBoilL = evapFactor > 0
    ? (postBoilL + system.kettleTrubLossL) / evapFactor
    : postBoilL + system.kettleTrubLossL;

  const evaporationL = preBoilL * (system.evaporationRatePctPerHour / 100) * boilHours;

  // Forward from batch_size
  const finishedBeerL = batchSizeL * (1 - system.fermentationLossPct / 100);

  return {
    preBoilL: round1(preBoilL),
    postBoilL: round1(postBoilL),
    intoFermenterL: round1(batchSizeL),
    finishedBeerL: round1(finishedBeerL),
    losses: {
      evaporationL: round1(evaporationL),
      kettleTrubL: round1(system.kettleTrubLossL),
      whirlpoolL: round1(postBoilL - batchSizeL),
      fermentationL: round1(batchSizeL - finishedBeerL),
      totalL: round1(preBoilL - finishedBeerL),
    },
  };
}

// ── OG (Plato) ──────────────────────────────────────────────

/**
 * Calculate Original Gravity in degrees Plato.
 * Two-step: extract in pre-boil → concentrate by boil.
 *
 * 1. totalExtractKg = Σ(malt_kg × extractPercent × efficiency)
 * 2. OG = totalExtractKg / (totalExtractKg + postBoilL) × 100
 *
 * The extract is dissolved in pre-boil volume but water evaporates during boil,
 * concentrating the wort. OG is measured post-boil (= into fermenter gravity).
 */
export function calculateOG(
  ingredients: IngredientInput[],
  preBoilL: number,
  postBoilL: number,
  efficiencyPct: number
): number {
  if (preBoilL <= 0 || postBoilL <= 0) return 0;

  const efficiency = efficiencyPct / 100;
  const malts = ingredients.filter(
    (i) => i.category === "malt" || i.category === "adjunct"
  );

  const totalExtractKg = malts.reduce((sum, malt) => {
    const weightKg = toKg(malt);
    const extractFraction = (malt.extractPercent ?? 80) / 100;
    return sum + weightKg * extractFraction * efficiency;
  }, 0);

  if (totalExtractKg <= 0) return 0;

  // Post-boil gravity: extract dissolved in post-boil water mass
  const postBoilWaterKg = postBoilL; // ≈ density of wort close to water
  const ogPlato = totalExtractKg / (totalExtractKg + postBoilWaterKg) * 100;

  return round1(ogPlato);
}

// ── IBU (Tinseth) ───────────────────────────────────────────

/**
 * Tinseth utilization factor.
 * U = bigness_factor * boil_time_factor
 * bigness_factor = 1.65 * 0.000125^(SG - 1)
 * boil_time_factor = (1 - e^(-0.04 * time)) / 4.15
 */
function tinsethUtilization(boilTimeMin: number, sgWort: number): number {
  const bignessFactor = 1.65 * Math.pow(0.000125, sgWort - 1);
  const boilTimeFactor = (1 - Math.exp(-0.04 * boilTimeMin)) / 4.15;
  return bignessFactor * boilTimeFactor;
}

/**
 * Temperature factor for IBU utilization.
 * Linear interpolation: 100°C = 1.0, 80°C = 0.0.
 * Below 80°C = 0 (no isomerization).
 */
function temperatureFactor(tempC: number): number {
  if (tempC >= 100) return 1.0;
  if (tempC <= 80) return 0.0;
  return (tempC - 80) / 20;
}

interface HopInput {
  weightKg: number;
  alphaDecimal: number;
  useStage: string;
  useTimeMin: number;
  temperatureC?: number;
}

interface IBUContext {
  postBoilL: number;
  ogPlato: number;
  boilTimeMin: number;
  whirlpoolTempC: number;
}

function calculateHopIBU(hop: HopInput, ctx: IBUContext): number {
  if (hop.alphaDecimal <= 0 || hop.weightKg <= 0 || ctx.postBoilL <= 0) return 0;

  const sg = platoToSG(ctx.ogPlato);
  let ibu = 0;

  switch (hop.useStage) {
    case "boil": {
      if (hop.useTimeMin <= 0) return 0;
      const util = tinsethUtilization(hop.useTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL;
      break;
    }
    case "fwh": {
      const util = tinsethUtilization(ctx.boilTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL * 1.1;
      break;
    }
    case "whirlpool": {
      if (hop.useTimeMin <= 0) return 0;
      const tempC = hop.temperatureC ?? ctx.whirlpoolTempC;
      const tempFact = temperatureFactor(tempC);
      if (tempFact <= 0) return 0;
      const util = tinsethUtilization(hop.useTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL * tempFact;
      break;
    }
    case "mash": {
      if (hop.useTimeMin <= 0) return 0;
      const util = tinsethUtilization(hop.useTimeMin, sg);
      ibu = (hop.weightKg * util * hop.alphaDecimal * 1_000_000) / ctx.postBoilL * 0.3;
      break;
    }
    case "dry_hop_cold": {
      ibu = 0;
      break;
    }
    case "dry_hop_warm": {
      const tempC = hop.temperatureC ?? 20;
      if (tempC < 20) {
        ibu = 0;
      } else {
        const lowUtil = 0.02 * (tempC - 20) / 10;
        ibu = (hop.weightKg * lowUtil * hop.alphaDecimal * 1_000_000) / ctx.postBoilL;
      }
      break;
    }
    default:
      ibu = 0;
  }

  return round1(ibu);
}

export function calculateIBUBreakdown(
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
    dryHopCold: 0, dryHopWarm: 0, total: 0,
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

  breakdown.total = round1(breakdown.boil + breakdown.fwh + breakdown.whirlpool +
                    breakdown.mash + breakdown.dryHopCold + breakdown.dryHopWarm);

  // Round individual values
  breakdown.boil = round1(breakdown.boil);
  breakdown.fwh = round1(breakdown.fwh);
  breakdown.whirlpool = round1(breakdown.whirlpool);
  breakdown.mash = round1(breakdown.mash);
  breakdown.dryHopCold = round1(breakdown.dryHopCold);
  breakdown.dryHopWarm = round1(breakdown.dryHopWarm);

  return breakdown;
}

/**
 * Calculate IBU using Tinseth formula on POST-BOIL volume.
 * IBU = Σ(W_kg × U × alpha × 1,000,000) / V_postBoil
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

  return round1(totalIBU);
}

// ── EBC (Morey) ─────────────────────────────────────────────

/**
 * Calculate beer color in EBC using Morey formula on BATCH SIZE (into fermenter).
 * MCU = Σ(weight_lbs × Lovibond) / volume_gal
 * SRM = 1.4922 × MCU^0.6859
 * EBC = SRM × 1.97
 */
export function calculateEBC(
  ingredients: IngredientInput[],
  batchSizeL: number
): number {
  if (batchSizeL <= 0) return 0;

  const malts = ingredients.filter(
    (i) => i.category === "malt" || i.category === "adjunct"
  );

  const volumeGal = batchSizeL / 3.78541;
  if (volumeGal <= 0) return 0;

  const mcu = malts.reduce((sum, malt) => {
    const weightLbs = toKg(malt) * 2.20462;
    const lovibond = (malt.ebc ?? 0) / 1.97;
    return sum + (weightLbs * lovibond) / volumeGal;
  }, 0);

  if (mcu <= 0) return 0;

  const srm = 1.4922 * Math.pow(mcu, 0.6859);
  const ebc = srm * 1.97;

  return round1(ebc);
}

// ── ABV (Balling) ───────────────────────────────────────────

/**
 * Calculate ABV using the Balling formula.
 * ABV = (OG_plato - FG_plato) / (2.0665 - 0.010665 * OG_plato)
 */
export function calculateABV(ogPlato: number, fgPlato: number): number {
  const denominator = 2.0665 - 0.010665 * ogPlato;
  if (denominator <= 0) return 0;

  const abv = (ogPlato - fgPlato) / denominator;
  return round2(Math.max(0, abv));
}

// ── Cost ────────────────────────────────────────────────────

/**
 * Calculate total and per-item cost.
 * Quantities and prices are taken 1:1 in stock units.
 * Only hops need conversion (recipe unit g → stock unit kg).
 */
export function calculateCost(
  ingredients: IngredientInput[]
): { total: number; perItem: { itemId: string; recipeItemId?: string; name: string; amount: number; cost: number; costPerUnit: number; unitSymbol?: string }[] } {
  const perItem = ingredients.map((ing) => {
    const rawCostPrice = ing.costPrice ?? 0;

    let stockAmount: number;
    if (ing.category === "hop" && ing.stockUnitToBaseFactor != null) {
      const recipeUnitFactor = ing.unitToBaseFactor ?? 1;
      const stockUnitFactor = ing.stockUnitToBaseFactor;
      stockAmount = stockUnitFactor !== 0
        ? ing.amountG * recipeUnitFactor / stockUnitFactor
        : ing.amountG;
    } else {
      stockAmount = ing.amountG;
    }

    const cost = stockAmount * rawCostPrice;
    return {
      itemId: ing.itemId,
      recipeItemId: ing.recipeItemId,
      name: ing.name,
      amount: stockAmount,
      cost: round2(cost),
      costPerUnit: round2(rawCostPrice),
      unitSymbol: ing.stockUnitSymbol ?? undefined,
    };
  });

  const total = perItem.reduce((sum, item) => sum + item.cost, 0);

  return {
    total: round2(total),
    perItem,
  };
}

// ── Malt requirements ───────────────────────────────────────

/**
 * Calculate total malt required in kg (from target OG).
 * Reverse of OG formula:
 *   OG/100 = extractKg / (extractKg + postBoilL)
 *   extractKg = (OG/100 × postBoilL) / (1 - OG/100)
 *   maltKg = extractKg / (extractPct/100) / (efficiency/100)
 */
export function calculateMaltRequired(
  targetOgPlato: number,
  postBoilL: number,
  efficiencyPct: number,
  extractEstimatePct: number
): number {
  if (targetOgPlato <= 0 || postBoilL <= 0) return 0;

  const ogFraction = targetOgPlato / 100;
  if (ogFraction >= 1) return 0;

  const extractNeededKg = (ogFraction * postBoilL) / (1 - ogFraction);
  const extractFraction = (extractEstimatePct || 80) / 100;
  const efficiency = (efficiencyPct || 75) / 100;

  if (extractFraction <= 0 || efficiency <= 0) return 0;

  const maltKg = extractNeededKg / extractFraction / efficiency;
  return round2(maltKg);
}

// ── Water calculation ───────────────────────────────────────

/**
 * Calculate water requirements with mash/sparge split.
 *
 * Mash water = maltKg × waterPerKgMalt
 * Grain absorption = maltKg × grainAbsorptionLPerKg
 * Volume after mash = mashWater - grainAbsorption
 * Sparge water = preBoilL - volumeAfterMash (fill kettle to pre-boil level)
 * Total = mashWater + spargeWater
 */
export function calculateWater(
  maltKg: number,
  preBoilL: number,
  waterPerKgMalt: number,
  grainAbsorptionLPerKg: number
): WaterCalculation {
  if (maltKg <= 0 || preBoilL <= 0) {
    return { mashWaterL: 0, spargeWaterL: 0, totalWaterL: 0, grainAbsorptionL: 0 };
  }

  const mashWaterL = maltKg * waterPerKgMalt;
  const grainAbsorptionL = maltKg * grainAbsorptionLPerKg;
  const volumeAfterMashL = mashWaterL - grainAbsorptionL;
  const spargeWaterL = Math.max(0, preBoilL - volumeAfterMashL);
  const totalWaterL = mashWaterL + spargeWaterL;

  return {
    mashWaterL: round1(mashWaterL),
    spargeWaterL: round1(spargeWaterL),
    totalWaterL: round1(totalWaterL),
    grainAbsorptionL: round1(grainAbsorptionL),
  };
}

// ── Combined calculation ────────────────────────────────────

/**
 * Run all calculations at once and return a RecipeCalculationResult.
 *
 * @param ingredients - all recipe ingredients with parsed numeric values
 * @param batchSizeL - batch volume in liters (= into fermenter, anchor point)
 * @param boilTimeMin - boil time in minutes (from recipe or constants)
 * @param fgPlato - Final gravity in Plato (optional, defaults to 25% of OG for estimate)
 * @param overhead - optional overhead inputs (pct, fixed costs)
 * @param brewingSystem - optional brewing system parameters (null = use defaults)
 * @param targetOgPlato - target OG from design slider (for malt plan calculation)
 * @returns RecipeCalculationResult with all calculated values
 */
export function calculateAll(
  ingredients: IngredientInput[],
  batchSizeL: number,
  boilTimeMin: number,
  fgPlato?: number,
  overhead?: OverheadInputs,
  brewingSystem?: BrewingSystemInput | null,
  targetOgPlato?: number
): RecipeCalculationResult {
  const system = brewingSystem ?? DEFAULT_BREWING_SYSTEM;

  // 1. Pipeline — uses boilTimeMin for evaporation
  const pipeline = calculateVolumePipeline(batchSizeL, boilTimeMin, system);

  // 2. OG — extract through pre-boil, concentrated by boil
  const og = calculateOG(ingredients, pipeline.preBoilL, pipeline.postBoilL, system.efficiencyPct);

  // 3. FG — from design target, or estimate 25% of OG
  const fg = fgPlato ?? round1(og * 0.25);

  // 4. ABV
  const abv = calculateABV(og, fg);

  // 5. IBU — Tinseth on post-boil volume
  const ibu = calculateIBU(ingredients, pipeline.postBoilL, og, boilTimeMin, system.whirlpoolTemperatureC);
  const ibuBreakdown = calculateIBUBreakdown(ingredients, pipeline.postBoilL, og, boilTimeMin, system.whirlpoolTemperatureC);

  // 6. EBC — Morey on batch size (into fermenter)
  const ebc = calculateEBC(ingredients, batchSizeL);

  // 7. Cost
  const { total: ingredientsCost, perItem } = calculateCost(ingredients);

  // 8. Overhead
  const oh = overhead ?? { overheadPct: 0, overheadCzk: 0, brewCostCzk: 0 };
  const ingredientOverheadCost = round2(ingredientsCost * oh.overheadPct / 100);
  const totalProductionCost = round2(
    ingredientsCost + ingredientOverheadCost + oh.brewCostCzk + oh.overheadCzk
  );
  const costPerLiter = batchSizeL > 0
    ? round2(totalProductionCost / batchSizeL)
    : 0;

  // 9. Malt — plan from target OG (design), actual from ingredients
  const ogForPlan = targetOgPlato ?? og;
  const maltRequiredKg = calculateMaltRequired(
    ogForPlan,
    pipeline.postBoilL,
    system.efficiencyPct,
    system.extractEstimate
  );

  const maltActualKg = round2(
    ingredients
      .filter((i) => i.category === "malt" || i.category === "adjunct")
      .reduce((sum, m) => sum + toKg(m), 0)
  );

  // 10. Water — based on malt plan, split into mash + sparge
  const water = calculateWater(
    maltRequiredKg > 0 ? maltRequiredKg : maltActualKg,
    pipeline.preBoilL,
    system.waterPerKgMalt,
    system.grainAbsorptionLPerKg
  );

  return {
    og,
    fg,
    abv,
    ibu,
    ibuBreakdown,
    ebc,
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
    pipeline,
    maltRequiredKg,
    maltActualKg,
    water,
    brewingSystemUsed: brewingSystem != null,
  };
}
