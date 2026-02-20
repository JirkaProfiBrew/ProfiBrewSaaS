export interface CashFlowCategory {
  id: string;
  tenantId: string;
  name: string;
  parentId: string | null;
  cashflowType: "income" | "expense";
  isSystem: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date | null;
  // computed in client
  children?: CashFlowCategory[];
  depth?: number;
}

export interface CreateCategoryInput {
  name: string;
  parentId: string | null;
  cashflowType: "income" | "expense";
}

export interface UpdateCategoryInput {
  name?: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}
