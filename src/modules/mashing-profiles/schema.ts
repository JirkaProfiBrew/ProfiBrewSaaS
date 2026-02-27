/**
 * Mashing Profiles module — Zod validation schemas.
 */

import { z } from "zod";

// ── MashStep schema ──────────────────────────────────────────

export const mashStepSchema = z.object({
  name: z.string().min(1, "Step name is required"),
  temperature: z.number().min(0, "Temperature must be non-negative"),
  time: z.number().min(0, "Time must be non-negative"),
  type: z.enum(["mash_in", "rest", "decoction", "mash_out"]),
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
