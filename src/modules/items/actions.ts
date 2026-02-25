"use server";

import { eq, and, ilike, or, sql, desc, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { getNextNumber } from "@/lib/db/counters";
import { items } from "@/../drizzle/schema/items";
import type { Item } from "./types";

// ── Helpers ────────────────────────────────────────────────────

/** Map a Drizzle row to an Item type. */
function mapRow(row: typeof items.$inferSelect): Item {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    brand: row.brand,
    isBrewMaterial: row.isBrewMaterial ?? false,
    isProductionItem: row.isProductionItem ?? false,
    isSaleItem: row.isSaleItem ?? false,
    isExciseRelevant: row.isExciseRelevant ?? false,
    stockCategory: row.stockCategory,
    issueMode: row.issueMode ?? "fifo",
    unitId: row.unitId,
    recipeUnitId: row.recipeUnitId,
    baseUnitAmount: row.baseUnitAmount,
    baseItemId: row.baseItemId,
    baseItemQuantity: row.baseItemQuantity,
    materialType: row.materialType,
    alpha: row.alpha,
    ebc: row.ebc,
    extractPercent: row.extractPercent,
    packagingType: row.packagingType,
    volumeL: row.volumeL,
    abv: row.abv,
    plato: row.plato,
    ean: row.ean,
    costPrice: row.costPrice,
    avgPrice: row.avgPrice,
    salePrice: row.salePrice,
    overheadManual: row.overheadManual ?? false,
    overheadPrice: row.overheadPrice,
    packagingCost: row.packagingCost,
    fillingCost: row.fillingCost,
    posAvailable: row.posAvailable ?? false,
    webAvailable: row.webAvailable ?? false,
    color: row.color,
    imageUrl: row.imageUrl,
    notes: row.notes,
    isActive: row.isActive ?? true,
    isFromLibrary: row.isFromLibrary ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface ItemFilter {
  isBrewMaterial?: boolean;
  isSaleItem?: boolean;
  materialType?: string;
  stockCategory?: string;
  isActive?: boolean;
  search?: string;
}

// ── Actions ────────────────────────────────────────────────────

/** List items with optional filters. */
export async function getItems(filter?: ItemFilter): Promise<Item[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(items.tenantId, tenantId)];

    if (filter?.isBrewMaterial !== undefined) {
      conditions.push(eq(items.isBrewMaterial, filter.isBrewMaterial));
    }
    if (filter?.isSaleItem !== undefined) {
      conditions.push(eq(items.isSaleItem, filter.isSaleItem));
    }
    if (filter?.materialType !== undefined) {
      conditions.push(eq(items.materialType, filter.materialType));
    }
    if (filter?.stockCategory !== undefined) {
      conditions.push(eq(items.stockCategory, filter.stockCategory));
    }
    if (filter?.isActive !== undefined) {
      conditions.push(eq(items.isActive, filter.isActive));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(items.name, `%${filter.search}%`),
          ilike(items.code, `%${filter.search}%`),
          ilike(items.brand, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select()
      .from(items)
      .where(and(...conditions))
      .orderBy(items.name);

    return rows.map(mapRow);
  });
}

/** Get a single item by ID. */
export async function getItemById(id: string): Promise<Item | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(items)
      .where(and(eq(items.tenantId, tenantId), eq(items.id, id)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row);
  });
}

/** Create a new item with auto-generated code. */
export async function createItem(
  data: Omit<
    typeof items.$inferInsert,
    "id" | "tenantId" | "code" | "avgPrice" | "createdAt" | "updatedAt"
  >
): Promise<Item> {
  return withTenant(async (tenantId) => {
    const code = await getNextNumber(tenantId, "item");

    const rows = await db
      .insert(items)
      .values({
        tenantId,
        code,
        name: data.name,
        brand: data.brand,
        isBrewMaterial: data.isBrewMaterial ?? false,
        isProductionItem: data.isProductionItem ?? false,
        isSaleItem: data.isSaleItem ?? false,
        isExciseRelevant: data.isExciseRelevant ?? false,
        stockCategory: data.stockCategory,
        issueMode: data.issueMode ?? "fifo",
        unitId: data.unitId,
        recipeUnitId: data.recipeUnitId,
        baseUnitAmount: data.baseUnitAmount,
        baseItemId: data.baseItemId,
        baseItemQuantity: data.baseItemQuantity,
        materialType: data.materialType,
        alpha: data.alpha,
        ebc: data.ebc,
        extractPercent: data.extractPercent,
        packagingType: data.packagingType,
        volumeL: data.volumeL,
        abv: data.abv,
        plato: data.plato,
        ean: data.ean,
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        overheadManual: data.overheadManual ?? false,
        overheadPrice: data.overheadPrice,
        packagingCost: data.packagingCost,
        fillingCost: data.fillingCost,
        posAvailable: data.posAvailable ?? false,
        webAvailable: data.webAvailable ?? false,
        color: data.color,
        imageUrl: data.imageUrl,
        notes: data.notes,
        isActive: data.isActive ?? true,
        isFromLibrary: data.isFromLibrary ?? false,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create item");
    return mapRow(row);
  });
}

/** Update an existing item. */
export async function updateItem(
  id: string,
  data: Partial<
    Omit<
      typeof items.$inferInsert,
      "id" | "tenantId" | "code" | "avgPrice" | "createdAt" | "updatedAt"
    >
  >
): Promise<Item> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(items)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(and(eq(items.tenantId, tenantId), eq(items.id, id)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Item not found");
    return mapRow(row);
  });
}

/** Soft delete an item (set isActive=false). */
export async function deleteItem(id: string): Promise<Item> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(items)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(and(eq(items.tenantId, tenantId), eq(items.id, id)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Item not found");
    return mapRow(row);
  });
}

/** Duplicate an item with a new code. */
export async function duplicateItem(id: string): Promise<Item> {
  return withTenant(async (tenantId) => {
    // Fetch original
    const originals = await db
      .select()
      .from(items)
      .where(and(eq(items.tenantId, tenantId), eq(items.id, id)))
      .limit(1);

    const original = originals[0];
    if (!original) throw new Error("Item not found");

    // Generate new code
    const code = await getNextNumber(tenantId, "item");

    // Insert copy
    const rows = await db
      .insert(items)
      .values({
        tenantId,
        code,
        name: `${original.name} (kopie)`,
        brand: original.brand,
        isBrewMaterial: original.isBrewMaterial,
        isProductionItem: original.isProductionItem,
        isSaleItem: original.isSaleItem,
        isExciseRelevant: original.isExciseRelevant,
        stockCategory: original.stockCategory,
        issueMode: original.issueMode,
        unitId: original.unitId,
        recipeUnitId: original.recipeUnitId,
        baseUnitAmount: original.baseUnitAmount,
        baseItemId: original.baseItemId,
        baseItemQuantity: original.baseItemQuantity,
        materialType: original.materialType,
        alpha: original.alpha,
        ebc: original.ebc,
        extractPercent: original.extractPercent,
        packagingType: original.packagingType,
        volumeL: original.volumeL,
        abv: original.abv,
        plato: original.plato,
        ean: original.ean,
        costPrice: original.costPrice,
        salePrice: original.salePrice,
        overheadManual: original.overheadManual,
        overheadPrice: original.overheadPrice,
        posAvailable: original.posAvailable,
        webAvailable: original.webAvailable,
        color: original.color,
        imageUrl: original.imageUrl,
        notes: original.notes,
        isActive: true,
        isFromLibrary: original.isFromLibrary,
        sourceLibraryId: original.sourceLibraryId,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to duplicate item");
    return mapRow(row);
  });
}

/** Get items with aggregated stock status and computed demand. */
export async function getItemsWithStock(
  filter?: ItemFilter
): Promise<Array<Item & { totalQty: number; demandedQty: number; availableQty: number }>> {
  return withTenant(async (tenantId) => {
    const { stockStatus, stockIssueLines, stockIssues } =
      await import("@/../drizzle/schema/stock");
    const { orders, orderItems } = await import("@/../drizzle/schema/orders");
    const { recipes, recipeItems } = await import(
      "@/../drizzle/schema/recipes"
    );
    const { batches } = await import("@/../drizzle/schema/batches");
    const { units } = await import("@/../drizzle/schema/system");

    const conditions = [eq(items.tenantId, tenantId)];

    if (filter?.isBrewMaterial !== undefined) {
      conditions.push(eq(items.isBrewMaterial, filter.isBrewMaterial));
    }
    if (filter?.isSaleItem !== undefined) {
      conditions.push(eq(items.isSaleItem, filter.isSaleItem));
    }
    if (filter?.materialType !== undefined) {
      conditions.push(eq(items.materialType, filter.materialType));
    }
    if (filter?.stockCategory !== undefined) {
      conditions.push(eq(items.stockCategory, filter.stockCategory));
    }
    if (filter?.isActive !== undefined) {
      conditions.push(eq(items.isActive, filter.isActive));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(items.name, `%${filter.search}%`),
          ilike(items.code, `%${filter.search}%`),
          ilike(items.brand, `%${filter.search}%`)
        )!
      );
    }

    // 1) Items + stock quantity
    const rows = await db
      .select({
        item: items,
        totalQty: sql<string>`COALESCE(SUM(${stockStatus.quantity}::decimal), 0)`,
      })
      .from(items)
      .leftJoin(
        stockStatus,
        and(
          eq(items.id, stockStatus.itemId),
          eq(stockStatus.tenantId, tenantId)
        )
      )
      .where(and(...conditions))
      .groupBy(items.id)
      .orderBy(items.name);

    if (rows.length === 0) return [];

    const itemIds = rows.map((r) => r.item.id);

    // 2) Order demand per item — unfulfilled order_items from active orders
    const orderDemandMap = new Map<string, number>();

    const activeOrderItems = await db
      .select({
        id: orderItems.id,
        itemId: orderItems.itemId,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.tenantId, tenantId),
          inArray(orderItems.itemId, itemIds),
          sql`${orders.status} IN ('confirmed', 'in_preparation', 'shipped')`
        )
      );

    if (activeOrderItems.length > 0) {
      const oiIds = activeOrderItems.map((r) => r.id);
      const oiIssuedRows = await db
        .select({
          orderItemId: stockIssueLines.orderItemId,
          totalIssued:
            sql<string>`COALESCE(SUM(${stockIssueLines.issuedQty}::decimal), 0)`,
        })
        .from(stockIssueLines)
        .innerJoin(
          stockIssues,
          and(
            eq(stockIssueLines.stockIssueId, stockIssues.id),
            eq(stockIssues.status, "confirmed")
          )
        )
        .where(inArray(stockIssueLines.orderItemId, oiIds))
        .groupBy(stockIssueLines.orderItemId);

      const oiIssuedMap = new Map<string, number>();
      for (const r of oiIssuedRows) {
        if (r.orderItemId)
          oiIssuedMap.set(r.orderItemId, Number(r.totalIssued));
      }

      for (const oi of activeOrderItems) {
        const required = Number(oi.quantity);
        const issued = oiIssuedMap.get(oi.id) ?? 0;
        const remaining = Math.max(0, required - issued);
        if (remaining > 0) {
          orderDemandMap.set(
            oi.itemId,
            (orderDemandMap.get(oi.itemId) ?? 0) + remaining
          );
        }
      }
    }

    // 3) Batch demand per item — unfulfilled recipe_items from active batches
    const batchDemandMap = new Map<string, number>();

    const activeBatchItems = await db
      .select({
        recipeItemId: recipeItems.id,
        itemId: recipeItems.itemId,
        amountG: recipeItems.amountG,
        toBaseFactor: units.toBaseFactor,
      })
      .from(recipeItems)
      .innerJoin(
        recipes,
        and(eq(recipeItems.recipeId, recipes.id), eq(recipes.tenantId, tenantId))
      )
      .innerJoin(
        batches,
        and(eq(batches.recipeId, recipes.id), eq(batches.tenantId, tenantId))
      )
      .leftJoin(units, eq(recipeItems.unitId, units.id))
      .where(
        and(
          eq(recipeItems.tenantId, tenantId),
          inArray(recipeItems.itemId, itemIds),
          sql`${batches.status} IN ('planned', 'brewing', 'fermenting', 'conditioning')`,
          sql`${batches.recipeId} IS NOT NULL`
        )
      );

    if (activeBatchItems.length > 0) {
      const riIds = activeBatchItems.map((r) => r.recipeItemId);
      const riIssuedRows = await db
        .select({
          recipeItemId: stockIssueLines.recipeItemId,
          totalIssued:
            sql<string>`COALESCE(SUM(${stockIssueLines.issuedQty}::decimal), 0)`,
        })
        .from(stockIssueLines)
        .innerJoin(
          stockIssues,
          and(
            eq(stockIssueLines.stockIssueId, stockIssues.id),
            eq(stockIssues.status, "confirmed")
          )
        )
        .where(inArray(stockIssueLines.recipeItemId, riIds))
        .groupBy(stockIssueLines.recipeItemId);

      const riIssuedMap = new Map<string, number>();
      for (const r of riIssuedRows) {
        if (r.recipeItemId)
          riIssuedMap.set(r.recipeItemId, Number(r.totalIssued));
      }

      for (const bi of activeBatchItems) {
        const factor = bi.toBaseFactor ? Number(bi.toBaseFactor) : null;
        const rawAmount = Number(bi.amountG);
        const required =
          factor != null && factor !== 0 ? rawAmount * factor : rawAmount;
        const issued = riIssuedMap.get(bi.recipeItemId) ?? 0;
        const remaining = Math.max(0, required - issued);
        if (remaining > 0) {
          batchDemandMap.set(
            bi.itemId,
            (batchDemandMap.get(bi.itemId) ?? 0) + remaining
          );
        }
      }
    }

    // 4) Merge stock + demand
    return rows.map((r) => {
      const qty = Number(r.totalQty);
      const demanded =
        (orderDemandMap.get(r.item.id) ?? 0) +
        (batchDemandMap.get(r.item.id) ?? 0);
      const available = qty - demanded;
      return {
        ...mapRow(r.item),
        totalQty: Math.round(qty * 100) / 100,
        demandedQty: Math.round(demanded * 100) / 100,
        availableQty: Math.round(available * 100) / 100,
      };
    });
  });
}

/** Get per-warehouse stock status for an item, with computed demand from getDemandBreakdown. */
export async function getItemStockByWarehouse(
  itemId: string
): Promise<{
  warehouses: Array<{ warehouseId: string; warehouseName: string; quantity: number; demandedQty: number; availableQty: number }>;
  demandBreakdown: DemandBreakdownRow[];
}> {
  return withTenant(async (tenantId) => {
    const { stockStatus } = await import("@/../drizzle/schema/stock");
    const { warehouses } = await import("@/../drizzle/schema/warehouses");

    const [stockRows, demand] = await Promise.all([
      db
        .select({
          warehouseId: stockStatus.warehouseId,
          warehouseName: warehouses.name,
          quantity: stockStatus.quantity,
        })
        .from(stockStatus)
        .innerJoin(warehouses, eq(stockStatus.warehouseId, warehouses.id))
        .where(
          and(
            eq(stockStatus.tenantId, tenantId),
            eq(stockStatus.itemId, itemId)
          )
        )
        .orderBy(warehouses.name),
      getDemandBreakdown(itemId),
    ]);

    // Total stock across all warehouses
    const totalQty = stockRows.reduce(
      (sum, r) => sum + Number(r.quantity ?? "0"),
      0
    );
    const demandedTotal = demand.totalDemanded;

    return {
      warehouses: stockRows.map((r) => {
        const qty = Number(r.quantity ?? "0");
        // Distribute demand proportionally per warehouse by stock share
        const warehouseDemand =
          totalQty > 0
            ? Math.round((qty / totalQty) * demandedTotal * 100) / 100
            : demandedTotal;
        const available = qty - warehouseDemand;
        return {
          warehouseId: r.warehouseId,
          warehouseName: r.warehouseName,
          quantity: qty,
          demandedQty: warehouseDemand,
          availableQty: Math.round(available * 100) / 100,
        };
      }),
      demandBreakdown: demand.rows,
    };
  });
}

// ── Demand Model ────────────────────────────────────────────────

export interface DemandBreakdownRow {
  source: "order" | "batch";
  sourceId: string;
  sourceCode: string;
  requiredQty: number;
  issuedQty: number;
  remainingQty: number;
}

/**
 * Get demand breakdown for an item — computed from active orders + active batches.
 * Order demand: confirmed/in_preparation/shipped orders with this item.
 * Batch demand: planned/brewing/fermenting/conditioning batches whose recipe snapshot includes this item.
 * Issued qty is computed from confirmed stock_issue_lines linked by order_item_id / recipe_item_id.
 */
export async function getDemandBreakdown(
  itemId: string
): Promise<{ totalDemanded: number; rows: DemandBreakdownRow[] }> {
  return withTenant(async (tenantId) => {
    const { orders, orderItems } = await import("@/../drizzle/schema/orders");
    const { recipes, recipeItems } = await import(
      "@/../drizzle/schema/recipes"
    );
    const { batches } = await import("@/../drizzle/schema/batches");
    const { stockIssueLines, stockIssues } = await import(
      "@/../drizzle/schema/stock"
    );
    const { units } = await import("@/../drizzle/schema/system");

    const rows: DemandBreakdownRow[] = [];

    // ── 1. Order demand ──────────────────────────────────────────
    const orderDemandRows = await db
      .select({
        orderItemId: orderItems.id,
        orderId: orders.id,
        orderNumber: orders.orderNumber,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          eq(orderItems.tenantId, tenantId),
          eq(orderItems.itemId, itemId),
          sql`${orders.status} IN ('confirmed', 'in_preparation', 'shipped')`
        )
      );

    // Compute issued qty per order_item_id
    if (orderDemandRows.length > 0) {
      const oiIds = orderDemandRows.map((r) => r.orderItemId);
      const issuedRows = await db
        .select({
          orderItemId: stockIssueLines.orderItemId,
          totalIssued: sql<string>`COALESCE(SUM(ABS(${stockIssueLines.issuedQty}::decimal)), 0)`,
        })
        .from(stockIssueLines)
        .innerJoin(
          stockIssues,
          and(
            eq(stockIssueLines.stockIssueId, stockIssues.id),
            eq(stockIssues.status, "confirmed")
          )
        )
        .where(
          and(
            eq(stockIssueLines.tenantId, tenantId),
            inArray(stockIssueLines.orderItemId, oiIds)
          )
        )
        .groupBy(stockIssueLines.orderItemId);

      const issuedMap = new Map<string, number>();
      for (const r of issuedRows) {
        if (r.orderItemId) issuedMap.set(r.orderItemId, Number(r.totalIssued));
      }

      for (const od of orderDemandRows) {
        const required = Number(od.quantity);
        const issued = issuedMap.get(od.orderItemId) ?? 0;
        const remaining = Math.max(0, required - issued);
        if (remaining > 0) {
          rows.push({
            source: "order",
            sourceId: od.orderId,
            sourceCode: od.orderNumber,
            requiredQty: required,
            issuedQty: issued,
            remainingQty: remaining,
          });
        }
      }
    }

    // ── 2. Batch demand ──────────────────────────────────────────
    // Find active batches whose snapshot recipe contains this item
    const batchDemandRows = await db
      .select({
        batchId: batches.id,
        batchNumber: batches.batchNumber,
        recipeItemId: recipeItems.id,
        amountG: recipeItems.amountG,
        toBaseFactor: units.toBaseFactor,
      })
      .from(batches)
      .innerJoin(
        recipes,
        and(eq(batches.recipeId, recipes.id), eq(recipes.tenantId, tenantId))
      )
      .innerJoin(
        recipeItems,
        and(
          eq(recipeItems.recipeId, recipes.id),
          eq(recipeItems.tenantId, tenantId),
          eq(recipeItems.itemId, itemId)
        )
      )
      .leftJoin(units, eq(recipeItems.unitId, units.id))
      .where(
        and(
          eq(batches.tenantId, tenantId),
          sql`${batches.status} IN ('planned', 'brewing', 'fermenting', 'conditioning')`,
          sql`${batches.recipeId} IS NOT NULL`
        )
      );

    if (batchDemandRows.length > 0) {
      // Compute issued qty per recipe_item_id
      const riIds = batchDemandRows.map((r) => r.recipeItemId);
      const issuedRows = await db
        .select({
          recipeItemId: stockIssueLines.recipeItemId,
          totalIssued: sql<string>`COALESCE(SUM(ABS(${stockIssueLines.issuedQty}::decimal)), 0)`,
        })
        .from(stockIssueLines)
        .innerJoin(
          stockIssues,
          and(
            eq(stockIssueLines.stockIssueId, stockIssues.id),
            eq(stockIssues.status, "confirmed")
          )
        )
        .where(
          and(
            eq(stockIssueLines.tenantId, tenantId),
            inArray(stockIssueLines.recipeItemId, riIds)
          )
        )
        .groupBy(stockIssueLines.recipeItemId);

      const issuedMap = new Map<string, number>();
      for (const r of issuedRows) {
        if (r.recipeItemId) issuedMap.set(r.recipeItemId, Number(r.totalIssued));
      }

      for (const bd of batchDemandRows) {
        // Convert recipe amount to base units (kg/l)
        const factor = bd.toBaseFactor ? Number(bd.toBaseFactor) : null;
        const rawAmount = Number(bd.amountG);
        const required = factor != null && factor !== 0
          ? rawAmount * factor
          : rawAmount; // null = already in base unit
        const issued = issuedMap.get(bd.recipeItemId) ?? 0;
        const remaining = Math.max(0, required - issued);
        if (remaining > 0) {
          rows.push({
            source: "batch",
            sourceId: bd.batchId,
            sourceCode: bd.batchNumber,
            requiredQty: Math.round(required * 100) / 100,
            issuedQty: Math.round(issued * 100) / 100,
            remainingQty: Math.round(remaining * 100) / 100,
          });
        }
      }
    }

    const totalDemanded = rows.reduce((sum, r) => sum + r.remainingQty, 0);
    return { totalDemanded: Math.round(totalDemanded * 100) / 100, rows };
  });
}

/** Get recent stock movements for an item (last 20). */
export async function getItemRecentMovements(
  itemId: string
): Promise<Array<{
  id: string;
  date: string;
  stockIssueId: string | null;
  movementType: string;
  quantity: string;
  unitPrice: string | null;
  warehouseId: string;
  warehouseName: string;
  stockIssueCode: string | null;
}>> {
  return withTenant(async (tenantId) => {
    const { stockMovements, stockIssues } = await import("@/../drizzle/schema/stock");
    const { warehouses } = await import("@/../drizzle/schema/warehouses");

    const rows = await db
      .select({
        id: stockMovements.id,
        date: stockMovements.date,
        stockIssueId: stockMovements.stockIssueId,
        movementType: stockMovements.movementType,
        quantity: stockMovements.quantity,
        unitPrice: stockMovements.unitPrice,
        warehouseId: stockMovements.warehouseId,
        warehouseName: warehouses.name,
        stockIssueCode: stockIssues.code,
      })
      .from(stockMovements)
      .leftJoin(warehouses, eq(stockMovements.warehouseId, warehouses.id))
      .leftJoin(stockIssues, eq(stockMovements.stockIssueId, stockIssues.id))
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.itemId, itemId)
        )
      )
      .orderBy(desc(stockMovements.createdAt))
      .limit(20);

    return rows.map((r) => ({
      id: r.id,
      date: r.date ?? "",
      stockIssueId: r.stockIssueId,
      movementType: r.movementType,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName ?? "",
      stockIssueCode: r.stockIssueCode,
    }));
  });
}

/** Get production items for base-item select (isProductionItem = true). */
export async function getProductionItemOptions(): Promise<
  { value: string; label: string; unitSymbol: string | null; costPrice: string | null }[]
> {
  return withTenant(async (tenantId) => {
    const { units } = await import("@/../drizzle/schema/system");

    const rows = await db
      .select({
        id: items.id,
        name: items.name,
        code: items.code,
        unitSymbol: units.symbol,
        costPrice: items.costPrice,
      })
      .from(items)
      .leftJoin(units, eq(items.unitId, units.id))
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.isProductionItem, true),
          eq(items.isActive, true)
        )
      )
      .orderBy(items.name);

    return rows.map((r) => ({
      value: r.id,
      label: `${r.code} — ${r.name}`,
      unitSymbol: r.unitSymbol,
      costPrice: r.costPrice,
    }));
  });
}
