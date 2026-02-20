/**
 * FIFO allocation engine (v2).
 * Creates issue movements directly referencing receipt lines via receipt_line_id.
 * No more stock_issue_allocations table — movements are the single source of truth.
 */

import { eq, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  stockIssueLines,
  stockMovements,
} from "@/../drizzle/schema/stock";
import type { ManualAllocationJsonEntry } from "../types";

type Transaction = PgTransaction<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle transaction type is complex
  any, any, any
>;

export interface AllocationEngineResult {
  allocated: number;
  missing: number;
  weightedAvgPrice: number;
  totalCost: number;
}

/**
 * Allocate an issue line via FIFO against receipt lines with remaining_qty > 0.
 * Creates one movement per receipt line consumed. Does NOT throw on insufficient stock.
 */
/**
 * @param targetItemId Optional — if provided, searches receipt lines for this item instead of issueLine.itemId.
 *                     Used for bulk mode where the sale item differs from the physical stock item.
 * @param targetQty    Optional — if provided, uses this quantity instead of issueLine.requestedQty.
 *                     Used for bulk mode with quantity conversion (e.g., 5 cans × 0.33L = 1.65L).
 */
export async function allocateFIFO(
  tx: Transaction,
  tenantId: string,
  issueId: string,
  issueLine: { id: string; itemId: string; requestedQty: string },
  warehouseId: string,
  date: string,
  batchId: string | null,
  targetItemId?: string,
  targetQty?: number
): Promise<AllocationEngineResult> {
  const effectiveItemId = targetItemId ?? issueLine.itemId;
  const requestedQty = targetQty ?? Number(issueLine.requestedQty);

  // Find receipt lines with remaining stock in the same warehouse, ordered by date (FIFO)
  const receiptLinesInWarehouse = await tx.execute(sql`
    SELECT sil.id, sil.remaining_qty, sil.unit_price, sil.stock_issue_id
    FROM stock_issue_lines sil
    JOIN stock_issues si ON si.id = sil.stock_issue_id
    WHERE sil.tenant_id = ${tenantId}
      AND sil.item_id = ${effectiveItemId}
      AND si.warehouse_id = ${warehouseId}
      AND si.movement_type = 'receipt'
      AND si.status = 'confirmed'
      AND COALESCE(sil.remaining_qty::decimal, 0) > 0
    ORDER BY si.date ASC, sil.created_at ASC
  `);

  let remaining = requestedQty;
  let totalCost = 0;
  let totalAllocated = 0;

  for (const rl of receiptLinesInWarehouse as unknown as Array<{
    id: string;
    remaining_qty: string;
    unit_price: string | null;
    stock_issue_id: string;
  }>) {
    if (remaining <= 0.0001) break;

    const available = Number(rl.remaining_qty);
    const allocateQty = Math.min(available, remaining);
    const unitPrice = Number(rl.unit_price ?? "0");

    // Create "out" movement referencing the receipt line
    // In bulk mode, effectiveItemId may differ from issueLine.itemId
    await tx.insert(stockMovements).values({
      tenantId,
      itemId: effectiveItemId,
      warehouseId,
      movementType: "out",
      quantity: String(-allocateQty),
      unitPrice: String(unitPrice),
      stockIssueId: issueId,
      stockIssueLineId: issueLine.id,
      receiptLineId: rl.id,
      batchId,
      date,
    });

    // Decrement remaining_qty on the receipt line
    await tx
      .update(stockIssueLines)
      .set({
        remainingQty: sql`(${stockIssueLines.remainingQty}::decimal - ${allocateQty})`,
      })
      .where(eq(stockIssueLines.id, rl.id));

    totalCost += allocateQty * unitPrice;
    totalAllocated += allocateQty;
    remaining -= allocateQty;
  }

  const missing = Math.max(0, remaining);
  const weightedAvgPrice = totalAllocated > 0 ? totalCost / totalAllocated : 0;

  return { allocated: totalAllocated, missing, weightedAvgPrice, totalCost };
}

/**
 * Process manual allocations stored in line.manualAllocations JSONB.
 * Creates one movement per entry. Does NOT throw on insufficient stock.
 */
/**
 * @param targetItemId Optional — for bulk mode, the physical stock item to allocate from.
 * @param targetQty    Optional — for bulk mode, the converted quantity to allocate.
 */
export async function processManualAllocations(
  tx: Transaction,
  tenantId: string,
  issueId: string,
  issueLine: {
    id: string;
    itemId: string;
    requestedQty: string;
    manualAllocations: ManualAllocationJsonEntry[] | null;
  },
  warehouseId: string,
  date: string,
  batchId: string | null,
  targetItemId?: string,
  targetQty?: number
): Promise<AllocationEngineResult> {
  const effectiveItemId = targetItemId ?? issueLine.itemId;
  const entries = issueLine.manualAllocations ?? [];
  if (entries.length === 0) {
    // No manual allocations — fall back to FIFO
    return allocateFIFO(tx, tenantId, issueId, issueLine, warehouseId, date, batchId, targetItemId, targetQty);
  }

  let totalAllocated = 0;
  let totalCost = 0;

  for (const entry of entries) {
    const allocateQty = entry.quantity;
    if (allocateQty <= 0) continue;

    // Read receipt line to get unit price and verify remaining
    const [receiptLine] = await tx
      .select({
        remainingQty: stockIssueLines.remainingQty,
        unitPrice: stockIssueLines.unitPrice,
      })
      .from(stockIssueLines)
      .where(eq(stockIssueLines.id, entry.receipt_line_id));

    if (!receiptLine) continue;

    const available = Number(receiptLine.remainingQty ?? "0");
    const actualQty = Math.min(allocateQty, available);
    if (actualQty <= 0) continue;

    const unitPrice = Number(receiptLine.unitPrice ?? "0");

    // Create "out" movement referencing the receipt line
    // In bulk mode, effectiveItemId may differ from issueLine.itemId
    await tx.insert(stockMovements).values({
      tenantId,
      itemId: effectiveItemId,
      warehouseId,
      movementType: "out",
      quantity: String(-actualQty),
      unitPrice: String(unitPrice),
      stockIssueId: issueId,
      stockIssueLineId: issueLine.id,
      receiptLineId: entry.receipt_line_id,
      batchId,
      date,
    });

    // Decrement remaining_qty on the receipt line
    await tx
      .update(stockIssueLines)
      .set({
        remainingQty: sql`(${stockIssueLines.remainingQty}::decimal - ${actualQty})`,
      })
      .where(eq(stockIssueLines.id, entry.receipt_line_id));

    totalCost += actualQty * unitPrice;
    totalAllocated += actualQty;
  }

  const requestedQty = targetQty ?? Number(issueLine.requestedQty);
  const missing = Math.max(0, requestedQty - totalAllocated);
  const weightedAvgPrice = totalAllocated > 0 ? totalCost / totalAllocated : 0;

  return { allocated: totalAllocated, missing, weightedAvgPrice, totalCost };
}
