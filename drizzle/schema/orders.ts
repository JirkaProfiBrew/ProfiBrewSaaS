import {
  pgTable,
  uuid,
  text,
  decimal,
  date,
  integer,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./tenants";
import { partners, contacts } from "./partners";
import { items } from "./items";
import { shops } from "./shops";
import { warehouses } from "./warehouses";
import { units } from "./system";
import { stockIssues } from "./stock";

// ============================================================
// ORDERS (sales orders)
// ============================================================
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderNumber: text("order_number").notNull(),
    partnerId: uuid("partner_id")
      .notNull()
      .references(() => partners.id),
    contactId: uuid("contact_id").references(() => contacts.id),
    status: text("status").notNull().default("draft"),
    // 'draft' | 'confirmed' | 'in_preparation' | 'shipped' | 'delivered' | 'invoiced' | 'cancelled'
    orderDate: date("order_date").notNull().default(sql`CURRENT_DATE`),
    deliveryDate: date("delivery_date"),
    shippedDate: date("shipped_date"),
    deliveredDate: date("delivered_date"),
    closedDate: date("closed_date"),
    shopId: uuid("shop_id").references(() => shops.id),
    warehouseId: uuid("warehouse_id").references(() => warehouses.id),
    totalExclVat: decimal("total_excl_vat").default("0"),
    totalVat: decimal("total_vat").default("0"),
    totalInclVat: decimal("total_incl_vat").default("0"),
    totalDeposit: decimal("total_deposit").default("0"),
    currency: text("currency").default("CZK"),
    stockIssueId: uuid("stock_issue_id").references(() => stockIssues.id),
    cashflowId: uuid("cashflow_id"), // No FK here — cashflows table created separately
    notes: text("notes"),
    internalNotes: text("internal_notes"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique("orders_tenant_order_number").on(table.tenantId, table.orderNumber),
    index("idx_orders_tenant").on(table.tenantId),
    index("idx_orders_partner").on(table.partnerId),
    index("idx_orders_status").on(table.tenantId, table.status),
    index("idx_orders_date").on(table.tenantId, table.orderDate),
  ]
);

// ============================================================
// ORDER ITEMS (line items within an order)
// ============================================================
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    quantity: decimal("quantity").notNull(),
    unitId: uuid("unit_id").references(() => units.id),
    unitPrice: decimal("unit_price").notNull(),
    vatRate: decimal("vat_rate").default("21"),
    discountPct: decimal("discount_pct").default("0"),
    totalExclVat: decimal("total_excl_vat"),
    totalVat: decimal("total_vat"),
    totalInclVat: decimal("total_incl_vat"),
    depositId: uuid("deposit_id"), // No FK here — deposits table created separately
    depositQty: decimal("deposit_qty").default("0"),
    depositTotal: decimal("deposit_total").default("0"),
    notes: text("notes"),
    sortOrder: integer("sort_order").default(0),
    reservedQty: decimal("reserved_qty").default("0"), // post-MVP prep, unused in MVP
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_order_items_order").on(table.orderId),
    index("idx_order_items_item").on(table.itemId),
  ]
);
