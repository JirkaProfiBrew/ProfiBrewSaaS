"use server";

import { eq, and, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { equipment } from "@/../drizzle/schema/equipment";
import type { Equipment } from "./types";

// ── Helpers ────────────────────────────────────────────────────

/** Map a Drizzle row to an Equipment type. */
function mapRow(row: typeof equipment.$inferSelect): Equipment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    shopId: row.shopId,
    name: row.name,
    equipmentType: row.equipmentType,
    volumeL: row.volumeL,
    status: row.status ?? "available",
    currentBatchId: row.currentBatchId,
    // Cast needed: Drizzle jsonb returns unknown, but our schema always stores objects
    properties: (row.properties as Record<string, unknown>) ?? {},
    notes: row.notes,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface EquipmentFilter {
  equipmentType?: string;
  status?: string;
  shopId?: string;
  isActive?: boolean;
  search?: string;
}

// ── Actions ────────────────────────────────────────────────────

/** List equipment with optional filters. */
export async function getEquipment(
  filter?: EquipmentFilter
): Promise<Equipment[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(equipment.tenantId, tenantId)];

    if (filter?.equipmentType !== undefined) {
      conditions.push(eq(equipment.equipmentType, filter.equipmentType));
    }
    if (filter?.status !== undefined) {
      conditions.push(eq(equipment.status, filter.status));
    }
    if (filter?.shopId !== undefined) {
      conditions.push(eq(equipment.shopId, filter.shopId));
    }
    if (filter?.isActive !== undefined) {
      conditions.push(eq(equipment.isActive, filter.isActive));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(equipment.name, `%${filter.search}%`),
          ilike(equipment.notes, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select()
      .from(equipment)
      .where(and(...conditions))
      .orderBy(equipment.name);

    return rows.map(mapRow);
  });
}

/** Get a single equipment item by ID. */
export async function getEquipmentById(
  id: string
): Promise<Equipment | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, id)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row);
  });
}

/** Create a new equipment entry. */
export async function createEquipment(
  data: Omit<
    typeof equipment.$inferInsert,
    "id" | "tenantId" | "currentBatchId" | "createdAt" | "updatedAt"
  >
): Promise<Equipment> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(equipment)
      .values({
        tenantId,
        name: data.name,
        equipmentType: data.equipmentType,
        volumeL: data.volumeL,
        shopId: data.shopId,
        status: data.status ?? "available",
        properties: data.properties ?? {},
        notes: data.notes,
        isActive: data.isActive ?? true,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create equipment");
    return mapRow(row);
  });
}

/** Update an existing equipment entry. */
export async function updateEquipment(
  id: string,
  data: Partial<
    Omit<
      typeof equipment.$inferInsert,
      "id" | "tenantId" | "currentBatchId" | "createdAt" | "updatedAt"
    >
  >
): Promise<Equipment> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(equipment)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, id)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Equipment not found");
    return mapRow(row);
  });
}

/** Soft delete equipment (set isActive=false). */
export async function deleteEquipment(id: string): Promise<Equipment> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(equipment)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, id)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Equipment not found");
    return mapRow(row);
  });
}
