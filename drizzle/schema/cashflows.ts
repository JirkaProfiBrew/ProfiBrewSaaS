import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { partners } from "./partners";
import { shops } from "./shops";

// ============================================================
// CASHFLOW CATEGORIES (hierarchical — income / expense)
// ============================================================
export const cashflowCategories = pgTable(
  "cashflow_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    // Self-reference for hierarchy — no .references() to avoid circular dep;
    // FK constraint is enforced in migration SQL
    parentId: uuid("parent_id"),
    cashflowType: text("cashflow_type").notNull(), // 'income' | 'expense'
    isSystem: boolean("is_system").default(false),
    sortOrder: integer("sort_order").default(0),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_cf_categories_tenant").on(table.tenantId),
    index("idx_cf_categories_parent").on(table.parentId),
  ]
);

// ============================================================
// CASHFLOWS (individual cash flow records)
// ============================================================
export const cashflows = pgTable(
  "cashflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code"), // CF-2026-001
    cashflowType: text("cashflow_type").notNull(), // 'income' | 'expense'
    categoryId: uuid("category_id").references(() => cashflowCategories.id),
    amount: decimal("amount").notNull(),
    currency: text("currency").default("CZK"),
    date: date("date").notNull(),
    dueDate: date("due_date"),
    paidDate: date("paid_date"),
    status: text("status").default("planned"), // 'planned' | 'pending' | 'paid' | 'cancelled'
    partnerId: uuid("partner_id").references(() => partners.id),
    orderId: uuid("order_id"), // NO FK — orders table may be separate
    stockIssueId: uuid("stock_issue_id"), // NO FK — stock_issues referenced but no explicit FK
    shopId: uuid("shop_id").references(() => shops.id),
    description: text("description"),
    notes: text("notes"),
    isCash: boolean("is_cash").default(false),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_cashflows_tenant").on(table.tenantId),
    index("idx_cashflows_type").on(table.tenantId, table.cashflowType),
    index("idx_cashflows_status").on(table.tenantId, table.status),
    index("idx_cashflows_date").on(table.tenantId, table.date),
    index("idx_cashflows_partner").on(table.partnerId),
  ]
);

// ============================================================
// CASHFLOW TEMPLATES (recurring cashflow definitions)
// ============================================================
export const cashflowTemplates = pgTable(
  "cashflow_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    cashflowType: text("cashflow_type").notNull(), // 'income' | 'expense'
    categoryId: uuid("category_id").references(() => cashflowCategories.id),
    amount: decimal("amount").notNull(),
    description: text("description"),
    partnerId: uuid("partner_id").references(() => partners.id),
    frequency: text("frequency").notNull(), // 'weekly' | 'monthly' | 'quarterly' | 'yearly'
    dayOfMonth: integer("day_of_month"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    nextDate: date("next_date").notNull(),
    isActive: boolean("is_active").default(true),
    lastGenerated: date("last_generated"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_cf_templates_tenant").on(table.tenantId),
  ]
);

// ============================================================
// CASH DESKS (physical cash registers tied to a shop)
// ============================================================
export const cashDesks = pgTable(
  "cash_desks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    shopId: uuid("shop_id")
      .notNull()
      .references(() => shops.id),
    currentBalance: decimal("current_balance").default("0"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_cash_desks_tenant").on(table.tenantId),
  ]
);
