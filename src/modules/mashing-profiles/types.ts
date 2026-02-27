/**
 * Mashing Profiles module — type definitions.
 */

export type MashingType = "infusion" | "decoction" | "step";

export type MashStepType = "mash_in" | "rest" | "decoction" | "mash_out";

export interface MashStep {
  name: string;
  temperature: number; // °C
  time: number; // minutes
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
