/**
 * Equipment module — Zod validation schemas.
 */

import { z } from "zod";

/** Schema for creating new equipment. Name and equipmentType are required. */
export const equipmentCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  equipmentType: z.string().min(1, "Equipment type is required"),
  volumeL: z.string().nullable().optional(),
  shopId: z.string().uuid().nullable().optional(),
  status: z.string().optional().default("available"),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

/** Schema for updating existing equipment. All fields optional except id. */
export const equipmentUpdateSchema = equipmentCreateSchema
  .partial()
  .extend({
    id: z.string().uuid(),
  });

export type EquipmentCreateInput = z.infer<typeof equipmentCreateSchema>;
export type EquipmentUpdateInput = z.infer<typeof equipmentUpdateSchema>;
