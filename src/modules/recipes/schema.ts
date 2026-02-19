/**
 * Recipes module — Zod validation schemas.
 */

import { z } from "zod";

/** Schema for creating a new recipe. Name is required. */
export const recipeCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  beerStyleId: z.string().uuid().nullable().optional(),
  status: z.string().optional().default("draft"),
  batchSizeL: z.string().nullable().optional(),
  batchSizeBrutoL: z.string().nullable().optional(),
  beerVolumeL: z.string().nullable().optional(),
  boilTimeMin: z.number().int().min(0).nullable().optional(),
  durationFermentationDays: z.number().int().min(0).nullable().optional(),
  durationConditioningDays: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** Schema for creating a recipe ingredient line. */
export const recipeItemCreateSchema = z.object({
  itemId: z.string().min(1, "Item is required"),
  category: z.string().min(1, "Category is required"),
  amountG: z.string().min(1, "Amount is required"),
  unitId: z.string().nullable().optional(),
  useStage: z.string().nullable().optional(),
  useTimeMin: z.number().int().min(0).nullable().optional(),
  hopPhase: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** Schema for creating a recipe process step. */
export const recipeStepCreateSchema = z.object({
  stepType: z.string().min(1, "Step type is required"),
  name: z.string().min(1, "Name is required"),
  temperatureC: z.string().nullable().optional(),
  timeMin: z.number().int().min(0).nullable().optional(),
  rampTimeMin: z.number().int().min(0).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;
export type RecipeItemCreateInput = z.infer<typeof recipeItemCreateSchema>;
export type RecipeStepCreateInput = z.infer<typeof recipeStepCreateSchema>;
