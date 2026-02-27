/**
 * Brewing calculation utilities — pure functions, no server dependency.
 *
 * Formulas used:
 * - OG (Plato): from malt extract contribution, assumes brewhouse efficiency
 * - IBU (Tinseth): hop utilization based on boil time and wort gravity
 * - EBC (Morey): color estimate from malt color contributions
 * - ABV (Balling): alcohol by volume from OG and FG in Plato
 * - Cost: sum of ingredient costs based on amount and unit price
 */

import type { RecipeCalculationResult, BrewingSystemInput, VolumePipeline } from "./types";
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

// ── OG (Plato) ──────────────────────────────────────────────

/**
 * Calculate Original Gravity in degrees Plato.
 *
 * OG (°P) = total_extract_kg / (volume_L * wort_density_approx) * 100
 * Simplified: total_extract = sum(weight_kg * extractPercent/100 * efficiency)
 * Plato = total_extract / (total_extract + volume_L) * 100
 *
 * @param ingredients - list of ingredients with category, amountG, extractPercent
 * @param volumeL - final batch volume in liters
 * @param efficiency - brewhouse efficiency (default 0.75 = 75%)
 * @returns OG in degrees Plato
 */
export function calculateOG(
  ingredients: IngredientInput[],
  volumeL: number,
  efficiency: number = 0.75
): number {
  if (volumeL <= 0) return 0;

  const malts = ingredients.filter(
    (i) => i.category === "malt" || i.category === "adjunct"
  );

  // Total extract mass in kg
  const totalExtractKg = malts.reduce((sum, malt) => {
    const weightKg = toKg(malt);
    const extractFraction = (malt.extractPercent ?? 80) / 100;
    return sum + weightKg * extractFraction * efficiency;
  }, 0);

  // Plato = extract_mass / (extract_mass + water_mass) * 100
  // Approximate water mass as volumeL (1 kg/L for water)
  if (totalExtractKg + volumeL <= 0) return 0;
  const plato = (totalExtractKg / (totalExtractKg + volumeL)) * 100;

  return Math.round(plato * 10) / 10;
}

// ── IBU (Tinseth) ───────────────────────────────────────────

/**
 * Tinseth utilization factor.
 * U = bigness_factor * boil_time_factor
 * bigness_factor = 1.65 * 0.000125^(SG - 1)
 * boil_time_factor = (1 - e^(-0.04 * time)) / 4.15
 *
 * SG is approximated from Plato: SG = 1 + (plato / (258.6 - 227.1 * plato / 258.2))
 */
function platoToSG(plato: number): number {
  if (plato <= 0) return 1.0;
  return 1 + plato / (258.6 - 227.1 * (plato / 258.2));
}

function tinsethUtilization(boilTimeMin: number, sgWort: number): number {
  const bignessFactor = 1.65 * Math.pow(0.000125, sgWort - 1);
  const boilTimeFactor = (1 - Math.exp(-0.04 * boilTimeMin)) / 4.15;
  return bignessFactor * boilTimeFactor;
}

/**
 * Calculate IBU using Tinseth formula.
 * IBU = sum( (W_g * U * A * 1000) / V )
 * where W_g = hop weight in grams (we convert to kg in formula),
 * U = utilization, A = alpha acid (decimal), V = volume (L)
 *
 * @param ingredients - list with hop alpha and useTimeMin
 * @param volumeL - batch volume in liters
 * @param ogPlato - OG in Plato (for utilization calc)
 * @returns IBU value
 */
export function calculateIBU(
  ingredients: IngredientInput[],
  volumeL: number,
  ogPlato: number
): number {
  if (volumeL <= 0) return 0;

  const sg = platoToSG(ogPlato);
  const hops = ingredients.filter((i) => i.category === "hop");

  const totalIBU = hops.reduce((sum, hop) => {
    const alphaDecimal = (hop.alpha ?? 0) / 100;
    const boilTime = hop.useTimeMin ?? 0;

    // Skip dry hops and whirlpool additions with 0 time (no isomerization)
    if (boilTime <= 0) return sum;

    const utilization = tinsethUtilization(boilTime, sg);
    const weightKg = toKg(hop);

    // Tinseth: IBU = (W_kg * U * alpha * 1000) / V
    const ibu = (weightKg * utilization * alphaDecimal * 1000000) / volumeL;
    return sum + ibu;
  }, 0);

  return Math.round(totalIBU * 10) / 10;
}

// ── EBC (Morey) ─────────────────────────────────────────────

/**
 * Calculate beer color in EBC using Morey formula.
 * MCU = sum(weight_kg * Lovibond) / volume_L
 * Lovibond ~= EBC / 1.97
 * SRM = 1.4922 * MCU^0.6859
 * EBC = SRM * 1.97
 *
 * @param ingredients - list with malt ebc values
 * @param volumeL - batch volume in liters
 * @returns EBC value
 */
export function calculateEBC(
  ingredients: IngredientInput[],
  volumeL: number
): number {
  if (volumeL <= 0) return 0;

  const malts = ingredients.filter(
    (i) => i.category === "malt" || i.category === "adjunct"
  );

  // MCU uses Lovibond, and volume in gallons for the original Morey
  // We convert: Lovibond = EBC / 1.97, gallons = liters / 3.78541
  const volumeGal = volumeL / 3.78541;
  if (volumeGal <= 0) return 0;

  const mcu = malts.reduce((sum, malt) => {
    const weightLbs = toKg(malt) * 2.20462; // kg to lbs
    const lovibond = (malt.ebc ?? 0) / 1.97;
    return sum + (weightLbs * lovibond) / volumeGal;
  }, 0);

  if (mcu <= 0) return 0;

  const srm = 1.4922 * Math.pow(mcu, 0.6859);
  const ebc = srm * 1.97;

  return Math.round(ebc * 10) / 10;
}

// ── ABV (Balling) ───────────────────────────────────────────

/**
 * Calculate ABV using the Balling formula.
 * ABV = (OG_plato - FG_plato) / (2.0665 - 0.010665 * OG_plato)
 *
 * @param ogPlato - Original gravity in Plato
 * @param fgPlato - Final gravity in Plato
 * @returns ABV percentage
 */
export function calculateABV(ogPlato: number, fgPlato: number): number {
  const denominator = 2.0665 - 0.010665 * ogPlato;
  if (denominator <= 0) return 0;

  const abv = (ogPlato - fgPlato) / denominator;
  return Math.round(Math.max(0, abv) * 100) / 100;
}

// ── Cost ────────────────────────────────────────────────────

/**
 * Calculate total and per-item cost.
 * Quantities and prices are taken 1:1 in stock units.
 * Only hops need conversion (recipe unit g → stock unit kg).
 *
 * @param ingredients - list with amountG and costPrice (per stock unit)
 * @returns total cost and breakdown per item
 */
export function calculateCost(
  ingredients: IngredientInput[]
): { total: number; perItem: { itemId: string; recipeItemId?: string; name: string; amount: number; cost: number; costPerUnit: number; unitSymbol?: string }[] } {
  const perItem = ingredients.map((ing) => {
    const rawCostPrice = ing.costPrice ?? 0;

    // Hops: recipe unit (g) ≠ stock unit (kg) — convert amount to stock unit
    // Everything else: 1:1 (recipe unit = stock unit), no conversion
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
      cost: Math.round(cost * 100) / 100,
      costPerUnit: Math.round(rawCostPrice * 100) / 100,
      unitSymbol: ing.stockUnitSymbol ?? undefined,
    };
  });

  const total = perItem.reduce((sum, item) => sum + item.cost, 0);

  return {
    total: Math.round(total * 100) / 100,
    perItem,
  };
}

// ── Volume pipeline ─────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Calculate volumes through the entire brewing process (reverse calculation).
 * Starting from finished beer volume, working backwards to pre-boil.
 */
export function calculateVolumePipeline(
  targetVolumeL: number,
  system: BrewingSystemInput
): VolumePipeline {
  const finishedBeerL = targetVolumeL;

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

// ── Malt & water requirements ───────────────────────────────

/**
 * Calculate total malt required in kg.
 * extract_needed = (plato/100) × pre_boil_volume × wort_density
 * malt_kg = extract_needed / (extract_estimate/100) / (efficiency/100)
 */
export function calculateMaltRequired(
  targetPlato: number,
  preBoilVolumeL: number,
  system: BrewingSystemInput
): number {
  if (targetPlato <= 0 || preBoilVolumeL <= 0) return 0;

  const wortDensity = 1 + targetPlato / 258;
  const extractNeededKg = (targetPlato / 100) * preBoilVolumeL * wortDensity;

  const extractFraction = (system.extractEstimate || 80) / 100;
  const efficiencyFraction = (system.efficiencyPct || 75) / 100;

  if (extractFraction <= 0 || efficiencyFraction <= 0) return 0;

  const maltKg = extractNeededKg / extractFraction / efficiencyFraction;
  return Math.round(maltKg * 100) / 100;
}

/**
 * Calculate total water required in liters.
 * water_L = malt_kg × water_per_kg_malt + water_reserve_L
 */
export function calculateWaterRequired(
  maltKg: number,
  system: BrewingSystemInput
): number {
  if (maltKg <= 0) return 0;

  const waterL = maltKg * (system.waterPerKgMalt || 4) + (system.waterReserveL || 0);
  return Math.round(waterL * 10) / 10;
}

// ── Combined calculation ────────────────────────────────────

/**
 * Run all calculations at once and return a RecipeCalculationResult.
 *
 * @param ingredients - all recipe ingredients with parsed numeric values
 * @param volumeL - batch volume in liters
 * @param fgPlato - Final gravity in Plato (optional, defaults to 25% of OG for estimate)
 * @param overhead - optional overhead inputs (pct, fixed costs)
 * @param brewingSystem - optional brewing system parameters (null = use defaults)
 * @returns RecipeCalculationResult with all calculated values
 */
export function calculateAll(
  ingredients: IngredientInput[],
  volumeL: number,
  fgPlato?: number,
  overhead?: OverheadInputs,
  brewingSystem?: BrewingSystemInput | null
): RecipeCalculationResult {
  const system = brewingSystem ?? DEFAULT_BREWING_SYSTEM;

  // Volume pipeline
  const pipeline = calculateVolumePipeline(volumeL, system);

  // OG — use efficiency from brewing system
  const og = calculateOG(ingredients, volumeL, system.efficiencyPct / 100);

  // Default FG estimate: ~25% of OG (typical apparent attenuation ~75%)
  const fg = fgPlato ?? Math.round(og * 0.25 * 10) / 10;

  const abv = calculateABV(og, fg);
  const ibu = calculateIBU(ingredients, volumeL, og);
  const ebc = calculateEBC(ingredients, volumeL);
  const { total: ingredientsCost, perItem } = calculateCost(ingredients);

  // Overhead computation
  const oh = overhead ?? { overheadPct: 0, overheadCzk: 0, brewCostCzk: 0 };
  const ingredientOverheadCost =
    Math.round(ingredientsCost * oh.overheadPct) / 100;
  const totalProductionCost =
    Math.round(
      (ingredientsCost + ingredientOverheadCost + oh.brewCostCzk + oh.overheadCzk) * 100
    ) / 100;
  const costPerLiter =
    volumeL > 0
      ? Math.round((totalProductionCost / volumeL) * 100) / 100
      : 0;

  // Malt & water requirements
  const maltRequiredKg = calculateMaltRequired(og, pipeline.preBoilL, system);
  const waterRequiredL = calculateWaterRequired(maltRequiredKg, system);

  return {
    og,
    fg,
    abv,
    ibu,
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
    waterRequiredL,
    brewingSystemUsed: brewingSystem != null,
  };
}
