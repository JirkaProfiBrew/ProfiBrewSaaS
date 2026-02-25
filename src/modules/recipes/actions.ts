"use server";

import { eq, and, ilike, or, sql, desc, asc, inArray, isNull, max, aliasedTable } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import {
  recipes,
  recipeItems,
  recipeSteps,
  recipeCalculations,
  mashingProfiles,
} from "@/../drizzle/schema/recipes";
import { beerStyles, beerStyleGroups } from "@/../drizzle/schema/beer-styles";
import { items } from "@/../drizzle/schema/items";
import { units } from "@/../drizzle/schema/system";
import { batches } from "@/../drizzle/schema/batches";
import { equipment } from "@/../drizzle/schema/equipment";
import { shops } from "@/../drizzle/schema/shops";
import { recipeCreateSchema, recipeItemCreateSchema, recipeStepCreateSchema } from "./schema";
import { calculateAll } from "./utils";
import type { IngredientInput, OverheadInputs } from "./utils";
import { resolveIngredientPrices } from "./price-resolver";
import { getDefaultShopSettings } from "@/modules/shops/actions";
import type { ShopSettings } from "@/modules/shops/types";
import type {
  Recipe,
  RecipeItem,
  RecipeStep,
  RecipeDetailData,
  BeerStyle,
  MashingProfile,
  RecipeCalculationResult,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────

/** Map a Drizzle recipe row (with optional joined style name) to a Recipe type. */
function mapRecipeRow(
  row: typeof recipes.$inferSelect,
  beerStyleName?: string | null
): Recipe {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    beerStyleId: row.beerStyleId,
    status: row.status ?? "draft",
    batchSizeL: row.batchSizeL,
    batchSizeBrutoL: row.batchSizeBrutoL,
    beerVolumeL: row.beerVolumeL,
    og: row.og,
    fg: row.fg,
    abv: row.abv,
    ibu: row.ibu,
    ebc: row.ebc,
    boilTimeMin: row.boilTimeMin,
    costPrice: row.costPrice,
    durationFermentationDays: row.durationFermentationDays,
    durationConditioningDays: row.durationConditioningDays,
    shelfLifeDays: row.shelfLifeDays,
    notes: row.notes,
    itemId: row.itemId,
    isFromLibrary: row.isFromLibrary ?? false,
    sourceRecipeId: row.sourceRecipeId ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    beerStyleName: beerStyleName ?? null,
  };
}

/** Map a Drizzle recipe_items row (with optional joined item fields) to a RecipeItem type. */
function mapRecipeItemRow(
  row: typeof recipeItems.$inferSelect,
  itemRow?: {
    name: string;
    code: string;
    brand: string | null;
    alpha: string | null;
    ebc: string | null;
    extractPercent: string | null;
    costPrice: string | null;
  } | null,
  unitRow?: {
    symbol: string;
    code: string;
    toBaseFactor: string | null;
  } | null
): RecipeItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    recipeId: row.recipeId,
    itemId: row.itemId,
    category: row.category,
    amountG: row.amountG,
    unitId: row.unitId,
    useStage: row.useStage,
    useTimeMin: row.useTimeMin,
    hopPhase: row.hopPhase,
    notes: row.notes,
    sortOrder: row.sortOrder ?? 0,
    itemName: itemRow?.name,
    itemCode: itemRow?.code,
    itemBrand: itemRow?.brand ?? null,
    itemAlpha: itemRow?.alpha ?? null,
    itemEbc: itemRow?.ebc ?? null,
    itemExtractPercent: itemRow?.extractPercent ?? null,
    itemCostPrice: itemRow?.costPrice ?? null,
    unitSymbol: unitRow?.symbol ?? null,
    unitCode: unitRow?.code ?? null,
    unitToBaseFactor: unitRow?.toBaseFactor ? parseFloat(unitRow.toBaseFactor) : null,
  };
}

/** Map a Drizzle recipe_steps row to a RecipeStep type. */
function mapRecipeStepRow(row: typeof recipeSteps.$inferSelect): RecipeStep {
  return {
    id: row.id,
    tenantId: row.tenantId,
    recipeId: row.recipeId,
    mashProfileId: row.mashProfileId,
    stepType: row.stepType,
    name: row.name,
    temperatureC: row.temperatureC,
    timeMin: row.timeMin,
    rampTimeMin: row.rampTimeMin,
    tempGradient: row.tempGradient,
    notes: row.notes,
    sortOrder: row.sortOrder ?? 0,
  };
}

// ── Filter interface ───────────────────────────────────────────

export interface RecipeFilter {
  status?: string;
  search?: string;
  beerStyleId?: string;
}

// ── Recipe CRUD ────────────────────────────────────────────────

/** List recipes with optional filters, JOIN beer_styles for style name. */
export async function getRecipes(filter?: RecipeFilter): Promise<Recipe[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        recipe: recipes,
        styleName: beerStyles.name,
      })
      .from(recipes)
      .leftJoin(beerStyles, eq(recipes.beerStyleId, beerStyles.id))
      .where(
        and(
          eq(recipes.tenantId, tenantId),
          // Always exclude batch snapshots from the recipe list
          sql`${recipes.status} != 'batch_snapshot'`,
          // Filter by status if provided, otherwise exclude archived
          filter?.status
            ? eq(recipes.status, filter.status)
            : undefined,
          // Search filter
          filter?.search
            ? or(
                ilike(recipes.name, `%${filter.search}%`),
                ilike(recipes.code, `%${filter.search}%`),
                ilike(beerStyles.name, `%${filter.search}%`)
              )
            : undefined,
          // Beer style filter
          filter?.beerStyleId
            ? eq(recipes.beerStyleId, filter.beerStyleId)
            : undefined
        )
      )
      .orderBy(asc(recipes.name));

    return rows.map((row) => mapRecipeRow(row.recipe, row.styleName));
  });
}

/** Get full recipe detail: recipe + items (JOIN items) + steps. */
export async function getRecipeDetail(
  recipeId: string
): Promise<RecipeDetailData | null> {
  return withTenant(async (tenantId) => {
    // Load recipe with style name
    const recipeRows = await db
      .select({
        recipe: recipes,
        styleName: beerStyles.name,
      })
      .from(recipes)
      .leftJoin(beerStyles, eq(recipes.beerStyleId, beerStyles.id))
      .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)))
      .limit(1);

    const recipeRow = recipeRows[0];
    if (!recipeRow) return null;

    // Load recipe items with joined item + unit data
    const itemRows = await db
      .select({
        recipeItem: recipeItems,
        itemName: items.name,
        itemCode: items.code,
        itemBrand: items.brand,
        itemAlpha: items.alpha,
        itemEbc: items.ebc,
        itemExtractPercent: items.extractPercent,
        itemCostPrice: items.costPrice,
        unitSymbol: units.symbol,
        unitCode: units.code,
        unitToBaseFactor: units.toBaseFactor,
      })
      .from(recipeItems)
      .innerJoin(items, eq(recipeItems.itemId, items.id))
      .leftJoin(units, eq(recipeItems.unitId, units.id))
      .where(
        and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.recipeId, recipeId))
      )
      .orderBy(asc(recipeItems.sortOrder));

    // Load recipe steps
    const stepRows = await db
      .select()
      .from(recipeSteps)
      .where(
        and(eq(recipeSteps.tenantId, tenantId), eq(recipeSteps.recipeId, recipeId))
      )
      .orderBy(asc(recipeSteps.sortOrder));

    return {
      recipe: mapRecipeRow(recipeRow.recipe, recipeRow.styleName),
      items: itemRows.map((row) =>
        mapRecipeItemRow(
          row.recipeItem,
          {
            name: row.itemName,
            code: row.itemCode,
            brand: row.itemBrand,
            alpha: row.itemAlpha,
            ebc: row.itemEbc,
            extractPercent: row.itemExtractPercent,
            costPrice: row.itemCostPrice,
          },
          row.unitSymbol
            ? {
                symbol: row.unitSymbol,
                code: row.unitCode ?? "",
                toBaseFactor: row.unitToBaseFactor,
              }
            : null
        )
      ),
      steps: stepRows.map(mapRecipeStepRow),
    };
  });
}

/** Get recipes linked to a production item. */
export async function getRecipesByItemId(itemId: string): Promise<Recipe[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(recipes)
      .where(
        and(
          eq(recipes.tenantId, tenantId),
          eq(recipes.itemId, itemId),
          sql`${recipes.status} != 'batch_snapshot'`
        )
      )
      .orderBy(asc(recipes.name));

    return rows.map((r) => mapRecipeRow(r));
  });
}

/** Create a new recipe. */
export async function createRecipe(
  data: Record<string, unknown>
): Promise<Recipe> {
  const parsed = recipeCreateSchema.parse(data);

  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(recipes)
      .values({
        tenantId,
        name: parsed.name,
        beerStyleId: parsed.beerStyleId ?? null,
        status: parsed.status ?? "draft",
        batchSizeL: parsed.batchSizeL ?? null,
        batchSizeBrutoL: parsed.batchSizeBrutoL ?? null,
        beerVolumeL: parsed.beerVolumeL ?? null,
        boilTimeMin: parsed.boilTimeMin ?? null,
        durationFermentationDays: parsed.durationFermentationDays ?? null,
        durationConditioningDays: parsed.durationConditioningDays ?? null,
        shelfLifeDays: parsed.shelfLifeDays ?? null,
        notes: parsed.notes ?? null,
        itemId: parsed.itemId ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create recipe");
    return mapRecipeRow(row);
  });
}

/** Update an existing recipe. */
export async function updateRecipe(
  recipeId: string,
  data: Record<string, unknown>
): Promise<Recipe> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(recipes)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Recipe not found");
    return mapRecipeRow(row);
  });
}

/** Soft delete recipe (set status = 'archived'). */
export async function deleteRecipe(recipeId: string): Promise<Recipe> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(recipes)
      .set({
        status: "archived",
        updatedAt: sql`now()`,
      })
      .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Recipe not found");
    return mapRecipeRow(row);
  });
}

/** Permanently delete a recipe. Fails if any batch references it. */
export async function permanentDeleteRecipe(recipeId: string): Promise<void> {
  return withTenant(async (tenantId) => {
    // Check if any batch references this recipe
    const batchRows = await db
      .select({ id: batches.id })
      .from(batches)
      .where(
        and(eq(batches.tenantId, tenantId), eq(batches.recipeId, recipeId))
      )
      .limit(1);

    if (batchRows.length > 0) {
      throw new Error("RECIPE_HAS_BATCHES");
    }

    // Physical delete — CASCADE handles recipe_items, recipe_steps, recipe_calculations
    const deleted = await db
      .delete(recipes)
      .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)))
      .returning({ id: recipes.id });

    if (deleted.length === 0) {
      throw new Error("Recipe not found");
    }
  });
}

/** Duplicate a recipe: copy recipe + items + steps in a transaction. */
export async function duplicateRecipe(recipeId: string): Promise<Recipe> {
  return withTenant(async (tenantId) => {
    return db.transaction(async (tx) => {
      // Load original recipe
      const origRows = await tx
        .select()
        .from(recipes)
        .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)))
        .limit(1);

      const orig = origRows[0];
      if (!orig) throw new Error("Recipe not found");

      // Insert copy
      const copyRows = await tx
        .insert(recipes)
        .values({
          tenantId,
          name: `${orig.name} (kopie)`,
          code: null, // reset code for copy
          beerStyleId: orig.beerStyleId,
          status: "draft",
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
          shelfLifeDays: orig.shelfLifeDays,
          notes: orig.notes,
          itemId: orig.itemId,
        })
        .returning();

      const copy = copyRows[0];
      if (!copy) throw new Error("Failed to duplicate recipe");

      // Copy recipe items
      const origItems = await tx
        .select()
        .from(recipeItems)
        .where(
          and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.recipeId, recipeId))
        );

      if (origItems.length > 0) {
        await tx.insert(recipeItems).values(
          origItems.map((item) => ({
            tenantId,
            recipeId: copy.id,
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
          and(eq(recipeSteps.tenantId, tenantId), eq(recipeSteps.recipeId, recipeId))
        );

      if (origSteps.length > 0) {
        await tx.insert(recipeSteps).values(
          origSteps.map((step) => ({
            tenantId,
            recipeId: copy.id,
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

      return mapRecipeRow(copy);
    });
  });
}

// ── Recipe Items (ingredients) ──────────────────────────────────

/** Add an ingredient to a recipe. */
export async function addRecipeItem(
  recipeId: string,
  data: Record<string, unknown>
): Promise<RecipeItem> {
  const parsed = recipeItemCreateSchema.parse(data);

  return withTenant(async (tenantId) => {
    // Get max sort order
    const maxOrderRows = await db
      .select({ maxOrder: max(recipeItems.sortOrder) })
      .from(recipeItems)
      .where(
        and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.recipeId, recipeId))
      );

    const nextOrder = ((maxOrderRows[0]?.maxOrder) ?? 0) + 1;

    const rows = await db
      .insert(recipeItems)
      .values({
        tenantId,
        recipeId,
        itemId: parsed.itemId,
        category: parsed.category,
        amountG: parsed.amountG,
        unitId: parsed.unitId ?? null,
        useStage: parsed.useStage ?? null,
        useTimeMin: parsed.useTimeMin ?? null,
        hopPhase: parsed.hopPhase ?? null,
        notes: parsed.notes ?? null,
        sortOrder: nextOrder,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to add recipe item");
    return mapRecipeItemRow(row);
  });
}

/** Update an existing recipe ingredient. */
export async function updateRecipeItem(
  itemId: string,
  data: Record<string, unknown>
): Promise<RecipeItem> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(recipeItems)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.id, itemId)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Recipe item not found");
    return mapRecipeItemRow(row);
  });
}

/** Remove an ingredient from a recipe (physical DELETE). */
export async function removeRecipeItem(itemId: string): Promise<void> {
  return withTenant(async (tenantId) => {
    await db
      .delete(recipeItems)
      .where(and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.id, itemId)));
  });
}

/** Reorder recipe items by updating sortOrder for each. */
export async function reorderRecipeItems(
  recipeId: string,
  itemIds: string[]
): Promise<void> {
  return withTenant(async (tenantId) => {
    for (let i = 0; i < itemIds.length; i++) {
      const id = itemIds[i];
      if (!id) continue;
      await db
        .update(recipeItems)
        .set({ sortOrder: i + 1 })
        .where(
          and(
            eq(recipeItems.tenantId, tenantId),
            eq(recipeItems.recipeId, recipeId),
            eq(recipeItems.id, id)
          )
        );
    }
  });
}

// ── Recipe Steps ────────────────────────────────────────────────

/** Add a step to a recipe. */
export async function addRecipeStep(
  recipeId: string,
  data: Record<string, unknown>
): Promise<RecipeStep> {
  const parsed = recipeStepCreateSchema.parse(data);

  return withTenant(async (tenantId) => {
    // Get max sort order
    const maxOrderRows = await db
      .select({ maxOrder: max(recipeSteps.sortOrder) })
      .from(recipeSteps)
      .where(
        and(eq(recipeSteps.tenantId, tenantId), eq(recipeSteps.recipeId, recipeId))
      );

    const nextOrder = ((maxOrderRows[0]?.maxOrder) ?? 0) + 1;

    const rows = await db
      .insert(recipeSteps)
      .values({
        tenantId,
        recipeId,
        stepType: parsed.stepType,
        name: parsed.name,
        temperatureC: parsed.temperatureC ?? null,
        timeMin: parsed.timeMin ?? null,
        rampTimeMin: parsed.rampTimeMin ?? null,
        notes: parsed.notes ?? null,
        sortOrder: nextOrder,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to add recipe step");
    return mapRecipeStepRow(row);
  });
}

/** Update an existing recipe step. */
export async function updateRecipeStep(
  stepId: string,
  data: Record<string, unknown>
): Promise<RecipeStep> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(recipeSteps)
      .set(data)
      .where(and(eq(recipeSteps.tenantId, tenantId), eq(recipeSteps.id, stepId)))
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Recipe step not found");
    return mapRecipeStepRow(row);
  });
}

/** Remove a step from a recipe (physical DELETE). */
export async function removeRecipeStep(stepId: string): Promise<void> {
  return withTenant(async (tenantId) => {
    await db
      .delete(recipeSteps)
      .where(and(eq(recipeSteps.tenantId, tenantId), eq(recipeSteps.id, stepId)));
  });
}

/** Reorder recipe steps by updating sortOrder for each. */
export async function reorderRecipeSteps(
  recipeId: string,
  stepIds: string[]
): Promise<void> {
  return withTenant(async (tenantId) => {
    for (let i = 0; i < stepIds.length; i++) {
      const id = stepIds[i];
      if (!id) continue;
      await db
        .update(recipeSteps)
        .set({ sortOrder: i + 1 })
        .where(
          and(
            eq(recipeSteps.tenantId, tenantId),
            eq(recipeSteps.recipeId, recipeId),
            eq(recipeSteps.id, id)
          )
        );
    }
  });
}

/** Apply a mashing profile: delete existing mash steps, insert from profile. */
export async function applyMashProfile(
  recipeId: string,
  profileId: string
): Promise<void> {
  return withTenant(async (tenantId) => {
    // Load the mashing profile
    const profileRows = await db
      .select()
      .from(mashingProfiles)
      .where(
        and(
          eq(mashingProfiles.id, profileId),
          or(
            isNull(mashingProfiles.tenantId),
            eq(mashingProfiles.tenantId, tenantId)
          )
        )
      )
      .limit(1);

    const profile = profileRows[0];
    if (!profile) throw new Error("Mashing profile not found");

    const mashStepTypes = ["mash_in", "rest", "decoction", "mash_out"];

    // Delete existing mash steps
    const existingSteps = await db
      .select()
      .from(recipeSteps)
      .where(
        and(
          eq(recipeSteps.tenantId, tenantId),
          eq(recipeSteps.recipeId, recipeId),
          inArray(recipeSteps.stepType, mashStepTypes)
        )
      );

    if (existingSteps.length > 0) {
      await db
        .delete(recipeSteps)
        .where(
          and(
            eq(recipeSteps.tenantId, tenantId),
            eq(recipeSteps.recipeId, recipeId),
            inArray(recipeSteps.stepType, mashStepTypes)
          )
        );
    }

    // Insert steps from the profile
    const profileSteps = (profile.steps ?? []) as Array<{
      stepType?: string;
      name?: string;
      temperatureC?: string;
      timeMin?: number;
      rampTimeMin?: number;
      notes?: string;
    }>;

    if (profileSteps.length > 0) {
      await db.insert(recipeSteps).values(
        profileSteps.map((step, idx) => ({
          tenantId,
          recipeId,
          mashProfileId: profileId,
          stepType: step.stepType ?? "rest",
          name: step.name ?? `Step ${idx + 1}`,
          temperatureC: step.temperatureC ?? null,
          timeMin: step.timeMin ?? null,
          rampTimeMin: step.rampTimeMin ?? null,
          notes: step.notes ?? null,
          sortOrder: idx + 1,
        }))
      );
    }
  });
}

// ── Calculation ─────────────────────────────────────────────────

/**
 * Resolve ShopSettings for a given recipe.
 *
 * For snapshot recipes (linked to a batch via batches.recipe_id):
 *   batch → equipment → shop → shop.settings
 *
 * For standalone recipes (no batch link):
 *   default (or first active) shop for the tenant.
 */
async function getShopSettingsForRecipe(
  tenantId: string,
  recipeId: string
): Promise<ShopSettings | null> {
  // Try to find a batch that references this recipe, then traverse equipment → shop
  const batchRow = await db
    .select({
      equipmentId: batches.equipmentId,
    })
    .from(batches)
    .where(
      and(eq(batches.tenantId, tenantId), eq(batches.recipeId, recipeId))
    )
    .limit(1);

  if (batchRow[0]?.equipmentId) {
    const equipRow = await db
      .select({ shopId: equipment.shopId })
      .from(equipment)
      .where(eq(equipment.id, batchRow[0].equipmentId))
      .limit(1);

    if (equipRow[0]?.shopId) {
      const shopRow = await db
        .select({ settings: shops.settings })
        .from(shops)
        .where(
          and(
            eq(shops.tenantId, tenantId),
            eq(shops.id, equipRow[0].shopId),
            eq(shops.isActive, true)
          )
        )
        .limit(1);

      if (shopRow[0]) {
        const parsed =
          shopRow[0].settings &&
          typeof shopRow[0].settings === "object" &&
          !Array.isArray(shopRow[0].settings)
            ? (shopRow[0].settings as ShopSettings)
            : ({} as ShopSettings);
        return parsed;
      }
    }
  }

  // Fallback: default shop for the tenant
  return getDefaultShopSettings(tenantId);
}

/** Calculate recipe parameters, save snapshot, and update recipe fields. */
export async function calculateAndSaveRecipe(
  recipeId: string
): Promise<RecipeCalculationResult> {
  return withTenant(async (tenantId) => {
    // Load recipe
    const recipeRows = await db
      .select()
      .from(recipes)
      .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)))
      .limit(1);

    const recipe = recipeRows[0];
    if (!recipe) throw new Error("Recipe not found");

    // Load items with joined item + unit data
    // Two unit joins: recipe unit (recipeItems.unitId) and stock unit (items.unitId)
    const stockUnit = aliasedTable(units, "stock_unit");
    const itemRows = await db
      .select({
        recipeItem: recipeItems,
        itemName: items.name,
        itemAlpha: items.alpha,
        itemEbc: items.ebc,
        itemExtractPercent: items.extractPercent,
        itemCostPrice: items.costPrice,
        unitToBaseFactor: units.toBaseFactor,
        stockUnitToBaseFactor: stockUnit.toBaseFactor,
        stockUnitSymbol: stockUnit.symbol,
      })
      .from(recipeItems)
      .innerJoin(items, eq(recipeItems.itemId, items.id))
      .leftJoin(units, eq(recipeItems.unitId, units.id))
      .leftJoin(stockUnit, eq(items.unitId, stockUnit.id))
      .where(
        and(eq(recipeItems.tenantId, tenantId), eq(recipeItems.recipeId, recipeId))
      );

    // Resolve shop settings via batch→equipment→shop chain (or default shop fallback)
    const shopSettings = await getShopSettingsForRecipe(tenantId, recipeId);
    const pricingMode = shopSettings?.ingredient_pricing_mode ?? "calc_price";

    console.log(
      `[calculateAndSaveRecipe] recipeId=${recipeId}, pricingMode=${pricingMode}, warehouseRawId=${shopSettings?.default_warehouse_raw_id ?? "none"}`
    );

    // Resolve ingredient prices based on pricing mode
    // For avg_stock: filter by default_warehouse_raw_id if configured
    const itemIds = itemRows.map((r) => r.recipeItem.itemId);
    const priceMap = await resolveIngredientPrices(tenantId, itemIds, pricingMode, {
      warehouseId: shopSettings?.default_warehouse_raw_id,
    });

    // Build IngredientInput[] — use resolved price with fallback to items.costPrice
    const ingredientInputs: IngredientInput[] = itemRows.map((row) => {
      const resolved = priceMap.get(row.recipeItem.itemId);
      const fallbackPrice = row.itemCostPrice ? parseFloat(row.itemCostPrice) : null;
      return {
        category: row.recipeItem.category,
        amountG: parseFloat(row.recipeItem.amountG) || 0,
        unitToBaseFactor: row.unitToBaseFactor
          ? parseFloat(row.unitToBaseFactor)
          : null,
        // Stock unit exists (join returned a row) → NULL factor = base unit = 1
        // No stock unit → null (calculateCost falls back to recipe unit factor)
        stockUnitToBaseFactor: row.stockUnitToBaseFactor
          ? parseFloat(row.stockUnitToBaseFactor)
          : (row.stockUnitSymbol != null ? 1 : null),
        alpha: row.itemAlpha ? parseFloat(row.itemAlpha) : null,
        ebc: row.itemEbc ? parseFloat(row.itemEbc) : null,
        extractPercent: row.itemExtractPercent
          ? parseFloat(row.itemExtractPercent)
          : null,
        costPrice: resolved?.price ?? fallbackPrice,
        stockUnitSymbol: row.stockUnitSymbol ?? null,
        useTimeMin: row.recipeItem.useTimeMin,
        itemId: row.recipeItem.itemId,
        recipeItemId: row.recipeItem.id,
        name: row.itemName,
      };
    });

    const volumeL = recipe.batchSizeL ? parseFloat(recipe.batchSizeL) : 0;
    const fgPlato = recipe.fg ? parseFloat(recipe.fg) : undefined;

    // Build overhead inputs from shop settings
    const overhead: OverheadInputs = {
      overheadPct: shopSettings?.overhead_pct ?? 0,
      overheadCzk: shopSettings?.overhead_czk ?? 0,
      brewCostCzk: shopSettings?.brew_cost_czk ?? 0,
    };

    const result = calculateAll(ingredientInputs, volumeL, fgPlato, overhead);

    // Enrich result with pricing mode + per-ingredient price source
    result.pricingMode = pricingMode;
    for (const ing of result.ingredients) {
      const resolved = priceMap.get(ing.itemId);
      if (resolved) {
        ing.priceSource = resolved.source;
      }
    }

    // Save calculation snapshot
    await db.insert(recipeCalculations).values({
      tenantId,
      recipeId,
      data: result,
    });

    // Update recipe with calculated values — costPrice = totalProductionCost
    await db
      .update(recipes)
      .set({
        og: String(result.og),
        fg: String(result.fg),
        abv: String(result.abv),
        ibu: String(result.ibu),
        ebc: String(result.ebc),
        costPrice: String(result.totalProductionCost),
        updatedAt: sql`now()`,
      })
      .where(and(eq(recipes.tenantId, tenantId), eq(recipes.id, recipeId)));

    return result;
  });
}

/** Get the latest recipe calculation snapshot (for UI display). */
export async function getLatestRecipeCalculation(
  recipeId: string
): Promise<RecipeCalculationResult | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ data: recipeCalculations.data })
      .from(recipeCalculations)
      .where(
        and(
          eq(recipeCalculations.tenantId, tenantId),
          eq(recipeCalculations.recipeId, recipeId)
        )
      )
      .orderBy(desc(recipeCalculations.calculatedAt))
      .limit(1);

    const row = rows[0];
    if (!row?.data) return null;

    // Safe cast — data is JSONB stored from RecipeCalculationResult
    return row.data as unknown as RecipeCalculationResult;
  });
}

// ── Brew Material Items (for ingredient selection) ──────────────

export interface BrewMaterialOption {
  id: string;
  name: string;
  code: string;
  materialType: string | null;
  unitId: string | null;
  recipeUnitId: string | null;
}

/** Get active brew material items for ingredient selection dropdown. */
export async function getBrewMaterialItems(): Promise<BrewMaterialOption[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: items.id,
        name: items.name,
        code: items.code,
        materialType: items.materialType,
        unitId: items.unitId,
        recipeUnitId: items.recipeUnitId,
      })
      .from(items)
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.isBrewMaterial, true),
          eq(items.isActive, true)
        )
      )
      .orderBy(asc(items.name));

    return rows;
  });
}

// ── Codebooks ───────────────────────────────────────────────────

/** Get all beer styles (global, no tenant filter), joined with group names. */
export async function getBeerStyles(): Promise<BeerStyle[]> {
  const rows = await db
    .select({
      style: beerStyles,
      groupName: beerStyleGroups.name,
      groupSortOrder: beerStyleGroups.sortOrder,
    })
    .from(beerStyles)
    .innerJoin(beerStyleGroups, eq(beerStyles.styleGroupId, beerStyleGroups.id))
    .orderBy(asc(beerStyleGroups.sortOrder), asc(beerStyles.name));

  return rows.map((row) => ({
    id: row.style.id,
    styleGroupId: row.style.styleGroupId,
    bjcpNumber: row.style.bjcpNumber,
    name: row.style.name,
    abvMin: row.style.abvMin,
    abvMax: row.style.abvMax,
    ibuMin: row.style.ibuMin,
    ibuMax: row.style.ibuMax,
    ebcMin: row.style.ebcMin,
    ebcMax: row.style.ebcMax,
    ogMin: row.style.ogMin,
    ogMax: row.style.ogMax,
    fgMin: row.style.fgMin,
    fgMax: row.style.fgMax,
    groupName: row.groupName,
  }));
}

/** Get mashing profiles: system (tenant_id IS NULL) + tenant's own. */
export async function getMashingProfiles(): Promise<MashingProfile[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(mashingProfiles)
      .where(
        or(
          isNull(mashingProfiles.tenantId),
          eq(mashingProfiles.tenantId, tenantId)
        )
      )
      .orderBy(asc(mashingProfiles.name));

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      steps: (row.steps ?? []) as unknown[],
      notes: row.notes,
    }));
  });
}
