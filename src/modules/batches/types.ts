/**
 * Batches module — type definitions.
 * Matches the DB schema in drizzle/schema/batches.ts.
 * Drizzle decimal columns return strings — actualVolumeL, ogActual etc. are string | null.
 */

export type BatchStatus =
  | "planned"
  | "brewing"
  | "fermenting"
  | "conditioning"
  | "carbonating"
  | "packaging"
  | "completed"
  | "dumped";

export const BATCH_STATUS_TRANSITIONS: Record<BatchStatus, BatchStatus[]> = {
  planned: ["brewing"],
  brewing: ["fermenting"],
  fermenting: ["conditioning"],
  conditioning: ["carbonating"],
  carbonating: ["packaging"],
  packaging: ["completed"],
  completed: [],
  dumped: [],
};
// ANY status can also transition to "dumped"

export const BATCH_STATUS_COLORS: Record<BatchStatus, string> = {
  planned: "gray",
  brewing: "orange",
  fermenting: "yellow",
  conditioning: "blue",
  carbonating: "indigo",
  packaging: "purple",
  completed: "green",
  dumped: "red",
};

export interface Batch {
  id: string;
  tenantId: string;
  batchNumber: string;
  batchSeq: number | null;
  recipeId: string | null;
  itemId: string | null;
  status: string;
  brewStatus: string | null;
  plannedDate: Date | null;
  brewDate: Date | null;
  endBrewDate: Date | null;
  actualVolumeL: string | null;
  ogActual: string | null;
  fgActual: string | null;
  abvActual: string | null;
  packagingLossL: string | null;
  equipmentId: string | null;
  primaryBatchId: string | null;
  isPaused: boolean;
  notes: string | null;
  brewerId: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
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
  lots: BatchIngredientLot[]; // lot breakdown from confirmed movements
}

export interface ProductionIssueInfo {
  id: string;
  code: string;
  status: string;
  date: string;
  movementPurpose: string;
}
