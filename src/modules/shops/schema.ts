/**
 * Shops module — Zod validation schemas.
 */

import { z } from "zod";

/** Address sub-schema for the JSONB address column. */
const addressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
}).nullable().optional();

/** Schema for creating a new shop. Name and shopType are required. */
export const shopCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  shopType: z.enum(["brewery", "taproom", "warehouse", "office"]),
  address: addressSchema,
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  settings: z.record(z.string(), z.unknown()).optional().default({}),
});

/** Schema for updating an existing shop. All fields optional except id. */
export const shopUpdateSchema = shopCreateSchema.partial().extend({
  id: z.string().uuid(),
});

export type ShopCreateInput = z.infer<typeof shopCreateSchema>;
export type ShopUpdateInput = z.infer<typeof shopUpdateSchema>;
