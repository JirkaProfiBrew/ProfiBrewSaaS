import {
  pgTable,
  uuid,
  text,
  boolean,
  decimal,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { shops } from "./shops";

// ============================================================
// EQUIPMENT (Cold zone vessels — fermenters, brite tanks, CKT)
// ============================================================
export const equipment = pgTable("equipment", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  shopId: uuid("shop_id").references(() => shops.id),
  name: text("name").notNull(),
  equipmentType: text("equipment_type").notNull(), // 'fermenter' | 'brite_tank' | 'conditioning'
  volumeL: decimal("volume_l"),
  status: text("status").default("available"), // 'available' | 'in_use' | 'maintenance' | 'retired'
  currentBatchId: uuid("current_batch_id"), // FK to batches added in Sprint 2
  properties: jsonb("properties").default({}),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
