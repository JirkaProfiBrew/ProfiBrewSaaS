/**
 * Stock Issues module — type definitions.
 * Matches the DB schema in drizzle/schema/stock.ts.
 * Drizzle decimal columns return strings.
 */

// ── Movement enums ────────────────────────────────────────────

export type MovementType = "receipt" | "issue";

export type MovementPurpose =
  | "purchase"
  | "production_in"
  | "production_out"
  | "sale"
  | "transfer"
  | "inventory"
  | "waste"
  | "other";

export type StockIssueStatus = "draft" | "confirmed" | "cancelled";

export type IssueMode = "fifo" | "lifo" | "average";

// ── Stock Issue ───────────────────────────────────────────────

export interface StockIssue {
  id: string;
  tenantId: string;
  code: string;
  codeNumber: number | null;
  codePrefix: string | null;
  counterId: string | null;
  movementType: string;
  movementPurpose: string;
  date: string;
  status: string;
  warehouseId: string;
  partnerId: string | null;
  orderId: string | null;
  batchId: string | null;
  season: string | null;
  additionalCost: string;
  totalCost: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// ── Stock Issue Line ──────────────────────────────────────────

export interface StockIssueLine {
  id: string;
  tenantId: string;
  stockIssueId: string;
  itemId: string;
  lineNo: number | null;
  requestedQty: string;
  issuedQty: string | null;
  missingQty: string | null;
  unitPrice: string | null;
  totalCost: string | null;
  issueModeSnapshot: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: Date | null;
}

// ── Composite types ───────────────────────────────────────────

export interface StockIssueWithLines extends StockIssue {
  lines: StockIssueLine[];
}

// ── Input types ───────────────────────────────────────────────

export interface CreateStockIssueInput {
  movementType: MovementType;
  movementPurpose: MovementPurpose;
  date: string;
  warehouseId: string;
  partnerId?: string | null;
  batchId?: string | null;
  season?: string | null;
  additionalCost?: string;
  notes?: string | null;
}

export interface UpdateStockIssueInput {
  movementPurpose?: MovementPurpose;
  date?: string;
  warehouseId?: string;
  partnerId?: string | null;
  batchId?: string | null;
  season?: string | null;
  additionalCost?: string;
  notes?: string | null;
}

export interface CreateLineInput {
  itemId: string;
  requestedQty: string;
  issuedQty?: string;
  unitPrice?: string;
  notes?: string | null;
}

export interface UpdateLineInput {
  requestedQty?: string;
  issuedQty?: string;
  unitPrice?: string;
  notes?: string | null;
}

// ── Stock Status ──────────────────────────────────────────────

export interface StockStatusRow {
  id: string;
  tenantId: string;
  itemId: string;
  warehouseId: string;
  quantity: string;
  reservedQty: string;
  updatedAt: Date | null;
}

// ── Allocation ────────────────────────────────────────────────

export interface AllocationRecord {
  sourceMovementId: string;
  quantity: number;
  unitPrice: number;
}

export interface AllocationResult {
  allocations: AllocationRecord[];
  weightedAvgPrice: number;
  totalCost: number;
}

// ── Filters ───────────────────────────────────────────────────

export interface StockIssueFilter {
  movementType?: string;
  status?: string;
  warehouseId?: string;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface StockStatusFilter {
  warehouseId?: string;
  itemId?: string;
}
