import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ============================================================
// SHOPS (Locations — brewery, taproom, warehouse, office)
// ============================================================
export const shops = pgTable("shops", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  shopType: text("shop_type").notNull(), // 'brewery' | 'taproom' | 'warehouse' | 'office'
  address: jsonb("address"), // { street, city, zip, country }
  isDefault: boolean("is_default").default(false),
  isActive: boolean("is_active").default(true),
  settings: jsonb("settings").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
