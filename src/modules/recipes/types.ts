/**
 * Recipes module — type definitions.
 * Matches the DB schema in drizzle/schema/recipes.ts and drizzle/schema/beer-styles.ts.
 * Drizzle decimal columns return strings — og, fg, abv, ibu, ebc, batchSizeL etc. are string | null.
 */

export type RecipeStatus = "draft" | "active" | "archived";

export type IngredientCategory = "malt" | "hop" | "yeast" | "adjunct" | "other";

export type UseStage = "mash" | "boil" | "whirlpool" | "fermentation" | "dry_hop";

export type StepType = "mash_in" | "rest" | "decoction" | "mash_out" | "boil" | "whirlpool" | "cooling";

export interface Recipe {
  id: string;
  tenantId: string;
  code: string | null;
  name: string;
  beerStyleId: string | null;
  status: string;
  batchSizeL: string | null;
  batchSizeBrutoL: string | null;
  beerVolumeL: string | null;
  og: string | null;
  fg: string | null;
  abv: string | null;
  ibu: string | null;
  ebc: string | null;
  targetIbu: string | null;
  targetEbc: string | null;
  boilTimeMin: number | null;
  costPrice: string | null;
  durationFermentationDays: number | null;
  durationConditioningDays: number | null;
  shelfLifeDays: number | null;
  notes: string | null;
  itemId: string | null;
  brewingSystemId: string | null;
  constantsOverride: RecipeConstantsOverride | null;
  isFromLibrary: boolean;
  sourceRecipeId: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Joined:
  beerStyleName?: string | null;
}

export interface RecipeItem {
  id: string;
  tenantId: string;
  recipeId: string;
  itemId: string;
  category: string;
  amountG: string;
  unitId: string | null;
  useStage: string | null;
  useTimeMin: number | null;
  hopPhase: string | null;
  notes: string | null;
  sortOrder: number;
  // Joined from items table:
  itemName?: string;
  itemCode?: string;
  itemBrand?: string | null;
  itemAlpha?: string | null;
  itemEbc?: string | null;
  itemExtractPercent?: string | null;
  itemCostPrice?: string | null;
  // Joined from units table:
  unitSymbol?: string | null;
  unitCode?: string | null;
  unitToBaseFactor?: number | null;
}

export interface RecipeStep {
  id: string;
  tenantId: string;
  recipeId: string;
  mashProfileId: string | null;
  stepType: string;
  name: string;
  temperatureC: string | null;
  timeMin: number | null;
  rampTimeMin: number | null;
  tempGradient: string | null;
  notes: string | null;
  sortOrder: number;
}

/**
 * Parametry varní soustavy pro výpočty.
 * Načtené z brewing_systems tabulky nebo NULL (= default hardcoded hodnoty).
 */
export interface BrewingSystemInput {
  batchSizeL: number;
  efficiencyPct: number;
  kettleVolumeL: number;
  kettleLossPct: number;
  whirlpoolLossPct: number;
  fermenterVolumeL: number;
  fermentationLossPct: number;
  extractEstimate: number;
  waterPerKgMalt: number;
  waterReserveL: number;
}

export interface RecipeConstantsOverride {
  efficiencyPct?: number;
  kettleLossPct?: number;
  whirlpoolLossPct?: number;
  fermentationLossPct?: number;
  extractEstimate?: number;
  waterPerKgMalt?: number;
  waterReserveL?: number;
  boilTimeMin?: number;
}

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

export interface VolumePipeline {
  preBoilL: number;
  postBoilL: number;
  intoFermenterL: number;
  finishedBeerL: number;
  losses: {
    kettleL: number;
    whirlpoolL: number;
    fermentationL: number;
    totalL: number;
  };
}

export interface RecipeCalculationResult {
  og: number;
  fg: number;
  abv: number;
  ibu: number;
  ebc: number;
  // Cost breakdown
  ingredientsCost: number;
  ingredientOverheadPct: number;
  ingredientOverheadCost: number;
  brewCost: number;
  overheadCost: number;
  totalProductionCost: number;
  costPerLiter: number;
  pricingMode: string;
  ingredients: {
    itemId: string;
    recipeItemId?: string;
    name: string;
    amount: number;
    cost: number;
    costPerUnit: number;
    unitSymbol?: string;
    priceSource: string;
  }[];
  /** @deprecated Alias for totalProductionCost (backward compat). */
  costPrice: number;
  // Volume pipeline (Phase B)
  pipeline?: VolumePipeline;
  maltRequiredKg?: number;
  waterRequiredL?: number;
  brewingSystemUsed?: boolean;
}

export interface BeerStyle {
  id: string;
  styleGroupId: string;
  bjcpNumber: string | null;
  bjcpCategory: string | null;
  name: string;
  abvMin: string | null;
  abvMax: string | null;
  ibuMin: string | null;
  ibuMax: string | null;
  ebcMin: string | null;
  ebcMax: string | null;
  ogMin: string | null;
  ogMax: string | null;
  fgMin: string | null;
  fgMax: string | null;
  srmMin: string | null;
  srmMax: string | null;
  appearance: string | null;
  aroma: string | null;
  flavor: string | null;
  comments: string | null;
  impression: string | null;
  mouthfeel: string | null;
  history: string | null;
  ingredients: string | null;
  styleComparison: string | null;
  commercialExamples: string | null;
  origin: string | null;
  styleFamily: string | null;
  groupName?: string;
  groupNameCz?: string;
  groupImageUrl?: string | null;
}

export interface BeerStyleGroup {
  id: string;
  name: string;
  nameCz: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface MashingProfile {
  id: string;
  tenantId: string | null;
  name: string;
  steps: unknown[];
  notes: string | null;
}

export interface RecipeDetailData {
  recipe: Recipe;
  items: RecipeItem[];
  steps: RecipeStep[];
}
