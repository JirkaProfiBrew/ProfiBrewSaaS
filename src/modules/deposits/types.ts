/**
 * Deposits module — type definitions.
 */

export interface Deposit {
  id: string;
  tenantId: string;
  name: string;
  depositAmount: string; // decimal as string
  isActive: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateDepositInput {
  name: string;
  depositAmount: string;
}

export interface UpdateDepositInput {
  name?: string;
  depositAmount?: string;
  isActive?: boolean;
}
