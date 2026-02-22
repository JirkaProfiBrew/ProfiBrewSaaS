"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { orders, orderItems } from "@/../drizzle/schema/orders";
import { partners, contacts } from "@/../drizzle/schema/partners";
import { items } from "@/../drizzle/schema/items";
import { deposits } from "@/../drizzle/schema/deposits";
import { units } from "@/../drizzle/schema/system";
import { shops } from "@/../drizzle/schema/shops";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { eq, and, sql, desc, ilike, or, gte, lte, count } from "drizzle-orm";
import { getNextNumber } from "@/lib/db/counters";
import { updateReservedQtyRow } from "@/modules/stock-issues/lib/stock-status-sync";
import {
  stockIssues,
  stockIssueLines,
} from "@/../drizzle/schema/stock";
import type {
  Order,
  OrderItem,
  OrderWithItems,
  CreateOrderInput,
  UpdateOrderInput,
  CreateOrderItemInput,
  UpdateOrderItemInput,
  OrderFilter,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────

function mapOrderRow(
  row: typeof orders.$inferSelect,
  joined?: { partnerName?: string | null; contactName?: string | null }
): Order {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orderNumber: row.orderNumber,
    partnerId: row.partnerId,
    contactId: row.contactId ?? null,
    status: row.status as Order["status"],
    orderDate: row.orderDate,
    deliveryDate: row.deliveryDate ?? null,
    shippedDate: row.shippedDate ?? null,
    deliveredDate: row.deliveredDate ?? null,
    closedDate: row.closedDate ?? null,
    shopId: row.shopId ?? null,
    warehouseId: row.warehouseId ?? null,
    totalExclVat: row.totalExclVat ?? "0",
    totalVat: row.totalVat ?? "0",
    totalInclVat: row.totalInclVat ?? "0",
    totalDeposit: row.totalDeposit ?? "0",
    currency: row.currency ?? "CZK",
    stockIssueId: row.stockIssueId ?? null,
    cashflowId: row.cashflowId ?? null,
    notes: row.notes ?? null,
    internalNotes: row.internalNotes ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    partnerName: joined?.partnerName ?? null,
    contactName: joined?.contactName ?? null,
  };
}

function mapOrderItemRow(
  row: typeof orderItems.$inferSelect,
  joined?: {
    itemName?: string | null;
    itemCode?: string | null;
    unitSymbol?: string | null;
    depositName?: string | null;
    depositAmount?: string | null;
  }
): OrderItem {
  return {
    id: row.id,
    tenantId: row.tenantId,
    orderId: row.orderId,
    itemId: row.itemId,
    quantity: row.quantity,
    unitId: row.unitId ?? null,
    unitPrice: row.unitPrice,
    vatRate: row.vatRate ?? "21",
    discountPct: row.discountPct ?? "0",
    totalExclVat: row.totalExclVat ?? null,
    totalVat: row.totalVat ?? null,
    totalInclVat: row.totalInclVat ?? null,
    depositId: row.depositId ?? null,
    depositQty: row.depositQty ?? "0",
    depositTotal: row.depositTotal ?? "0",
    notes: row.notes ?? null,
    sortOrder: row.sortOrder ?? 0,
    createdAt: row.createdAt ?? null,
    itemName: joined?.itemName ?? null,
    itemCode: joined?.itemCode ?? null,
    unitSymbol: joined?.unitSymbol ?? null,
    depositName: joined?.depositName ?? null,
    depositAmount: joined?.depositAmount ?? null,
  };
}

/** Calculate line totals from quantity, unitPrice, discountPct, vatRate. */
function calculateLineTotals(
  quantity: string,
  unitPrice: string,
  discountPct: string,
  vatRate: string
): { totalExclVat: string; totalVat: string; totalInclVat: string } {
  const qty = Number(quantity);
  const price = Number(unitPrice);
  const discount = Number(discountPct);
  const vat = Number(vatRate);

  const lineExclVat = qty * price * (1 - discount / 100);
  const lineVat = lineExclVat * (vat / 100);
  const lineInclVat = lineExclVat + lineVat;

  return {
    totalExclVat: lineExclVat.toFixed(2),
    totalVat: lineVat.toFixed(2),
    totalInclVat: lineInclVat.toFixed(2),
  };
}

/** Recalculate order header totals from all order items. (Internal helper.) */
async function recalculateOrderTotals(
  orderId: string,
  tenantId: string
): Promise<void> {
  const rows = await db
    .select({
      totalExclVat: orderItems.totalExclVat,
      totalVat: orderItems.totalVat,
      totalInclVat: orderItems.totalInclVat,
      depositTotal: orderItems.depositTotal,
    })
    .from(orderItems)
    .where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId))
    );

  let sumExclVat = 0;
  let sumVat = 0;
  let sumInclVat = 0;
  let sumDeposit = 0;

  for (const row of rows) {
    sumExclVat += Number(row.totalExclVat ?? "0");
    sumVat += Number(row.totalVat ?? "0");
    sumInclVat += Number(row.totalInclVat ?? "0");
    sumDeposit += Number(row.depositTotal ?? "0");
  }

  await db
    .update(orders)
    .set({
      totalExclVat: sumExclVat.toFixed(2),
      totalVat: sumVat.toFixed(2),
      totalInclVat: sumInclVat.toFixed(2),
      totalDeposit: sumDeposit.toFixed(2),
      updatedAt: sql`now()`,
    })
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
}

// ── CRUD: Orders ──────────────────────────────────────────────

/** List orders with optional filters. */
export async function getOrders(filter?: OrderFilter): Promise<Order[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(orders.tenantId, tenantId)];

    if (filter?.status) {
      conditions.push(eq(orders.status, filter.status));
    }
    if (filter?.partnerId) {
      conditions.push(eq(orders.partnerId, filter.partnerId));
    }
    if (filter?.dateFrom) {
      conditions.push(gte(orders.orderDate, filter.dateFrom));
    }
    if (filter?.dateTo) {
      conditions.push(lte(orders.orderDate, filter.dateTo));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(orders.orderNumber, `%${filter.search}%`),
          ilike(partners.name, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select({
        order: orders,
        partnerName: partners.name,
      })
      .from(orders)
      .leftJoin(partners, eq(orders.partnerId, partners.id))
      .where(and(...conditions))
      .orderBy(desc(orders.orderDate), desc(orders.createdAt));

    return rows.map((r) =>
      mapOrderRow(r.order, { partnerName: r.partnerName })
    );
  });
}

/** Get a single order by ID, including all line items with joined fields. */
export async function getOrder(id: string): Promise<OrderWithItems | null> {
  return withTenant(async (tenantId) => {
    // Load order header with partner + contact names
    const orderRows = await db
      .select({
        order: orders,
        partnerName: partners.name,
        contactName: contacts.name,
      })
      .from(orders)
      .leftJoin(partners, eq(orders.partnerId, partners.id))
      .leftJoin(contacts, eq(orders.contactId, contacts.id))
      .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
      .limit(1);

    const row = orderRows[0];
    if (!row) return null;

    // Load order items with joined fields
    const itemRows = await db
      .select({
        orderItem: orderItems,
        itemName: items.name,
        itemCode: items.code,
        unitSymbol: units.symbol,
        depositName: deposits.name,
        depositAmount: deposits.depositAmount,
      })
      .from(orderItems)
      .leftJoin(items, eq(orderItems.itemId, items.id))
      .leftJoin(units, eq(orderItems.unitId, units.id))
      .leftJoin(deposits, eq(orderItems.depositId, deposits.id))
      .where(
        and(eq(orderItems.orderId, id), eq(orderItems.tenantId, tenantId))
      )
      .orderBy(orderItems.sortOrder, orderItems.createdAt);

    return {
      ...mapOrderRow(row.order, {
        partnerName: row.partnerName,
        contactName: row.contactName,
      }),
      items: itemRows.map((ir) =>
        mapOrderItemRow(ir.orderItem, {
          itemName: ir.itemName,
          itemCode: ir.itemCode,
          unitSymbol: ir.unitSymbol,
          depositName: ir.depositName,
          depositAmount: ir.depositAmount,
        })
      ),
    };
  });
}

/** Create a new draft order with auto-generated order number. */
export async function createOrder(
  data: CreateOrderInput
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const orderNumber = await getNextNumber(tenantId, "order");

      const rows = await db
        .insert(orders)
        .values({
          tenantId,
          orderNumber,
          partnerId: data.partnerId,
          contactId: data.contactId ?? null,
          status: "draft",
          orderDate: data.orderDate ?? new Date().toISOString().slice(0, 10),
          deliveryDate: data.deliveryDate ?? null,
          shopId: data.shopId ?? null,
          warehouseId: data.warehouseId ?? null,
          notes: data.notes ?? null,
          internalNotes: data.internalNotes ?? null,
        })
        .returning();

      const row = rows[0];
      if (!row) return { error: "CREATE_FAILED" };

      // Fetch partner name for the response
      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, row.partnerId))
        .limit(1);

      return mapOrderRow(row, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] createOrder failed:", err);
      return { error: "CREATE_FAILED" };
    }
  });
}

/** Update an order (only in draft status). */
export async function updateOrder(
  id: string,
  data: UpdateOrderInput
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      // Verify draft status
      const existing = await db
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };
      if (existing[0].status !== "draft") return { error: "NOT_DRAFT" };

      const rows = await db
        .update(orders)
        .set({
          ...(data.partnerId !== undefined && { partnerId: data.partnerId }),
          ...(data.contactId !== undefined && {
            contactId: data.contactId ?? null,
          }),
          ...(data.deliveryDate !== undefined && {
            deliveryDate: data.deliveryDate ?? null,
          }),
          ...(data.shopId !== undefined && { shopId: data.shopId ?? null }),
          ...(data.warehouseId !== undefined && {
            warehouseId: data.warehouseId ?? null,
          }),
          ...(data.notes !== undefined && { notes: data.notes ?? null }),
          ...(data.internalNotes !== undefined && {
            internalNotes: data.internalNotes ?? null,
          }),
          updatedAt: sql`now()`,
        })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .returning();

      const row = rows[0];
      if (!row) return { error: "NOT_FOUND" };

      // Fetch partner name for the response
      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, row.partnerId))
        .limit(1);

      return mapOrderRow(row, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] updateOrder failed:", err);
      return { error: "UPDATE_FAILED" };
    }
  });
}

/** Delete an order. Blocked if a linked stock issue or cashflow exists. */
export async function deleteOrder(
  id: string
): Promise<{ success: true } | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const existing = await db
        .select({
          stockIssueId: orders.stockIssueId,
          cashflowId: orders.cashflowId,
        })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };
      if (existing[0].stockIssueId || existing[0].cashflowId) {
        return { error: "HAS_RELATED_RECORDS" };
      }

      await db
        .delete(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)));

      return { success: true as const };
    } catch (err: unknown) {
      console.error("[orders] deleteOrder failed:", err);
      return { error: "DELETE_FAILED" };
    }
  });
}

// ── CRUD: Order Items ─────────────────────────────────────────

/** Add a line item to an order (only in draft status). */
export async function addOrderItem(
  orderId: string,
  data: CreateOrderItemInput
): Promise<OrderItem | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      // Verify order exists and is draft
      const orderRow = await db
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
        .limit(1);

      if (!orderRow[0]) return { error: "ORDER_NOT_FOUND" };
      if (orderRow[0].status !== "draft") return { error: "NOT_DRAFT" };

      // Calculate line totals
      const vatRate = data.vatRate ?? "21";
      const discountPct = data.discountPct ?? "0";
      const lineTotals = calculateLineTotals(
        data.quantity,
        data.unitPrice,
        discountPct,
        vatRate
      );

      // Calculate deposit total
      let depositTotal = "0";
      let depositAmount: string | null = null;
      if (data.depositId) {
        const depositRows = await db
          .select({ depositAmount: deposits.depositAmount })
          .from(deposits)
          .where(
            and(
              eq(deposits.tenantId, tenantId),
              eq(deposits.id, data.depositId)
            )
          )
          .limit(1);

        depositAmount = depositRows[0]?.depositAmount ?? null;
        if (depositAmount) {
          const dQty = Number(data.depositQty ?? "0");
          depositTotal = (dQty * Number(depositAmount)).toFixed(2);
        }
      }

      // Get the item's unitId for the line
      const itemRow = await db
        .select({ unitId: items.unitId, name: items.name, code: items.code })
        .from(items)
        .where(eq(items.id, data.itemId))
        .limit(1);

      const unitId = itemRow[0]?.unitId ?? null;

      // Get current max sortOrder
      const maxSortRow = await db
        .select({
          max: sql<number>`COALESCE(MAX(${orderItems.sortOrder}), 0)`,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      const nextSort = (maxSortRow[0]?.max ?? 0) + 1;

      const rows = await db
        .insert(orderItems)
        .values({
          tenantId,
          orderId,
          itemId: data.itemId,
          quantity: data.quantity,
          unitId,
          unitPrice: data.unitPrice,
          vatRate,
          discountPct,
          totalExclVat: lineTotals.totalExclVat,
          totalVat: lineTotals.totalVat,
          totalInclVat: lineTotals.totalInclVat,
          depositId: data.depositId ?? null,
          depositQty: data.depositQty ?? "0",
          depositTotal,
          notes: data.notes ?? null,
          sortOrder: nextSort,
        })
        .returning();

      const row = rows[0];
      if (!row) return { error: "CREATE_FAILED" };

      // Recalculate order totals
      await recalculateOrderTotals(orderId, tenantId);

      // Fetch unit symbol for the response
      let unitSymbol: string | null = null;
      if (unitId) {
        const unitRow = await db
          .select({ symbol: units.symbol })
          .from(units)
          .where(eq(units.id, unitId))
          .limit(1);
        unitSymbol = unitRow[0]?.symbol ?? null;
      }

      // Fetch deposit name
      let depositName: string | null = null;
      if (data.depositId) {
        const depRow = await db
          .select({ name: deposits.name })
          .from(deposits)
          .where(eq(deposits.id, data.depositId))
          .limit(1);
        depositName = depRow[0]?.name ?? null;
      }

      return mapOrderItemRow(row, {
        itemName: itemRow[0]?.name ?? null,
        itemCode: itemRow[0]?.code ?? null,
        unitSymbol,
        depositName,
        depositAmount,
      });
    } catch (err: unknown) {
      console.error("[orders] addOrderItem failed:", err);
      return { error: "CREATE_FAILED" };
    }
  });
}

/** Update an order line item (only if order is draft). */
export async function updateOrderItem(
  id: string,
  data: UpdateOrderItemInput
): Promise<OrderItem | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      // Verify the order item exists and its order is draft
      const lineRow = await db
        .select({
          orderItem: orderItems,
          orderStatus: orders.status,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(eq(orderItems.tenantId, tenantId), eq(orderItems.id, id))
        )
        .limit(1);

      if (!lineRow[0]) return { error: "NOT_FOUND" };
      if (lineRow[0].orderStatus !== "draft") return { error: "NOT_DRAFT" };

      const current = lineRow[0].orderItem;
      const quantity = data.quantity ?? current.quantity;
      const unitPrice = data.unitPrice ?? current.unitPrice;
      const vatRate = data.vatRate ?? current.vatRate ?? "21";
      const discountPct = data.discountPct ?? current.discountPct ?? "0";

      // Recalculate line totals
      const lineTotals = calculateLineTotals(
        quantity,
        unitPrice,
        discountPct,
        vatRate
      );

      // Handle deposit
      const depositId =
        data.depositId !== undefined ? (data.depositId ?? null) : current.depositId;
      const depositQty = data.depositQty ?? current.depositQty ?? "0";

      let depositTotal = "0";
      if (depositId) {
        const depositRows = await db
          .select({ depositAmount: deposits.depositAmount })
          .from(deposits)
          .where(
            and(
              eq(deposits.tenantId, tenantId),
              eq(deposits.id, depositId)
            )
          )
          .limit(1);

        const depAmt = depositRows[0]?.depositAmount;
        if (depAmt) {
          depositTotal = (Number(depositQty) * Number(depAmt)).toFixed(2);
        }
      }

      const rows = await db
        .update(orderItems)
        .set({
          quantity,
          unitPrice,
          vatRate,
          discountPct,
          totalExclVat: lineTotals.totalExclVat,
          totalVat: lineTotals.totalVat,
          totalInclVat: lineTotals.totalInclVat,
          depositId,
          depositQty,
          depositTotal,
          notes: data.notes !== undefined ? (data.notes ?? null) : current.notes,
        })
        .where(
          and(eq(orderItems.tenantId, tenantId), eq(orderItems.id, id))
        )
        .returning();

      const row = rows[0];
      if (!row) return { error: "NOT_FOUND" };

      // Recalculate order totals
      await recalculateOrderTotals(current.orderId, tenantId);

      // Fetch joined fields for response
      const itemRow = await db
        .select({ name: items.name, code: items.code })
        .from(items)
        .where(eq(items.id, row.itemId))
        .limit(1);

      let unitSymbol: string | null = null;
      if (row.unitId) {
        const unitRow = await db
          .select({ symbol: units.symbol })
          .from(units)
          .where(eq(units.id, row.unitId))
          .limit(1);
        unitSymbol = unitRow[0]?.symbol ?? null;
      }

      let depositName: string | null = null;
      let depositAmount: string | null = null;
      if (row.depositId) {
        const depRow = await db
          .select({ name: deposits.name, depositAmount: deposits.depositAmount })
          .from(deposits)
          .where(eq(deposits.id, row.depositId))
          .limit(1);
        depositName = depRow[0]?.name ?? null;
        depositAmount = depRow[0]?.depositAmount ?? null;
      }

      return mapOrderItemRow(row, {
        itemName: itemRow[0]?.name ?? null,
        itemCode: itemRow[0]?.code ?? null,
        unitSymbol,
        depositName,
        depositAmount,
      });
    } catch (err: unknown) {
      console.error("[orders] updateOrderItem failed:", err);
      return { error: "UPDATE_FAILED" };
    }
  });
}

/** Remove an order line item (only if order is draft). */
export async function removeOrderItem(
  id: string
): Promise<{ success: true } | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      // Verify the order item exists and its order is draft
      const lineRow = await db
        .select({
          orderId: orderItems.orderId,
          orderStatus: orders.status,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orderItems.orderId, orders.id))
        .where(
          and(eq(orderItems.tenantId, tenantId), eq(orderItems.id, id))
        )
        .limit(1);

      if (!lineRow[0]) return { error: "NOT_FOUND" };
      if (lineRow[0].orderStatus !== "draft") return { error: "NOT_DRAFT" };

      const { orderId } = lineRow[0];

      await db
        .delete(orderItems)
        .where(
          and(eq(orderItems.tenantId, tenantId), eq(orderItems.id, id))
        );

      // Recalculate order totals
      await recalculateOrderTotals(orderId, tenantId);

      return { success: true as const };
    } catch (err: unknown) {
      console.error("[orders] removeOrderItem failed:", err);
      return { error: "DELETE_FAILED" };
    }
  });
}

// ── Reserved Qty Helper ──────────────────────────────────────

/**
 * Adjust reserved_qty for all items in an order.
 * @param delta +1 to reserve, -1 to release
 */
async function adjustReservedQtyForOrder(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  tenantId: string,
  orderId: string
  ,
  delta: 1 | -1
): Promise<void> {
  // Load order header for shop/warehouse
  const orderRow = await tx
    .select({
      shopId: orders.shopId,
      warehouseId: orders.warehouseId,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  const warehouseId = orderRow[0]?.warehouseId;
  if (!warehouseId) return;

  // Resolve shop's stock_mode
  let stockMode: string | undefined;
  if (orderRow[0]?.shopId) {
    const shopRows = await tx
      .select({ settings: shops.settings })
      .from(shops)
      .where(eq(shops.id, orderRow[0].shopId))
      .limit(1);
    const settings = shopRows[0]?.settings as Record<string, unknown> | null;
    stockMode = settings?.stock_mode as string | undefined;
  }

  if (stockMode === "none") return;

  const oItems = await tx
    .select({
      itemId: orderItems.itemId,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(
      and(eq(orderItems.orderId, orderId), eq(orderItems.tenantId, tenantId))
    );

  for (const oi of oItems) {
    const itemRow = await tx
      .select({
        baseItemId: items.baseItemId,
        baseItemQuantity: items.baseItemQuantity,
      })
      .from(items)
      .where(eq(items.id, oi.itemId))
      .limit(1);

    const qty = Number(oi.quantity);
    let reserveItemId = oi.itemId;
    let reserveQty = qty;

    if (
      stockMode === "bulk" &&
      itemRow[0]?.baseItemId &&
      itemRow[0]?.baseItemQuantity
    ) {
      reserveItemId = itemRow[0].baseItemId;
      reserveQty = qty * Number(itemRow[0].baseItemQuantity);
    }

    await updateReservedQtyRow(
      tx,
      tenantId,
      reserveItemId,
      warehouseId,
      delta * reserveQty
    );
  }
}

// ── Status Workflow Actions ───────────────────────────────────

/** Confirm an order: draft -> confirmed. Must have at least 1 item.
 * Increments reserved_qty on the correct item (base_item in bulk mode).
 */
export async function confirmOrder(
  id: string
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      // Pre-checks outside transaction
      const existing = await db
        .select({
          status: orders.status,
          warehouseId: orders.warehouseId,
          shopId: orders.shopId,
        })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };
      if (existing[0].status !== "draft") return { error: "NOT_DRAFT" };

      // Warehouse is required for stock reservation
      if (!existing[0].warehouseId) return { error: "NO_WAREHOUSE" };

      // Check shop stock_mode — "none" means no stock tracking
      if (existing[0].shopId) {
        const shopRows = await db
          .select({ settings: shops.settings })
          .from(shops)
          .where(eq(shops.id, existing[0].shopId))
          .limit(1);
        const settings = shopRows[0]?.settings as Record<string, unknown> | null;
        const stockMode = settings?.stock_mode as string | undefined;
        if (stockMode === "none") return { error: "STOCK_MODE_NONE" };
      }

      const itemCount = await db
        .select({ value: count() })
        .from(orderItems)
        .where(
          and(eq(orderItems.orderId, id), eq(orderItems.tenantId, tenantId))
        );

      if (Number(itemCount[0]?.value ?? 0) === 0) return { error: "NO_ITEMS" };

      // Recalculate totals one final time
      await recalculateOrderTotals(id, tenantId);

      // Reserve stock + update status in a transaction
      const result = await db.transaction(async (tx) => {
        // Reserve stock for each order item
        await adjustReservedQtyForOrder(tx, tenantId, id, 1);

        // Set status to confirmed
        const rows = await tx
          .update(orders)
          .set({
            status: "confirmed",
            updatedAt: sql`now()`,
          })
          .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
          .returning();

        return rows[0];
      });

      if (!result) return { error: "NOT_FOUND" };

      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, result.partnerId))
        .limit(1);

      return mapOrderRow(result, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] confirmOrder failed:", err);
      return { error: "CONFIRM_FAILED" };
    }
  });
}

/** Start preparation: confirmed -> in_preparation. */
export async function startPreparation(
  id: string
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const existing = await db
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };
      if (existing[0].status !== "confirmed")
        return { error: "INVALID_STATUS" };

      const rows = await db
        .update(orders)
        .set({
          status: "in_preparation",
          updatedAt: sql`now()`,
        })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .returning();

      const row = rows[0];
      if (!row) return { error: "NOT_FOUND" };

      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, row.partnerId))
        .limit(1);

      return mapOrderRow(row, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] startPreparation failed:", err);
      return { error: "TRANSITION_FAILED" };
    }
  });
}

/** Ship order: in_preparation -> shipped. Sets shippedDate to today.
 * Releases reserved_qty (stock was already physically consumed via stock issue).
 */
export async function shipOrder(
  id: string
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const existing = await db
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };
      if (existing[0].status !== "in_preparation")
        return { error: "INVALID_STATUS" };

      const today = new Date().toISOString().slice(0, 10);

      // Release reserved_qty + update status in a transaction
      const result = await db.transaction(async (tx) => {
        // Release reserved stock
        await adjustReservedQtyForOrder(tx, tenantId, id, -1);

        const rows = await tx
          .update(orders)
          .set({
            status: "shipped",
            shippedDate: today,
            updatedAt: sql`now()`,
          })
          .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
          .returning();

        return rows[0];
      });

      if (!result) return { error: "NOT_FOUND" };

      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, result.partnerId))
        .limit(1);

      return mapOrderRow(result, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] shipOrder failed:", err);
      return { error: "TRANSITION_FAILED" };
    }
  });
}

/** Deliver order: shipped -> delivered. Sets deliveredDate to today. */
export async function deliverOrder(
  id: string
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const existing = await db
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };
      if (existing[0].status !== "shipped") return { error: "INVALID_STATUS" };

      const today = new Date().toISOString().slice(0, 10);

      const rows = await db
        .update(orders)
        .set({
          status: "delivered",
          deliveredDate: today,
          updatedAt: sql`now()`,
        })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .returning();

      const row = rows[0];
      if (!row) return { error: "NOT_FOUND" };

      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, row.partnerId))
        .limit(1);

      return mapOrderRow(row, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] deliverOrder failed:", err);
      return { error: "TRANSITION_FAILED" };
    }
  });
}

/** Invoice order: delivered -> invoiced. Sets closedDate to today. */
export async function invoiceOrder(
  id: string
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const existing = await db
        .select({ status: orders.status })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };
      if (existing[0].status !== "delivered")
        return { error: "INVALID_STATUS" };

      const today = new Date().toISOString().slice(0, 10);

      const rows = await db
        .update(orders)
        .set({
          status: "invoiced",
          closedDate: today,
          updatedAt: sql`now()`,
        })
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .returning();

      const row = rows[0];
      if (!row) return { error: "NOT_FOUND" };

      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, row.partnerId))
        .limit(1);

      return mapOrderRow(row, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] invoiceOrder failed:", err);
      return { error: "TRANSITION_FAILED" };
    }
  });
}

/** Cancel an order: any status except invoiced -> cancelled. Sets closedDate.
 * Releases reserved_qty if order was confirmed+ and not yet shipped.
 * Cancels any linked draft stock issue.
 */
export async function cancelOrder(
  id: string,
  reason?: string
): Promise<Order | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const existing = await db
        .select({
          status: orders.status,
          internalNotes: orders.internalNotes,
          stockIssueId: orders.stockIssueId,
        })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
        .limit(1);

      const existingRow = existing[0];
      if (!existingRow) return { error: "NOT_FOUND" };
      if (existingRow.status === "invoiced")
        return { error: "ALREADY_INVOICED" };
      if (existingRow.status === "cancelled")
        return { error: "ALREADY_CANCELLED" };

      const today = new Date().toISOString().slice(0, 10);
      const previousStatus = existingRow.status;
      const linkedStockIssueId = existingRow.stockIssueId;

      // Append or set cancellation reason in internalNotes
      let newInternalNotes = existingRow.internalNotes;
      if (reason) {
        if (newInternalNotes) {
          newInternalNotes = `${newInternalNotes}\n[Cancelled] ${reason}`;
        } else {
          newInternalNotes = `[Cancelled] ${reason}`;
        }
      }

      const result = await db.transaction(async (tx) => {
        // Release reserved_qty if order was confirmed but not yet shipped
        // (shipped already released reserved_qty)
        const hasReservation =
          previousStatus === "confirmed" ||
          previousStatus === "in_preparation";

        if (hasReservation) {
          await adjustReservedQtyForOrder(tx, tenantId, id, -1);
        }

        // Cancel linked draft stock issue if any
        if (linkedStockIssueId) {
          const issueRows = await tx
            .select({ status: stockIssues.status })
            .from(stockIssues)
            .where(eq(stockIssues.id, linkedStockIssueId))
            .limit(1);

          if (issueRows[0]?.status === "draft") {
            await tx
              .update(stockIssues)
              .set({ status: "cancelled", updatedAt: sql`now()` })
              .where(eq(stockIssues.id, linkedStockIssueId));
          }
        }

        // Set order status to cancelled
        const rows = await tx
          .update(orders)
          .set({
            status: "cancelled",
            closedDate: today,
            internalNotes: newInternalNotes,
            updatedAt: sql`now()`,
          })
          .where(and(eq(orders.tenantId, tenantId), eq(orders.id, id)))
          .returning();

        return rows[0];
      });

      if (!result) return { error: "NOT_FOUND" };

      const partnerRows = await db
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, result.partnerId))
        .limit(1);

      return mapOrderRow(result, { partnerName: partnerRows[0]?.name });
    } catch (err: unknown) {
      console.error("[orders] cancelOrder failed:", err);
      return { error: "CANCEL_FAILED" };
    }
  });
}

// ── Stock Issue from Order ────────────────────────────────────

/**
 * Create a draft stock issue from an order.
 * Creates one issue line per order item. Links the stock issue to the order.
 * Only allowed for confirmed+ orders without an existing stock issue.
 */
export async function createStockIssueFromOrder(
  orderId: string
): Promise<{ stockIssueId: string } | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      // Load order with items
      const orderRow = await db
        .select({
          status: orders.status,
          partnerId: orders.partnerId,
          warehouseId: orders.warehouseId,
          stockIssueId: orders.stockIssueId,
          orderDate: orders.orderDate,
        })
        .from(orders)
        .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)))
        .limit(1);

      const oRow = orderRow[0];
      if (!oRow) return { error: "NOT_FOUND" };
      if (oRow.status === "draft") return { error: "NOT_CONFIRMED" };
      if (oRow.status === "cancelled") return { error: "CANCELLED" };
      if (oRow.stockIssueId) return { error: "ALREADY_HAS_ISSUE" };

      const warehouseId = oRow.warehouseId;
      if (!warehouseId) return { error: "NO_WAREHOUSE" };

      const issueDate = oRow.orderDate;
      const issueParnerId = oRow.partnerId;

      // Load order items
      const oItems = await db
        .select({
          id: orderItems.id,
          itemId: orderItems.itemId,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(
          and(
            eq(orderItems.orderId, orderId),
            eq(orderItems.tenantId, tenantId)
          )
        )
        .orderBy(orderItems.sortOrder, orderItems.createdAt);

      if (oItems.length === 0) return { error: "NO_ITEMS" };

      // Generate stock issue code
      const counterEntity = "stock_issue_dispatch";
      const code = await getNextNumber(tenantId, counterEntity, warehouseId);

      // Create stock issue + lines in a transaction
      const issueId = await db.transaction(async (tx) => {
        // Create draft stock issue
        const issueRows = await tx
          .insert(stockIssues)
          .values({
            tenantId,
            code,
            movementType: "issue",
            movementPurpose: "sale",
            date: issueDate,
            status: "draft",
            warehouseId,
            partnerId: issueParnerId,
            orderId,
          })
          .returning({ id: stockIssues.id });

        const newIssueId = issueRows[0]?.id;
        if (!newIssueId) throw new Error("Failed to create stock issue");

        // Create issue lines from order items
        let lineNo = 0;
        for (const oi of oItems) {
          lineNo += 1;
          await tx.insert(stockIssueLines).values({
            tenantId,
            stockIssueId: newIssueId,
            itemId: oi.itemId,
            orderItemId: oi.id,
            lineNo,
            requestedQty: oi.quantity,
            issuedQty: oi.quantity,
            unitPrice: oi.unitPrice,
            sortOrder: lineNo,
          });
        }

        // Link stock issue back to the order
        await tx
          .update(orders)
          .set({
            stockIssueId: newIssueId,
            updatedAt: sql`now()`,
          })
          .where(and(eq(orders.tenantId, tenantId), eq(orders.id, orderId)));

        return newIssueId;
      });

      return { stockIssueId: issueId };
    } catch (err: unknown) {
      console.error("[orders] createStockIssueFromOrder failed:", err);
      return { error: "CREATE_ISSUE_FAILED" };
    }
  });
}

// ── Helper Options Loaders ────────────────────────────────────

/** Get partner options (customers only) for select fields. */
export async function getPartnerOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: partners.id, name: partners.name })
      .from(partners)
      .where(
        and(
          eq(partners.tenantId, tenantId),
          eq(partners.isCustomer, true),
          eq(partners.isActive, true)
        )
      )
      .orderBy(partners.name);

    return rows.map((r) => ({ value: r.id, label: r.name }));
  });
}

/** Get contact options for a given partner. */
export async function getContactOptions(
  partnerId: string
): Promise<Array<{ value: string; label: string }>> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          eq(contacts.partnerId, partnerId)
        )
      )
      .orderBy(contacts.name);

    return rows.map((r) => ({ value: r.id, label: r.name }));
  });
}

/** Get item options (sale items only) for order line selection. */
export async function getItemOptions(): Promise<
  Array<{
    value: string;
    label: string;
    unitPrice: string;
    unitSymbol: string;
  }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: items.id,
        name: items.name,
        code: items.code,
        salePrice: items.salePrice,
        unitSymbol: units.symbol,
      })
      .from(items)
      .leftJoin(units, eq(items.unitId, units.id))
      .where(
        and(
          eq(items.tenantId, tenantId),
          eq(items.isSaleItem, true),
          eq(items.isActive, true)
        )
      )
      .orderBy(items.name);

    return rows.map((r) => ({
      value: r.id,
      label: `${r.code} — ${r.name}`,
      unitPrice: r.salePrice ?? "0",
      unitSymbol: r.unitSymbol ?? "ks",
    }));
  });
}

/** Get shop options for select fields. */
export async function getShopOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: shops.id, name: shops.name })
      .from(shops)
      .where(
        and(eq(shops.tenantId, tenantId), eq(shops.isActive, true))
      )
      .orderBy(shops.name);

    return rows.map((r) => ({ value: r.id, label: r.name }));
  });
}

/** Get warehouse options for select fields. */
export async function getWarehouseOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: warehouses.id,
        name: warehouses.name,
        code: warehouses.code,
      })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenantId, tenantId),
          eq(warehouses.isActive, true)
        )
      )
      .orderBy(warehouses.name);

    return rows.map((r) => ({
      value: r.id,
      label: `${r.code} — ${r.name}`,
    }));
  });
}

/** Get deposit options for select fields. */
export async function getDepositOptions(): Promise<
  Array<{ value: string; label: string; depositAmount: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: deposits.id,
        name: deposits.name,
        depositAmount: deposits.depositAmount,
      })
      .from(deposits)
      .where(
        and(eq(deposits.tenantId, tenantId), eq(deposits.isActive, true))
      )
      .orderBy(deposits.name);

    return rows.map((r) => ({
      value: r.id,
      label: r.name,
      depositAmount: r.depositAmount,
    }));
  });
}
