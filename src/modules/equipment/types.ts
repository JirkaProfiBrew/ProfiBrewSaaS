/**
 * Equipment module — type definitions.
 * Matches the DB schema in drizzle/schema/equipment.ts.
 * Drizzle decimal columns return strings — volumeL is string | null.
 */

export type EquipmentType =
  | "brewhouse"
  | "fermenter"
  | "brite_tank"
  | "conditioning"
  | "bottling_line"
  | "keg_washer";

export type EquipmentStatus =
  | "available"
  | "in_use"
  | "maintenance"
  | "retired";

export interface Equipment {
  id: string;
  tenantId: string;
  shopId: string | null;
  name: string;
  equipmentType: string;
  volumeL: string | null;
  status: string;
  currentBatchId: string | null;
  properties: Record<string, unknown>;
  notes: string | null;
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type EquipmentCreate = Omit<
  Equipment,
  "id" | "tenantId" | "createdAt" | "updatedAt" | "currentBatchId"
>;

export type EquipmentUpdate = Partial<EquipmentCreate> & { id: string };
