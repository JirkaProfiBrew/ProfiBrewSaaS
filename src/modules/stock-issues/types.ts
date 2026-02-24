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

export type IssueMode = "fifo" | "manual_lot";

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
  cashflowId: string | null;
  cashflowCode: string | null;
  batchId: string | null;
  season: string | null;
  additionalCost: string;
  totalCost: string;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Joined fields (from browser queries)
  warehouseName: string | null;
  partnerName: string | null;
}

// ── Stock Issue Line ──────────────────────────────────────────

// JSONB entry stored on issue lines for manual_lot pre-selection
export interface ManualAllocationJsonEntry {
  receipt_line_id: string;
  quantity: number;
}

export interface StockIssueLine {
  id: string;
  tenantId: string;
  stockIssueId: string;
  itemId: string;
  lineNo: number | null;
  requestedQty: string;
  issuedQty: string | null; // computed from movements for confirmed issues
  missingQty: string | null; // computed: requestedQty - issuedQty
  unitPrice: string | null;
  totalCost: string | null;
  issueModeSnapshot: string | null;
  notes: string | null;
  sortOrder: number;
  manualAllocations: ManualAllocationJsonEntry[] | null;
  // Lot tracking (receipt lines only)
  lotNumber: string | null;
  expiryDate: string | null;
  lotAttributes: Record<string, unknown>;
  remainingQty: string | null;
  // VPN (vedlejší pořizovací náklady) — computed by recalculate
  overheadPerUnit: string;
  fullUnitPrice: string | null;
  createdAt: Date | null;
}

// ── Receipt Costs (VPN — vedlejší pořizovací náklady) ─────────

export type CostAllocation = "by_value" | "by_quantity";

export interface ReceiptCost {
  id: string;
  tenantId: string;
  stockIssueId: string;
  description: string;
  amount: string;
  allocation: CostAllocation;
  sortOrder: number;
  createdAt: Date | null;
}

export interface CreateReceiptCostInput {
  description: string;
  amount: string;
  allocation?: CostAllocation;
}

export interface UpdateReceiptCostInput {
  description?: string;
  amount?: string;
  allocation?: CostAllocation;
}

// ── Composite types ───────────────────────────────────────────

export interface StockIssueWithLines extends StockIssue {
  lines: StockIssueLine[];
  costs: ReceiptCost[];
}

// ── Input types ───────────────────────────────────────────────

export interface CreateStockIssueInput {
  movementType: MovementType;
  movementPurpose: MovementPurpose;
  date: string;
  warehouseId: string;
  partnerId?: string | null;
  orderId?: string | null;
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
  lotNumber?: string | null;
  expiryDate?: string | null;
  lotAttributes?: Record<string, unknown>;
}

export interface UpdateLineInput {
  requestedQty?: string;
  issuedQty?: string;
  unitPrice?: string;
  notes?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
  lotAttributes?: Record<string, unknown>;
}

// ── Lot Attribute Interfaces ─────────────────────────────────

export interface MaltLotAttributes {
  extractPercent?: number;
  moisture?: number;
}

export interface HopLotAttributes {
  cropYear?: number;
  actualAlpha?: number;
}

export interface YeastLotAttributes {
  generation?: number;
  viability?: number;
}

// ── Manual Lot Selection ─────────────────────────────────────

export interface ManualAllocationInput {
  receiptLineId: string;
  quantity: string;
  unitPrice: string;
}

export interface AvailableReceiptLine {
  receiptLineId: string;
  receiptDate: string;
  receiptCode: string;
  supplierName: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  requestedQty: string;
  remainingQty: string;
  unitPrice: string | null;
}

// ── Tracking (readonly browser over receipt lines) ───────────

export type TrackingLotStatus = "in_stock" | "partial" | "issued" | "expired";

// ── Receipt Cancel Check ─────────────────────────────────────

export interface BlockingIssueInfo {
  issueId: string;
  issueCode: string;
  itemName: string;
  allocatedQty: number;
}

export interface ReceiptCancelCheck {
  canCancel: boolean;
  blockingIssues: BlockingIssueInfo[];
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
  receiptLineId: string;
  quantity: number;
  unitPrice: number;
}

export interface AllocationResult {
  allocations: AllocationRecord[];
  weightedAvgPrice: number;
  totalCost: number;
}

// ── Prevalidation (partial issue support) ────────────────────

export interface PrevalidationWarning {
  itemName: string;
  unit: string;
  requested: number;
  available: number;
  willIssue: number;
  missing: number;
}

export interface PrevalidationResult {
  canConfirm: boolean;
  hasWarnings: boolean;
  warnings: PrevalidationWarning[];
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
