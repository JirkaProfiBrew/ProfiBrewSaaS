/**
 * Orders module — type definitions.
 * Matches the DB schema in drizzle/schema/orders.ts.
 * Drizzle decimal columns return strings.
 */

// -- Status enum ---------------------------------------------------------------

export type OrderStatus =
  | "draft"
  | "confirmed"
  | "in_preparation"
  | "shipped"
  | "delivered"
  | "invoiced"
  | "cancelled";

// -- Order ---------------------------------------------------------------------

export interface Order {
  id: string;
  tenantId: string;
  orderNumber: string;
  partnerId: string;
  contactId: string | null;
  status: OrderStatus;
  orderDate: string;
  deliveryDate: string | null;
  shippedDate: string | null;
  deliveredDate: string | null;
  closedDate: string | null;
  shopId: string | null;
  warehouseId: string | null;
  totalExclVat: string;
  totalVat: string;
  totalInclVat: string;
  totalDeposit: string;
  currency: string;
  stockIssueId: string | null;
  cashflowId: string | null;
  notes: string | null;
  internalNotes: string | null;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Joined fields (from browser queries)
  partnerName: string | null;
  contactName: string | null;
}

// -- Order Item ----------------------------------------------------------------

export interface OrderItem {
  id: string;
  tenantId: string;
  orderId: string;
  itemId: string;
  quantity: string;
  unitId: string | null;
  unitPrice: string;
  vatRate: string;
  discountPct: string;
  totalExclVat: string | null;
  totalVat: string | null;
  totalInclVat: string | null;
  depositId: string | null;
  depositQty: string;
  depositTotal: string;
  notes: string | null;
  sortOrder: number;
  createdAt: Date | null;
  // Joined fields
  itemName: string | null;
  itemCode: string | null;
  unitSymbol: string | null;
  depositName: string | null;
  depositAmount: string | null;
}

// -- Composite types -----------------------------------------------------------

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

// -- Input types ---------------------------------------------------------------

export interface CreateOrderInput {
  partnerId: string;
  contactId?: string | null;
  orderDate?: string;
  deliveryDate?: string | null;
  shopId?: string | null;
  warehouseId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
}

export interface UpdateOrderInput {
  partnerId?: string;
  contactId?: string | null;
  deliveryDate?: string | null;
  shopId?: string | null;
  warehouseId?: string | null;
  notes?: string | null;
  internalNotes?: string | null;
}

export interface CreateOrderItemInput {
  itemId: string;
  quantity: string;
  unitPrice: string;
  vatRate?: string;
  discountPct?: string;
  depositId?: string | null;
  depositQty?: string;
  notes?: string | null;
}

export interface UpdateOrderItemInput {
  quantity?: string;
  unitPrice?: string;
  vatRate?: string;
  discountPct?: string;
  depositId?: string | null;
  depositQty?: string;
  notes?: string | null;
}

// -- Filters -------------------------------------------------------------------

export interface OrderFilter {
  status?: string;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// -- Totals --------------------------------------------------------------------

export interface OrderTotals {
  totalExclVat: string;
  totalVat: string;
  totalInclVat: string;
  totalDeposit: string;
}
