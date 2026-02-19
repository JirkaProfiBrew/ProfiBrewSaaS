import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { shops } from "./shops";

// ============================================================
// WAREHOUSES (stock locations — tied to shops or standalone)
// ============================================================
export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    shopId: uuid("shop_id").references(() => shops.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    isExciseRelevant: boolean("is_excise_relevant").default(false),
    categories: text("categories").array(), // postgres text[]
    isDefault: boolean("is_default").default(false),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("warehouses_tenant_code").on(table.tenantId, table.code),
  ]
);
