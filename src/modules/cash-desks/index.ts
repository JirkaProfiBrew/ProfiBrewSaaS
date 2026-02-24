/**
 * Cash Desks module -- public API.
 * Re-exports types, actions, hooks, and components for use by other modules and pages.
 */

// Types
export type {
  CashDesk,
  CreateCashDeskInput,
  UpdateCashDeskInput,
  CashDeskTransactionInput,
  CashDeskDailySummary,
} from "./types";

// Actions
export {
  getCashDesks,
  getCashDesk,
  createCashDesk,
  updateCashDesk,
  deleteCashDesk,
  createCashDeskTransaction,
  updateCashDeskTransaction,
  deleteCashDeskTransaction,
  getCashDeskTransactions,
  getCashDeskDailySummary,
  getShopOptions,
} from "./actions";

// Hooks
export {
  useCashDeskList,
  useCashDeskDetail,
  useCashDeskTransactions,
  useCashDeskDailySummary,
} from "./hooks";

// Components
export { CashDeskManager } from "./components/CashDeskManager";
export { CashDeskView } from "./components/CashDeskView";
export { CashDeskTransactionDialog } from "./components/CashDeskTransactionDialog";
