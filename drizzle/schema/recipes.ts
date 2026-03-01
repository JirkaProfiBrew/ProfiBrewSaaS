import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { beerStyles } from "./beer-styles";
import { items } from "./items";
import { units } from "./system";
import { brewingSystems } from "./brewing-systems";

// ============================================================
// MASHING PROFILES (tenant_id NULL = system profile)
// ============================================================
export const mashingProfiles = pgTable("mashing_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  name: text("name").notNull(),
  mashingType: text("mashing_type"), // 'infusion' | 'decoction' | 'step'
  description: text("description"),
  steps: jsonb("steps").default([]),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// RECIPES
// ============================================================
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code"),
    name: text("name").notNull(),
    beerStyleId: uuid("beer_style_id").references(() => beerStyles.id),
    status: text("status").notNull().default("draft"), // 'draft' | 'active' | 'archived'
    batchSizeL: decimal("batch_size_l"),
    batchSizeBrutoL: decimal("batch_size_bruto_l"),
    beerVolumeL: decimal("beer_volume_l"),
    og: decimal("og"),
    fg: decimal("fg"),
    abv: decimal("abv"),
    ibu: decimal("ibu"),
    ebc: decimal("ebc"),
    targetIbu: decimal("target_ibu"),
    targetEbc: decimal("target_ebc"),
    boilTimeMin: integer("boil_time_min"),
    costPrice: decimal("cost_price"),
    durationFermentationDays: integer("duration_fermentation_days"),
    durationConditioningDays: integer("duration_conditioning_days"),
    shelfLifeDays: integer("shelf_life_days"),
    notes: text("notes"),
    itemId: uuid("item_id").references(() => items.id),
    brewingSystemId: uuid("brewing_system_id").references(
      () => brewingSystems.id
    ),
    constantsOverride: jsonb("constants_override"),
    maltInputMode: text("malt_input_mode").default("percent"),
    isFromLibrary: boolean("is_from_library").default(false),
    sourceLibraryId: uuid("source_library_id"),
    sourceRecipeId: uuid("source_recipe_id"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_recipes_tenant_status").on(table.tenantId, table.status),
  ]
);

// ============================================================
// RECIPE ITEMS (ingredients)
// ============================================================
export const recipeItems = pgTable(
  "recipe_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    category: text("category").notNull(), // 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
    amountG: decimal("amount_g").notNull(),
    unitId: uuid("unit_id").references(() => units.id),
    useStage: text("use_stage"), // 'mash' | 'boil' | 'whirlpool' | 'fermentation' | 'dry_hop'
    useTimeMin: integer("use_time_min"),
    temperatureC: decimal("temperature_c"),
    hopPhase: text("hop_phase"),
    notes: text("notes"),
    percent: decimal("percent"),
    sortOrder: integer("sort_order").default(0),
    reservedQty: decimal("reserved_qty").default("0"), // post-MVP prep, unused in MVP
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_recipe_items_recipe").on(table.recipeId),
  ]
);

// ============================================================
// RECIPE STEPS
// ============================================================
export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    mashProfileId: uuid("mash_profile_id").references(() => mashingProfiles.id),
    stepType: text("step_type").notNull(), // 'mash_in' | 'rest' | 'decoction' | 'mash_out' | 'boil' | 'whirlpool' | 'cooling'
    name: text("name").notNull(),
    temperatureC: decimal("temperature_c"),
    timeMin: integer("time_min"),
    rampTimeMin: integer("ramp_time_min"),
    tempGradient: decimal("temp_gradient"),
    notes: text("notes"),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_recipe_steps_recipe").on(table.recipeId),
  ]
);

// ============================================================
// RECIPE CALCULATIONS (snapshots)
// ============================================================
export const recipeCalculations = pgTable("recipe_calculations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id, { onDelete: "cascade" }),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
