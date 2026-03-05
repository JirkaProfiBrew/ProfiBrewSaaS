"use server";

import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { batches, batchSteps } from "@/../drizzle/schema/batches";
import { recipes, recipeSteps, recipeItems } from "@/../drizzle/schema/recipes";
import { items } from "@/../drizzle/schema/items";
import { brewingSystems } from "@/../drizzle/schema/brewing-systems";
import { units } from "@/../drizzle/schema/system";
import type {
  HopAddition,
  BrewStepPreviewItem,
  BrewStepPreviewResult,
} from "../types";

// Derive the transaction type from the db instance
type TxType = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = typeof db | TxType;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

// ── Shared step-building logic ───────────────────────────────────

/**
 * Build the full brew day step timeline from recipe + brewing system.
 * Pure computation — no DB writes. Used by both preview and generate.
 */
async function buildBrewStepsData(
  executor: DbOrTx,
  tenantId: string,
  recipeId: string,
  brewingSystemId: string | null,
  brewStart: Date
): Promise<BrewStepPreviewItem[]> {
  // 1. Load mashing steps from recipe_steps
  const mashStepTypes = ["mash_in", "rest", "heat", "decoction", "mash_out"];
  const recipeStepRows = await executor
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

  // 2. Load brewing system
  const system = brewingSystemId
    ? ((
        await executor
          .select()
          .from(brewingSystems)
          .where(
            and(
              eq(brewingSystems.tenantId, tenantId),
              eq(brewingSystems.id, brewingSystemId)
            )
          )
          .limit(1)
      )[0] ?? null)
    : null;

  // 3. Load recipe boil time (from recipes.boilTimeMin, fallback to recipe_steps boil step)
  const recipeRow = (
    await executor
      .select({ boilTimeMin: recipes.boilTimeMin })
      .from(recipes)
      .where(eq(recipes.id, recipeId))
      .limit(1)
  )[0];

  let boilTimeMin = recipeRow?.boilTimeMin ?? null;
  if (boilTimeMin == null) {
    const boilStepRows = await executor
      .select({ timeMin: recipeSteps.timeMin })
      .from(recipeSteps)
      .where(
        and(
          eq(recipeSteps.tenantId, tenantId),
          eq(recipeSteps.recipeId, recipeId),
          eq(recipeSteps.stepType, "boil")
        )
      )
      .limit(1);
    boilTimeMin = boilStepRows[0]?.timeMin ?? 90;
  }

  // 4. Load hop additions from recipe_items (grouped by useStage)
  const hopsByStage = await loadHopAdditions(
    executor,
    tenantId,
    recipeId,
    boilTimeMin
  );

  // 4b. Load non-hop additions (malt, fermentable, other) grouped by target step
  const ingredientsByStep = await loadIngredientAdditions(executor, tenantId, recipeId);

  const steps: BrewStepPreviewItem[] = [];
  let sortOrder = 0;
  let cumulativeMin = 0;

  // 5. Preparation step — always first (time from brewing system, fallback 30 min)
  const prepTimeMin = system?.timePreparation ?? 30;
  steps.push({
    sortOrder: ++sortOrder,
    stepType: "preparation",
    brewPhase: "preparation",
    name: "Příprava",
    temperatureC: "20",
    timeMin: prepTimeMin,
    autoSwitch: false,
    startTimePlan: addMinutes(brewStart, cumulativeMin),
    hopAdditions: null,
  });
  cumulativeMin += prepTimeMin;

  // 6. Mashing steps — split into heat (ramp) + hold per recipe step
  let prevTempC = 20;
  for (const rs of recipeStepRows) {
    const targetTemp = rs.temperatureC ? Number(rs.temperatureC) : prevTempC;
    const tempDiff = Math.abs(targetTemp - prevTempC);

    // Heat step (ramp to target temperature)
    if (tempDiff > 0) {
      const rampMin =
        (rs.rampTimeMin ?? 0) > 0 ? rs.rampTimeMin! : tempDiff; // 1°C = 1 min fallback
      steps.push({
        sortOrder: ++sortOrder,
        stepType: "heat",
        brewPhase: "mashing",
        name: `Ohřev na ${targetTemp}°C`,
        temperatureC: rs.temperatureC,
        timeMin: rampMin,
        autoSwitch: true,
        startTimePlan: addMinutes(brewStart, cumulativeMin),
        hopAdditions: null,
      });
      cumulativeMin += rampMin;
    }

    // Hold step (the actual mashing rest/step)
    const holdMin = rs.timeMin ?? 0;
    if (holdMin > 0) {
      steps.push({
        sortOrder: ++sortOrder,
        stepType: rs.stepType,
        brewPhase: "mashing",
        name: rs.name,
        temperatureC: rs.temperatureC,
        timeMin: holdMin,
        autoSwitch: rs.stepType === "rest" || rs.stepType === "mash_out",
        startTimePlan: addMinutes(brewStart, cumulativeMin),
        hopAdditions: null,
      });
      cumulativeMin += holdMin;
    }

    prevTempC = targetTemp;
  }

  // 6b. Attach mash ingredients (malts + fermentables + others) to the first mashing hold step
  if (ingredientsByStep.mash.length > 0) {
    const firstHold = steps.find(
      (s) => s.brewPhase === "mashing" && s.stepType !== "heat"
    );
    if (firstHold) {
      firstHold.hopAdditions = ingredientsByStep.mash;
    }
  }

  // 6c. Attach mash hops to the last mashing hold step
  if (hopsByStage.mash.length > 0) {
    for (let i = steps.length - 1; i >= 0; i--) {
      const s = steps[i];
      if (s && s.brewPhase === "mashing" && s.stepType !== "heat") {
        s.hopAdditions = s.hopAdditions
          ? [...s.hopAdditions, ...hopsByStage.mash]
          : hopsByStage.mash;
        break;
      }
    }
  }

  // 7. Post-mash steps (from brewing_system)
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
    // Combine hop additions + ingredient additions for this step
    const parts: HopAddition[] = [];

    if (pm.stepType === "lautering") {
      parts.push(...hopsByStage.fwh);
    } else if (pm.stepType === "boil") {
      // Order: hops (by boil time), then fermentables, then others
      parts.push(...hopsByStage.boil);
      parts.push(...ingredientsByStep.boil);
    } else if (pm.stepType === "whirlpool") {
      parts.push(...hopsByStage.whirlpool);
      parts.push(...ingredientsByStep.whirlpool);
    }

    const stepHops: HopAddition[] | null = parts.length > 0 ? parts : null;

    steps.push({
      sortOrder: ++sortOrder,
      stepType: pm.stepType,
      brewPhase: pm.brewPhase,
      name: pm.name,
      temperatureC: pm.tempC,
      timeMin: pm.timeMin,
      autoSwitch: false,
      startTimePlan: addMinutes(brewStart, cumulativeMin),
      hopAdditions: stepHops,
    });
    cumulativeMin += pm.timeMin;
  }

  return steps;
}

// ── Public API ───────────────────────────────────────────────────

interface BatchRow {
  recipeId: string | null;
  brewingSystemId: string | null;
  plannedDate: Date | null;
}

/**
 * Generate brew steps when transitioning a batch to the "brewing" phase.
 * Deletes existing batch_steps, then builds and inserts the full brew day timeline.
 */
export async function generateBrewSteps(
  tx: TxType,
  tenantId: string,
  batchId: string,
  batch: BatchRow
): Promise<void> {
  // Delete existing batch_steps for this batch
  await tx
    .delete(batchSteps)
    .where(
      and(eq(batchSteps.tenantId, tenantId), eq(batchSteps.batchId, batchId))
    );

  if (!batch.recipeId) return;

  const brewStart = batch.plannedDate ?? new Date();
  const previewSteps = await buildBrewStepsData(
    tx,
    tenantId,
    batch.recipeId,
    batch.brewingSystemId,
    brewStart
  );

  if (previewSteps.length === 0) return;

  // Map preview items to DB insert rows
  const insertRows: Array<typeof batchSteps.$inferInsert> = previewSteps.map(
    (s) => ({
      tenantId,
      batchId,
      sortOrder: s.sortOrder,
      stepType: s.stepType,
      brewPhase: s.brewPhase,
      name: s.name,
      temperatureC: s.temperatureC,
      timeMin: s.timeMin,
      rampTimeMin: 0,
      stepSource: s.stepType === "heat" || ["preparation", "lautering", "heat_to_boil", "whirlpool", "transfer", "cleanup"].includes(s.stepType) ? "system" : "recipe",
      autoSwitch: s.autoSwitch,
      startTimePlan: s.startTimePlan,
      hopAdditions: s.hopAdditions,
    })
  );

  await tx.insert(batchSteps).values(insertRows);
}

/**
 * Regenerate brew steps for an existing batch in brewing phase.
 * Preserves tracking data (actual times, notes, hop confirmations) by matching step names.
 */
export async function regenerateBrewSteps(
  tenantId: string,
  batchId: string
): Promise<void> {
  const batchRows = await db
    .select({
      recipeId: batches.recipeId,
      brewingSystemId: batches.brewingSystemId,
      plannedDate: batches.plannedDate,
    })
    .from(batches)
    .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
    .limit(1);

  const batch = batchRows[0];
  if (!batch?.recipeId) return;

  await db.transaction(async (tx) => {
    // 1. Load existing steps → build name→tracking map
    const oldSteps = await tx
      .select()
      .from(batchSteps)
      .where(and(eq(batchSteps.tenantId, tenantId), eq(batchSteps.batchId, batchId)))
      .orderBy(asc(batchSteps.sortOrder));

    const trackingByName = new Map<
      string,
      {
        startTimeReal: Date | null;
        endTimeReal: Date | null;
        actualDurationMin: number | null;
        notes: string | null;
        hopAdditions: HopAddition[] | null;
      }
    >();
    for (const s of oldSteps) {
      trackingByName.set(s.name, {
        startTimeReal: s.startTimeReal,
        endTimeReal: s.endTimeReal,
        actualDurationMin: s.actualDurationMin,
        notes: s.notes,
        hopAdditions: s.hopAdditions as HopAddition[] | null,
      });
    }

    // 2. Delete old steps
    await tx
      .delete(batchSteps)
      .where(and(eq(batchSteps.tenantId, tenantId), eq(batchSteps.batchId, batchId)));

    // 3. Build fresh steps
    const brewStart = batch.plannedDate ?? new Date();
    const freshSteps = await buildBrewStepsData(
      tx,
      tenantId,
      batch.recipeId!,
      batch.brewingSystemId,
      brewStart
    );
    if (freshSteps.length === 0) return;

    // 4. Insert with preserved tracking
    const insertRows: Array<typeof batchSteps.$inferInsert> = freshSteps.map((s) => {
      const tracking = trackingByName.get(s.name);
      return {
        tenantId,
        batchId,
        sortOrder: s.sortOrder,
        stepType: s.stepType,
        brewPhase: s.brewPhase,
        name: s.name,
        temperatureC: s.temperatureC,
        timeMin: s.timeMin,
        rampTimeMin: 0,
        stepSource:
          s.stepType === "heat" ||
          ["preparation", "lautering", "heat_to_boil", "whirlpool", "transfer", "cleanup"].includes(s.stepType)
            ? "system"
            : "recipe",
        autoSwitch: s.autoSwitch,
        startTimePlan: s.startTimePlan,
        hopAdditions: s.hopAdditions,
        // Preserve tracking data if step existed before
        ...(tracking && {
          startTimeReal: tracking.startTimeReal,
          endTimeReal: tracking.endTimeReal,
          actualDurationMin: tracking.actualDurationMin,
          notes: tracking.notes,
        }),
        // Merge hop confirmations from old data
        ...(tracking?.hopAdditions && s.hopAdditions && {
          hopAdditions: s.hopAdditions.map((h, i) => {
            const oldHop = tracking.hopAdditions?.[i];
            if (oldHop?.confirmed) {
              return { ...h, confirmed: true, actualTime: oldHop.actualTime };
            }
            return h;
          }),
        }),
      };
    });

    await tx.insert(batchSteps).values(insertRows);
  });
}

/**
 * Build a brew step preview from recipe + brewing system — no DB writes.
 * Reads directly from db (not a transaction). Works from any batch phase.
 */
export async function previewBrewSteps(
  tenantId: string,
  batchId: string
): Promise<BrewStepPreviewResult> {
  const batchRows = await db
    .select({
      recipeId: batches.recipeId,
      brewingSystemId: batches.brewingSystemId,
      plannedDate: batches.plannedDate,
    })
    .from(batches)
    .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
    .limit(1);

  const batch = batchRows[0];
  if (!batch?.recipeId) {
    return { steps: [], brewStart: new Date(), brewEnd: new Date(), totalMinutes: 0 };
  }

  const brewStart = batch.plannedDate ?? new Date();
  const steps = await buildBrewStepsData(
    db,
    tenantId,
    batch.recipeId,
    batch.brewingSystemId,
    brewStart
  );

  const totalMinutes = steps.reduce((sum, s) => sum + s.timeMin, 0);
  return {
    steps,
    brewStart,
    brewEnd: addMinutes(brewStart, totalMinutes),
    totalMinutes,
  };
}

// ── Helpers ──────────────────────────────────────────────────────

/** Hop additions grouped by useStage for attachment to correct brew steps. */
interface HopsByStage {
  mash: HopAddition[];
  fwh: HopAddition[];
  boil: HopAddition[];
  whirlpool: HopAddition[];
}

/** Stages excluded from the brew day timeline. */
const SKIP_STAGES = new Set([
  "dry_hop", "dry_hop_cold", "dry_hop_warm",
  "fermentation", "conditioning", "bottling",
]);

/**
 * Load hop additions from recipe items, grouped by useStage.
 * Joins with units to convert amountG (recipe unit) → grams.
 * Excludes dry_hop/fermentation/conditioning stages.
 */
async function loadHopAdditions(
  executor: DbOrTx,
  tenantId: string,
  recipeId: string,
  boilTimeMin: number
): Promise<HopsByStage> {
  const hopRows = await executor
    .select({
      itemName: items.name,
      amountG: recipeItems.amountG,
      useStage: recipeItems.useStage,
      useTimeMin: recipeItems.useTimeMin,
      toBaseFactor: units.toBaseFactor,
      notes: recipeItems.notes,
    })
    .from(recipeItems)
    .leftJoin(items, eq(recipeItems.itemId, items.id))
    .leftJoin(units, eq(recipeItems.unitId, units.id))
    .where(
      and(
        eq(recipeItems.tenantId, tenantId),
        eq(recipeItems.recipeId, recipeId),
        eq(recipeItems.category, "hop")
      )
    )
    .orderBy(asc(recipeItems.useTimeMin));

  const result: HopsByStage = { mash: [], fwh: [], boil: [], whirlpool: [] };

  for (const h of hopRows) {
    const stage = h.useStage as string | null;
    if (!stage || SKIP_STAGES.has(stage)) continue;

    // Convert amount to grams: amountG is in recipe unit, toBaseFactor converts to kg
    const rawAmount = h.amountG ? Number(h.amountG) : 0;
    const toBase = h.toBaseFactor ? Number(h.toBaseFactor) : 0.001; // default = grams (0.001 kg)
    const amountGrams = rawAmount * toBase * 1000; // recipe unit → kg → g

    const base = {
      itemName: h.itemName ?? "Hop",
      amountG: amountGrams,
      actualTime: null,
      confirmed: false,
      recipeNotes: h.notes ?? null,
    };

    if (stage === "boil") {
      result.boil.push({ ...base, addAtMin: h.useTimeMin ?? 0 });
    } else if (stage === "mash") {
      result.mash.push({ ...base, addAtMin: h.useTimeMin ?? 0 });
    } else if (stage === "fwh") {
      result.fwh.push({ ...base, addAtMin: 0 });
    } else if (stage === "whirlpool") {
      result.whirlpool.push({ ...base, addAtMin: h.useTimeMin ?? 0 });
    }
  }

  // Sort boil hops by boil time DESC (longest boil first)
  result.boil.sort((a, b) => b.addAtMin - a.addAtMin);

  return result;
}

/** Non-hop ingredients grouped by target brew step. */
interface IngredientsByStep {
  mash: HopAddition[];
  boil: HopAddition[];
  whirlpool: HopAddition[];
}

/** useStage values that map to brew day steps for non-hop ingredients. */
const INGREDIENT_STAGE_MAP: Record<string, keyof IngredientsByStep> = {
  mash: "mash",
  boil: "boil",
  whirlpool: "whirlpool",
};

/**
 * Load non-hop ingredient additions (malt, fermentable, other) from recipe items.
 * Groups by useStage → target brew step. Skips fermentation/conditioning/bottling stages.
 * Malts without useStage default to "mash".
 */
async function loadIngredientAdditions(
  executor: DbOrTx,
  tenantId: string,
  recipeId: string
): Promise<IngredientsByStep> {
  const rows = await executor
    .select({
      itemName: items.name,
      category: recipeItems.category,
      amountG: recipeItems.amountG,
      useStage: recipeItems.useStage,
      toBaseFactor: units.toBaseFactor,
      unitCategory: units.category,
      unitSymbol: units.symbol,
      notes: recipeItems.notes,
    })
    .from(recipeItems)
    .leftJoin(items, eq(recipeItems.itemId, items.id))
    .leftJoin(units, eq(recipeItems.unitId, units.id))
    .where(
      and(
        eq(recipeItems.tenantId, tenantId),
        eq(recipeItems.recipeId, recipeId),
        inArray(recipeItems.category, ["malt", "fermentable", "other"])
      )
    )
    .orderBy(asc(recipeItems.sortOrder));

  // Group by (step, category) for proper ordering
  const grouped: Record<keyof IngredientsByStep, Record<string, HopAddition[]>> = {
    mash: {}, boil: {}, whirlpool: {},
  };

  for (const r of rows) {
    // Defaults match the UI select defaults in recipe cards:
    // malt/fermentable → "mash", other → "boil"
    const defaultStage = r.category === "other" ? "boil" : "mash";
    const stage = r.useStage ?? defaultStage;

    const target = INGREDIENT_STAGE_MAP[stage];
    if (!target) continue; // skip fermentation, conditioning, bottling, etc.

    const rawAmount = r.amountG ? Number(r.amountG) : 0;
    const isWeight = r.unitCategory === "weight" || !r.unitCategory;
    const cat = r.category ?? "other";

    if (!grouped[target][cat]) grouped[target][cat] = [];

    if (isWeight) {
      const toBase = r.toBaseFactor ? Number(r.toBaseFactor) : 0.001;
      grouped[target][cat].push({
        itemName: r.itemName ?? "Ingredient",
        amountG: rawAmount * toBase * 1000,
        addAtMin: 0,
        actualTime: null,
        confirmed: false,
        recipeNotes: r.notes ?? null,
      });
    } else {
      grouped[target][cat].push({
        itemName: r.itemName ?? "Ingredient",
        amountG: rawAmount,
        addAtMin: 0,
        actualTime: null,
        confirmed: false,
        unitSymbol: r.unitSymbol,
        recipeNotes: r.notes ?? null,
      });
    }
  }

  // Flatten with category order: malt → fermentable → other
  const CAT_ORDER = ["malt", "fermentable", "other"];
  const flatten = (g: Record<string, HopAddition[]>): HopAddition[] =>
    CAT_ORDER.flatMap((cat) => g[cat] ?? []);

  return {
    mash: flatten(grouped.mash),
    boil: flatten(grouped.boil),
    whirlpool: flatten(grouped.whirlpool),
  };
}
