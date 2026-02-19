/**
 * Warehouses module — type definitions.
 * Matches the DB schema in drizzle/schema/warehouses.ts.
 */

export interface Warehouse {
  id: string;
  tenantId: string;
  shopId: string | null;
  code: string;
  name: string;
  isExciseRelevant: boolean;
  categories: string[] | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type WarehouseCreate = Omit<
  Warehouse,
  "id" | "tenantId" | "createdAt" | "updatedAt"
>;

export type WarehouseUpdate = Partial<
  Omit<WarehouseCreate, "code">
> & { id: string };

/** Available warehouse categories. */
export const WAREHOUSE_CATEGORIES = [
  "suroviny",
  "pivo",
  "obaly",
  "sluzby",
  "ostatni",
] as const;

export type WarehouseCategory = (typeof WAREHOUSE_CATEGORIES)[number];
