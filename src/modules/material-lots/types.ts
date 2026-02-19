/**
 * Material Lots module — type definitions.
 * Matches the DB schema in drizzle/schema/stock.ts.
 */

// ── Lot status (computed, not stored in DB) ───────────────────

export type LotStatus = "active" | "exhausted" | "expiring" | "expired";

// ── Material Lot ──────────────────────────────────────────────

export interface MaterialLot {
  id: string;
  tenantId: string;
  itemId: string;
  lotNumber: string;
  supplierId: string | null;
  receivedDate: string | null;
  expiryDate: string | null;
  quantityInitial: string | null;
  quantityRemaining: string | null;
  unitPrice: string | null;
  properties: Record<string, string> | null;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Joined fields (from browser queries)
  itemName: string | null;
  supplierName: string | null;
  // Computed field
  status: LotStatus;
}

// ── Input types ───────────────────────────────────────────────

export interface CreateMaterialLotInput {
  lotNumber: string;
  itemId: string;
  supplierId?: string | null;
  receivedDate?: string | null;
  expiryDate?: string | null;
  quantityInitial?: string | null;
  quantityRemaining?: string | null;
  unitPrice?: string | null;
  properties?: Record<string, string> | null;
  notes?: string | null;
}

export interface UpdateMaterialLotInput {
  lotNumber?: string;
  supplierId?: string | null;
  receivedDate?: string | null;
  expiryDate?: string | null;
  unitPrice?: string | null;
  properties?: Record<string, string> | null;
  notes?: string | null;
}

// ── Filter ────────────────────────────────────────────────────

export interface MaterialLotFilter {
  itemId?: string;
  supplierId?: string;
  search?: string;
}

// ── Traceability (batch usage) ────────────────────────────────

export interface LotBatchUsage {
  batchId: string;
  batchNumber: string;
  recipeName: string | null;
  brewDate: string | null;
  quantityUsed: string | null;
}
