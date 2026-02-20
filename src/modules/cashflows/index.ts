/**
 * Cashflows module -- public API.
 * Re-exports types, actions, hooks, and config for use by other modules and pages.
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
