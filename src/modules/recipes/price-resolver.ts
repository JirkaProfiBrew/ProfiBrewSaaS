"use server";

/**
 * Ingredient price resolver — resolves per-item prices based on the tenant's
 * `ingredient_pricing_mode` shop setting.
 *
 * Modes:
 * - calc_price (default): items.cost_price
 * - avg_stock: weighted average from confirmed receipt lines with remaining_qty > 0
 * - last_purchase: last confirmed receipt line unit_price per item
 */

import { eq, and, desc, gt, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { items } from "@/../drizzle/schema/items";
import { stockIssues, stockIssueLines } from "@/../drizzle/schema/stock";
import type { ShopSettings } from "@/modules/shops/types";

export interface ResolvedItemPrice {
  itemId: string;
  price: number | null;
  source: string;
}

export interface ResolveOptions {
  /** Optional warehouse filter for avg_stock mode (shop settings default_warehouse_raw_id). */
  warehouseId?: string;
}

/**
 * Resolve ingredient prices for the given items based on pricing mode.
 * Returns a Map keyed by itemId.
 */
export async function resolveIngredientPrices(
  tenantId: string,
  itemIds: string[],
  mode: ShopSettings["ingredient_pricing_mode"],
  options?: ResolveOptions
): Promise<Map<string, ResolvedItemPrice>> {
  const result = new Map<string, ResolvedItemPrice>();
  if (itemIds.length === 0) return result;

  const effectiveMode = mode ?? "calc_price";

  if (effectiveMode === "calc_price") {
    const rows = await db
      .select({ id: items.id, costPrice: items.costPrice })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), inArray(items.id, itemIds)));

    for (const row of rows) {
      result.set(row.id, {
        itemId: row.id,
        price: row.costPrice ? parseFloat(row.costPrice) : null,
        source: "calc_price",
      });
    }
    return result;
  }

  if (effectiveMode === "avg_stock") {
    // Weighted average from confirmed receipt lines with remaining stock
    // avg = SUM(remaining_qty * full_unit_price) / SUM(remaining_qty)
    const warehouseCondition = options?.warehouseId
      ? eq(stockIssues.warehouseId, options.warehouseId)
      : undefined;

    const conditions = [
      eq(stockIssueLines.tenantId, tenantId),
      inArray(stockIssueLines.itemId, itemIds),
      eq(stockIssues.status, "confirmed"),
      eq(stockIssues.movementType, "receipt"),
      gt(stockIssueLines.remainingQty, "0"),
      ...(warehouseCondition ? [warehouseCondition] : []),
    ];

    const rows = await db
      .select({
        itemId: stockIssueLines.itemId,
        avgPrice: sql<string>`
          CASE WHEN SUM(${stockIssueLines.remainingQty}::numeric) > 0
          THEN SUM(${stockIssueLines.remainingQty}::numeric * COALESCE(${stockIssueLines.fullUnitPrice}, ${stockIssueLines.unitPrice}, 0)::numeric)
               / SUM(${stockIssueLines.remainingQty}::numeric)
          ELSE NULL END
        `.as("avg_price"),
      })
      .from(stockIssueLines)
      .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
      .where(and(...conditions))
      .groupBy(stockIssueLines.itemId);

    for (const row of rows) {
      result.set(row.itemId, {
        itemId: row.itemId,
        price: row.avgPrice ? parseFloat(row.avgPrice) : null,
        source: "avg_stock",
      });
    }
    // Fill missing items (no stock) with null
    for (const itemId of itemIds) {
      if (!result.has(itemId)) {
        result.set(itemId, { itemId, price: null, source: "avg_stock" });
      }
    }
    return result;
  }

  // last_purchase — latest confirmed receipt line per item
  if (effectiveMode === "last_purchase") {
    for (const itemId of itemIds) {
      const rows = await db
        .select({ unitPrice: stockIssueLines.unitPrice })
        .from(stockIssueLines)
        .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
        .where(
          and(
            eq(stockIssueLines.tenantId, tenantId),
            eq(stockIssueLines.itemId, itemId),
            eq(stockIssues.status, "confirmed"),
            eq(stockIssues.movementType, "receipt")
          )
        )
        .orderBy(desc(stockIssues.date))
        .limit(1);

      const row = rows[0];
      result.set(itemId, {
        itemId,
        price: row?.unitPrice ? parseFloat(row.unitPrice) : null,
        source: "last_purchase",
      });
    }
    return result;
  }

  return result;
}
