/**
 * Cashflows module — type definitions.
 * Matches the DB schema in drizzle/schema/cashflows.ts.
 * Drizzle decimal columns return strings.
 */

// -- Enum types ----------------------------------------------------------------

export type CashFlowType = "income" | "expense";
export type CashFlowStatus = "planned" | "pending" | "paid" | "cancelled";
export type TemplateFrequency = "weekly" | "monthly" | "quarterly" | "yearly";

// -- CashFlow ------------------------------------------------------------------

export interface CashFlow {
  id: string;
  tenantId: string;
  code: string | null;
  cashflowType: CashFlowType;
  categoryId: string | null;
  amount: string;
  currency: string;
  date: string;
  dueDate: string | null;
  paidDate: string | null;
  status: CashFlowStatus;
  partnerId: string | null;
  orderId: string | null;
  stockIssueId: string | null;
  shopId: string | null;
  description: string | null;
  notes: string | null;
  isCash: boolean;
  cashDeskId: string | null;
  templateId: string | null;
  isRecurring: boolean;
  createdBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Joined fields
  categoryName: string | null;
  partnerName: string | null;
  cashDeskName: string | null;
}

// -- CashFlowCategory ----------------------------------------------------------

export interface CashFlowCategory {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  cashflowType: CashFlowType;
  isSystem: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date | null;
}

// -- CashFlowTemplate ----------------------------------------------------------

export interface CashFlowTemplate {
  id: string;
  tenantId: string;
  name: string;
  cashflowType: CashFlowType;
  categoryId: string | null;
  amount: string;
  description: string | null;
  partnerId: string | null;
  frequency: TemplateFrequency;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  nextDate: string;
  isActive: boolean;
  autoGenerate: boolean;
  lastGenerated: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  // Joined fields
  categoryName: string | null;
  partnerName: string | null;
}

// -- Input types ---------------------------------------------------------------

export interface CreateCashFlowInput {
  cashflowType: CashFlowType;
  categoryId?: string | null;
  amount: string;
  currency?: string;
  date: string;
  dueDate?: string | null;
  status?: CashFlowStatus;
  partnerId?: string | null;
  orderId?: string | null;
  stockIssueId?: string | null;
  shopId?: string | null;
  description?: string | null;
  notes?: string | null;
  isCash?: boolean;
  cashDeskId?: string | null;
}

export interface UpdateCashFlowInput {
  categoryId?: string | null;
  amount?: string;
  currency?: string;
  date?: string;
  dueDate?: string | null;
  status?: CashFlowStatus;
  partnerId?: string | null;
  description?: string | null;
  notes?: string | null;
  isCash?: boolean;
}

export interface CreateTemplateInput {
  name: string;
  cashflowType: CashFlowType;
  categoryId?: string | null;
  amount: string;
  description?: string | null;
  partnerId?: string | null;
  frequency: TemplateFrequency;
  dayOfMonth?: number | null;
  startDate: string;
  endDate?: string | null;
  nextDate: string;
  autoGenerate?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  categoryId?: string | null;
  amount?: string;
  description?: string | null;
  partnerId?: string | null;
  frequency?: TemplateFrequency;
  dayOfMonth?: number | null;
  endDate?: string | null;
  nextDate?: string;
  isActive?: boolean;
  autoGenerate?: boolean;
}

// -- Filter types --------------------------------------------------------------

export interface CashFlowFilter {
  cashflowType?: CashFlowType;
  status?: CashFlowStatus;
  categoryId?: string;
  partnerId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// -- Summary -------------------------------------------------------------------

export interface CashFlowSummary {
  month: number;
  year: number;
  totalIncome: string;
  totalExpense: string;
  balance: string;
  paidIncome: string;
  paidExpense: string;
  paidBalance: string;
}

// -- Select options ------------------------------------------------------------

export interface SelectOption {
  value: string;
  label: string;
}

export interface CategoryOption extends SelectOption {
  type: CashFlowType;
  parentId: string | null;
}
