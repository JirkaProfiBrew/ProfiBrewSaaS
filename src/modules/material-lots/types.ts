import type { TrackingLotStatus } from "@/modules/stock-issues/types";

export interface TrackingLot {
  id: string; // stock_issue_line.id
  receiptCode: string;
  receiptDate: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  supplierName: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
  issuedQty: string;
  remainingQty: string;
  unitPrice: string | null;
  unitSymbol: string | null;
  lotAttributes: Record<string, unknown>;
  status: TrackingLotStatus;
  warehouseId: string;
  warehouseName: string;
  materialType: string | null;
}

export interface TrackingLotDetail extends TrackingLot {
  allocations: TrackingAllocation[];
}

export interface TrackingAllocation {
  id: string;
  issueCode: string;
  issueDate: string;
  quantity: string;
  unitPrice: string;
}

export interface TrackingFilter {
  status?: TrackingLotStatus;
  warehouseId?: string;
  itemId?: string;
  search?: string;
}
