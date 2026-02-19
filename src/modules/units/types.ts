/**
 * Units module — type definitions.
 * Represents units of measurement (system and tenant-scoped).
 */

export interface Unit {
  id: string;
  code: string;
  nameCs: string;
  nameEn: string;
  symbol: string;
  category: "weight" | "volume" | "count";
  baseUnitCode: string | null;
  toBaseFactor: number;
  isSystem: boolean;
}

/** Which unit codes are allowed per material type */
export const ALLOWED_UNITS: Record<string, string[]> = {
  malt: ["kg"],
  grain: ["kg"],
  hop: ["kg", "g"],
  yeast: ["g", "ks"],
  adjunct: ["kg", "g", "l", "ml"],
  other: ["kg", "g", "l", "ml", "ks"],
};

/** Which material types have a separate recipe unit */
export const HAS_RECIPE_UNIT: string[] = ["hop"];
