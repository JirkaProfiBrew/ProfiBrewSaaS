/**
 * Cashflows module -- public API.
 * Re-exports types, actions, hooks, config, and components for use by other modules and pages.
 */

export type {
  CashFlow,
  CashFlowCategory,
  CashFlowTemplate,
  CashFlowType,
  CashFlowStatus,
  TemplateFrequency,
  CreateCashFlowInput,
  UpdateCashFlowInput,
  CreateTemplateInput,
  UpdateTemplateInput,
  CashFlowFilter,
  CashFlowSummary,
  SelectOption,
  CategoryOption,
} from "./types";

export {
  getCashFlows,
  getCashFlow,
  createCashFlow,
  updateCashFlow,
  deleteCashFlow,
  markCashFlowPaid,
  cancelCashFlow,
  getCashFlowSummary,
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  generateFromTemplates,
  createCashFlowFromOrder,
  getPartnerOptions,
  getCategoryOptions,
} from "./actions";

export {
  useCashFlowList,
  useCashFlowDetail,
  useTemplateList,
  useTemplateDetail,
} from "./hooks";

export { cashflowBrowserConfig } from "./config";

// Components
export { CashFlowBrowser } from "./components/CashFlowBrowser";
export { CashFlowDetail } from "./components/CashFlowDetail";
export { CashFlowStatusBadge } from "./components/CashFlowStatusBadge";
export { CashFlowTypeBadge } from "./components/CashFlowTypeBadge";
export { CashFlowSummaryPanel } from "./components/CashFlowSummaryPanel";
export { TemplateManager } from "./components/TemplateManager";
