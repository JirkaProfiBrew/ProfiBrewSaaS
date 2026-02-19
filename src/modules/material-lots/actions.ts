"use server";

import { eq, and, ilike, or, sql, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { materialLots } from "@/../drizzle/schema/stock";
import { items } from "@/../drizzle/schema/items";
import { partners } from "@/../drizzle/schema/partners";
import { batchMaterialLots } from "@/../drizzle/schema/batches";
import { batches } from "@/../drizzle/schema/batches";
import { recipes } from "@/../drizzle/schema/recipes";
import type {
  MaterialLot,
  MaterialLotFilter,
  CreateMaterialLotInput,
  UpdateMaterialLotInput,
  LotBatchUsage,
  LotStatus,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────

/** Compute lot status from quantity remaining and expiry date. */
function computeStatus(
  quantityRemaining: string | null,
  expiryDate: string | null
): LotStatus {
  const qty = parseFloat(quantityRemaining ?? "0");
  if (qty <= 0) return "exhausted";

  if (expiryDate) {
    const expiry = new Date(expiryDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiry < today) return "expired";

    const thirtyDaysFromNow = new Date(today);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    if (expiry <= thirtyDaysFromNow) return "expiring";
  }

  return "active";
}

/** Map a Drizzle row to a MaterialLot type. */
function mapRow(
  row: typeof materialLots.$inferSelect,
  joined?: { itemName?: string | null; supplierName?: string | null }
): MaterialLot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    itemId: row.itemId,
    lotNumber: row.lotNumber,
    supplierId: row.supplierId,
    receivedDate: row.receivedDate,
    expiryDate: row.expiryDate,
    quantityInitial: row.quantityInitial,
    quantityRemaining: row.quantityRemaining,
    unitPrice: row.unitPrice,
    properties: row.properties as Record<string, string> | null,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    itemName: joined?.itemName ?? null,
    supplierName: joined?.supplierName ?? null,
    status: computeStatus(row.quantityRemaining, row.expiryDate),
  };
}

// ── Actions ────────────────────────────────────────────────────

/** List material lots with optional filters, joined with item & supplier names. */
export async function getMaterialLots(
  filter?: MaterialLotFilter
): Promise<MaterialLot[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(materialLots.tenantId, tenantId)];

    if (filter?.itemId) {
      conditions.push(eq(materialLots.itemId, filter.itemId));
    }
    if (filter?.supplierId) {
      conditions.push(eq(materialLots.supplierId, filter.supplierId));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(materialLots.lotNumber, `%${filter.search}%`),
          ilike(items.name, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select({
        lot: materialLots,
        itemName: items.name,
        supplierName: partners.name,
      })
      .from(materialLots)
      .leftJoin(items, eq(materialLots.itemId, items.id))
      .leftJoin(partners, eq(materialLots.supplierId, partners.id))
      .where(and(...conditions))
      .orderBy(desc(materialLots.receivedDate));

    return rows.map((r) =>
      mapRow(r.lot, {
        itemName: r.itemName,
        supplierName: r.supplierName,
      })
    );
  });
}

/** Get a single material lot by ID. */
export async function getMaterialLot(
  id: string
): Promise<MaterialLot | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        lot: materialLots,
        itemName: items.name,
        supplierName: partners.name,
      })
      .from(materialLots)
      .leftJoin(items, eq(materialLots.itemId, items.id))
      .leftJoin(partners, eq(materialLots.supplierId, partners.id))
      .where(
        and(eq(materialLots.tenantId, tenantId), eq(materialLots.id, id))
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row.lot, {
      itemName: row.itemName,
      supplierName: row.supplierName,
    });
  });
}

/** Create a new material lot. */
export async function createMaterialLot(
  data: CreateMaterialLotInput
): Promise<MaterialLot> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(materialLots)
      .values({
        tenantId,
        lotNumber: data.lotNumber,
        itemId: data.itemId,
        supplierId: data.supplierId ?? null,
        receivedDate: data.receivedDate ?? null,
        expiryDate: data.expiryDate ?? null,
        quantityInitial: data.quantityInitial ?? null,
        quantityRemaining: data.quantityRemaining ?? data.quantityInitial ?? null,
        unitPrice: data.unitPrice ?? null,
        properties: data.properties ?? {},
        notes: data.notes ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create material lot");
    return mapRow(row);
  });
}

/** Update an existing material lot. */
export async function updateMaterialLot(
  id: string,
  data: UpdateMaterialLotInput
): Promise<MaterialLot> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(materialLots)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(materialLots.tenantId, tenantId), eq(materialLots.id, id))
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Material lot not found");
    return mapRow(row);
  });
}

/** Delete a material lot (hard delete — lots without batch usage can be deleted). */
export async function deleteMaterialLot(id: string): Promise<void> {
  return withTenant(async (tenantId) => {
    await db
      .delete(materialLots)
      .where(
        and(eq(materialLots.tenantId, tenantId), eq(materialLots.id, id))
      );
  });
}

/** Get batch usage (traceability) for a given lot. */
export async function getLotBatchUsage(
  lotId: string
): Promise<LotBatchUsage[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        batchId: batchMaterialLots.batchId,
        batchNumber: batches.batchNumber,
        recipeName: recipes.name,
        brewDate: batches.brewDate,
        quantityUsed: batchMaterialLots.quantityUsed,
      })
      .from(batchMaterialLots)
      .innerJoin(batches, eq(batchMaterialLots.batchId, batches.id))
      .leftJoin(recipes, eq(batches.recipeId, recipes.id))
      .where(
        and(
          eq(batchMaterialLots.tenantId, tenantId),
          eq(batchMaterialLots.lotId, lotId)
        )
      )
      .orderBy(desc(batches.brewDate));

    return rows.map((r) => ({
      batchId: r.batchId,
      batchNumber: r.batchNumber ?? "",
      recipeName: r.recipeName ?? null,
      brewDate: r.brewDate?.toISOString() ?? null,
      quantityUsed: r.quantityUsed ?? null,
    }));
  });
}

/** Get brew material items for select options (is_brew_material = true). */
export async function getBrewMaterialOptions(): Promise<
  { value: string; label: string }[]
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: items.id, name: items.name })
      .from(items)
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.isBrewMaterial, true),
          eq(items.isActive, true)
        )
      )
      .orderBy(items.name);

    return rows.map((r) => ({ value: r.id, label: r.name }));
  });
}

/** Get supplier partners for select options. */
export async function getSupplierOptions(): Promise<
  { value: string; label: string }[]
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: partners.id, name: partners.name })
      .from(partners)
      .where(
        and(
          eq(partners.tenantId, tenantId),
          eq(partners.isSupplier, true),
          eq(partners.isActive, true)
        )
      )
      .orderBy(partners.name);

    return rows.map((r) => ({ value: r.id, label: r.name }));
  });
}
