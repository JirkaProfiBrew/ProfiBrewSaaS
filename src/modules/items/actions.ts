"use server";

import { eq, and, ilike, or, sql } from "drizzle-orm";

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
