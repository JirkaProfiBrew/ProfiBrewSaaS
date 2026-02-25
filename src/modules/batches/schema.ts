/**
 * Batches module — Zod validation schemas.
 */

import { z } from "zod";

/** Schema for creating a new batch. Only recipeId is meaningful at create time. */
export const batchCreateSchema = z.object({
  recipeId: z.string().uuid().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
  plannedDate: z.string().nullable().optional(), // ISO date string
  equipmentId: z.string().uuid().nullable().optional(),
  brewerId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type BatchCreateInput = z.infer<typeof batchCreateSchema>;

/** Schema for updating an existing batch. */
export const batchUpdateSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  plannedDate: z.string().nullable().optional(),
  equipmentId: z.string().uuid().nullable().optional(),
  brewerId: z.string().uuid().nullable().optional(),
  actualVolumeL: z.string().nullable().optional(),
  ogActual: z.string().nullable().optional(),
  fgActual: z.string().nullable().optional(),
  packagingLossL: z.string().nullable().optional(),
  lotNumber: z.string().nullable().optional(),
  bottledDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export type BatchUpdateInput = z.infer<typeof batchUpdateSchema>;

/** Schema for adding a measurement to a batch. */
export const batchMeasurementSchema = z.object({
  measurementType: z.string().min(1),
  value: z.string().nullable().optional(),
  valuePlato: z.string().nullable().optional(),
  valueSg: z.string().nullable().optional(),
  temperatureC: z.string().nullable().optional(),
  isStart: z.boolean().optional().default(false),
  isEnd: z.boolean().optional().default(false),
  notes: z.string().nullable().optional(),
  measuredAt: z.string().optional(), // ISO string
});

export type BatchMeasurementInput = z.infer<typeof batchMeasurementSchema>;

/** Schema for adding a bottling item to a batch. */
export const bottlingItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().positive(),
  baseUnits: z.string().nullable().optional(),
  bottledAt: z.string().optional(), // ISO string
  notes: z.string().nullable().optional(),
});

export type BottlingItemInput = z.infer<typeof bottlingItemSchema>;
