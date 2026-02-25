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

import type { RecipeCalculationResult } from "./types";

// ── Input interface ─────────────────────────────────────────

export interface IngredientInput {
  category: string;
  amountG: number;                 // amount in the recipe unit (legacy name, now unit-agnostic)
  unitToBaseFactor?: number | null; // factor to convert recipe unit → base unit (kg); null = already base unit; 0.001 = g→kg
  stockUnitToBaseFactor?: number | null; // factor to convert stock unit → base unit (kg); null = stock unit IS base unit
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
 * Cost = sum(amount_g / 1000 * cost_per_kg)
 *
 * @param ingredients - list with amountG and costPrice (per kg)
 * @returns total cost and breakdown per item
 */
export function calculateCost(
  ingredients: IngredientInput[]
): { total: number; perItem: { itemId: string; recipeItemId?: string; name: string; amount: number; cost: number; costPerUnit: number }[] } {
  const perItem = ingredients.map((ing) => {
    const weightBaseUnit = toKg(ing); // amount converted to base unit (kg)
    // costPrice is per STOCK unit. Convert to per base unit (kg):
    // If stock unit = g (factor 0.001), costPrice 4 CZK/g → 4 / 0.001 = 4000 CZK/kg
    // If stock unit = kg (factor null/1), costPrice 20 CZK/kg → 20 / 1 = 20 CZK/kg
    const stockFactor = ing.stockUnitToBaseFactor ?? 1;
    const rawCostPrice = ing.costPrice ?? 0;
    const costPerBaseUnit = stockFactor > 0 ? rawCostPrice / stockFactor : rawCostPrice;
    const cost = weightBaseUnit * costPerBaseUnit;
    return {
      itemId: ing.itemId,
      recipeItemId: ing.recipeItemId,
      name: ing.name,
      amount: ing.amountG,
      cost: Math.round(cost * 100) / 100,
      costPerUnit: Math.round(costPerBaseUnit * 100) / 100,
    };
  });

  const total = perItem.reduce((sum, item) => sum + item.cost, 0);

  return {
    total: Math.round(total * 100) / 100,
    perItem,
  };
}

// ── Combined calculation ────────────────────────────────────

/**
 * Run all calculations at once and return a RecipeCalculationResult.
 *
 * @param ingredients - all recipe ingredients with parsed numeric values
 * @param volumeL - batch volume in liters
 * @param fgPlato - Final gravity in Plato (optional, defaults to 25% of OG for estimate)
 * @param overhead - optional overhead inputs (pct, fixed costs)
 * @returns RecipeCalculationResult with all calculated values
 */
export function calculateAll(
  ingredients: IngredientInput[],
  volumeL: number,
  fgPlato?: number,
  overhead?: OverheadInputs
): RecipeCalculationResult {
  const og = calculateOG(ingredients, volumeL);

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
  };
}
