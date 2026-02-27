import {
  pgTable,
  uuid,
  text,
  boolean,
  decimal,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { shops } from "./shops";

// ============================================================
// BREWING SYSTEMS (Varní soustavy)
// ============================================================
export const brewingSystems = pgTable(
  "brewing_systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    shopId: uuid("shop_id").references(() => shops.id),

    // Header
    name: text("name").notNull(),
    description: text("description"),
    isPrimary: boolean("is_primary").default(false),
    batchSizeL: decimal("batch_size_l").notNull(),
    efficiencyPct: decimal("efficiency_pct").notNull().default("75"),

    // Hot zone — Kettle
    kettleVolumeL: decimal("kettle_volume_l"),
    kettleLossPct: decimal("kettle_loss_pct").default("10"),

    // Hot zone — Whirlpool
    whirlpoolLossPct: decimal("whirlpool_loss_pct").default("10"),

    // Cold zone — Fermenter (schematic, for visualization)
    fermenterVolumeL: decimal("fermenter_volume_l"),
    fermentationLossPct: decimal("fermentation_loss_pct").default("10"),

    // Constants
    extractEstimate: decimal("extract_estimate").default("0.80"),
    waterPerKgMalt: decimal("water_per_kg_malt").default("1.0"),
    waterReserveL: decimal("water_reserve_l").default("0"),

    // Step times (minutes)
    timePreparation: integer("time_preparation").default(30),
    timeLautering: integer("time_lautering").default(60),
    timeWhirlpool: integer("time_whirlpool").default(90),
    timeTransfer: integer("time_transfer").default(15),
    timeCleanup: integer("time_cleanup").default(60),

    // Meta
    notes: text("notes"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_brewing_systems_tenant").on(table.tenantId, table.isActive),
    // Partial unique index for is_primary handled in SQL migration
  ]
);
