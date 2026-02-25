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

import { eq, and, desc, inArray, sql } from "drizzle-orm";

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

  // Debug: log the effective pricing mode
  console.log(
    `[price-resolver] mode=${effectiveMode}, warehouseId=${options?.warehouseId ?? "none"}, items=${itemIds.length}`
  );

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
    // Uses raw SQL for remaining_qty > 0 to handle NULL safely (NULL::decimal > 0 = false)
    const warehouseCondition = options?.warehouseId
      ? eq(stockIssues.warehouseId, options.warehouseId)
      : undefined;

    const conditions = [
      eq(stockIssueLines.tenantId, tenantId),
      inArray(stockIssueLines.itemId, itemIds),
      eq(stockIssues.status, "confirmed"),
      eq(stockIssues.movementType, "receipt"),
      sql`COALESCE(${stockIssueLines.remainingQty}::numeric, 0) > 0`,
      ...(warehouseCondition ? [warehouseCondition] : []),
    ];

    const rows = await db
      .select({
        itemId: stockIssueLines.itemId,
        avgPrice: sql<string>`
          CASE WHEN SUM(COALESCE(${stockIssueLines.remainingQty}, 0)::numeric) > 0
          THEN SUM(COALESCE(${stockIssueLines.remainingQty}, 0)::numeric * COALESCE(${stockIssueLines.fullUnitPrice}, ${stockIssueLines.unitPrice}, 0)::numeric)
               / SUM(COALESCE(${stockIssueLines.remainingQty}, 0)::numeric)
          ELSE NULL END
        `.as("avg_price"),
      })
      .from(stockIssueLines)
      .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
      .where(and(...conditions))
      .groupBy(stockIssueLines.itemId);

    console.log(
      `[price-resolver] avg_stock query returned ${rows.length} rows for ${itemIds.length} items`
    );

    for (const row of rows) {
      const price = row.avgPrice ? parseFloat(row.avgPrice) : null;
      console.log(
        `[price-resolver] avg_stock item=${row.itemId} avgPrice=${price}`
      );
      result.set(row.itemId, {
        itemId: row.itemId,
        price,
        source: "avg_stock",
      });
    }
    // Fill missing items (no stock) with null — will fallback to costPrice in caller
    for (const itemId of itemIds) {
      if (!result.has(itemId)) {
        console.log(
          `[price-resolver] avg_stock item=${itemId} NO STOCK — will fallback to costPrice`
        );
        result.set(itemId, { itemId, price: null, source: "avg_stock" });
      }
    }
    return result;
  }

  // last_purchase — latest confirmed receipt line per item
  if (effectiveMode === "last_purchase") {
    for (const itemId of itemIds) {
      const rows = await db
        .select({
          unitPrice: stockIssueLines.unitPrice,
          fullUnitPrice: stockIssueLines.fullUnitPrice,
        })
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
      const price = row?.fullUnitPrice
        ? parseFloat(row.fullUnitPrice)
        : row?.unitPrice
          ? parseFloat(row.unitPrice)
          : null;
      result.set(itemId, {
        itemId,
        price,
        source: "last_purchase",
      });
    }
    return result;
  }

  return result;
}
