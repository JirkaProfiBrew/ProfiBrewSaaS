/**
 * Batches module — type definitions.
 * Matches the DB schema in drizzle/schema/batches.ts.
 * Drizzle decimal columns return strings — actualVolumeL, ogActual etc. are string | null.
 */

// BatchStatus removed — use BatchPhase as the single lifecycle field

export interface Batch {
  id: string;
  tenantId: string;
  batchNumber: string;
  batchSeq: number | null;
  recipeId: string | null;
  itemId: string | null;
  // status removed — use currentPhase
  plannedDate: Date | null;
  brewDate: Date | null;
  endBrewDate: Date | null;
  actualVolumeL: string | null;
  ogActual: string | null;
  fgActual: string | null;
  abvActual: string | null;
  packagingLossL: string | null;
  exciseRelevantHl: string | null;
  exciseReportedHl: string | null;
  exciseStatus: string | null;
  lotNumber: string | null;
  bottledDate: string | null;
  equipmentId: string | null;
  conditioningEquipmentId: string | null;
  primaryBatchId: string | null;
  isPaused: boolean;
  notes: string | null;
  brewerId: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Brew management fields
  currentPhase: string;
  phaseHistory: PhaseHistory | null;
  brewMode: string | null;
  fermentationDays: number | null;
  conditioningDays: number | null;
  fermentationStart: string | null;
  conditioningStart: string | null;
  estimatedEnd: string | null;
  // Joined fields:
  recipeName?: string | null;
  sourceRecipeId?: string | null;
  sourceRecipeName?: string | null;
  recipeOg?: string | null;
  recipeFg?: string | null;
  recipeAbv?: string | null;
  recipeIbu?: string | null;
  recipeEbc?: string | null;
  recipeBatchSizeL?: string | null;
  recipeBeerStyleName?: string | null;
  itemName?: string | null;
  itemCode?: string | null;
  equipmentName?: string | null;
  shopId?: string | null;
  shopName?: string | null;
}

export interface BatchStep {
  id: string;
  tenantId: string;
  batchId: string;
  stepType: string;
  brewPhase: string | null;
  name: string;
  temperatureC: string | null;
  timeMin: number | null;
  pauseMin: number | null;
  autoSwitch: boolean;
  equipmentId: string | null;
  startTimePlan: Date | null;
  startTimeReal: Date | null;
  endTimeReal: Date | null;
  actualDurationMin: number | null;
  stepSource: string | null;
  rampTimeMin: number | null;
  hopAdditions: HopAddition[] | null;
  notes: string | null;
  sortOrder: number;
}

export interface BatchMeasurement {
  id: string;
  tenantId: string;
  batchId: string;
  measurementType: string;
  value: string | null;
  valuePlato: string | null;
  valueSg: string | null;
  temperatureC: string | null;
  isStart: boolean;
  isEnd: boolean;
  phase: string | null;
  volumeL: string | null;
  notes: string | null;
  measuredAt: Date | null;
  createdAt: Date | null;
}

export interface BatchNote {
  id: string;
  tenantId: string;
  batchId: string;
  batchStepId: string | null;
  text: string;
  createdBy: string | null;
  createdAt: Date | null;
}

export interface BottlingItem {
  id: string;
  tenantId: string;
  batchId: string;
  itemId: string;
  quantity: number;
  baseUnits: string | null;
  bottledAt: Date | null;
  notes: string | null;
  // Joined fields:
  itemName?: string;
  itemCode?: string;
}

export interface BatchDetail {
  batch: Batch;
  steps: BatchStep[];
  measurements: BatchMeasurement[];
  notes: BatchNote[];
  bottlingItems: BottlingItem[];
}

export interface RecipeIngredient {
  id: string;
  itemName: string;
  itemCode: string | null;
  category: string;
  amountG: string;
  unitSymbol: string | null;
  useStage: string | null;
  useTimeMin: number | null;
  sortOrder: number;
}

export interface BatchIngredientLot {
  lotNumber: string | null;
  quantity: number;
  receiptLineId: string;
}

export interface BatchIngredientRow {
  recipeItemId: string;
  itemId: string;
  itemName: string;
  itemCode: string | null;
  category: string;
  originalQty: string | null; // amount from the original (source) recipe; null if no source
  recipeQty: string; // amount from the batch snapshot recipe (no scaling)
  unitSymbol: string | null;
  useStage: string | null;
  issuedQty: string; // from confirmed production issue lines
  missingQty: string; // recipeQty - issuedQty
  currentStock: string; // current warehouse stock for this item
  lots: BatchIngredientLot[]; // lot breakdown from confirmed movements
}

// ── Batch Brew Management ─────────────────────────────────

/** Phases in the brew lifecycle (new brew management flow) */
export type BatchPhase =
  | "plan"
  | "preparation"
  | "brewing"
  | "fermentation"
  | "conditioning"
  | "packaging"
  | "completed"
  | "dumped";

/** Allowed phase transitions (linear). "dumped" is reachable from any non-terminal phase via special logic. */
export const PHASE_TRANSITIONS: Record<BatchPhase, BatchPhase[]> = {
  plan: ["preparation"],
  preparation: ["brewing"],
  brewing: ["fermentation"],
  fermentation: ["conditioning"],
  conditioning: ["packaging"],
  packaging: ["completed"],
  completed: [],
  dumped: [],
};

/** Phase route slugs for URL */
export const PHASE_ROUTES: Record<BatchPhase, string> = {
  plan: "plan",
  preparation: "prep",
  brewing: "brewing",
  fermentation: "ferm",
  conditioning: "cond",
  packaging: "pack",
  completed: "done",
  dumped: "done",
};

/** Reverse map: route slug → BatchPhase */
export const ROUTE_TO_PHASE: Record<string, BatchPhase> = Object.fromEntries(
  Object.entries(PHASE_ROUTES).map(([phase, route]) => [route, phase as BatchPhase])
) as Record<string, BatchPhase>;

/** Phase timestamp metadata */
export interface PhaseTimestamp {
  started_at: string | null;
  completed_at: string | null;
}

export type PhaseHistory = Partial<Record<BatchPhase, PhaseTimestamp>>;

/** Hop addition within a brew step */
export interface HopAddition {
  itemName: string;
  amountG: number;
  addAtMin: number;
  actualTime: string | null;
  confirmed: boolean;
  /** Display unit symbol (e.g. "ks"). When set, amountG is in this unit, not grams. */
  unitSymbol?: string | null;
}

/** A lightweight step descriptor returned by previewBrewSteps() */
export interface BrewStepPreviewItem {
  sortOrder: number;
  stepType: string;
  brewPhase: string;
  name: string;
  temperatureC: string | null;
  timeMin: number;
  autoSwitch: boolean;
  startTimePlan: Date;
  hopAdditions: HopAddition[] | null;
}

/** Result of previewBrewSteps() — full brew day timeline without DB writes */
export interface BrewStepPreviewResult {
  steps: BrewStepPreviewItem[];
  brewStart: Date;
  brewEnd: Date;
  totalMinutes: number;
}

/** Lot tracking entry (input or output) */
export interface BatchLotEntry {
  id: string;
  direction: "in" | "out";
  itemId: string | null;
  itemName: string;
  lotNumber: string | null;
  amount: number;
  unit: string;
  receiptId: string | null;
  notes: string | null;
  createdAt: string;
}

/** Excise summary for batch sidebar */
export interface ExciseSummary {
  plannedTaxCzk: number;
  currentTaxCzk: number;
  diffCzk: number;
  currentVolumeHl: number;
  movements: Array<{
    phase: string;
    label: string;
    volumeL: number;
    taxCzk: number;
  }>;
}

export interface ProductionIssueInfo {
  id: string;
  code: string;
  status: string;
  date: string;
  movementPurpose: string;
}
