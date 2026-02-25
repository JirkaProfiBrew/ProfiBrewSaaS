/**
 * Items module — Zod validation schemas.
 */

import { z } from "zod";

/** Schema for creating a new item. Only name is required. */
export const itemCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  brand: z.string().nullable().optional(),
  isBrewMaterial: z.boolean().optional().default(false),
  isProductionItem: z.boolean().optional().default(false),
  isSaleItem: z.boolean().optional().default(false),
  isExciseRelevant: z.boolean().optional().default(false),
  stockCategory: z.string().nullable().optional(),
  issueMode: z.string().optional().default("fifo"),
  unitId: z.string().uuid().nullable().optional(),
  baseUnitAmount: z.string().nullable().optional(),
  materialType: z.string().nullable().optional(),
  alpha: z.string().nullable().optional(),
  ebc: z.string().nullable().optional(),
  extractPercent: z.string().nullable().optional(),
  packagingType: z.string().nullable().optional(),
  volumeL: z.string().nullable().optional(),
  abv: z.string().nullable().optional(),
  plato: z.string().nullable().optional(),
  ean: z.string().nullable().optional(),
  costPrice: z.string().nullable().optional(),
  salePrice: z.string().nullable().optional(),
  overheadManual: z.boolean().optional().default(false),
  overheadPrice: z.string().nullable().optional(),
  packagingCost: z.string().nullable().optional(),
  fillingCost: z.string().nullable().optional(),
  posAvailable: z.boolean().optional().default(false),
  webAvailable: z.boolean().optional().default(false),
  color: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
  isFromLibrary: z.boolean().optional().default(false),
});

/** Schema for updating an existing item. All fields optional except id. */
export const itemUpdateSchema = itemCreateSchema
  .partial()
  .extend({
    id: z.string().uuid(),
  });

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemUpdateInput = z.infer<typeof itemUpdateSchema>;
