/**
 * Mashing Profiles module — type definitions.
 */

export type MashingType = "infusion" | "decoction" | "step";

export type MashStepType = "mash_in" | "rest" | "heat" | "decoction" | "mash_out";

export interface MashStep {
  name: string;
  stepType: MashStepType;
  targetTemperatureC: number; // °C
  rampTimeMin: number; // minutes — time to reach target temperature
  holdTimeMin: number; // minutes — time at target temperature
  notes?: string;
}

/** Legacy MashStep shape — used for migrating old JSONB data on read */
export interface LegacyMashStep {
  name: string;
  temperature: number;
  time: number;
  type: MashStepType;
  notes?: string;
}

export interface MashingProfile {
  id: string;
  tenantId: string | null;
  name: string;
  mashingType: MashingType | null;
  description: string | null;
  steps: MashStep[];
  notes: string | null;
  isActive: boolean;
  isSystem: boolean; // computed: tenantId === null
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type CreateMashingProfileInput = {
  name: string;
  mashingType?: MashingType | null;
  description?: string | null;
  steps: MashStep[];
  notes?: string | null;
};

export type UpdateMashingProfileInput = Partial<CreateMashingProfileInput>;

// ── Mash Duration ─────────────────────────────────────────────

export interface MashDuration {
  totalMin: number;
  rampMin: number;
  holdMin: number;
  formatted: string;
}
