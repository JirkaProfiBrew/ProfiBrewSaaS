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

/** Shop settings JSONB structure for stock/pricing parameters. */
export interface ShopSettings {
  stock_mode?: "none" | "bulk" | "packaged";
  default_warehouse_raw_id?: string;
  default_warehouse_beer_id?: string;
  ingredient_pricing_mode?: "calc_price" | "avg_stock" | "last_purchase";
  beer_pricing_mode?: "fixed" | "recipe_calc" | "actual_costs";
  overhead_pct?: number;
  overhead_czk?: number;
  brew_cost_czk?: number;
  // Auto-CF from receipt
  auto_cf_from_receipt?: boolean;
  auto_cf_category_id?: string;
  auto_cf_status?: "planned" | "pending";
}
