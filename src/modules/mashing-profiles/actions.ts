"use server";

import { eq, and, or, sql, asc, isNull, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { mashingProfiles, recipeSteps } from "@/../drizzle/schema/recipes";
import { mashingProfileCreateSchema, mashingProfileUpdateSchema } from "./schema";
import type { MashingProfile, MashStep } from "./types";

// ── Helpers ────────────────────────────────────────────────────

function mapRow(row: typeof mashingProfiles.$inferSelect): MashingProfile {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    mashingType: row.mashingType as MashingProfile["mashingType"],
    description: row.description,
    steps: (row.steps ?? []) as MashStep[],
    notes: row.notes,
    isActive: row.isActive ?? true,
    isSystem: row.tenantId === null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface MashingProfileFilter {
  isActive?: boolean;
  isSystem?: boolean;
  search?: string;
}

// ── Actions ────────────────────────────────────────────────────

/**
 * List mashing profiles: system (tenant_id IS NULL) + tenant's own.
 * Orders system profiles first (by name), then tenant profiles (by name).
 * Defaults to is_active = true.
 */
export async function getMashingProfiles(
  filter?: MashingProfileFilter
): Promise<MashingProfile[]> {
  return withTenant(async (tenantId) => {
    const conditions = [
      or(
        isNull(mashingProfiles.tenantId),
        eq(mashingProfiles.tenantId, tenantId)
      ),
    ];

    // Default to active only
    if (filter?.isActive !== false) {
      conditions.push(eq(mashingProfiles.isActive, true));
    }

    const rows = await db
      .select()
      .from(mashingProfiles)
      .where(and(...conditions))
      .orderBy(
        sql`${mashingProfiles.tenantId} IS NOT NULL`,
        asc(mashingProfiles.name)
      );

    let result = rows.map(mapRow);

    // Client-side filter for isSystem (computed field)
    if (filter?.isSystem === true) {
      result = result.filter((p) => p.isSystem);
    } else if (filter?.isSystem === false) {
      result = result.filter((p) => !p.isSystem);
    }

    return result;
  });
}

/**
 * Get a single mashing profile by ID.
 * Must be a system profile OR belong to the current tenant.
 */
export async function getMashingProfile(
  id: string
): Promise<MashingProfile | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(mashingProfiles)
      .where(
        and(
          eq(mashingProfiles.id, id),
          or(
            isNull(mashingProfiles.tenantId),
            eq(mashingProfiles.tenantId, tenantId)
          )
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapRow(row);
  });
}

/**
 * Create a new mashing profile. Always sets the current tenant_id.
 */
export async function createMashingProfile(
  data: Record<string, unknown>
): Promise<MashingProfile> {
  const parsed = mashingProfileCreateSchema.parse(data);

  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(mashingProfiles)
      .values({
        tenantId,
        name: parsed.name,
        mashingType: parsed.mashingType ?? null,
        description: parsed.description ?? null,
        steps: parsed.steps,
        notes: parsed.notes ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create mashing profile");
    return mapRow(row);
  });
}

/**
 * Update an existing mashing profile.
 * Only tenant's own profiles can be updated (system profiles are read-only).
 */
export async function updateMashingProfile(
  id: string,
  data: Record<string, unknown>
): Promise<MashingProfile> {
  const parsed = mashingProfileUpdateSchema.parse(data);

  return withTenant(async (tenantId) => {
    // Verify the profile exists and belongs to this tenant (not system)
    const existing = await db
      .select()
      .from(mashingProfiles)
      .where(eq(mashingProfiles.id, id))
      .limit(1);

    const profile = existing[0];
    if (!profile) throw new Error("Mashing profile not found");
    if (profile.tenantId === null) {
      throw new Error("SYSTEM_PROFILE_READONLY");
    }
    if (profile.tenantId !== tenantId) {
      throw new Error("Mashing profile not found");
    }

    const updateData: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (parsed.name !== undefined) updateData.name = parsed.name;
    if (parsed.mashingType !== undefined) updateData.mashingType = parsed.mashingType;
    if (parsed.description !== undefined) updateData.description = parsed.description;
    if (parsed.steps !== undefined) updateData.steps = parsed.steps;
    if (parsed.notes !== undefined) updateData.notes = parsed.notes;

    const rows = await db
      .update(mashingProfiles)
      .set(updateData)
      .where(
        and(
          eq(mashingProfiles.tenantId, tenantId),
          eq(mashingProfiles.id, id)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Mashing profile not found");
    return mapRow(row);
  });
}

/**
 * Soft delete a mashing profile (set is_active = false).
 * Only tenant's own profiles can be deleted.
 */
export async function deleteMashingProfile(
  id: string
): Promise<MashingProfile> {
  return withTenant(async (tenantId) => {
    // Verify not a system profile
    const existing = await db
      .select()
      .from(mashingProfiles)
      .where(eq(mashingProfiles.id, id))
      .limit(1);

    const profile = existing[0];
    if (!profile) throw new Error("Mashing profile not found");
    if (profile.tenantId === null) {
      throw new Error("SYSTEM_PROFILE_READONLY");
    }
    if (profile.tenantId !== tenantId) {
      throw new Error("Mashing profile not found");
    }

    const rows = await db
      .update(mashingProfiles)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(mashingProfiles.tenantId, tenantId),
          eq(mashingProfiles.id, id)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Mashing profile not found");
    return mapRow(row);
  });
}

/**
 * Duplicate any mashing profile (system or own) as a new tenant-owned profile.
 * The copy name is "{original.name} (kopie)".
 */
export async function duplicateMashingProfile(
  id: string
): Promise<MashingProfile> {
  return withTenant(async (tenantId) => {
    // Load the source profile (system or own)
    const sourceRows = await db
      .select()
      .from(mashingProfiles)
      .where(
        and(
          eq(mashingProfiles.id, id),
          or(
            isNull(mashingProfiles.tenantId),
            eq(mashingProfiles.tenantId, tenantId)
          )
        )
      )
      .limit(1);

    const source = sourceRows[0];
    if (!source) throw new Error("Mashing profile not found");

    const rows = await db
      .insert(mashingProfiles)
      .values({
        tenantId,
        name: `${source.name} (kopie)`,
        mashingType: source.mashingType,
        description: source.description,
        steps: source.steps,
        notes: source.notes,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to duplicate mashing profile");
    return mapRow(row);
  });
}

/**
 * Save mash-related steps from a recipe as a new mashing profile.
 * Only mash step types (mash_in, rest, decoction, mash_out) are included.
 */
export async function saveRecipeStepsAsProfile(
  recipeId: string,
  name: string
): Promise<MashingProfile> {
  return withTenant(async (tenantId) => {
    const mashStepTypes = ["mash_in", "rest", "decoction", "mash_out"];

    // Load mash steps from the recipe
    const stepRows = await db
      .select()
      .from(recipeSteps)
      .where(
        and(
          eq(recipeSteps.tenantId, tenantId),
          eq(recipeSteps.recipeId, recipeId),
          inArray(recipeSteps.stepType, mashStepTypes)
        )
      )
      .orderBy(asc(recipeSteps.sortOrder));

    if (stepRows.length === 0) {
      throw new Error("NO_MASH_STEPS");
    }

    // Convert recipe steps to MashStep[]
    const steps: MashStep[] = stepRows.map((step) => ({
      name: step.name,
      temperature: step.temperatureC ? parseFloat(step.temperatureC) : 0,
      time: step.timeMin ?? 0,
      type: step.stepType as MashStep["type"],
      notes: step.notes ?? undefined,
    }));

    // Create the new profile
    const rows = await db
      .insert(mashingProfiles)
      .values({
        tenantId,
        name,
        steps,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create mashing profile from recipe");
    return mapRow(row);
  });
}
