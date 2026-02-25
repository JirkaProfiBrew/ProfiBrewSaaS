"use server";

import { eq, and, ilike, or, sql, arrayContains } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { counters } from "@/../drizzle/schema/system";
import { stockIssues } from "@/../drizzle/schema/stock";
import { orders } from "@/../drizzle/schema/orders";
import { shops } from "@/../drizzle/schema/shops";
import type { Warehouse } from "./types";

// ── Helpers ────────────────────────────────────────────────────

/** Map a Drizzle row to a Warehouse type. */
function mapRow(row: typeof warehouses.$inferSelect): Warehouse {
  return {
    id: row.id,
    tenantId: row.tenantId,
    shopId: row.shopId,
    code: row.code,
    name: row.name,
    isExciseRelevant: row.isExciseRelevant ?? false,
    categories: row.categories,
    isDefault: row.isDefault ?? false,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface WarehouseFilter {
  isActive?: boolean;
  isExciseRelevant?: boolean;
  shopId?: string;
  category?: string;
  search?: string;
}

// ── Actions ────────────────────────────────────────────────────

/** List warehouses with optional filters. */
export async function getWarehouses(
  filter?: WarehouseFilter
): Promise<Warehouse[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(warehouses.tenantId, tenantId)];

    if (filter?.isActive !== undefined) {
      conditions.push(eq(warehouses.isActive, filter.isActive));
    }
    if (filter?.isExciseRelevant !== undefined) {
      conditions.push(eq(warehouses.isExciseRelevant, filter.isExciseRelevant));
    }
    if (filter?.shopId !== undefined) {
      conditions.push(eq(warehouses.shopId, filter.shopId));
    }
    if (filter?.category) {
      conditions.push(arrayContains(warehouses.categories, [filter.category]));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(warehouses.name, `%${filter.search}%`),
          ilike(warehouses.code, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select()
      .from(warehouses)
      .where(and(...conditions))
      .orderBy(warehouses.name);

    return rows.map(mapRow);
  });
}

/** Get a single warehouse by ID. */
export async function getWarehouseById(
  id: string
): Promise<Warehouse | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.id, id)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row);
  });
}

/** Create a new warehouse + auto-create per-warehouse counters. */
export async function createWarehouse(
  data: Omit<
    typeof warehouses.$inferInsert,
    "id" | "tenantId" | "createdAt" | "updatedAt"
  >
): Promise<Warehouse | { error: "DUPLICATE_CODE" }> {
  return withTenant(async (tenantId) => {
    // If setting as default, unset any existing default first
    if (data.isDefault) {
      await db
        .update(warehouses)
        .set({ isDefault: false, updatedAt: sql`now()` })
        .where(
          and(eq(warehouses.tenantId, tenantId), eq(warehouses.isDefault, true))
        );
    }

    // Pre-check for duplicate code (unique constraint as safety net)
    const existing = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(eq(warehouses.tenantId, tenantId), eq(warehouses.code, data.code))
      )
      .limit(1);

    if (existing.length > 0) {
      return { error: "DUPLICATE_CODE" as const };
    }

    const rows = await db
      .insert(warehouses)
      .values({
        tenantId,
        code: data.code,
        name: data.name,
        shopId: data.shopId ?? null,
        isExciseRelevant: data.isExciseRelevant ?? false,
        categories: data.categories ?? null,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create warehouse");

    // Auto-create 2 counters for this warehouse (receipt + dispatch)
    const warehouseCode = row.code;
    await db
      .insert(counters)
      .values([
        {
          tenantId,
          entity: "stock_issue_receipt",
          warehouseId: row.id,
          prefix: `PRI${warehouseCode}`,
          includeYear: false,
          padding: 7,
          separator: "",
          resetYearly: false,
        },
        {
          tenantId,
          entity: "stock_issue_dispatch",
          warehouseId: row.id,
          prefix: `VYD${warehouseCode}`,
          includeYear: false,
          padding: 7,
          separator: "",
          resetYearly: false,
        },
      ])
      .onConflictDoNothing();

    return mapRow(row);
  });
}

/** Update an existing warehouse. */
export async function updateWarehouse(
  id: string,
  data: Partial<
    Omit<
      typeof warehouses.$inferInsert,
      "id" | "tenantId" | "code" | "createdAt" | "updatedAt"
    >
  >
): Promise<Warehouse> {
  return withTenant(async (tenantId) => {
    // If setting as default, unset any existing default first
    if (data.isDefault) {
      await db
        .update(warehouses)
        .set({ isDefault: false, updatedAt: sql`now()` })
        .where(
          and(
            eq(warehouses.tenantId, tenantId),
            eq(warehouses.isDefault, true)
          )
        );
    }

    const rows = await db
      .update(warehouses)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.id, id)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Warehouse not found");
    return mapRow(row);
  });
}

/** Hard delete a warehouse if no linked records exist. */
export async function deleteWarehouse(
  id: string
): Promise<{ success: true } | { error: "HAS_STOCK_ISSUES" | "HAS_ORDERS" | "HAS_SHOP_SETTINGS" }> {
  return withTenant(async (tenantId) => {
    // Check stock issues
    const issues = await db
      .select({ id: stockIssues.id })
      .from(stockIssues)
      .where(and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.warehouseId, id)))
      .limit(1);
    if (issues.length > 0) {
      return { error: "HAS_STOCK_ISSUES" as const };
    }

    // Check orders
    const linkedOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tenantId, tenantId), eq(orders.warehouseId, id)))
      .limit(1);
    if (linkedOrders.length > 0) {
      return { error: "HAS_ORDERS" as const };
    }

    // Check shop settings JSONB references
    const linkedShops = await db
      .select({ id: shops.id })
      .from(shops)
      .where(
        and(
          eq(shops.tenantId, tenantId),
          or(
            sql`${shops.settings}->>'default_warehouse_raw_id' = ${id}`,
            sql`${shops.settings}->>'default_warehouse_beer_id' = ${id}`
          )
        )
      )
      .limit(1);
    if (linkedShops.length > 0) {
      return { error: "HAS_SHOP_SETTINGS" as const };
    }

    // Delete counters for this warehouse
    await db
      .delete(counters)
      .where(and(eq(counters.tenantId, tenantId), eq(counters.warehouseId, id)));

    // Hard delete
    await db
      .delete(warehouses)
      .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.id, id)));

    return { success: true as const };
  });
}
