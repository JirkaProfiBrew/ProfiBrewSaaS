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
    warehouseId: uuid("warehouse_id"), // nullable — no FK to avoid circular import
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
    unique("counters_tenant_entity_warehouse").on(table.tenantId, table.entity, table.warehouseId),
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
  code: text("code").unique().notNull(),
  nameCs: text("name_cs").notNull(),
  nameEn: text("name_en").notNull(),
  symbol: text("symbol").notNull(),
  category: text("category").notNull(), // 'weight' | 'volume' | 'count'
  baseUnitCode: text("base_unit_code"), // NULL = is base unit; 'kg' for g
  toBaseFactor: decimal("to_base_factor"), // g→kg = 0.001, ml→l = 0.001
  isSystem: boolean("is_system").default(true),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
