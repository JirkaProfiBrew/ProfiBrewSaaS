/**
 * Orders module — public API.
 * Re-exports types, components, and hooks for use by other modules.
 */
export type {
  Order,
  OrderItem,
  OrderWithItems,
  OrderStatus,
  CreateOrderInput,
  UpdateOrderInput,
  CreateOrderItemInput,
  UpdateOrderItemInput,
  OrderFilter,
  OrderTotals,
} from "./types";

export { OrderBrowser } from "./components/OrderBrowser";
export { OrderDetail } from "./components/OrderDetail";
export { OrderStatusBadge } from "./components/OrderStatusBadge";
export { OrderStatusActions } from "./components/OrderStatusActions";
