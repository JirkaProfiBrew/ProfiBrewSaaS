/**
 * Excise module — Zod validation schemas for form inputs.
 */

import { z } from "zod";

export const exciseMovementSchema = z.object({
  movementType: z.enum([
    "production",
    "release",
    "loss",
    "destruction",
    "transfer_in",
    "transfer_out",
    "adjustment",
  ]),
  volumeHl: z.string().min(1),
  date: z.string().min(1),
  warehouseId: z.string().min(1),
  direction: z.enum(["in", "out"]),
  plato: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  batchId: z.string().optional().nullable(),
});

export const generateReportSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

export type ExciseMovementFormValues = z.infer<typeof exciseMovementSchema>;
export type GenerateReportFormValues = z.infer<typeof generateReportSchema>;
