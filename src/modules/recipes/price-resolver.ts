"use server";

/**
 * Ingredient price resolver — resolves per-item prices based on the tenant's
 * `ingredient_pricing_mode` shop setting.
 *
 * Modes:
 * - calc_price (default): items.cost_price
 * - avg_stock: items.avg_price (falls back to cost_price in caller)
 * - last_purchase: last confirmed receipt line unit_price per item
 */

import { eq, and, desc, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { items } from "@/../drizzle/schema/items";
import { stockIssues, stockIssueLines } from "@/../drizzle/schema/stock";
import type { ShopSettings } from "@/modules/shops/types";

export interface ResolvedItemPrice {
  itemId: string;
  price: number | null;
  source: string;
}

/**
 * Resolve ingredient prices for the given items based on pricing mode.
 * Returns a Map keyed by itemId.
 */
export async function resolveIngredientPrices(
  tenantId: string,
  itemIds: string[],
  mode: ShopSettings["ingredient_pricing_mode"]
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
    const rows = await db
      .select({ id: items.id, avgPrice: items.avgPrice })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), inArray(items.id, itemIds)));

    for (const row of rows) {
      result.set(row.id, {
        itemId: row.id,
        price: row.avgPrice ? parseFloat(row.avgPrice) : null,
        source: "avg_stock",
      });
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
