import {
  pgTable,
  uuid,
  text,
  integer,
  decimal,
  timestamp,
} from "drizzle-orm/pg-core";

// ============================================================
// BEER STYLE GROUPS (global codebook — no tenant_id)
// ============================================================
export const beerStyleGroups = pgTable("beer_style_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  nameCz: text("name_cz"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// BEER STYLES (global codebook — BJCP 2021, no tenant_id)
// ============================================================
export const beerStyles = pgTable("beer_styles", {
  id: uuid("id").primaryKey().defaultRandom(),
  styleGroupId: uuid("style_group_id")
    .notNull()
    .references(() => beerStyleGroups.id),
  bjcpNumber: text("bjcp_number"),
  bjcpCategory: text("bjcp_category"),
  name: text("name").notNull(),
  abvMin: decimal("abv_min"),
  abvMax: decimal("abv_max"),
  ibuMin: decimal("ibu_min"),
  ibuMax: decimal("ibu_max"),
  ebcMin: decimal("ebc_min"),
  ebcMax: decimal("ebc_max"),
  ogMin: decimal("og_min"),
  ogMax: decimal("og_max"),
  fgMin: decimal("fg_min"),
  fgMax: decimal("fg_max"),
  srmMin: decimal("srm_min"),
  srmMax: decimal("srm_max"),
  appearance: text("appearance"),
  aroma: text("aroma"),
  flavor: text("flavor"),
  comments: text("comments"),
  impression: text("impression"),
  mouthfeel: text("mouthfeel"),
  history: text("history"),
  ingredients: text("ingredients"),
  styleComparison: text("style_comparison"),
  commercialExamples: text("commercial_examples"),
  origin: text("origin"),
  styleFamily: text("style_family"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
