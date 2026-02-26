import {
  pgTable,
  uuid,
  text,
  boolean,
  decimal,
  date,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { batches } from "./batches";
import { warehouses } from "./warehouses";
import { stockIssues } from "./stock";

// ============================================================
// EXCISE RATES (tax rates per Plato category)
// ============================================================
export const exciseRates = pgTable(
  "excise_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id), // NULLABLE — NULL = system-wide defaults
    category: text("category").notNull(), // 'A' | 'B' | 'C' | 'D' | 'E'
    ratePerPlatoHl: decimal("rate_per_plato_hl").notNull(), // Kc per 1 °P per 1 hl
    validFrom: date("valid_from").notNull(),
    validTo: date("valid_to"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_excise_rates_category").on(table.category, table.validFrom),
  ]
);

// ============================================================
// EXCISE MOVEMENTS (individual excise-relevant movements)
// ============================================================
export const exciseMovements = pgTable(
  "excise_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    batchId: uuid("batch_id").references(() => batches.id),
    stockIssueId: uuid("stock_issue_id").references(() => stockIssues.id),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id),
    movementType: text("movement_type").notNull(), // 'production' | 'release' | 'loss' | 'destruction' | 'transfer_in' | 'transfer_out' | 'adjustment'
    volumeHl: decimal("volume_hl").notNull(),
    direction: text("direction").notNull(), // 'in' | 'out'
    plato: decimal("plato"),
    platoSource: text("plato_source"), // 'batch_measurement' | 'recipe' | 'manual'
    taxRate: decimal("tax_rate"),
    taxAmount: decimal("tax_amount"),
    date: date("date").notNull(),
    period: text("period").notNull(), // 'YYYY-MM'
    status: text("status").default("draft"), // 'draft' | 'confirmed' | 'reported'
    description: text("description"),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_excise_movements_tenant_period").on(
      table.tenantId,
      table.period
    ),
    index("idx_excise_movements_batch").on(table.batchId),
    index("idx_excise_movements_issue").on(table.stockIssueId),
  ]
);

// ============================================================
// EXCISE MONTHLY REPORTS (monthly summaries for tax authority)
// ============================================================
export const exciseMonthlyReports = pgTable(
  "excise_monthly_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    period: text("period").notNull(), // 'YYYY-MM'
    openingBalanceHl: decimal("opening_balance_hl").default("0"),
    productionHl: decimal("production_hl").default("0"),
    transferInHl: decimal("transfer_in_hl").default("0"),
    releaseHl: decimal("release_hl").default("0"),
    transferOutHl: decimal("transfer_out_hl").default("0"),
    lossHl: decimal("loss_hl").default("0"),
    destructionHl: decimal("destruction_hl").default("0"),
    adjustmentHl: decimal("adjustment_hl").default("0"),
    closingBalanceHl: decimal("closing_balance_hl").default("0"),
    totalTax: decimal("total_tax").default("0"),
    taxDetails: jsonb("tax_details"), // [{plato, volume_hl, tax}]
    status: text("status").default("draft"), // 'draft' | 'submitted' | 'accepted'
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedBy: uuid("submitted_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("excise_monthly_reports_tenant_period").on(
      table.tenantId,
      table.period
    ),
  ]
);
