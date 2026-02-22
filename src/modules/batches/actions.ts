"use server";

import { eq, and, ilike, or, sql, desc, asc, aliasedTable, inArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { getNextNumber } from "@/lib/db/counters";
import {
  batches,
  batchSteps,
  batchMeasurements,
  batchNotes,
  bottlingItems,
} from "@/../drizzle/schema/batches";
import { recipes, recipeSteps } from "@/../drizzle/schema/recipes";
import { recipeItems } from "@/../drizzle/schema/recipes";
import { items } from "@/../drizzle/schema/items";
import { units } from "@/../drizzle/schema/system";
import { equipment } from "@/../drizzle/schema/equipment";
import {
  stockIssues,
  stockIssueLines,
  stockMovements,
} from "@/../drizzle/schema/stock";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { updateStockStatusRow } from "@/modules/stock-issues/lib/stock-status-sync";
import type {
  Batch,
  BatchStep,
  BatchMeasurement,
  BatchNote,
  BottlingItem,
  BatchDetail as BatchDetailType,
  BatchStatus,
  RecipeIngredient,
  BatchIngredientRow,
  ProductionIssueInfo,
} from "./types";
import { BATCH_STATUS_TRANSITIONS } from "./types";
import type { BatchCreateInput, BatchUpdateInput, BatchMeasurementInput, BottlingItemInput } from "./schema";

// ── Helpers ────────────────────────────────────────────────────

/** Map brew_phase from recipe step_type. */
function mapStepTypeToBrewPhase(stepType: string): string {
  switch (stepType) {
    case "mash_in":
    case "rest":
    case "decoction":
    case "mash_out":
      return "mashing";
    case "boil":
      return "boiling";
    case "whirlpool":
    case "cooling":
      return "post_boil";
    default:
      return "other";
  }
}

/** Map a Drizzle batches row + joined fields to a Batch type. */
function mapBatchRow(
  row: typeof batches.$inferSelect,
  joined?: {
    recipeName?: string | null;
    sourceRecipeId?: string | null;
    sourceRecipeName?: string | null;
    itemName?: string | null;
    itemCode?: string | null;
    equipmentName?: string | null;
  }
): Batch {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchNumber: row.batchNumber,
    batchSeq: row.batchSeq,
    recipeId: row.recipeId,
    itemId: row.itemId,
    status: row.status,
    brewStatus: row.brewStatus,
    plannedDate: row.plannedDate,
    brewDate: row.brewDate,
    endBrewDate: row.endBrewDate,
    actualVolumeL: row.actualVolumeL,
    ogActual: row.ogActual,
    fgActual: row.fgActual,
    abvActual: row.abvActual,
    equipmentId: row.equipmentId,
    primaryBatchId: row.primaryBatchId,
    isPaused: row.isPaused ?? false,
    notes: row.notes,
    brewerId: row.brewerId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    recipeName: joined?.recipeName ?? null,
    sourceRecipeId: joined?.sourceRecipeId ?? null,
    sourceRecipeName: joined?.sourceRecipeName ?? null,
    itemName: joined?.itemName ?? null,
    itemCode: joined?.itemCode ?? null,
    equipmentName: joined?.equipmentName ?? null,
  };
}

/** Map a Drizzle batch_steps row to a BatchStep type. */
function mapStepRow(row: typeof batchSteps.$inferSelect): BatchStep {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchId: row.batchId,
    stepType: row.stepType,
    brewPhase: row.brewPhase,
    name: row.name,
    temperatureC: row.temperatureC,
    timeMin: row.timeMin,
    pauseMin: row.pauseMin,
    autoSwitch: row.autoSwitch ?? false,
    equipmentId: row.equipmentId,
    startTimePlan: row.startTimePlan,
    startTimeReal: row.startTimeReal,
    endTimeReal: row.endTimeReal,
    sortOrder: row.sortOrder ?? 0,
  };
}

/** Map a Drizzle batch_measurements row to a BatchMeasurement type. */
function mapMeasurementRow(
  row: typeof batchMeasurements.$inferSelect
): BatchMeasurement {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchId: row.batchId,
    measurementType: row.measurementType,
    value: row.value,
    valuePlato: row.valuePlato,
    valueSg: row.valueSg,
    temperatureC: row.temperatureC,
    isStart: row.isStart ?? false,
    isEnd: row.isEnd ?? false,
    notes: row.notes,
    measuredAt: row.measuredAt,
    createdAt: row.createdAt,
  };
}

/** Map a Drizzle batch_notes row to a BatchNote type. */
function mapNoteRow(row: typeof batchNotes.$inferSelect): BatchNote {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchId: row.batchId,
    batchStepId: row.batchStepId,
    text: row.text,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/** Map a Drizzle bottling_items row + joined fields to a BottlingItem type. */
function mapBottlingRow(
  row: typeof bottlingItems.$inferSelect,
  joined?: { itemName?: string; itemCode?: string }
): BottlingItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchId: row.batchId,
    itemId: row.itemId,
    quantity: row.quantity,
    baseUnits: row.baseUnits,
    bottledAt: row.bottledAt,
    notes: row.notes,
    itemName: joined?.itemName,
    itemCode: joined?.itemCode,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface BatchFilter {
  status?: string;
  recipeId?: string;
  equipmentId?: string;
  search?: string;
}

// ── Actions ────────────────────────────────────────────────────

/** List batches with optional filters. Includes joined recipe, item, and equipment names. */
export async function getBatches(filter?: BatchFilter): Promise<Batch[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(batches.tenantId, tenantId)];

    if (filter?.status !== undefined) {
      conditions.push(eq(batches.status, filter.status));
    }
    if (filter?.recipeId !== undefined) {
      conditions.push(eq(batches.recipeId, filter.recipeId));
    }
    if (filter?.equipmentId !== undefined) {
      conditions.push(eq(batches.equipmentId, filter.equipmentId));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(batches.batchNumber, `%${filter.search}%`),
          ilike(batches.notes, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select({
        batch: batches,
        recipeName: recipes.name,
        itemName: items.name,
        itemCode: items.code,
        equipmentName: equipment.name,
      })
      .from(batches)
      .leftJoin(recipes, eq(batches.recipeId, recipes.id))
      .leftJoin(items, eq(batches.itemId, items.id))
      .leftJoin(equipment, eq(batches.equipmentId, equipment.id))
      .where(and(...conditions))
      .orderBy(desc(batches.brewDate), desc(batches.createdAt));

    return rows.map((row) =>
      mapBatchRow(row.batch, {
        recipeName: row.recipeName,
        itemName: row.itemName,
        itemCode: row.itemCode,
        equipmentName: row.equipmentName,
      })
    );
  });
}

/** Get a single batch by ID with all related data. */
export async function getBatchDetail(
  batchId: string
): Promise<BatchDetailType | null> {
  return withTenant(async (tenantId) => {
    // Alias for the source recipe (original recipe the snapshot was cloned from)
    const sourceRecipe = aliasedTable(recipes, "source_recipe");

    // Fetch batch with joins (including source recipe for snapshot info)
    const batchRows = await db
      .select({
        batch: batches,
        recipeName: recipes.name,
        sourceRecipeId: recipes.sourceRecipeId,
        sourceRecipeName: sourceRecipe.name,
        itemName: items.name,
        itemCode: items.code,
        equipmentName: equipment.name,
      })
      .from(batches)
      .leftJoin(recipes, eq(batches.recipeId, recipes.id))
      .leftJoin(sourceRecipe, eq(recipes.sourceRecipeId, sourceRecipe.id))
      .leftJoin(items, eq(batches.itemId, items.id))
      .leftJoin(equipment, eq(batches.equipmentId, equipment.id))
      .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
      .limit(1);

    const batchRow = batchRows[0];
    if (!batchRow) return null;

    // Fetch related data in parallel
    const [stepsData, measurementsData, notesData, bottlingData] =
      await Promise.all([
        db
          .select()
          .from(batchSteps)
          .where(
            and(
              eq(batchSteps.tenantId, tenantId),
              eq(batchSteps.batchId, batchId)
            )
          )
          .orderBy(asc(batchSteps.sortOrder)),

        db
          .select()
          .from(batchMeasurements)
          .where(
            and(
              eq(batchMeasurements.tenantId, tenantId),
              eq(batchMeasurements.batchId, batchId)
            )
          )
          .orderBy(asc(batchMeasurements.measuredAt)),

        db
          .select()
          .from(batchNotes)
          .where(
            and(
              eq(batchNotes.tenantId, tenantId),
              eq(batchNotes.batchId, batchId)
            )
          )
          .orderBy(desc(batchNotes.createdAt)),

        db
          .select({
            bottling: bottlingItems,
            itemName: items.name,
            itemCode: items.code,
          })
          .from(bottlingItems)
          .leftJoin(items, eq(bottlingItems.itemId, items.id))
          .where(
            and(
              eq(bottlingItems.tenantId, tenantId),
              eq(bottlingItems.batchId, batchId)
            )
          ),
      ]);

    return {
      batch: mapBatchRow(batchRow.batch, {
        recipeName: batchRow.recipeName,
        sourceRecipeId: batchRow.sourceRecipeId,
        sourceRecipeName: batchRow.sourceRecipeName,
        itemName: batchRow.itemName,
        itemCode: batchRow.itemCode,
        equipmentName: batchRow.equipmentName,
      }),
      steps: stepsData.map(mapStepRow),
      measurements: measurementsData.map(mapMeasurementRow),
      notes: notesData.map(mapNoteRow),
      bottlingItems: bottlingData.map((row) =>
        mapBottlingRow(row.bottling, {
          itemName: row.itemName ?? undefined,
          itemCode: row.itemCode ?? undefined,
        })
      ),
    };
  });
}

/** Create a new batch, optionally snapshotting the recipe (copy recipe + items + steps). */
export async function createBatch(data: BatchCreateInput): Promise<Batch> {
  return withTenant(async (tenantId) => {
    return db.transaction(async (tx) => {
      // 1. Generate batch number
      const batchNumber = await getNextNumber(tenantId, "batch");

      // 2. If recipeId provided, snapshot the recipe
      let snapshotRecipeId: string | null = null;

      if (data.recipeId) {
        // Load original recipe
        const origRows = await tx
          .select()
          .from(recipes)
          .where(
            and(eq(recipes.tenantId, tenantId), eq(recipes.id, data.recipeId))
          )
          .limit(1);

        const orig = origRows[0];
        if (!orig) throw new Error("Recipe not found");

        // Insert snapshot copy
        const snapshotRows = await tx
          .insert(recipes)
          .values({
            tenantId,
            name: orig.name,
            code: null,
            beerStyleId: orig.beerStyleId,
            status: "batch_snapshot",
            sourceRecipeId: orig.id,
            batchSizeL: orig.batchSizeL,
            batchSizeBrutoL: orig.batchSizeBrutoL,
            beerVolumeL: orig.beerVolumeL,
            og: orig.og,
            fg: orig.fg,
            abv: orig.abv,
            ibu: orig.ibu,
            ebc: orig.ebc,
            boilTimeMin: orig.boilTimeMin,
            costPrice: orig.costPrice,
            durationFermentationDays: orig.durationFermentationDays,
            durationConditioningDays: orig.durationConditioningDays,
            notes: orig.notes,
          })
          .returning();

        const snapshot = snapshotRows[0];
        if (!snapshot) throw new Error("Failed to snapshot recipe");
        snapshotRecipeId = snapshot.id;

        // Copy recipe items
        const origItems = await tx
          .select()
          .from(recipeItems)
          .where(
            and(
              eq(recipeItems.tenantId, tenantId),
              eq(recipeItems.recipeId, data.recipeId)
            )
          );

        if (origItems.length > 0) {
          await tx.insert(recipeItems).values(
            origItems.map((item) => ({
              tenantId,
              recipeId: snapshot.id,
              itemId: item.itemId,
              category: item.category,
              amountG: item.amountG,
              unitId: item.unitId,
              useStage: item.useStage,
              useTimeMin: item.useTimeMin,
              hopPhase: item.hopPhase,
              notes: item.notes,
              sortOrder: item.sortOrder,
            }))
          );
        }

        // Copy recipe steps
        const origSteps = await tx
          .select()
          .from(recipeSteps)
          .where(
            and(
              eq(recipeSteps.tenantId, tenantId),
              eq(recipeSteps.recipeId, data.recipeId)
            )
          );

        if (origSteps.length > 0) {
          await tx.insert(recipeSteps).values(
            origSteps.map((step) => ({
              tenantId,
              recipeId: snapshot.id,
              stepType: step.stepType,
              name: step.name,
              temperatureC: step.temperatureC,
              timeMin: step.timeMin,
              rampTimeMin: step.rampTimeMin,
              tempGradient: step.tempGradient,
              notes: step.notes,
              sortOrder: step.sortOrder,
            }))
          );
        }
      }

      // 3. If equipmentId provided, verify it exists for tenant
      if (data.equipmentId) {
        const equipmentRows = await tx
          .select({ id: equipment.id })
          .from(equipment)
          .where(
            and(
              eq(equipment.tenantId, tenantId),
              eq(equipment.id, data.equipmentId)
            )
          )
          .limit(1);

        if (!equipmentRows[0]) {
          throw new Error("Equipment not found");
        }
      }

      // 4. Insert batch — use snapshot recipe ID instead of original
      const insertedRows = await tx
        .insert(batches)
        .values({
          tenantId,
          batchNumber,
          recipeId: snapshotRecipeId ?? null,
          itemId: data.itemId ?? null,
          status: "planned",
          plannedDate: data.plannedDate ? new Date(data.plannedDate) : null,
          equipmentId: data.equipmentId ?? null,
          brewerId: data.brewerId ?? null,
          notes: data.notes ?? null,
        })
        .returning();

      const inserted = insertedRows[0];
      if (!inserted) throw new Error("Failed to create batch");

      // 5. Copy snapshot recipe_steps → batch_steps
      if (snapshotRecipeId) {
        const stepRows = await tx
          .select()
          .from(recipeSteps)
          .where(
            and(
              eq(recipeSteps.tenantId, tenantId),
              eq(recipeSteps.recipeId, snapshotRecipeId)
            )
          )
          .orderBy(asc(recipeSteps.sortOrder));

        if (stepRows.length > 0) {
          await tx.insert(batchSteps).values(
            stepRows.map((rs) => ({
              tenantId,
              batchId: inserted.id,
              stepType: rs.stepType,
              brewPhase: mapStepTypeToBrewPhase(rs.stepType),
              name: rs.name,
              temperatureC: rs.temperatureC,
              timeMin: rs.timeMin,
              sortOrder: rs.sortOrder ?? 0,
            }))
          );
        }
      }

      return mapBatchRow(inserted);
    });
  });
}

/** Update an existing batch. Handles equipment changes. */
export async function updateBatch(
  batchId: string,
  data: BatchUpdateInput
): Promise<Batch> {
  return withTenant(async (tenantId) => {
    return db.transaction(async (tx) => {
      // Load current batch
      const currentRows = await tx
        .select()
        .from(batches)
        .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
        .limit(1);

      const current = currentRows[0];
      if (!current) throw new Error("Batch not found");

      const activeStatuses = ["brewing", "fermenting", "conditioning", "carbonating", "packaging"];

      // Handle equipment changes
      if (data.equipmentId !== undefined && data.equipmentId !== current.equipmentId) {
        // Release old equipment if batch is actively brewing
        if (current.equipmentId && activeStatuses.includes(current.status)) {
          await tx
            .update(equipment)
            .set({
              status: "available",
              currentBatchId: null,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(equipment.tenantId, tenantId),
                eq(equipment.id, current.equipmentId)
              )
            );
        }

        // Claim new equipment if batch is actively brewing
        if (data.equipmentId && activeStatuses.includes(current.status)) {
          await tx
            .update(equipment)
            .set({
              status: "in_use",
              currentBatchId: batchId,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(equipment.tenantId, tenantId),
                eq(equipment.id, data.equipmentId)
              )
            );
        }
      }

      // Update batch
      const updatedRows = await tx
        .update(batches)
        .set({
          ...(data.itemId !== undefined ? { itemId: data.itemId } : {}),
          ...(data.plannedDate !== undefined
            ? { plannedDate: data.plannedDate ? new Date(data.plannedDate) : null }
            : {}),
          ...(data.equipmentId !== undefined
            ? { equipmentId: data.equipmentId }
            : {}),
          ...(data.brewerId !== undefined ? { brewerId: data.brewerId } : {}),
          ...(data.actualVolumeL !== undefined
            ? { actualVolumeL: data.actualVolumeL }
            : {}),
          ...(data.ogActual !== undefined ? { ogActual: data.ogActual } : {}),
          ...(data.fgActual !== undefined ? { fgActual: data.fgActual } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          updatedAt: sql`now()`,
        })
        .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
        .returning();

      const updated = updatedRows[0];
      if (!updated) throw new Error("Failed to update batch");

      return mapBatchRow(updated);
    });
  });
}

/** Soft delete batch — set status to 'dumped', add a note, release equipment. */
export async function deleteBatch(batchId: string): Promise<Batch> {
  return withTenant(async (tenantId) => {
    return db.transaction(async (tx) => {
      const currentRows = await tx
        .select()
        .from(batches)
        .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
        .limit(1);

      const current = currentRows[0];
      if (!current) throw new Error("Batch not found");

      // Release equipment if assigned
      if (current.equipmentId) {
        await tx
          .update(equipment)
          .set({
            status: "available",
            currentBatchId: null,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(equipment.tenantId, tenantId),
              eq(equipment.id, current.equipmentId)
            )
          );
      }

      // Set batch to dumped
      const updatedRows = await tx
        .update(batches)
        .set({
          status: "dumped",
          endBrewDate: current.endBrewDate ?? sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
        .returning();

      const updated = updatedRows[0];
      if (!updated) throw new Error("Failed to delete batch");

      // Add note
      await tx.insert(batchNotes).values({
        tenantId,
        batchId,
        text: "Batch dumped",
      });

      return mapBatchRow(updated);
    });
  });
}

/**
 * Transition batch status — the core workflow engine.
 * Validates transition, syncs equipment, updates dates.
 */
export async function transitionBatchStatus(
  batchId: string,
  newStatus: BatchStatus,
  note?: string
): Promise<Batch> {
  return withTenant(async (tenantId) => {
    return db.transaction(async (tx) => {
      // 1. Load current batch
      const currentRows = await tx
        .select()
        .from(batches)
        .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
        .limit(1);

      const current = currentRows[0];
      if (!current) throw new Error("Batch not found");

      const currentStatus = current.status as BatchStatus;

      // 2. Validate transition
      const allowedTransitions = BATCH_STATUS_TRANSITIONS[currentStatus] ?? [];
      if (newStatus !== "dumped" && !allowedTransitions.includes(newStatus)) {
        throw new Error(
          `Invalid transition: ${currentStatus} -> ${newStatus}`
        );
      }

      // 3. If dumped, note is required
      if (newStatus === "dumped" && !note) {
        throw new Error("A note is required when dumping a batch");
      }

      // 4. Prepare update data
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updatedAt: sql`now()`,
      };

      // 5. Equipment sync and date management
      if (newStatus === "brewing") {
        // Set brew_date if not already set
        if (!current.brewDate) {
          updateData.brewDate = sql`now()`;
        }
        // Claim equipment
        if (current.equipmentId) {
          await tx
            .update(equipment)
            .set({
              status: "in_use",
              currentBatchId: batchId,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(equipment.tenantId, tenantId),
                eq(equipment.id, current.equipmentId)
              )
            );
        }
      }

      if (newStatus === "completed" || newStatus === "dumped") {
        // Set end_brew_date if not already set
        if (!current.endBrewDate) {
          updateData.endBrewDate = sql`now()`;
        }
        // Release equipment
        if (current.equipmentId) {
          await tx
            .update(equipment)
            .set({
              status: "available",
              currentBatchId: null,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(equipment.tenantId, tenantId),
                eq(equipment.id, current.equipmentId)
              )
            );
        }
      }

      // 6. Update batch
      const updatedRows = await tx
        .update(batches)
        .set(updateData)
        .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
        .returning();

      const updated = updatedRows[0];
      if (!updated) throw new Error("Failed to transition batch status");

      // 7. If note provided, add to batch_notes
      if (note) {
        await tx.insert(batchNotes).values({
          tenantId,
          batchId,
          text: note,
        });
      }

      // 8. Auto-receipt on completion
      if (newStatus === "completed") {
        await onBatchCompleted(tx, tenantId, batchId, updated);
      }

      return mapBatchRow(updated);
    });
  });
}

// ── Batch Steps ────────────────────────────────────────────────

/** Start a batch step — set start_time_real to now. */
export async function startBatchStep(stepId: string): Promise<BatchStep> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(batchSteps)
      .set({ startTimeReal: sql`now()` })
      .where(
        and(eq(batchSteps.tenantId, tenantId), eq(batchSteps.id, stepId))
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Batch step not found");
    return mapStepRow(row);
  });
}

/** Complete a batch step — set end_time_real to now. */
export async function completeBatchStep(stepId: string): Promise<BatchStep> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(batchSteps)
      .set({ endTimeReal: sql`now()` })
      .where(
        and(eq(batchSteps.tenantId, tenantId), eq(batchSteps.id, stepId))
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Batch step not found");
    return mapStepRow(row);
  });
}

// ── Batch Measurements ─────────────────────────────────────────

/** Add a measurement to a batch. */
export async function addBatchMeasurement(
  batchId: string,
  data: BatchMeasurementInput
): Promise<BatchMeasurement> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(batchMeasurements)
      .values({
        tenantId,
        batchId,
        measurementType: data.measurementType,
        value: data.value ?? null,
        valuePlato: data.valuePlato ?? null,
        valueSg: data.valueSg ?? null,
        temperatureC: data.temperatureC ?? null,
        isStart: data.isStart ?? false,
        isEnd: data.isEnd ?? false,
        notes: data.notes ?? null,
        measuredAt: data.measuredAt ? new Date(data.measuredAt) : sql`now()`,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to add measurement");
    return mapMeasurementRow(row);
  });
}

/** Update an existing measurement. */
export async function updateBatchMeasurement(
  measurementId: string,
  data: Partial<BatchMeasurementInput>
): Promise<BatchMeasurement> {
  return withTenant(async (tenantId) => {
    const values: Record<string, unknown> = {};
    if (data.measurementType !== undefined) values.measurementType = data.measurementType;
    if (data.value !== undefined) values.value = data.value;
    if (data.valuePlato !== undefined) values.valuePlato = data.valuePlato;
    if (data.valueSg !== undefined) values.valueSg = data.valueSg;
    if (data.temperatureC !== undefined) values.temperatureC = data.temperatureC;
    if (data.isStart !== undefined) values.isStart = data.isStart;
    if (data.isEnd !== undefined) values.isEnd = data.isEnd;
    if (data.notes !== undefined) values.notes = data.notes;
    if (data.measuredAt !== undefined) values.measuredAt = data.measuredAt ? new Date(data.measuredAt) : null;
    values.updatedAt = sql`now()`;

    const rows = await db
      .update(batchMeasurements)
      .set(values)
      .where(
        and(
          eq(batchMeasurements.tenantId, tenantId),
          eq(batchMeasurements.id, measurementId)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Measurement not found");
    return mapMeasurementRow(row);
  });
}

/** Delete a measurement (physical DELETE). */
export async function deleteBatchMeasurement(
  measurementId: string
): Promise<void> {
  return withTenant(async (tenantId) => {
    await db
      .delete(batchMeasurements)
      .where(
        and(
          eq(batchMeasurements.tenantId, tenantId),
          eq(batchMeasurements.id, measurementId)
        )
      );
  });
}

// ── Batch Notes ────────────────────────────────────────────────

/** Add a note to a batch. */
export async function addBatchNote(
  batchId: string,
  text: string
): Promise<BatchNote> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(batchNotes)
      .values({
        tenantId,
        batchId,
        text,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to add note");
    return mapNoteRow(row);
  });
}

/** Delete a note (physical DELETE). */
export async function deleteBatchNote(noteId: string): Promise<void> {
  return withTenant(async (tenantId) => {
    await db
      .delete(batchNotes)
      .where(
        and(eq(batchNotes.tenantId, tenantId), eq(batchNotes.id, noteId))
      );
  });
}

// ── Bottling Items ─────────────────────────────────────────────

/** Add a bottling item to a batch. */
export async function addBottlingItem(
  batchId: string,
  data: BottlingItemInput
): Promise<BottlingItem> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(bottlingItems)
      .values({
        tenantId,
        batchId,
        itemId: data.itemId,
        quantity: data.quantity,
        baseUnits: data.baseUnits ?? null,
        bottledAt: data.bottledAt ? new Date(data.bottledAt) : sql`now()`,
        notes: data.notes ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to add bottling item");
    return mapBottlingRow(row);
  });
}

/** Update a bottling item. */
export async function updateBottlingItem(
  bottlingId: string,
  data: Partial<BottlingItemInput>
): Promise<BottlingItem> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(bottlingItems)
      .set({
        ...(data.itemId !== undefined ? { itemId: data.itemId } : {}),
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.baseUnits !== undefined ? { baseUnits: data.baseUnits } : {}),
        ...(data.bottledAt !== undefined
          ? { bottledAt: data.bottledAt ? new Date(data.bottledAt) : null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      })
      .where(
        and(
          eq(bottlingItems.tenantId, tenantId),
          eq(bottlingItems.id, bottlingId)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Bottling item not found");
    return mapBottlingRow(row);
  });
}

/** Delete a bottling item (physical DELETE). */
export async function deleteBottlingItem(bottlingId: string): Promise<void> {
  return withTenant(async (tenantId) => {
    await db
      .delete(bottlingItems)
      .where(
        and(
          eq(bottlingItems.tenantId, tenantId),
          eq(bottlingItems.id, bottlingId)
        )
      );
  });
}

// ── Recipe Ingredients (read-only for batch view) ──────────────

/** Get recipe ingredients for the batch ingredients tab. */
export async function getRecipeIngredients(
  recipeId: string
): Promise<RecipeIngredient[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        recipeItem: recipeItems,
        itemName: items.name,
        itemCode: items.code,
        unitSymbol: units.symbol,
      })
      .from(recipeItems)
      .leftJoin(items, eq(recipeItems.itemId, items.id))
      .leftJoin(units, eq(recipeItems.unitId, units.id))
      .where(
        and(
          eq(recipeItems.tenantId, tenantId),
          eq(recipeItems.recipeId, recipeId)
        )
      )
      .orderBy(asc(recipeItems.sortOrder));

    return rows.map((row) => ({
      id: row.recipeItem.id,
      itemName: row.itemName ?? "",
      itemCode: row.itemCode ?? null,
      category: row.recipeItem.category,
      amountG: row.recipeItem.amountG,
      unitSymbol: row.unitSymbol ?? null,
      useStage: row.recipeItem.useStage,
      useTimeMin: row.recipeItem.useTimeMin,
      sortOrder: row.recipeItem.sortOrder ?? 0,
    }));
  });
}

/** Get list of equipment for selects (only active equipment). */
export async function getEquipmentOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: equipment.id, name: equipment.name })
      .from(equipment)
      .where(
        and(eq(equipment.tenantId, tenantId), eq(equipment.isActive, true))
      )
      .orderBy(asc(equipment.name));

    return rows.map((row) => ({
      value: row.id,
      label: row.name,
    }));
  });
}

/** Get list of recipes for selects (only active recipes). */
export async function getRecipeOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: recipes.id, name: recipes.name })
      .from(recipes)
      .where(
        and(eq(recipes.tenantId, tenantId), eq(recipes.status, "active"))
      )
      .orderBy(asc(recipes.name));

    return rows.map((row) => ({
      value: row.id,
      label: row.name,
    }));
  });
}

/** Get list of production items for bottling selects. */
export async function getProductionItemOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: items.id, name: items.name, code: items.code })
      .from(items)
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.isActive, true),
          eq(items.isProductionItem, true)
        )
      )
      .orderBy(asc(items.name));

    return rows.map((row) => ({
      value: row.id,
      label: `${row.code} - ${row.name}`,
    }));
  });
}


// ── Production Stock Integration ───────────────────────────────

/** Transaction type alias for onBatchCompleted. */
type TxType = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Auto-receipt on batch completion.
 * Creates a confirmed stock issue receipt for the production item.
 * Runs within transitionBatchStatus's transaction.
 */
async function onBatchCompleted(
  tx: TxType,
  tenantId: string,
  batchId: string,
  batch: typeof batches.$inferSelect
): Promise<void> {
  // a. Find the first active warehouse
  const warehouseRows = await tx
    .select()
    .from(warehouses)
    .where(
      and(
        eq(warehouses.tenantId, tenantId),
        eq(warehouses.isActive, true)
      )
    )
    .orderBy(asc(warehouses.createdAt))
    .limit(1);

  const warehouse = warehouseRows[0];
  if (!warehouse) return; // No warehouse — skip auto-receipt

  // b. If the batch has an itemId (production item)
  if (!batch.itemId) return;

  // c. Load item for cost price
  const itemRows = await tx
    .select({ costPrice: items.costPrice })
    .from(items)
    .where(eq(items.id, batch.itemId))
    .limit(1);

  const item = itemRows[0];

  // d. Load recipe for batch size fallback
  let recipeBatchSizeL: string | null = null;
  if (batch.recipeId) {
    const recipeRows = await tx
      .select({ batchSizeL: recipes.batchSizeL })
      .from(recipes)
      .where(eq(recipes.id, batch.recipeId))
      .limit(1);
    recipeBatchSizeL = recipeRows[0]?.batchSizeL ?? null;
  }

  const receiptQty = batch.actualVolumeL ?? recipeBatchSizeL ?? "0";
  if (Number(receiptQty) <= 0) return; // No volume — skip

  const unitPrice = item?.costPrice ?? "0";
  const today = new Date().toISOString().split("T")[0]!;

  // e. Generate stock issue code
  const code = await getNextNumber(tenantId, "stock_issue_receipt", warehouse.id);

  // f. Create the stock issue (receipt, production_in)
  const issueRows = await tx
    .insert(stockIssues)
    .values({
      tenantId,
      code,
      movementType: "receipt",
      movementPurpose: "production_in",
      date: today,
      status: "draft",
      warehouseId: warehouse.id,
      batchId,
      notes: `Auto-receipt for batch ${batch.batchNumber}`,
    })
    .returning();

  const issue = issueRows[0];
  if (!issue) return;

  // g. Create one line
  const lineRows = await tx
    .insert(stockIssueLines)
    .values({
      tenantId,
      stockIssueId: issue.id,
      itemId: batch.itemId,
      lineNo: 1,
      requestedQty: receiptQty,
      unitPrice,
      sortOrder: 0,
    })
    .returning();

  const line = lineRows[0];
  if (!line) return;

  // h. Confirm inline — create "in" movement, set remaining_qty, update stock_status
  const requestedQtyNum = Number(receiptQty);
  const unitPriceNum = Number(unitPrice);
  const lineTotalCost = requestedQtyNum * unitPriceNum;

  await tx.insert(stockMovements).values({
    tenantId,
    itemId: batch.itemId,
    warehouseId: warehouse.id,
    movementType: "in",
    quantity: receiptQty,
    unitPrice,
    stockIssueId: issue.id,
    stockIssueLineId: line.id,
    batchId,
    isClosed: false,
    date: today,
  });

  // Update line with issued data
  await tx
    .update(stockIssueLines)
    .set({
      issuedQty: receiptQty,
      totalCost: String(lineTotalCost),
      remainingQty: receiptQty,
    })
    .where(eq(stockIssueLines.id, line.id));

  // Mark issue as confirmed
  await tx
    .update(stockIssues)
    .set({
      status: "confirmed",
      totalCost: String(lineTotalCost),
      updatedAt: sql`now()`,
    })
    .where(eq(stockIssues.id, issue.id));

  // Update stock_status
  await updateStockStatusRow(
    tx,
    tenantId,
    batch.itemId,
    warehouse.id,
    requestedQtyNum
  );
}

/**
 * Create a draft production issue (material withdrawal) for a batch.
 * Returns the created stock issue ID.
 */
export async function createProductionIssue(
  batchId: string
): Promise<{ stockIssueId: string } | { error: string }> {
  return withTenant(async (tenantId) => {
    // a. Load batch
    const batchRows = await db
      .select()
      .from(batches)
      .where(
        and(eq(batches.tenantId, tenantId), eq(batches.id, batchId))
      )
      .limit(1);

    const batch = batchRows[0];
    if (!batch) return { error: "BATCH_NOT_FOUND" };

    // b. Check recipe
    if (!batch.recipeId) return { error: "NO_RECIPE" };

    // c. Load recipe
    const recipeRows = await db
      .select({ batchSizeL: recipes.batchSizeL })
      .from(recipes)
      .where(
        and(eq(recipes.tenantId, tenantId), eq(recipes.id, batch.recipeId))
      )
      .limit(1);

    const recipe = recipeRows[0];
    if (!recipe) return { error: "NO_RECIPE" };

    // d. Load recipe items
    const recipeItemRows = await db
      .select({
        id: recipeItems.id,
        itemId: recipeItems.itemId,
        amountG: recipeItems.amountG,
        sortOrder: recipeItems.sortOrder,
      })
      .from(recipeItems)
      .where(
        and(
          eq(recipeItems.tenantId, tenantId),
          eq(recipeItems.recipeId, batch.recipeId)
        )
      )
      .orderBy(asc(recipeItems.sortOrder));

    if (recipeItemRows.length === 0) return { error: "NO_INGREDIENTS" };

    // e. Find the first active warehouse
    const warehouseRows = await db
      .select()
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenantId, tenantId),
          eq(warehouses.isActive, true)
        )
      )
      .orderBy(asc(warehouses.createdAt))
      .limit(1);

    const warehouse = warehouseRows[0];
    if (!warehouse) return { error: "NO_WAREHOUSE" };

    // f. Compute scale factor
    const recipeBatchSizeL = Number(recipe.batchSizeL ?? "0");
    const actualVolumeL = Number(batch.actualVolumeL ?? "0");
    const scaleFactor =
      recipeBatchSizeL > 0
        ? (actualVolumeL > 0 ? actualVolumeL : recipeBatchSizeL) / recipeBatchSizeL
        : 1;

    const today = new Date().toISOString().split("T")[0]!;

    // g. Generate code
    const code = await getNextNumber(tenantId, "stock_issue_dispatch", warehouse.id);

    // h. Create stock issue + lines in transaction
    const result = await db.transaction(async (tx) => {
      const issueRows = await tx
        .insert(stockIssues)
        .values({
          tenantId,
          code,
          movementType: "issue",
          movementPurpose: "production_out",
          date: today,
          status: "draft",
          warehouseId: warehouse.id,
          batchId,
          notes: `Production issue for batch ${batch.batchNumber}`,
        })
        .returning();

      const issue = issueRows[0];
      if (!issue) throw new Error("Failed to create production issue");

      // i. Create lines
      for (let i = 0; i < recipeItemRows.length; i++) {
        const ri = recipeItemRows[i]!;
        const scaledQty = Number(ri.amountG) * scaleFactor;

        await tx.insert(stockIssueLines).values({
          tenantId,
          stockIssueId: issue.id,
          itemId: ri.itemId,
          lineNo: i + 1,
          requestedQty: String(scaledQty),
          recipeItemId: ri.id,
          sortOrder: ri.sortOrder ?? i,
        });
      }

      return issue.id;
    });

    return { stockIssueId: result };
  });
}

/**
 * Create a production issue and immediately confirm it (direct issue).
 */
export async function directProductionIssue(
  batchId: string
): Promise<{ stockIssueId: string } | { error: string }> {
  // Step 1: Create the draft production issue
  const createResult = await createProductionIssue(batchId);
  if ("error" in createResult) return createResult;

  // Step 2: Confirm it
  const { confirmStockIssue } = await import("@/modules/stock-issues/actions");
  const confirmResult = await confirmStockIssue(createResult.stockIssueId);
  if (confirmResult && typeof confirmResult === "object" && "error" in confirmResult) {
    return { error: (confirmResult as { error: string }).error };
  }

  return { stockIssueId: createResult.stockIssueId };
}

/**
 * Clear existing lines on a draft stock issue and prefill from a batch's recipe.
 */
export async function prefillIssueFromBatch(
  issueId: string,
  batchId: string
): Promise<{ success: true } | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      // a. Verify issue exists and is draft
      const issueRows = await db
        .select({ status: stockIssues.status })
        .from(stockIssues)
        .where(
          and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, issueId))
        )
        .limit(1);

      if (!issueRows[0]) return { error: "NOT_FOUND" };
      if (issueRows[0].status !== "draft") return { error: "NOT_DRAFT" };

      // b. Load batch + recipe (same as createProductionIssue)
      const batchRows = await db
        .select()
        .from(batches)
        .where(
          and(eq(batches.tenantId, tenantId), eq(batches.id, batchId))
        )
        .limit(1);

      const batch = batchRows[0];
      if (!batch) return { error: "BATCH_NOT_FOUND" };
      if (!batch.recipeId) return { error: "NO_RECIPE" };

      const recipeRows = await db
        .select({ batchSizeL: recipes.batchSizeL })
        .from(recipes)
        .where(
          and(eq(recipes.tenantId, tenantId), eq(recipes.id, batch.recipeId))
        )
        .limit(1);

      const recipe = recipeRows[0];
      if (!recipe) return { error: "NO_RECIPE" };

      const recipeItemRows = await db
        .select({
          id: recipeItems.id,
          itemId: recipeItems.itemId,
          amountG: recipeItems.amountG,
          sortOrder: recipeItems.sortOrder,
        })
        .from(recipeItems)
        .where(
          and(
            eq(recipeItems.tenantId, tenantId),
            eq(recipeItems.recipeId, batch.recipeId)
          )
        )
        .orderBy(asc(recipeItems.sortOrder));

      if (recipeItemRows.length === 0) return { error: "NO_INGREDIENTS" };

      // c. Compute scale factor
      const recipeBatchSizeL = Number(recipe.batchSizeL ?? "0");
      const actualVolumeL = Number(batch.actualVolumeL ?? "0");
      const scaleFactor =
        recipeBatchSizeL > 0
          ? (actualVolumeL > 0 ? actualVolumeL : recipeBatchSizeL) / recipeBatchSizeL
          : 1;

      // d. Delete existing lines + update batchId in transaction
      await db.transaction(async (tx) => {
        // Delete existing lines
        await tx
          .delete(stockIssueLines)
          .where(
            and(
              eq(stockIssueLines.tenantId, tenantId),
              eq(stockIssueLines.stockIssueId, issueId)
            )
          );

        // Insert new lines from recipe
        for (let i = 0; i < recipeItemRows.length; i++) {
          const ri = recipeItemRows[i]!;
          const scaledQty = Number(ri.amountG) * scaleFactor;

          await tx.insert(stockIssueLines).values({
            tenantId,
            stockIssueId: issueId,
            itemId: ri.itemId,
            lineNo: i + 1,
            requestedQty: String(scaledQty),
            recipeItemId: ri.id,
            sortOrder: ri.sortOrder ?? i,
          });
        }

        // Update issue's batchId
        await tx
          .update(stockIssues)
          .set({ batchId, updatedAt: sql`now()` })
          .where(
            and(
              eq(stockIssues.tenantId, tenantId),
              eq(stockIssues.id, issueId)
            )
          );
      });

      return { success: true as const };
    } catch (err: unknown) {
      console.error("[batches] prefillIssueFromBatch failed:", err);
      return { error: "PREFILL_FAILED" };
    }
  });
}

/**
 * Get batches suitable for production issue selection.
 * Returns batches with status planned/brewing/fermenting/conditioning that have a recipe.
 */
export async function getBatchOptionsForIssue(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: batches.id,
        batchNumber: batches.batchNumber,
        recipeName: recipes.name,
      })
      .from(batches)
      .leftJoin(
        recipes,
        and(eq(recipes.id, batches.recipeId), eq(recipes.tenantId, tenantId))
      )
      .where(
        and(
          eq(batches.tenantId, tenantId),
          inArray(batches.status, [
            "planned",
            "brewing",
            "fermenting",
            "conditioning",
          ]),
          sql`${batches.recipeId} IS NOT NULL`
        )
      )
      .orderBy(desc(batches.createdAt));

    return rows.map((r) => ({
      value: r.id,
      label: `${r.batchNumber}${r.recipeName ? ` — ${r.recipeName}` : ""}`,
    }));
  });
}

/**
 * Get batch ingredients with recipe quantities, issued quantities, and missing quantities.
 */
export async function getBatchIngredients(
  batchId: string
): Promise<BatchIngredientRow[]> {
  return withTenant(async (tenantId) => {
    // a. Load batch
    const batchRows = await db
      .select({
        recipeId: batches.recipeId,
        actualVolumeL: batches.actualVolumeL,
      })
      .from(batches)
      .where(
        and(eq(batches.tenantId, tenantId), eq(batches.id, batchId))
      )
      .limit(1);

    const batch = batchRows[0];
    if (!batch?.recipeId) return [];

    // b. Load recipe for batch size
    const recipeRows = await db
      .select({ batchSizeL: recipes.batchSizeL })
      .from(recipes)
      .where(eq(recipes.id, batch.recipeId))
      .limit(1);

    const recipe = recipeRows[0];

    // c. Compute scale factor
    const recipeBatchSizeL = Number(recipe?.batchSizeL ?? "0");
    const actualVolumeL = Number(batch.actualVolumeL ?? "0");
    const scaleFactor =
      recipeBatchSizeL > 0
        ? (actualVolumeL > 0 ? actualVolumeL : recipeBatchSizeL) / recipeBatchSizeL
        : 1;

    // d. Load recipe items with item names
    const riRows = await db
      .select({
        recipeItem: recipeItems,
        itemName: items.name,
        itemCode: items.code,
        unitSymbol: units.symbol,
      })
      .from(recipeItems)
      .leftJoin(items, eq(recipeItems.itemId, items.id))
      .leftJoin(units, eq(recipeItems.unitId, units.id))
      .where(
        and(
          eq(recipeItems.tenantId, tenantId),
          eq(recipeItems.recipeId, batch.recipeId)
        )
      )
      .orderBy(asc(recipeItems.sortOrder));

    if (riRows.length === 0) return [];

    // e. Load issued quantities from confirmed production issues
    const recipeItemIds = riRows.map((r) => r.recipeItem.id);

    const issuedRows = await db
      .select({
        recipeItemId: stockIssueLines.recipeItemId,
        totalIssued: sql<string>`COALESCE(SUM(ABS(${stockIssueLines.issuedQty}::decimal)), 0)`,
      })
      .from(stockIssueLines)
      .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
      .where(
        and(
          eq(stockIssues.tenantId, tenantId),
          eq(stockIssues.batchId, batchId),
          eq(stockIssues.movementPurpose, "production_out"),
          eq(stockIssues.status, "confirmed"),
          inArray(stockIssueLines.recipeItemId, recipeItemIds)
        )
      )
      .groupBy(stockIssueLines.recipeItemId);

    // Build a map of recipeItemId -> issued qty
    const issuedMap = new Map<string, number>();
    for (const row of issuedRows) {
      if (row.recipeItemId) {
        issuedMap.set(row.recipeItemId, Number(row.totalIssued));
      }
    }

    // e2. Load lot details from confirmed production issue movements
    const lotRows = recipeItemIds.length > 0 ? await db
      .select({
        recipeItemId: stockIssueLines.recipeItemId,
        lotNumber: sql<string | null>`rl."lot_number"`,
        receiptLineId: stockMovements.receiptLineId,
        quantity: sql<string>`ABS(${stockMovements.quantity}::decimal)`,
      })
      .from(stockMovements)
      .innerJoin(stockIssueLines, eq(stockMovements.stockIssueLineId, stockIssueLines.id))
      .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
      .leftJoin(
        sql`stock_issue_lines rl`,
        sql`rl.id = ${stockMovements.receiptLineId}`
      )
      .where(
        and(
          eq(stockIssues.tenantId, tenantId),
          eq(stockIssues.batchId, batchId),
          eq(stockIssues.movementPurpose, "production_out"),
          eq(stockIssues.status, "confirmed"),
          sql`${stockMovements.quantity}::decimal < 0`,
          inArray(stockIssueLines.recipeItemId, recipeItemIds)
        )
      ) : [];

    // Build a map of recipeItemId -> lots
    const lotsMap = new Map<string, Array<{ lotNumber: string | null; quantity: number; receiptLineId: string }>>();
    for (const row of lotRows) {
      if (!row.recipeItemId || !row.receiptLineId) continue;
      const key = row.recipeItemId;
      if (!lotsMap.has(key)) lotsMap.set(key, []);
      lotsMap.get(key)!.push({
        lotNumber: row.lotNumber,
        quantity: Number(row.quantity),
        receiptLineId: row.receiptLineId,
      });
    }

    // f. Build result rows
    return riRows.map((row): BatchIngredientRow => {
      const recipeQty = Number(row.recipeItem.amountG) * scaleFactor;
      const issuedQty = issuedMap.get(row.recipeItem.id) ?? 0;
      const missingQty = Math.max(0, recipeQty - issuedQty);

      return {
        recipeItemId: row.recipeItem.id,
        itemId: row.recipeItem.itemId,
        itemName: row.itemName ?? "",
        itemCode: row.itemCode ?? null,
        category: row.recipeItem.category,
        recipeQty: String(recipeQty),
        unitSymbol: row.unitSymbol ?? null,
        useStage: row.recipeItem.useStage,
        issuedQty: String(issuedQty),
        missingQty: String(missingQty),
        lots: lotsMap.get(row.recipeItem.id) ?? [],
      };
    });
  });
}

/**
 * Get production issues linked to a batch.
 */
export async function getProductionIssues(
  batchId: string
): Promise<ProductionIssueInfo[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: stockIssues.id,
        code: stockIssues.code,
        status: stockIssues.status,
        date: stockIssues.date,
        movementPurpose: stockIssues.movementPurpose,
      })
      .from(stockIssues)
      .where(
        and(
          eq(stockIssues.tenantId, tenantId),
          eq(stockIssues.batchId, batchId)
        )
      )
      .orderBy(desc(stockIssues.createdAt));

    return rows.map((row): ProductionIssueInfo => ({
      id: row.id,
      code: row.code,
      status: row.status ?? "draft",
      date: row.date,
      movementPurpose: row.movementPurpose,
    }));
  });
}
