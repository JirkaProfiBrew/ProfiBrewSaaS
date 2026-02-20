/**
 * Stock Status sync helper.
 * Performs UPSERT into stock_status to keep current levels in sync.
 */

import { sql, eq, and } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { stockStatus } from "@/../drizzle/schema/stock";

type Transaction = PgTransaction<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle transaction type is complex
  any, any, any
>;

/**
 * Update stock_status for a given item + warehouse.
 * Uses UPSERT: INSERT ... ON CONFLICT DO UPDATE.
 *
 * @param quantityDelta Positive = receipt, negative = issue
 */
export async function updateStockStatusRow(
  tx: Transaction,
  tenantId: string,
  itemId: string,
  warehouseId: string,
  quantityDelta: number
): Promise<void> {
  await tx
    .insert(stockStatus)
    .values({
      tenantId,
      itemId,
      warehouseId,
      quantity: String(quantityDelta),
      reservedQty: "0",
    })
    .onConflictDoUpdate({
      target: [stockStatus.tenantId, stockStatus.itemId, stockStatus.warehouseId],
      set: {
        quantity: sql`${stockStatus.quantity}::decimal + ${quantityDelta}`,
        updatedAt: sql`now()`,
      },
      setWhere: and(
        eq(stockStatus.tenantId, tenantId),
        eq(stockStatus.itemId, itemId),
        eq(stockStatus.warehouseId, warehouseId)
      ),
    });
}

/**
 * Update reserved_qty on stock_status for a given item + warehouse.
 * Uses UPSERT: INSERT ... ON CONFLICT DO UPDATE.
 *
 * @param reservedQtyDelta Positive = reserve, negative = release
 */
export async function updateReservedQtyRow(
  tx: Transaction,
  tenantId: string,
  itemId: string,
  warehouseId: string,
  reservedQtyDelta: number
): Promise<void> {
  await tx
    .insert(stockStatus)
    .values({
      tenantId,
      itemId,
      warehouseId,
      quantity: "0",
      reservedQty: String(reservedQtyDelta),
    })
    .onConflictDoUpdate({
      target: [stockStatus.tenantId, stockStatus.itemId, stockStatus.warehouseId],
      set: {
        reservedQty: sql`${stockStatus.reservedQty}::decimal + ${reservedQtyDelta}`,
        updatedAt: sql`now()`,
      },
      setWhere: and(
        eq(stockStatus.tenantId, tenantId),
        eq(stockStatus.itemId, itemId),
        eq(stockStatus.warehouseId, warehouseId)
      ),
    });
}
