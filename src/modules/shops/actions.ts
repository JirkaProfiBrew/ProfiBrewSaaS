"use server";

import { eq, and, sql, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { shops } from "@/../drizzle/schema/shops";
import type { Shop, ShopAddress, ShopSettings } from "./types";

// ── Helpers ────────────────────────────────────────────────────

/** Parse the JSONB address column into a typed ShopAddress. */
function parseAddress(raw: unknown): ShopAddress | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    // Safe cast: we've verified raw is a non-null, non-array object from JSONB
    const obj = raw as Record<string, unknown>;
    return {
      street: typeof obj.street === "string" ? obj.street : undefined,
      city: typeof obj.city === "string" ? obj.city : undefined,
      zip: typeof obj.zip === "string" ? obj.zip : undefined,
      country: typeof obj.country === "string" ? obj.country : undefined,
    };
  }
  return null;
}

/** Parse the JSONB settings column into a typed Record. */
function parseSettings(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) {
    // Safe cast: we've verified raw is a non-null, non-array object from JSONB
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Map a Drizzle row to a Shop type. */
function mapRow(row: typeof shops.$inferSelect): Shop {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    shopType: row.shopType,
    address: parseAddress(row.address),
    isDefault: row.isDefault ?? false,
    isActive: row.isActive ?? true,
    settings: parseSettings(row.settings),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface ShopFilter {
  shopType?: string;
  isActive?: boolean;
  search?: string;
}

// ── Actions ────────────────────────────────────────────────────

/** List shops with optional filters. */
export async function getShops(filter?: ShopFilter): Promise<Shop[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(shops.tenantId, tenantId)];

    if (filter?.shopType !== undefined) {
      conditions.push(eq(shops.shopType, filter.shopType));
    }
    if (filter?.isActive !== undefined) {
      conditions.push(eq(shops.isActive, filter.isActive));
    }

    const rows = await db
      .select()
      .from(shops)
      .where(and(...conditions))
      .orderBy(shops.name);

    return rows.map(mapRow);
  });
}

/** Get a single shop by ID. */
export async function getShopById(id: string): Promise<Shop | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(shops)
      .where(and(eq(shops.tenantId, tenantId), eq(shops.id, id)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row);
  });
}

/** Create a new shop. */
export async function createShop(
  data: Omit<
    typeof shops.$inferInsert,
    "id" | "tenantId" | "createdAt" | "updatedAt"
  >
): Promise<Shop> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(shops)
      .values({
        tenantId,
        name: data.name,
        shopType: data.shopType,
        address: data.address ?? null,
        isDefault: data.isDefault ?? false,
        isActive: data.isActive ?? true,
        settings: data.settings ?? {},
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create shop");
    return mapRow(row);
  });
}

/** Update an existing shop. */
export async function updateShop(
  id: string,
  data: Partial<
    Omit<
      typeof shops.$inferInsert,
      "id" | "tenantId" | "createdAt" | "updatedAt"
    >
  >
): Promise<Shop> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(shops)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(and(eq(shops.tenantId, tenantId), eq(shops.id, id)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Shop not found");
    return mapRow(row);
  });
}

/** Soft delete a shop (set isActive=false). */
export async function deleteShop(id: string): Promise<Shop> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(shops)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(and(eq(shops.tenantId, tenantId), eq(shops.id, id)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Shop not found");
    return mapRow(row);
  });
}

/**
 * Get the ShopSettings JSONB from the default (or first active) shop for the tenant.
 * Used by recipe calculation to resolve pricing mode and overhead values.
 */
export async function getDefaultShopSettings(
  tenantId: string
): Promise<ShopSettings | null> {
  const rows = await db
    .select({ settings: shops.settings })
    .from(shops)
    .where(and(eq(shops.tenantId, tenantId), eq(shops.isActive, true)))
    .orderBy(desc(shops.isDefault))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const parsed = parseSettings(row.settings);
  return parsed as ShopSettings;
}
