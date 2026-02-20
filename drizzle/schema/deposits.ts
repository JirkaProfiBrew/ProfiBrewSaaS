import {
  pgTable,
  uuid,
  text,
  boolean,
  decimal,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ============================================================
// DEPOSITS (Keg deposits and packaging deposits)
// ============================================================
export const deposits = pgTable(
  "deposits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(), // 'Keg 30L', 'Keg 50L', 'Přepravka'
    depositAmount: decimal("deposit_amount").notNull(), // Výše zálohy (Kč)
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("idx_deposits_tenant").on(table.tenantId)]
);
