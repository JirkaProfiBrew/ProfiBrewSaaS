/**
 * Excise module — type definitions.
 * Matches the DB schema in drizzle/schema/excise.ts.
 * Drizzle decimal columns return strings.
 */

// ── Movement enums ────────────────────────────────────────────

export type ExciseMovementType =
  | "production"
  | "release"
  | "loss"
  | "destruction"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";

export type ExciseDirection = "in" | "out";

export type ExciseMovementStatus = "draft" | "confirmed" | "reported";

export type ExciseReportStatus = "draft" | "submitted" | "accepted";

export type BreweryCategory = "A" | "B" | "C" | "D" | "E";

export type PlatoSource = "batch_measurement" | "recipe" | "manual";

export type TaxPoint = "production" | "release";

// ── Excise Settings (stored in tenants.settings JSONB) ────────

export interface ExciseSettings {
  excise_enabled: boolean;
  excise_brewery_category: BreweryCategory;
  excise_tax_point: TaxPoint;
  excise_plato_source: PlatoSource;
  excise_loss_norm_pct: number;
}

export const DEFAULT_EXCISE_SETTINGS: ExciseSettings = {
  excise_enabled: true,
  excise_brewery_category: "A",
  excise_tax_point: "production",
  excise_plato_source: "batch_measurement",
  excise_loss_norm_pct: 1.5,
};

// ── Excise Rate ───────────────────────────────────────────────

export interface ExciseRate {
  id: string;
  tenantId: string | null;
  category: string;
  ratePerPlatoHl: string;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  createdAt: Date | null;
}

// ── Excise Movement ───────────────────────────────────────────

export interface ExciseMovement {
  id: string;
  tenantId: string;
  batchId: string | null;
  stockIssueId: string | null;
  warehouseId: string | null;
  movementType: string;
  volumeHl: string;
  direction: string;
  plato: string | null;
  platoSource: string | null;
  taxRate: string | null;
  taxAmount: string | null;
  date: string;
  period: string;
  status: string;
  description: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Joined fields
  batchNumber: string | null;
  stockIssueCode: string | null;
  warehouseName: string | null;
}

// ── Excise Monthly Report ─────────────────────────────────────

export interface TaxDetailEntry {
  plato: number;
  volume_hl: number;
  tax: number;
}

export interface ExciseMonthlyReport {
  id: string;
  tenantId: string;
  period: string;
  openingBalanceHl: string;
  productionHl: string;
  transferInHl: string;
  releaseHl: string;
  transferOutHl: string;
  lossHl: string;
  destructionHl: string;
  adjustmentHl: string;
  closingBalanceHl: string;
  totalTax: string;
  taxDetails: TaxDetailEntry[] | null;
  status: string;
  submittedAt: Date | null;
  submittedBy: string | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// ── Input types ───────────────────────────────────────────────

export interface CreateExciseMovementInput {
  batchId?: string | null;
  stockIssueId?: string | null;
  warehouseId?: string | null;
  movementType: ExciseMovementType;
  volumeHl: string;
  direction: ExciseDirection;
  plato?: string | null;
  platoSource?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  date: string;
  period: string;
  status?: ExciseMovementStatus;
  description?: string | null;
  notes?: string | null;
}

export interface UpdateExciseMovementInput {
  plato?: string | null;
  notes?: string | null;
  status?: ExciseMovementStatus;
  // Only for manual (adjustment) movements:
  movementType?: ExciseMovementType;
  volumeHl?: string;
  direction?: ExciseDirection;
  date?: string;
  warehouseId?: string | null;
  description?: string | null;
}

// ── Filter ────────────────────────────────────────────────────

export interface ExciseMovementFilter {
  direction?: string;
  period?: string;
  movementType?: string;
  warehouseId?: string;
  status?: string;
  search?: string;
}

// ── Dashboard ─────────────────────────────────────────────────

export interface ExciseDashboardData {
  currentBalanceHl: number;
  monthProduction: number;
  monthRelease: number;
  monthTax: number;
  currentPeriod: string;
}
