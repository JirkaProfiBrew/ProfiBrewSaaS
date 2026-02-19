/**
 * FIFO/LIFO allocation engine.
 * Allocates issue quantities against open receipt movements.
 */

import { eq, and, asc, desc, sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { stockMovements, stockIssueAllocations } from "@/../drizzle/schema/stock";
import type { AllocationResult, IssueMode } from "../types";

type Transaction = PgTransaction<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle transaction type is complex
  any, any, any
>;

/**
 * Allocate an issue quantity against open receipt movements using FIFO or LIFO.
 *
 * @throws Error if insufficient stock
 */
export async function allocateIssue(
  tx: Transaction,
  tenantId: string,
  itemId: string,
  warehouseId: string,
  quantity: number,
  issueMode: IssueMode
): Promise<AllocationResult> {
  // 1. Load open receipt movements for this item + warehouse
  const dateOrder = issueMode === "lifo" ? desc(stockMovements.date) : asc(stockMovements.date);

  const openMovements = await tx
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.tenantId, tenantId),
        eq(stockMovements.itemId, itemId),
        eq(stockMovements.warehouseId, warehouseId),
        eq(stockMovements.movementType, "in"),
        eq(stockMovements.isClosed, false)
      )
    )
    .orderBy(dateOrder, asc(stockMovements.createdAt));

  // 2. For each movement, calculate remaining capacity
  const allocations: AllocationResult["allocations"] = [];
  let remaining = quantity;

  for (const movement of openMovements) {
    if (remaining <= 0) break;

    const movementQty = Number(movement.quantity);

    // Sum existing allocations against this movement
    const existingAllocRows = await tx
      .select({ total: sql<string>`COALESCE(SUM(${stockIssueAllocations.quantity}::decimal), 0)` })
      .from(stockIssueAllocations)
      .where(eq(stockIssueAllocations.sourceMovementId, movement.id));

    const existingAllocated = Number(existingAllocRows[0]?.total ?? "0");
    const availableInMovement = movementQty - existingAllocated;

    if (availableInMovement <= 0) continue;

    // 3. Allocate
    const allocateQty = Math.min(availableInMovement, remaining);
    const unitPrice = Number(movement.unitPrice ?? "0");

    allocations.push({
      sourceMovementId: movement.id,
      quantity: allocateQty,
      unitPrice,
    });

    remaining -= allocateQty;

    // 4. If fully allocated, close the movement
    if (availableInMovement - allocateQty <= 0) {
      await tx
        .update(stockMovements)
        .set({ isClosed: true })
        .where(eq(stockMovements.id, movement.id));
    }
  }

  // 5. Check if we have enough stock
  if (remaining > 0.0001) {
    throw new Error(
      `Insufficient stock for item ${itemId} in warehouse ${warehouseId}. ` +
      `Requested: ${quantity}, available: ${quantity - remaining}`
    );
  }

  // 6. Calculate weighted average price
  let totalCost = 0;
  for (const alloc of allocations) {
    totalCost += alloc.quantity * alloc.unitPrice;
  }
  const weightedAvgPrice = quantity > 0 ? totalCost / quantity : 0;

  return { allocations, weightedAvgPrice, totalCost };
}
