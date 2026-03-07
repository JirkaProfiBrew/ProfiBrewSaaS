import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

// ============================================================
// CASHFLOW CATEGORY TEMPLATES (global — no tenant_id)
// ============================================================
export const cashflowCategoryTemplates = pgTable(
  "cashflow_category_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    cashflowType: text("cashflow_type").notNull(), // 'income' | 'expense'
    parentId: uuid("parent_id"), // self-ref, FK in migration SQL
    sortOrder: integer("sort_order").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

// ============================================================
// BILLING EVENTS (manual tracking for MVP — no Stripe)
// ============================================================
export const billingEvents = pgTable(
  "billing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: text("type").notNull(), // 'conversion_confirmed' | 'invoice_sent' | 'payment_received' | 'subscription_cancelled'
    planSlug: text("plan_slug"),
    amount: decimal("amount"),
    notes: text("notes"),
    processed: boolean("processed").default(false),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    processedBy: uuid("processed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_billing_events_tenant").on(table.tenantId),
    index("idx_billing_events_processed").on(table.processed),
  ]
);
