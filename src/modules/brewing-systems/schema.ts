import { z } from "zod";

export const brewingSystemCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().nullable().optional(),
  isPrimary: z.boolean().optional().default(false),
  batchSizeL: z.string().min(1, "Batch size is required"),
  efficiencyPct: z.string().optional().default("75"),
  shopId: z.string().uuid().nullable().optional(),
  kettleVolumeL: z.string().nullable().optional(),
  evaporationRatePctPerHour: z.string().nullable().optional(),
  kettleTrubLossL: z.string().nullable().optional(),
  whirlpoolLossPct: z.string().nullable().optional(),
  fermenterVolumeL: z.string().nullable().optional(),
  fermentationLossPct: z.string().nullable().optional(),
  extractEstimate: z.string().nullable().optional(),
  waterPerKgMalt: z.string().nullable().optional(),
  grainAbsorptionLPerKg: z.string().nullable().optional(),
  waterReserveL: z.string().nullable().optional(),
  timePreparation: z.number().int().nullable().optional(),
  timeLautering: z.number().int().nullable().optional(),
  timeWhirlpool: z.number().int().nullable().optional(),
  timeTransfer: z.number().int().nullable().optional(),
  timeCleanup: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

export const brewingSystemUpdateSchema = brewingSystemCreateSchema
  .partial()
  .extend({
    id: z.string().uuid(),
  });

export type BrewingSystemCreateInput = z.infer<typeof brewingSystemCreateSchema>;
export type BrewingSystemUpdateInput = z.infer<typeof brewingSystemUpdateSchema>;
