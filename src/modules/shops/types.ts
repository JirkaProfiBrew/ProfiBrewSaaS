/**
 * Shops module — type definitions.
 * Matches the DB schema in drizzle/schema/shops.ts.
 */

export interface ShopAddress {
  street?: string;
  city?: string;
  zip?: string;
  country?: string;
}

export interface Shop {
  id: string;
  tenantId: string;
  name: string;
  shopType: string;
  address: ShopAddress | null;
  isDefault: boolean;
  isActive: boolean;
  settings: Record<string, unknown>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type ShopCreate = Omit<
  Shop,
  "id" | "tenantId" | "createdAt" | "updatedAt"
>;

export type ShopUpdate = Partial<ShopCreate> & { id: string };

export type ShopType = "brewery" | "taproom" | "warehouse" | "office";
