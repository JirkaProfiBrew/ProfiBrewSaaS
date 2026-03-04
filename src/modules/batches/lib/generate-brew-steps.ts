"use server";

import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { batchSteps } from "@/../drizzle/schema/batches";
import { recipeSteps, recipeItems } from "@/../drizzle/schema/recipes";
import { items } from "@/../drizzle/schema/items";
import { brewingSystems } from "@/../drizzle/schema/brewing-systems";
import type { HopAddition } from "../types";

// Derive the transaction type from the db instance
type TxType = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface BatchRow {
  recipeId: string | null;
  brewingSystemId: string | null;
  plannedDate: Date | null;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

/**
 * Generate brew steps when transitioning a batch to the "brewing" phase.
 * Deletes existing batch_steps, then builds the full brew day timeline from:
 *   - recipe steps (mashing)
 *   - brewing system time defaults (preparation, lautering, whirlpool, etc.)
 *   - hop additions from recipe items
 */
export async function generateBrewSteps(
  tx: TxType,
  tenantId: string,
  batchId: string,
  batch: BatchRow
): Promise<void> {
  // 1. Delete existing batch_steps for this batch
  await tx
    .delete(batchSteps)
    .where(
      and(eq(batchSteps.tenantId, tenantId), eq(batchSteps.batchId, batchId))
    );

  if (!batch.recipeId) return;

  // 2. Load mashing steps from recipe_steps
  const mashStepTypes = ["mash_in", "rest", "heat", "decoction", "mash_out"];
  const recipeStepRows = await tx
    .select()
    .from(recipeSteps)
    .where(
      and(
        eq(recipeSteps.tenantId, tenantId),
        eq(recipeSteps.recipeId, batch.recipeId),
        inArray(recipeSteps.stepType, mashStepTypes)
      )
    )
    .orderBy(asc(recipeSteps.sortOrder));

  // 3. Load brewing system
  const system = batch.brewingSystemId
    ? ((
        await tx
          .select()
          .from(brewingSystems)
          .where(
            and(
              eq(brewingSystems.tenantId, tenantId),
              eq(brewingSystems.id, batch.brewingSystemId)
            )
          )
          .limit(1)
      )[0] ?? null)
    : null;

  // 4. Load recipe boil time
  const boilStepRows = await tx
    .select()
    .from(recipeSteps)
    .where(
      and(
        eq(recipeSteps.tenantId, tenantId),
        eq(recipeSteps.recipeId, batch.recipeId),
        eq(recipeSteps.stepType, "boil")
      )
    )
    .limit(1);
  const boilTimeMin = boilStepRows[0]?.timeMin ?? 90;

  // 5. Load hop additions from recipe_items
  const hopAdditions = await getHopAdditionsForBatch(
    tx,
    tenantId,
    batch.recipeId,
    boilTimeMin
  );

  const steps: Array<typeof batchSteps.$inferInsert> = [];
  let sortOrder = 0;
  let cumulativeMin = 0;
  const brewStart = batch.plannedDate ?? new Date();

  // 6. Preparation step (from brewing_system)
  if (system?.timePreparation) {
    steps.push({
      tenantId,
      batchId,
      sortOrder: ++sortOrder,
      stepType: "preparation",
      brewPhase: "preparation",
      name: "Příprava",
      temperatureC: "20",
      timeMin: system.timePreparation,
      rampTimeMin: 0,
      stepSource: "system",
      startTimePlan: addMinutes(brewStart, cumulativeMin),
    });
    cumulativeMin += system.timePreparation;
  }

  // 7. Mashing steps (from recipe)
  for (const rs of recipeStepRows) {
    const ramp = rs.rampTimeMin ?? 0;
    const hold = rs.timeMin ?? 0;
    steps.push({
      tenantId,
      batchId,
      sortOrder: ++sortOrder,
      stepType: rs.stepType,
      brewPhase: "mashing",
      name: rs.name,
      temperatureC: rs.temperatureC,
      timeMin: hold,
      rampTimeMin: ramp,
      stepSource: "recipe",
      autoSwitch: rs.stepType === "rest",
      startTimePlan: addMinutes(brewStart, cumulativeMin),
    });
    cumulativeMin += ramp + hold;
  }

  // 8. Post-mash steps (from brewing_system)
  const postMashSteps = [
    {
      stepType: "lautering",
      brewPhase: "boiling",
      name: "Scezování",
      tempC: "70",
      timeMin: system?.timeLautering ?? 60,
    },
    {
      stepType: "heat_to_boil",
      brewPhase: "boiling",
      name: "Ohřev na chmelovar",
      tempC: "100",
      timeMin: 30,
    },
    {
      stepType: "boil",
      brewPhase: "boiling",
      name: "Chmelovar",
      tempC: "100",
      timeMin: boilTimeMin,
    },
    {
      stepType: "whirlpool",
      brewPhase: "post_boil",
      name: "Whirlpool a chlazení",
      tempC: null as string | null,
      timeMin: system?.timeWhirlpool ?? 90,
    },
    {
      stepType: "transfer",
      brewPhase: "post_boil",
      name: "Přesun na kvašení",
      tempC: null as string | null,
      timeMin: system?.timeTransfer ?? 15,
    },
    {
      stepType: "cleanup",
      brewPhase: "post_boil",
      name: "Úklid",
      tempC: null as string | null,
      timeMin: system?.timeCleanup ?? 60,
    },
  ];

  for (const pm of postMashSteps) {
    const step: typeof batchSteps.$inferInsert = {
      tenantId,
      batchId,
      sortOrder: ++sortOrder,
      stepType: pm.stepType,
      brewPhase: pm.brewPhase,
      name: pm.name,
      temperatureC: pm.tempC,
      timeMin: pm.timeMin,
      rampTimeMin: 0,
      stepSource: "system",
      startTimePlan: addMinutes(brewStart, cumulativeMin),
    };

    // Attach hop additions to the boil step
    if (pm.stepType === "boil" && hopAdditions.length > 0) {
      step.hopAdditions = hopAdditions;
    }

    steps.push(step);
    cumulativeMin += pm.timeMin;
  }

  // 9. Bulk insert
  if (steps.length > 0) {
    await tx.insert(batchSteps).values(steps);
  }
}

/**
 * Build hop additions array from recipe items.
 * Joins recipe_items with items table to get item names.
 * category = 'hop' (per schema: 'malt' | 'hop' | 'yeast' | 'fermentable' | 'other')
 */
async function getHopAdditionsForBatch(
  tx: TxType,
  tenantId: string,
  recipeId: string,
  boilTimeMin: number
): Promise<HopAddition[]> {
  // Load hop items from recipe, joining with items table for the name
  const hopRows = await tx
    .select({
      itemName: items.name,
      amountG: recipeItems.amountG,
      useStage: recipeItems.useStage,
      useTimeMin: recipeItems.useTimeMin,
    })
    .from(recipeItems)
    .leftJoin(items, eq(recipeItems.itemId, items.id))
    .where(
      and(
        eq(recipeItems.tenantId, tenantId),
        eq(recipeItems.recipeId, recipeId),
        eq(recipeItems.category, "hop")
      )
    )
    .orderBy(asc(recipeItems.useTimeMin));

  return hopRows
    .filter((h) => h.useStage === "boil")
    .map((h) => ({
      itemName: h.itemName ?? "Hop",
      amountG: h.amountG ? Number(h.amountG) : 0,
      addAtMin: boilTimeMin - (h.useTimeMin ?? 0), // Minutes from start of boil
      actualTime: null,
      confirmed: false,
    }));
}
