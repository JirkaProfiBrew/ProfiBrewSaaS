"use server";

import { eq, sql, asc, isNull, and } from "drizzle-orm";

import { db } from "@/lib/db";
import { withSuperadmin } from "@/lib/auth/superadmin";
import { mashingProfiles } from "@/../drizzle/schema/recipes";
import {
  mashingProfileCreateSchema,
  mashingProfileUpdateSchema,
} from "@/modules/mashing-profiles/schema";
import type {
  MashingProfile,
  MashStep,
  LegacyMashStep,
} from "@/modules/mashing-profiles/types";

// ── Helpers ────────────────────────────────────────────────────

/** Migrate a legacy step (old field names) to the new MashStep shape on read. */
function migrateStep(raw: Record<string, unknown>): MashStep {
  if ("stepType" in raw && typeof raw.stepType === "string") {
    return raw as unknown as MashStep;
  }

  const legacy = raw as unknown as LegacyMashStep;
  return {
    name: legacy.name,
    stepType: legacy.type,
    targetTemperatureC: legacy.temperature,
    rampTimeMin: 0,
    holdTimeMin: legacy.time,
    notes: legacy.notes,
  };
}

function mapRow(row: typeof mashingProfiles.$inferSelect): MashingProfile {
  const rawSteps = (row.steps ?? []) as Record<string, unknown>[];
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    mashingType: row.mashingType as MashingProfile["mashingType"],
    description: row.description,
    steps: rawSteps.map(migrateStep),
    notes: row.notes,
    isActive: row.isActive ?? true,
    isSystem: row.tenantId === null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Actions ────────────────────────────────────────────────────

/**
 * List system mashing profiles (tenant_id IS NULL, active).
 */
export async function adminGetMashingProfiles(): Promise<MashingProfile[]> {
  return withSuperadmin(async () => {
    const rows = await db
      .select()
      .from(mashingProfiles)
      .where(
        and(
          isNull(mashingProfiles.tenantId),
          eq(mashingProfiles.isActive, true)
        )
      )
      .orderBy(asc(mashingProfiles.name));

    return rows.map(mapRow);
  });
}

/**
 * Get a single system mashing profile by ID.
 */
export async function adminGetMashingProfile(
  id: string
): Promise<MashingProfile | null> {
  return withSuperadmin(async () => {
    const rows = await db
      .select()
      .from(mashingProfiles)
      .where(
        and(eq(mashingProfiles.id, id), isNull(mashingProfiles.tenantId))
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row);
  });
}

/**
 * Create a new system mashing profile (tenant_id = NULL).
 */
export async function adminCreateMashingProfile(
  data: Record<string, unknown>
): Promise<MashingProfile> {
  const parsed = mashingProfileCreateSchema.parse(data);

  return withSuperadmin(async () => {
    const rows = await db
      .insert(mashingProfiles)
      .values({
        tenantId: null,
        name: parsed.name,
        mashingType: parsed.mashingType ?? null,
        description: parsed.description ?? null,
        steps: parsed.steps,
        notes: parsed.notes ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create system mashing profile");
    return mapRow(row);
  });
}

/**
 * Update an existing system mashing profile.
 */
export async function adminUpdateMashingProfile(
  id: string,
  data: Record<string, unknown>
): Promise<MashingProfile> {
  const parsed = mashingProfileUpdateSchema.parse(data);

  return withSuperadmin(async () => {
    // Verify the profile exists and is a system profile
    const existing = await db
      .select()
      .from(mashingProfiles)
      .where(eq(mashingProfiles.id, id))
      .limit(1);

    const profile = existing[0];
    if (!profile) throw new Error("System mashing profile not found");
    if (profile.tenantId !== null) {
      throw new Error("NOT_SYSTEM_PROFILE");
    }

    const updateData: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.mashingType !== undefined)
      updateData.mashingType = parsed.mashingType;
    if (parsed.description !== undefined)
      updateData.description = parsed.description;
    if (parsed.steps !== undefined) updateData.steps = parsed.steps;
    if (parsed.notes !== undefined) updateData.notes = parsed.notes;

    const rows = await db
      .update(mashingProfiles)
      .set(updateData)
      .where(
        and(eq(mashingProfiles.id, id), isNull(mashingProfiles.tenantId))
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("System mashing profile not found");
    return mapRow(row);
  });
}

/**
 * Soft delete a system mashing profile (set is_active = false).
 */
export async function adminDeleteMashingProfile(
  id: string
): Promise<MashingProfile> {
  return withSuperadmin(async () => {
    // Verify the profile exists and is a system profile
    const existing = await db
      .select()
      .from(mashingProfiles)
      .where(eq(mashingProfiles.id, id))
      .limit(1);

    const profile = existing[0];
    if (!profile) throw new Error("System mashing profile not found");
    if (profile.tenantId !== null) {
      throw new Error("NOT_SYSTEM_PROFILE");
    }

    const rows = await db
      .update(mashingProfiles)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(mashingProfiles.id, id), isNull(mashingProfiles.tenantId))
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("System mashing profile not found");
    return mapRow(row);
  });
}
