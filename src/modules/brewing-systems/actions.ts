"use server";

import { eq, and, ilike, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { brewingSystems } from "@/../drizzle/schema/brewing-systems";
import { shops } from "@/../drizzle/schema/shops";
import type { BrewingSystem } from "./types";

// ── Helpers ────────────────────────────────────────────────────

function mapRow(
  row: typeof brewingSystems.$inferSelect,
  shopName?: string | null
): BrewingSystem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    shopId: row.shopId,
    shopName: shopName ?? undefined,
    name: row.name,
    description: row.description,
    isPrimary: row.isPrimary ?? false,
    batchSizeL: row.batchSizeL,
    efficiencyPct: row.efficiencyPct,
    kettleVolumeL: row.kettleVolumeL,
    kettleLossPct: row.kettleLossPct,
    whirlpoolLossPct: row.whirlpoolLossPct,
    fermenterVolumeL: row.fermenterVolumeL,
    fermentationLossPct: row.fermentationLossPct,
    extractEstimate: row.extractEstimate,
    waterPerKgMalt: row.waterPerKgMalt,
    waterReserveL: row.waterReserveL,
    timePreparation: row.timePreparation,
    timeLautering: row.timeLautering,
    timeWhirlpool: row.timeWhirlpool,
    timeTransfer: row.timeTransfer,
    timeCleanup: row.timeCleanup,
    notes: row.notes,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface BrewingSystemFilter {
  isActive?: boolean;
  search?: string;
}

// ── Actions ────────────────────────────────────────────────────

export async function getBrewingSystems(
  filter?: BrewingSystemFilter
): Promise<BrewingSystem[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(brewingSystems.tenantId, tenantId)];

    if (filter?.isActive !== undefined) {
      conditions.push(eq(brewingSystems.isActive, filter.isActive));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(brewingSystems.name, `%${filter.search}%`),
          ilike(brewingSystems.description, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select({
        system: brewingSystems,
        shopName: shops.name,
      })
      .from(brewingSystems)
      .leftJoin(shops, eq(shops.id, brewingSystems.shopId))
      .where(and(...conditions))
      .orderBy(brewingSystems.name);

    return rows.map((r) => mapRow(r.system, r.shopName));
  });
}

export async function getBrewingSystem(
  id: string
): Promise<BrewingSystem | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        system: brewingSystems,
        shopName: shops.name,
      })
      .from(brewingSystems)
      .leftJoin(shops, eq(shops.id, brewingSystems.shopId))
      .where(
        and(eq(brewingSystems.tenantId, tenantId), eq(brewingSystems.id, id))
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row.system, row.shopName);
  });
}

export async function createBrewingSystem(
  data: Omit<
    typeof brewingSystems.$inferInsert,
    "id" | "tenantId" | "createdAt" | "updatedAt"
  >
): Promise<BrewingSystem> {
  return withTenant(async (tenantId) => {
    const rows = await db.transaction(async (tx) => {
      // If new system is primary, unset existing primary first
      if (data.isPrimary) {
        await tx
          .update(brewingSystems)
          .set({ isPrimary: false, updatedAt: sql`now()` })
          .where(
            and(
              eq(brewingSystems.tenantId, tenantId),
              eq(brewingSystems.isPrimary, true)
            )
          );
      }

      return tx
        .insert(brewingSystems)
        .values({
          tenantId,
          name: data.name,
          description: data.description,
          isPrimary: data.isPrimary ?? false,
          batchSizeL: data.batchSizeL,
          efficiencyPct: data.efficiencyPct ?? "75",
          shopId: data.shopId,
          kettleVolumeL: data.kettleVolumeL,
          kettleLossPct: data.kettleLossPct,
          whirlpoolLossPct: data.whirlpoolLossPct,
          fermenterVolumeL: data.fermenterVolumeL,
          fermentationLossPct: data.fermentationLossPct,
          extractEstimate: data.extractEstimate,
          waterPerKgMalt: data.waterPerKgMalt,
          waterReserveL: data.waterReserveL,
          timePreparation: data.timePreparation,
          timeLautering: data.timeLautering,
          timeWhirlpool: data.timeWhirlpool,
          timeTransfer: data.timeTransfer,
          timeCleanup: data.timeCleanup,
          notes: data.notes,
          isActive: data.isActive ?? true,
        })
        .returning();
    });

    const row = rows[0];
    if (!row) throw new Error("Failed to create brewing system");
    return mapRow(row);
  });
}

export async function updateBrewingSystem(
  id: string,
  data: Partial<
    Omit<
      typeof brewingSystems.$inferInsert,
      "id" | "tenantId" | "createdAt" | "updatedAt"
    >
  >
): Promise<BrewingSystem> {
  return withTenant(async (tenantId) => {
    const rows = await db.transaction(async (tx) => {
      // If setting as primary, unset existing primary first
      if (data.isPrimary) {
        await tx
          .update(brewingSystems)
          .set({ isPrimary: false, updatedAt: sql`now()` })
          .where(
            and(
              eq(brewingSystems.tenantId, tenantId),
              eq(brewingSystems.isPrimary, true)
            )
          );
      }

      return tx
        .update(brewingSystems)
        .set({
          ...data,
          updatedAt: sql`now()`,
        })
        .where(
          and(eq(brewingSystems.tenantId, tenantId), eq(brewingSystems.id, id))
        )
        .returning();
    });

    const row = rows[0];
    if (!row) throw new Error("Brewing system not found");
    return mapRow(row);
  });
}

export async function deleteBrewingSystem(id: string): Promise<BrewingSystem> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(brewingSystems)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(brewingSystems.tenantId, tenantId), eq(brewingSystems.id, id))
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Brewing system not found");
    return mapRow(row);
  });
}

export async function getPrimaryBrewingSystem(): Promise<BrewingSystem | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        system: brewingSystems,
        shopName: shops.name,
      })
      .from(brewingSystems)
      .leftJoin(shops, eq(shops.id, brewingSystems.shopId))
      .where(
        and(
          eq(brewingSystems.tenantId, tenantId),
          eq(brewingSystems.isPrimary, true),
          eq(brewingSystems.isActive, true)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row.system, row.shopName);
  });
}

export async function setPrimaryBrewingSystem(id: string): Promise<void> {
  return withTenant(async (tenantId) => {
    await db.transaction(async (tx) => {
      // Unset current primary
      await tx
        .update(brewingSystems)
        .set({ isPrimary: false, updatedAt: sql`now()` })
        .where(
          and(
            eq(brewingSystems.tenantId, tenantId),
            eq(brewingSystems.isPrimary, true)
          )
        );

      // Set new primary
      await tx
        .update(brewingSystems)
        .set({ isPrimary: true, updatedAt: sql`now()` })
        .where(
          and(eq(brewingSystems.tenantId, tenantId), eq(brewingSystems.id, id))
        );
    });
  });
}

