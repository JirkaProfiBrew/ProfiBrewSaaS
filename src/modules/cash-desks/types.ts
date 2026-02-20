/**
 * Cash Desks module — type definitions.
 * Matches the DB schema in drizzle/schema/cashflows.ts (cashDesks table).
 * Drizzle decimal columns return strings.
 */

// -- CashDesk ------------------------------------------------------------------

export interface CashDesk {
  id: string;
  tenantId: string;
  name: string;
  shopId: string;
  shopName: string | null;
  currentBalance: string; // decimal from DB
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

// -- Input types ---------------------------------------------------------------

export interface CreateCashDeskInput {
  name: string;
  shopId: string;
}

export interface UpdateCashDeskInput {
  name?: string;
  shopId?: string;
  isActive?: boolean;
}

export interface CashDeskTransactionInput {
  type: "income" | "expense";
  amount: string;
  description: string;
  categoryId?: string | null;
}

// -- Summary -------------------------------------------------------------------

export interface CashDeskDailySummary {
  income: string;
  expense: string;
  net: string;
  transactionCount: number;
}
