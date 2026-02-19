import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { recipes } from "./recipes";
import { items } from "./items";
import { equipment } from "./equipment";

// ============================================================
// BATCHES
// ============================================================
export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    batchNumber: text("batch_number").notNull(),
    batchSeq: integer("batch_seq"),
    recipeId: uuid("recipe_id").references(() => recipes.id),
    itemId: uuid("item_id").references(() => items.id),
    status: text("status").notNull().default("planned"), // 'planned' | 'brewing' | 'fermenting' | 'conditioning' | 'carbonating' | 'packaging' | 'completed' | 'dumped'
    brewStatus: text("brew_status"),
    plannedDate: timestamp("planned_date", { withTimezone: true }),
    brewDate: timestamp("brew_date", { withTimezone: true }),
    endBrewDate: timestamp("end_brew_date", { withTimezone: true }),
    actualVolumeL: decimal("actual_volume_l"),
    ogActual: decimal("og_actual"),
    fgActual: decimal("fg_actual"),
    abvActual: decimal("abv_actual"),
    equipmentId: uuid("equipment_id").references(() => equipment.id),
    primaryBatchId: uuid("primary_batch_id"), // Self-reference — FK added in SQL migration
    exciseRelevantHl: decimal("excise_relevant_hl"),
    exciseReportedHl: decimal("excise_reported_hl"),
    exciseStatus: text("excise_status"),
    isPaused: boolean("is_paused").default(false),
    notes: text("notes"),
    brewerId: uuid("brewer_id"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("batches_tenant_batch_number").on(table.tenantId, table.batchNumber),
    index("idx_batches_tenant_status").on(table.tenantId, table.status),
    index("idx_batches_tenant_date").on(table.tenantId, table.brewDate),
  ]
);

// ============================================================
// BATCH STEPS
// ============================================================
export const batchSteps = pgTable(
  "batch_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    stepType: text("step_type").notNull(),
    brewPhase: text("brew_phase"), // 'mashing' | 'boiling' | 'fermentation' | 'conditioning'
    name: text("name").notNull(),
    temperatureC: decimal("temperature_c"),
    timeMin: integer("time_min"),
    pauseMin: integer("pause_min"),
    autoSwitch: boolean("auto_switch").default(false),
    equipmentId: uuid("equipment_id").references(() => equipment.id),
    startTimePlan: timestamp("start_time_plan", { withTimezone: true }),
    startTimeReal: timestamp("start_time_real", { withTimezone: true }),
    endTimeReal: timestamp("end_time_real", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_batch_steps_batch").on(table.batchId),
  ]
);

// ============================================================
// BATCH MEASUREMENTS
// ============================================================
export const batchMeasurements = pgTable(
  "batch_measurements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    measurementType: text("measurement_type").notNull(), // 'gravity' | 'temperature' | 'ph' | 'volume' | 'pressure'
    value: decimal("value"),
    valuePlato: decimal("value_plato"),
    valueSg: decimal("value_sg"),
    temperatureC: decimal("temperature_c"),
    isStart: boolean("is_start").default(false),
    isEnd: boolean("is_end").default(false),
    notes: text("notes"),
    measuredAt: timestamp("measured_at", { withTimezone: true }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_batch_measurements_batch").on(table.batchId),
  ]
);

// ============================================================
// BATCH NOTES
// ============================================================
export const batchNotes = pgTable("batch_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batches.id),
  batchStepId: uuid("batch_step_id").references(() => batchSteps.id),
  text: text("text").notNull(),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// BOTTLING ITEMS
// ============================================================
export const bottlingItems = pgTable("bottling_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batches.id),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id),
  quantity: integer("quantity").notNull(),
  baseUnits: decimal("base_units"),
  bottledAt: timestamp("bottled_at", { withTimezone: true }).defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// BATCH MATERIAL LOTS (schema only — UI in Sprint 3)
// ============================================================
export const batchMaterialLots = pgTable("batch_material_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => batches.id),
  lotId: uuid("lot_id"), // FK to material_lots (Sprint 3)
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id),
  quantityUsed: decimal("quantity_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
