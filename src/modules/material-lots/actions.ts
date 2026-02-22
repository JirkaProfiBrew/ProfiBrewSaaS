"use server";

import { eq, and, ilike, or, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import {
  stockIssues,
  stockIssueLines,
  stockMovements,
} from "@/../drizzle/schema/stock";
import { items } from "@/../drizzle/schema/items";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { partners } from "@/../drizzle/schema/partners";
import { units } from "@/../drizzle/schema/system";
import type {
  TrackingLot,
  TrackingLotDetail,
  TrackingAllocation,
  TrackingFilter,
} from "./types";
import type { TrackingLotStatus } from "@/modules/stock-issues/types";

function computeStatus(
  remainingQty: string | null,
  issuedQty: string | null,
  expiryDate: string | null
): TrackingLotStatus {
  const remaining = Number(remainingQty ?? "0");
  const issued = Number(issuedQty ?? "0");

  if (expiryDate && new Date(expiryDate) < new Date()) return "expired";
  if (remaining <= 0) return "issued";
  if (issued > 0 && remaining < issued) return "partial";
  return "in_stock";
}

export async function getTrackingLots(
  filter?: TrackingFilter
): Promise<TrackingLot[]> {
  return withTenant(async (tenantId) => {
    const conditions = [
      eq(stockIssueLines.tenantId, tenantId),
      eq(stockIssues.movementType, "receipt"),
      eq(stockIssues.status, "confirmed"),
    ];

    if (filter?.warehouseId) {
      conditions.push(eq(stockIssues.warehouseId, filter.warehouseId));
    }
    if (filter?.itemId) {
      conditions.push(eq(stockIssueLines.itemId, filter.itemId));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(stockIssues.code, `%${filter.search}%`),
          ilike(stockIssueLines.lotNumber, `%${filter.search}%`),
          ilike(items.name, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select({
        id: stockIssueLines.id,
        receiptCode: stockIssues.code,
        receiptDate: stockIssues.date,
        itemId: stockIssueLines.itemId,
        itemName: items.name,
        itemCode: items.code,
        supplierName: partners.name,
        lotNumber: stockIssueLines.lotNumber,
        expiryDate: stockIssueLines.expiryDate,
        issuedQty: stockIssueLines.issuedQty,
        remainingQty: stockIssueLines.remainingQty,
        unitPrice: stockIssueLines.unitPrice,
        unitSymbol: units.symbol,
        lotAttributes: stockIssueLines.lotAttributes,
        warehouseId: stockIssues.warehouseId,
        warehouseName: warehouses.name,
        materialType: items.materialType,
      })
      .from(stockIssueLines)
      .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
      .innerJoin(items, eq(stockIssueLines.itemId, items.id))
      .innerJoin(warehouses, eq(stockIssues.warehouseId, warehouses.id))
      .leftJoin(partners, eq(stockIssues.partnerId, partners.id))
      .leftJoin(units, eq(items.unitId, units.id))
      .where(and(...conditions))
      .orderBy(desc(stockIssues.date), desc(stockIssueLines.createdAt));

    const lots = rows.map((r) => ({
      id: r.id,
      receiptCode: r.receiptCode,
      receiptDate: r.receiptDate,
      itemId: r.itemId,
      itemName: r.itemName,
      itemCode: r.itemCode,
      supplierName: r.supplierName ?? null,
      lotNumber: r.lotNumber ?? null,
      expiryDate: r.expiryDate ?? null,
      issuedQty: r.issuedQty ?? "0",
      remainingQty: r.remainingQty ?? "0",
      unitPrice: r.unitPrice ?? null,
      unitSymbol: r.unitSymbol ?? null,
      lotAttributes: (r.lotAttributes as Record<string, unknown>) ?? {},
      status: computeStatus(r.remainingQty, r.issuedQty, r.expiryDate),
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      materialType: r.materialType ?? null,
    }));

    // Apply status filter in app layer (computed field)
    if (filter?.status) {
      return lots.filter((l) => l.status === filter.status);
    }

    return lots;
  });
}

export async function getTrackingLot(
  id: string
): Promise<TrackingLotDetail | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: stockIssueLines.id,
        receiptCode: stockIssues.code,
        receiptDate: stockIssues.date,
        itemId: stockIssueLines.itemId,
        itemName: items.name,
        itemCode: items.code,
        supplierName: partners.name,
        lotNumber: stockIssueLines.lotNumber,
        expiryDate: stockIssueLines.expiryDate,
        issuedQty: stockIssueLines.issuedQty,
        remainingQty: stockIssueLines.remainingQty,
        unitPrice: stockIssueLines.unitPrice,
        unitSymbol: units.symbol,
        lotAttributes: stockIssueLines.lotAttributes,
        warehouseId: stockIssues.warehouseId,
        warehouseName: warehouses.name,
        materialType: items.materialType,
      })
      .from(stockIssueLines)
      .innerJoin(stockIssues, eq(stockIssueLines.stockIssueId, stockIssues.id))
      .innerJoin(items, eq(stockIssueLines.itemId, items.id))
      .innerJoin(warehouses, eq(stockIssues.warehouseId, warehouses.id))
      .leftJoin(partners, eq(stockIssues.partnerId, partners.id))
      .leftJoin(units, eq(items.unitId, units.id))
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.id, id),
          eq(stockIssues.movementType, "receipt"),
          eq(stockIssues.status, "confirmed")
        )
      )
      .limit(1);

    const r = rows[0];
    if (!r) return null;

    // Get allocations (issue lines that allocated from this receipt line)
    const allocations = await getTrackingLotAllocations(tenantId, id);

    return {
      id: r.id,
      receiptCode: r.receiptCode,
      receiptDate: r.receiptDate,
      itemId: r.itemId,
      itemName: r.itemName,
      itemCode: r.itemCode,
      supplierName: r.supplierName ?? null,
      lotNumber: r.lotNumber ?? null,
      expiryDate: r.expiryDate ?? null,
      issuedQty: r.issuedQty ?? "0",
      remainingQty: r.remainingQty ?? "0",
      unitPrice: r.unitPrice ?? null,
      unitSymbol: r.unitSymbol ?? null,
      lotAttributes: (r.lotAttributes as Record<string, unknown>) ?? {},
      status: computeStatus(r.remainingQty, r.issuedQty, r.expiryDate),
      warehouseId: r.warehouseId,
      warehouseName: r.warehouseName,
      materialType: r.materialType ?? null,
      allocations,
    };
  });
}

/** Internal: get issue allocations for a receipt line using movements (by tenantId -- already verified). */
async function getTrackingLotAllocations(
  tenantId: string,
  receiptLineId: string
): Promise<TrackingAllocation[]> {
  const { batches } = await import("@/../drizzle/schema/batches");

  // Single query with JOIN to stock_issues + batches instead of N+1
  const rows = await db
    .select({
      id: stockMovements.id,
      quantity: stockMovements.quantity,
      unitPrice: stockMovements.unitPrice,
      issueCode: stockIssues.code,
      issueDate: stockIssues.date,
      movementPurpose: stockIssues.movementPurpose,
      batchId: stockIssues.batchId,
      batchNumber: batches.batchNumber,
    })
    .from(stockMovements)
    .innerJoin(stockIssues, eq(stockMovements.stockIssueId, stockIssues.id))
    .leftJoin(batches, eq(stockIssues.batchId, batches.id))
    .where(
      and(
        eq(stockMovements.tenantId, tenantId),
        eq(stockMovements.receiptLineId, receiptLineId),
        sql`${stockMovements.quantity}::decimal < 0`,
        sql`${stockMovements.notes} IS DISTINCT FROM 'Storno'`
      )
    );

  return rows.map((r) => ({
    id: r.id,
    issueCode: r.issueCode ?? "?",
    issueDate: r.issueDate ?? "?",
    quantity: String(Math.abs(Number(r.quantity))),
    unitPrice: r.unitPrice ?? "0",
    movementPurpose: r.movementPurpose ?? null,
    batchId: r.batchId ?? null,
    batchNumber: r.batchNumber ?? null,
  }));
}
