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
  primaryKey,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { units } from "./system";

// ============================================================
// ITEMS (Unified — materials, products, everything in one)
// ============================================================
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),

    // === FLAGS (what this item is) ===
    isBrewMaterial: boolean("is_brew_material").default(false),
    isProductionItem: boolean("is_production_item").default(false),
    isSaleItem: boolean("is_sale_item").default(false),
    isExciseRelevant: boolean("is_excise_relevant").default(false),

    // === STOCK ===
    stockCategory: text("stock_category"), // 'raw_material' | 'finished_product' | 'packaging' | 'other'
    issueMode: text("issue_mode").default("fifo"), // 'fifo' | 'manual_lot'
    unitId: uuid("unit_id").references(() => units.id),
    recipeUnitId: uuid("recipe_unit_id").references(() => units.id),
    baseUnitAmount: decimal("base_unit_amount"),

    // === BASE ITEM (self-reference for variants/packaged items) ===
    baseItemId: uuid("base_item_id"), // Self-reference to items(id) — FK added in SQL migration
    baseItemQuantity: decimal("base_item_quantity"),

    // === MATERIAL-SPECIFIC ===
    materialType: text("material_type"), // 'malt' | 'hop' | 'yeast' | 'adjunct' | 'other'
    alpha: decimal("alpha"),
    ebc: decimal("ebc"),
    extractPercent: decimal("extract_percent"),

    // === PRODUCT-SPECIFIC ===
    packagingType: text("packaging_type"), // 'keg_30' | 'keg_50' | 'bottle_500' | 'can_330'...
    volumeL: decimal("volume_l"),
    abv: decimal("abv"),
    plato: decimal("plato"),
    ean: text("ean"),

    // === PRICING ===
    costPrice: decimal("cost_price"),
    avgPrice: decimal("avg_price"),
    salePrice: decimal("sale_price"),
    overheadManual: boolean("overhead_manual").default(false),
    overheadPrice: decimal("overhead_price"),

    // === POS / WEB ===
    posAvailable: boolean("pos_available").default(false),
    webAvailable: boolean("web_available").default(false),
    color: text("color"),

    // === META ===
    imageUrl: text("image_url"),
    notes: text("notes"),
    isActive: boolean("is_active").default(true),
    isFromLibrary: boolean("is_from_library").default(false),
    sourceLibraryId: uuid("source_library_id"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("items_tenant_code").on(table.tenantId, table.code),
    index("idx_items_tenant_material").on(table.tenantId, table.materialType),
    index("idx_items_tenant_active").on(table.tenantId, table.isActive),
  ]
);

// ============================================================
// CATEGORIES (category system — tenant_id nullable = global)
// ============================================================
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").references(() => tenants.id),
  name: text("name").notNull(),
  categoryType: text("category_type").notNull(), // 'stock' | 'cashflow' | 'product'
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ============================================================
// ITEM_CATEGORIES (many-to-many)
// ============================================================
export const itemCategories = pgTable(
  "item_categories",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.categoryId] }),
  ]
);
