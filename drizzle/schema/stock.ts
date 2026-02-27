import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  decimal,
  date,
  timestamp,
  jsonb,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";
import { warehouses } from "./warehouses";
import { partners } from "./partners";
import { items } from "./items";
import { batches } from "./batches";
import { recipeItems } from "./recipes";
import { counters } from "./system";

// ============================================================
// STOCK ISSUES (receipt / issue documents)
// ============================================================
export const stockIssues = pgTable(
  "stock_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    codeNumber: integer("code_number"),
    codePrefix: text("code_prefix"),
    counterId: uuid("counter_id").references(() => counters.id),
    movementType: text("movement_type").notNull(), // 'receipt' | 'issue'
    movementPurpose: text("movement_purpose").notNull(), // 'purchase' | 'production_in' | 'production_out' | 'sale' | 'transfer' | 'inventory' | 'waste' | 'other'
    date: date("date").notNull(),
    status: text("status").default("draft"), // 'draft' | 'confirmed' | 'cancelled'
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    partnerId: uuid("partner_id").references(() => partners.id),
    orderId: uuid("order_id"), // NO FK — Sprint 4
    cashflowId: uuid("cashflow_id"), // NO FK — link to generated CF
    batchId: uuid("batch_id").references(() => batches.id),
    season: text("season"),
    additionalCost: decimal("additional_cost").default("0"),
    totalCost: decimal("total_cost").default("0"),
    notes: text("notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("stock_issues_tenant_code").on(table.tenantId, table.code),
    index("idx_stock_issues_tenant_status").on(table.tenantId, table.status),
    index("idx_stock_issues_tenant_date").on(table.tenantId, table.date),
  ]
);

// ============================================================
// STOCK ISSUE LINES (line items within a stock issue)
// ============================================================
export const stockIssueLines = pgTable(
  "stock_issue_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stockIssueId: uuid("stock_issue_id")
      .notNull()
      .references(() => stockIssues.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    lineNo: integer("line_no"),
    requestedQty: decimal("requested_qty").notNull(),
    issuedQty: decimal("issued_qty"),
    missingQty: decimal("missing_qty"),
    unitPrice: decimal("unit_price"),
    totalCost: decimal("total_cost"),
    issueModeSnapshot: text("issue_mode_snapshot"), // snapshot of item's issue_mode at time of issue
    notes: text("notes"),
    sortOrder: integer("sort_order").default(0),
    recipeItemId: uuid("recipe_item_id").references(() => recipeItems.id, { onDelete: "set null" }),
    orderItemId: uuid("order_item_id"), // NO FK — circular dep with orders.ts
    // Manual allocation entries (for manual_lot issue lines, stored as JSONB)
    manualAllocations: jsonb("manual_allocations"),
    // Lot tracking (filled on receipt lines only)
    lotNumber: text("lot_number"),
    expiryDate: date("expiry_date"),
    lotAttributes: jsonb("lot_attributes").default({}),
    remainingQty: decimal("remaining_qty"), // materialized: for receipts = issuedQty - allocated
    // Excise-relevant data (filled on receipt lines — snapshot from batch at receipt time)
    plato: decimal("plato"), // °P (original gravity) for excise tax calculation
    receiptBatchId: uuid("batch_id").references(() => batches.id), // source batch for this receipt line
    // VPN (vedlejší pořizovací náklady) — computed by recalculateOverheadForReceipt
    overheadPerUnit: decimal("overhead_per_unit").default("0"),
    fullUnitPrice: decimal("full_unit_price"), // unitPrice + overheadPerUnit (= pořizovací cena)
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_stock_issue_lines_issue").on(table.stockIssueId),
  ]
);

// ============================================================
// RECEIPT COSTS (vedlejší pořizovací náklady on receipts)
// ============================================================
export const receiptCosts = pgTable(
  "receipt_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stockIssueId: uuid("stock_issue_id")
      .notNull()
      .references(() => stockIssues.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: decimal("amount").notNull().default("0"),
    allocation: text("allocation").notNull().default("by_value"), // 'by_value' | 'by_quantity'
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_receipt_costs_issue").on(table.stockIssueId),
  ]
);

// ============================================================
// STOCK MOVEMENTS (individual stock in/out movements)
// ============================================================
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    movementType: text("movement_type").notNull(), // 'in' | 'out'
    quantity: decimal("quantity").notNull(),
    unitPrice: decimal("unit_price"),
    stockIssueId: uuid("stock_issue_id").references(() => stockIssues.id),
    stockIssueLineId: uuid("stock_issue_line_id").references(
      () => stockIssueLines.id
    ),
    orderId: uuid("order_id"), // NO FK — Sprint 4
    batchId: uuid("batch_id").references(() => batches.id),
    lotId: uuid("lot_id"), // NO FK — will reference material_lots
    receiptLineId: uuid("receipt_line_id").references(
      () => stockIssueLines.id
    ), // FK to the receipt line this issue movement draws from
    isClosed: boolean("is_closed").default(false),
    date: date("date").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_stock_movements_item_warehouse").on(
      table.tenantId,
      table.itemId,
      table.warehouseId
    ),
    index("idx_stock_movements_date").on(table.tenantId, table.date),
    index("idx_movements_receipt_line").on(table.receiptLineId),
  ]
);

// ============================================================
// STOCK ISSUE ALLOCATIONS (DEPRECATED — kept for compilation, no longer used in code)
// ============================================================
export const stockIssueAllocations = pgTable(
  "stock_issue_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    stockIssueLineId: uuid("stock_issue_line_id")
      .notNull()
      .references(() => stockIssueLines.id),
    sourceMovementId: uuid("source_movement_id")
      .notNull()
      .references(() => stockMovements.id),
    quantity: decimal("quantity").notNull(),
    unitPrice: decimal("unit_price").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_stock_issue_allocations_line").on(table.stockIssueLineId),
  ]
);

// ============================================================
// STOCK STATUS (current stock levels per item+warehouse)
// ============================================================
export const stockStatus = pgTable(
  "stock_status",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    quantity: decimal("quantity").default("0"),
    reservedQty: decimal("reserved_qty").default("0"),
    // NOTE: available_qty = quantity - reserved_qty — computed in app layer
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("stock_status_tenant_item_warehouse").on(
      table.tenantId,
      table.itemId,
      table.warehouseId
    ),
  ]
);

// ============================================================
// MATERIAL LOTS (lot/batch tracking for materials)
// ============================================================
export const materialLots = pgTable(
  "material_lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    lotNumber: text("lot_number").notNull(),
    supplierId: uuid("supplier_id").references(() => partners.id),
    receivedDate: date("received_date"),
    expiryDate: date("expiry_date"),
    quantityInitial: decimal("quantity_initial"),
    quantityRemaining: decimal("quantity_remaining"),
    unitPrice: decimal("unit_price"),
    properties: jsonb("properties").default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_material_lots_item").on(table.tenantId, table.itemId),
  ]
);
