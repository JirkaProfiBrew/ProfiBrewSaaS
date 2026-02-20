"use server";

import { eq, and, ilike, or, sql, desc } from "drizzle-orm";

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

/** Get items with aggregated stock status. */
export async function getItemsWithStock(
  filter?: ItemFilter
): Promise<Array<Item & { totalQty: number; reservedQty: number; availableQty: number }>> {
  return withTenant(async (tenantId) => {
    const { stockStatus } = await import("@/../drizzle/schema/stock");

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
      .select({
        item: items,
        totalQty: sql<string>`COALESCE(SUM(${stockStatus.quantity}::decimal), 0)`,
        reservedQty: sql<string>`COALESCE(SUM(${stockStatus.reservedQty}::decimal), 0)`,
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

    return rows.map((r) => {
      const totalQty = Number(r.totalQty);
      const reservedQty = Number(r.reservedQty);
      return {
        ...mapRow(r.item),
        totalQty,
        reservedQty,
        availableQty: totalQty - reservedQty,
      };
    });
  });
}

/** Get per-warehouse stock status for an item. */
export async function getItemStockByWarehouse(
  itemId: string
): Promise<Array<{ warehouseId: string; warehouseName: string; quantity: number; reservedQty: number; availableQty: number }>> {
  return withTenant(async (tenantId) => {
    const { stockStatus } = await import("@/../drizzle/schema/stock");
    const { warehouses } = await import("@/../drizzle/schema/warehouses");

    const rows = await db
      .select({
        warehouseId: stockStatus.warehouseId,
        warehouseName: warehouses.name,
        quantity: stockStatus.quantity,
        reservedQty: stockStatus.reservedQty,
      })
      .from(stockStatus)
      .innerJoin(warehouses, eq(stockStatus.warehouseId, warehouses.id))
      .where(
        and(
          eq(stockStatus.tenantId, tenantId),
          eq(stockStatus.itemId, itemId)
        )
      )
      .orderBy(warehouses.name);

    return rows.map((r) => {
      const qty = Number(r.quantity ?? "0");
      const reserved = Number(r.reservedQty ?? "0");
      return {
        warehouseId: r.warehouseId,
        warehouseName: r.warehouseName,
        quantity: qty,
        reservedQty: reserved,
        availableQty: qty - reserved,
      };
    });
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
  { value: string; label: string; unitSymbol: string | null }[]
> {
  return withTenant(async (tenantId) => {
    const { units } = await import("@/../drizzle/schema/system");

    const rows = await db
      .select({
        id: items.id,
        name: items.name,
        code: items.code,
        unitSymbol: units.symbol,
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
    }));
  });
}
