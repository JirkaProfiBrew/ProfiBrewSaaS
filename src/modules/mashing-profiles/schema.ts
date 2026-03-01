/**
 * Mashing Profiles module — Zod validation schemas.
 */

import { z } from "zod";

// ── MashStep schema ──────────────────────────────────────────

export const mashStepSchema = z.object({
  name: z.string().min(1, "Step name is required"),
  stepType: z.enum(["mash_in", "rest", "heat", "decoction", "mash_out"]),
  targetTemperatureC: z.number().min(0, "Temperature must be non-negative"),
  rampTimeMin: z.number().min(0, "Ramp time must be non-negative"),
  holdTimeMin: z.number().min(0, "Hold time must be non-negative"),
  notes: z.string().optional(),
});

// ── Create schema ────────────────────────────────────────────

export const mashingProfileCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  mashingType: z.enum(["infusion", "decoction", "step"]).nullable().optional(),
  description: z.string().nullable().optional(),
  steps: z.array(mashStepSchema).min(1, "At least one step is required"),
  notes: z.string().nullable().optional(),
});

// ── Update schema ────────────────────────────────────────────

export const mashingProfileUpdateSchema = mashingProfileCreateSchema.partial();

// ── Inferred types ───────────────────────────────────────────

export type MashingProfileCreateInput = z.infer<typeof mashingProfileCreateSchema>;
export type MashingProfileUpdateInput = z.infer<typeof mashingProfileUpdateSchema>;
