import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const savedViews = pgTable("saved_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: uuid("user_id"),
  entity: text("entity").notNull(),
  name: text("name").notNull(),
  isDefault: boolean("is_default").default(false),
  isShared: boolean("is_shared").default(false),
  viewMode: text("view_mode").default("list"),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// COUNTERS (configurable numbering sequences)
// ============================================================
export const counters = pgTable(
  "counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    entity: text("entity").notNull(),
    prefix: text("prefix").notNull(),
    includeYear: boolean("include_year").default(true),
    currentNumber: integer("current_number").default(0),
    padding: integer("padding").default(3),
    separator: text("separator").default("-"),
    resetYearly: boolean("reset_yearly").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("counters_tenant_entity").on(table.tenantId, table.entity),
  ]
);

// ============================================================
// COUNTRIES (system codebook — no tenant_id)
// ============================================================
export const countries = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").unique().notNull(),
  nameCs: text("name_cs").notNull(),
  nameEn: text("name_en").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// UNITS (units of measure — tenant_id nullable = system units)
// ============================================================
export const units = pgTable("units", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  name: text("name").notNull(),
  baseUnit: text("base_unit"),
  conversionFactor: decimal("conversion_factor"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
