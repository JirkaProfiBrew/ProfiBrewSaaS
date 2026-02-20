"use server";

import { eq, and, ilike, or, gte, lte, sql, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { getNextNumber } from "@/lib/db/counters";
import {
  stockIssues,
  stockIssueLines,
  stockMovements,
} from "@/../drizzle/schema/stock";
import { items } from "@/../drizzle/schema/items";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { partners } from "@/../drizzle/schema/partners";
import {
  allocateFIFO,
  processManualAllocations,
} from "./lib/allocation-engine";
import { updateStockStatusRow } from "./lib/stock-status-sync";
import type {
  StockIssue,
  StockIssueLine,
  StockIssueWithLines,
  CreateStockIssueInput,
  UpdateStockIssueInput,
  CreateLineInput,
  UpdateLineInput,
  StockIssueFilter,
  AvailableReceiptLine,
  ManualAllocationInput,
  ManualAllocationJsonEntry,
  ReceiptCancelCheck,
  BlockingIssueInfo,
  PrevalidationResult,
  PrevalidationWarning,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────

function mapIssueRow(
  row: typeof stockIssues.$inferSelect,
  joined?: { warehouseName?: string | null; partnerName?: string | null }
): StockIssue {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    codeNumber: row.codeNumber,
    codePrefix: row.codePrefix,
    counterId: row.counterId,
    movementType: row.movementType,
    movementPurpose: row.movementPurpose,
    date: row.date,
    status: row.status ?? "draft",
    warehouseId: row.warehouseId,
    partnerId: row.partnerId,
    orderId: row.orderId,
    batchId: row.batchId,
    season: row.season,
    additionalCost: row.additionalCost ?? "0",
    totalCost: row.totalCost ?? "0",
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    warehouseName: joined?.warehouseName ?? null,
    partnerName: joined?.partnerName ?? null,
  };
}

function mapLineRow(
  row: typeof stockIssueLines.$inferSelect,
  computedIssuedQty?: string | null
): StockIssueLine {
  const issuedQty = computedIssuedQty ?? row.issuedQty;
  const requestedNum = Number(row.requestedQty);
  const issuedNum = Number(issuedQty ?? "0");
  const computedMissing =
    computedIssuedQty !== undefined && issuedQty
      ? requestedNum > issuedNum
        ? String(requestedNum - issuedNum)
        : null
      : row.missingQty;

  return {
    id: row.id,
    tenantId: row.tenantId,
    stockIssueId: row.stockIssueId,
    itemId: row.itemId,
    lineNo: row.lineNo,
    requestedQty: row.requestedQty,
    issuedQty: issuedQty,
    missingQty: computedMissing,
    unitPrice: row.unitPrice,
    totalCost: row.totalCost,
    issueModeSnapshot: row.issueModeSnapshot,
    notes: row.notes,
    sortOrder: row.sortOrder ?? 0,
    manualAllocations:
      (row.manualAllocations as ManualAllocationJsonEntry[] | null) ?? null,
    lotNumber: row.lotNumber ?? null,
    expiryDate: row.expiryDate ?? null,
    lotAttributes: (row.lotAttributes as Record<string, unknown>) ?? {},
    remainingQty: row.remainingQty ?? null,
    createdAt: row.createdAt,
  };
}

// ── CRUD: Stock Issues ─────────────────────────────────────────

/** List stock issues with optional filters. */
export async function getStockIssues(
  filter?: StockIssueFilter
): Promise<StockIssue[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(stockIssues.tenantId, tenantId)];

    if (filter?.movementType) {
      conditions.push(eq(stockIssues.movementType, filter.movementType));
    }
    if (filter?.status) {
      conditions.push(eq(stockIssues.status, filter.status));
    }
    if (filter?.warehouseId) {
      conditions.push(eq(stockIssues.warehouseId, filter.warehouseId));
    }
    if (filter?.partnerId) {
      conditions.push(eq(stockIssues.partnerId, filter.partnerId));
    }
    if (filter?.dateFrom) {
      conditions.push(gte(stockIssues.date, filter.dateFrom));
    }
    if (filter?.dateTo) {
      conditions.push(lte(stockIssues.date, filter.dateTo));
    }
    if (filter?.search) {
      conditions.push(
        or(
          ilike(stockIssues.code, `%${filter.search}%`),
          ilike(stockIssues.notes, `%${filter.search}%`)
        )!
      );
    }

    const rows = await db
      .select({
        issue: stockIssues,
        warehouseName: warehouses.name,
        partnerName: partners.name,
      })
      .from(stockIssues)
      .leftJoin(warehouses, eq(stockIssues.warehouseId, warehouses.id))
      .leftJoin(partners, eq(stockIssues.partnerId, partners.id))
      .where(and(...conditions))
      .orderBy(desc(stockIssues.date), desc(stockIssues.createdAt));

    return rows.map((r) =>
      mapIssueRow(r.issue, {
        warehouseName: r.warehouseName,
        partnerName: r.partnerName,
      })
    );
  });
}

/** Get a single stock issue by ID, including lines with computed actuals. */
export async function getStockIssue(
  id: string
): Promise<StockIssueWithLines | null> {
  return withTenant(async (tenantId) => {
    const issueRows = await db
      .select()
      .from(stockIssues)
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
      )
      .limit(1);

    const issueRow = issueRows[0];
    if (!issueRow) return null;

    const lineRows = await db
      .select()
      .from(stockIssueLines)
      .where(eq(stockIssueLines.stockIssueId, id))
      .orderBy(stockIssueLines.sortOrder, stockIssueLines.createdAt);

    const isConfirmedIssue =
      issueRow.movementType === "issue" && issueRow.status === "confirmed";

    // For confirmed issues: compute issuedQty from movements
    let computedActuals: Record<string, string> = {};
    if (isConfirmedIssue) {
      const movementSums = await db
        .select({
          lineId: stockMovements.stockIssueLineId,
          totalQty: sql<string>`SUM(ABS(${stockMovements.quantity}::decimal))`,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.stockIssueId, id),
            sql`${stockMovements.notes} IS DISTINCT FROM 'Storno'`
          )
        )
        .groupBy(stockMovements.stockIssueLineId);

      computedActuals = Object.fromEntries(
        movementSums
          .filter((r) => r.lineId != null)
          .map((r) => [r.lineId!, r.totalQty])
      );
    }

    return {
      ...mapIssueRow(issueRow),
      lines: lineRows.map((row) =>
        mapLineRow(
          row,
          isConfirmedIssue ? (computedActuals[row.id] ?? "0") : undefined
        )
      ),
    };
  });
}

/** Create a new draft stock issue with auto-generated code. */
export async function createStockIssue(
  data: CreateStockIssueInput
): Promise<StockIssue> {
  return withTenant(async (tenantId) => {
    // Determine counter entity based on movement type
    const counterEntity =
      data.movementType === "receipt"
        ? "stock_issue_receipt"
        : "stock_issue_dispatch";

    // Generate code from per-warehouse counter
    const code = await getNextNumber(tenantId, counterEntity, data.warehouseId);

    const rows = await db
      .insert(stockIssues)
      .values({
        tenantId,
        code,
        movementType: data.movementType,
        movementPurpose: data.movementPurpose,
        date: data.date,
        status: "draft",
        warehouseId: data.warehouseId,
        partnerId: data.partnerId ?? null,
        batchId: data.batchId ?? null,
        season: data.season ?? null,
        additionalCost: data.additionalCost ?? "0",
        notes: data.notes ?? null,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create stock issue");
    return mapIssueRow(row);
  });
}

/** Update a stock issue (only in draft status). */
export async function updateStockIssue(
  id: string,
  data: UpdateStockIssueInput
): Promise<StockIssue> {
  return withTenant(async (tenantId) => {
    // Verify draft status
    const existing = await db
      .select({ status: stockIssues.status })
      .from(stockIssues)
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
      )
      .limit(1);

    if (!existing[0]) throw new Error("Stock issue not found");
    if (existing[0].status !== "draft") {
      throw new Error("Can only edit stock issues in draft status");
    }

    const rows = await db
      .update(stockIssues)
      .set({
        ...data,
        updatedAt: sql`now()`,
      })
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Stock issue not found");
    return mapIssueRow(row);
  });
}

/** Soft delete a stock issue (only in draft status). */
export async function deleteStockIssue(id: string): Promise<void> {
  return withTenant(async (tenantId) => {
    const existing = await db
      .select({ status: stockIssues.status })
      .from(stockIssues)
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
      )
      .limit(1);

    if (!existing[0]) throw new Error("Stock issue not found");
    if (existing[0].status !== "draft") {
      throw new Error("Can only delete stock issues in draft status");
    }

    await db
      .update(stockIssues)
      .set({ status: "cancelled", updatedAt: sql`now()` })
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
      );
  });
}

// ── CRUD: Lines ────────────────────────────────────────────────

/** Add a line to a stock issue (only in draft status). */
export async function addStockIssueLine(
  issueId: string,
  data: CreateLineInput
): Promise<StockIssueLine> {
  return withTenant(async (tenantId) => {
    // Verify draft status
    const existing = await db
      .select({ status: stockIssues.status })
      .from(stockIssues)
      .where(
        and(
          eq(stockIssues.tenantId, tenantId),
          eq(stockIssues.id, issueId)
        )
      )
      .limit(1);

    if (!existing[0]) throw new Error("Stock issue not found");
    if (existing[0].status !== "draft") {
      throw new Error("Can only add lines to draft stock issues");
    }

    // Get next line number
    const maxLineNo = await db
      .select({ max: sql<number>`COALESCE(MAX(${stockIssueLines.lineNo}), 0)` })
      .from(stockIssueLines)
      .where(eq(stockIssueLines.stockIssueId, issueId));

    const nextLineNo = (maxLineNo[0]?.max ?? 0) + 1;

    const issuedQty = data.issuedQty ?? data.requestedQty;
    const requestedNum = Number(data.requestedQty);
    const issuedNum = Number(issuedQty);
    const missingQty = requestedNum > issuedNum ? String(requestedNum - issuedNum) : null;
    const unitPrice = data.unitPrice ?? null;
    const totalCost = unitPrice ? String(issuedNum * Number(unitPrice)) : null;

    const rows = await db
      .insert(stockIssueLines)
      .values({
        tenantId,
        stockIssueId: issueId,
        itemId: data.itemId,
        lineNo: nextLineNo,
        requestedQty: data.requestedQty,
        issuedQty,
        missingQty,
        unitPrice,
        totalCost,
        notes: data.notes ?? null,
        sortOrder: nextLineNo,
        lotNumber: data.lotNumber ?? null,
        expiryDate: data.expiryDate ?? null,
        lotAttributes: data.lotAttributes ?? {},
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to add line");
    return mapLineRow(row);
  });
}

/** Update a stock issue line (only in draft status). */
export async function updateStockIssueLine(
  lineId: string,
  data: UpdateLineInput
): Promise<StockIssueLine> {
  return withTenant(async (tenantId) => {
    // Verify draft status via join
    const lineRow = await db
      .select({
        line: stockIssueLines,
        issueStatus: stockIssues.status,
      })
      .from(stockIssueLines)
      .innerJoin(
        stockIssues,
        eq(stockIssueLines.stockIssueId, stockIssues.id)
      )
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.id, lineId)
        )
      )
      .limit(1);

    if (!lineRow[0]) throw new Error("Stock issue line not found");
    if (lineRow[0].issueStatus !== "draft") {
      throw new Error("Can only edit lines on draft stock issues");
    }

    const current = lineRow[0].line;
    const requestedQty = data.requestedQty ?? current.requestedQty;
    const issuedQty = data.issuedQty ?? current.issuedQty ?? requestedQty;
    const unitPrice = data.unitPrice ?? current.unitPrice;

    const requestedNum = Number(requestedQty);
    const issuedNum = Number(issuedQty);
    const missingQty = requestedNum > issuedNum ? String(requestedNum - issuedNum) : null;
    const totalCost = unitPrice ? String(issuedNum * Number(unitPrice)) : null;

    const rows = await db
      .update(stockIssueLines)
      .set({
        requestedQty,
        issuedQty,
        missingQty,
        unitPrice,
        totalCost,
        notes: data.notes !== undefined ? data.notes : current.notes,
        lotNumber: data.lotNumber !== undefined ? (data.lotNumber ?? null) : current.lotNumber,
        expiryDate: data.expiryDate !== undefined ? (data.expiryDate ?? null) : current.expiryDate,
        lotAttributes: data.lotAttributes !== undefined ? (data.lotAttributes ?? {}) : current.lotAttributes,
      })
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.id, lineId)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Stock issue line not found");
    return mapLineRow(row);
  });
}

/** Remove a stock issue line (only in draft status). */
export async function removeStockIssueLine(lineId: string): Promise<void> {
  return withTenant(async (tenantId) => {
    // Verify draft status
    const lineRow = await db
      .select({ issueStatus: stockIssues.status })
      .from(stockIssueLines)
      .innerJoin(
        stockIssues,
        eq(stockIssueLines.stockIssueId, stockIssues.id)
      )
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.id, lineId)
        )
      )
      .limit(1);

    if (!lineRow[0]) throw new Error("Stock issue line not found");
    if (lineRow[0].issueStatus !== "draft") {
      throw new Error("Can only remove lines from draft stock issues");
    }

    // manualAllocations JSONB is on the line itself — deleted with the line
    await db
      .delete(stockIssueLines)
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.id, lineId)
        )
      );
  });
}

// ── WORKFLOW: Prevalidation ──────────────────────────────────

/**
 * Pre-validate an issue before confirming.
 * Checks if there's sufficient stock for each line and returns warnings for partial issues.
 */
export async function prevalidateIssue(
  issueId: string
): Promise<PrevalidationResult> {
  return withTenant(async (tenantId) => {
    // Load issue + lines
    const issueRows = await db
      .select()
      .from(stockIssues)
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, issueId))
      )
      .limit(1);

    const issue = issueRows[0];
    if (!issue) throw new Error("Stock issue not found");
    if (issue.movementType !== "issue") {
      return { canConfirm: true, hasWarnings: false, warnings: [] };
    }

    const lines = await db
      .select({
        id: stockIssueLines.id,
        itemId: stockIssueLines.itemId,
        requestedQty: stockIssueLines.requestedQty,
      })
      .from(stockIssueLines)
      .where(eq(stockIssueLines.stockIssueId, issueId));

    if (lines.length === 0) {
      return { canConfirm: false, hasWarnings: false, warnings: [] };
    }

    const warnings: PrevalidationWarning[] = [];

    for (const line of lines) {
      const requested = Number(line.requestedQty);

      // Sum remaining_qty from confirmed receipt lines for this item+warehouse
      const availableRows = await db.execute(sql`
        SELECT COALESCE(SUM(sil.remaining_qty::decimal), 0) AS available
        FROM stock_issue_lines sil
        JOIN stock_issues si ON si.id = sil.stock_issue_id
        WHERE sil.tenant_id = ${tenantId}
          AND sil.item_id = ${line.itemId}
          AND si.warehouse_id = ${issue.warehouseId}
          AND si.movement_type = 'receipt'
          AND si.status = 'confirmed'
          AND COALESCE(sil.remaining_qty::decimal, 0) > 0
      `);

      const available = Number(
        (availableRows[0] as { available: string } | undefined)?.available ?? "0"
      );

      if (available < requested - 0.0001) {
        // Get item info for display
        const { units } = await import("@/../drizzle/schema/system");
        const itemRows = await db
          .select({ name: items.name, unitSymbol: units.symbol })
          .from(items)
          .leftJoin(units, eq(items.unitId, units.id))
          .where(eq(items.id, line.itemId))
          .limit(1);

        const itemName = itemRows[0]?.name ?? "?";
        const unit = itemRows[0]?.unitSymbol ?? "";
        const willIssue = Math.min(available, requested);
        const missing = requested - willIssue;

        warnings.push({
          itemName,
          unit,
          requested,
          available,
          willIssue,
          missing,
        });
      }
    }

    return {
      canConfirm: true,
      hasWarnings: warnings.length > 0,
      warnings,
    };
  });
}

// ── WORKFLOW: Confirm ──────────────────────────────────────────

/**
 * Confirm a stock issue: draft → confirmed.
 * Receipts: creates "in" movements, sets remaining_qty.
 * Issues: uses FIFO/manual engine to create "out" movements with receipt_line_id.
 * All within a DB transaction.
 */
export async function confirmStockIssue(id: string): Promise<StockIssue> {
  return withTenant(async (tenantId) => {
    const result = await db.transaction(async (tx) => {
      // 1. LOAD issue + lines
      const issueRows = await tx
        .select()
        .from(stockIssues)
        .where(
          and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
        )
        .for("update")
        .limit(1);

      const issue = issueRows[0];
      if (!issue) throw new Error("Stock issue not found");
      if (issue.status !== "draft") {
        throw new Error("Can only confirm stock issues in draft status");
      }

      const lines = await tx
        .select()
        .from(stockIssueLines)
        .where(eq(stockIssueLines.stockIssueId, id))
        .orderBy(stockIssueLines.sortOrder);

      // 2. VALIDATE
      if (lines.length === 0) {
        throw new Error("Stock issue must have at least one line");
      }

      const isReceipt = issue.movementType === "receipt";
      let documentTotalCost = 0;

      // 3. PROCESS each line
      for (const line of lines) {
        const requestedQty = Number(line.requestedQty);

        if (requestedQty <= 0) {
          throw new Error(
            `Line ${line.lineNo ?? "?"} must have quantity > 0`
          );
        }

        if (isReceipt) {
          // ── RECEIPT: single "in" movement, set remaining_qty ──
          const unitPrice = Number(line.unitPrice ?? "0");
          const lineTotalCost = requestedQty * unitPrice;

          await tx.insert(stockMovements).values({
            tenantId,
            itemId: line.itemId,
            warehouseId: issue.warehouseId,
            movementType: "in",
            quantity: String(requestedQty),
            unitPrice: line.unitPrice,
            stockIssueId: id,
            stockIssueLineId: line.id,
            batchId: issue.batchId,
            isClosed: false,
            date: issue.date,
          });

          // Set remaining_qty = requestedQty (full lot available)
          await tx
            .update(stockIssueLines)
            .set({
              issuedQty: String(requestedQty),
              unitPrice: String(unitPrice),
              totalCost: String(lineTotalCost),
              remainingQty: String(requestedQty),
            })
            .where(eq(stockIssueLines.id, line.id));

          documentTotalCost += lineTotalCost;

          // Update stock_status
          await updateStockStatusRow(
            tx,
            tenantId,
            line.itemId,
            issue.warehouseId,
            requestedQty
          );
        } else {
          // ── ISSUE: FIFO or manual_lot engine ──

          // Get item's issue_mode
          const itemRows = await tx
            .select({ issueMode: items.issueMode })
            .from(items)
            .where(eq(items.id, line.itemId))
            .limit(1);

          const issueMode =
            (itemRows[0]?.issueMode as "fifo" | "manual_lot") ?? "fifo";

          // Snapshot issue mode on the line
          await tx
            .update(stockIssueLines)
            .set({ issueModeSnapshot: issueMode })
            .where(eq(stockIssueLines.id, line.id));

          // Run allocation engine
          const engineResult =
            issueMode === "manual_lot"
              ? await processManualAllocations(
                  tx,
                  tenantId,
                  id,
                  {
                    id: line.id,
                    itemId: line.itemId,
                    requestedQty: line.requestedQty,
                    manualAllocations:
                      (line.manualAllocations as ManualAllocationJsonEntry[] | null) ?? null,
                  },
                  issue.warehouseId,
                  issue.date,
                  issue.batchId
                )
              : await allocateFIFO(
                  tx,
                  tenantId,
                  id,
                  {
                    id: line.id,
                    itemId: line.itemId,
                    requestedQty: line.requestedQty,
                  },
                  issue.warehouseId,
                  issue.date,
                  issue.batchId
                );

          // Update line with cost from engine (issuedQty/missingQty computed from movements)
          await tx
            .update(stockIssueLines)
            .set({
              unitPrice: String(engineResult.weightedAvgPrice),
              totalCost: String(engineResult.totalCost),
            })
            .where(eq(stockIssueLines.id, line.id));

          documentTotalCost += engineResult.totalCost;

          // Update stock_status with allocated amount
          await updateStockStatusRow(
            tx,
            tenantId,
            line.itemId,
            issue.warehouseId,
            -engineResult.allocated
          );
        }
      }

      // 4. Update issue header
      const additionalCost = Number(issue.additionalCost ?? "0");
      const totalCost = documentTotalCost + additionalCost;

      const updatedRows = await tx
        .update(stockIssues)
        .set({
          status: "confirmed",
          totalCost: String(totalCost),
          updatedAt: sql`now()`,
        })
        .where(eq(stockIssues.id, id))
        .returning();

      const updated = updatedRows[0];
      if (!updated) throw new Error("Failed to update stock issue");
      return mapIssueRow(updated);
    });

    return result;
  });
}

// ── WORKFLOW: Receipt Cancel Check ────────────────────────────

/**
 * Check if a receipt can be cancelled.
 * A receipt cannot be cancelled if any of its lines have movements
 * with receipt_line_id pointing to them (i.e., issue movements that consumed stock).
 */
export async function checkReceiptCancellable(
  id: string
): Promise<ReceiptCancelCheck> {
  return withTenant(async (tenantId) => {
    // Verify this is a confirmed receipt
    const issueRows = await db
      .select({
        status: stockIssues.status,
        movementType: stockIssues.movementType,
      })
      .from(stockIssues)
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
      )
      .limit(1);

    const issue = issueRows[0];
    if (!issue) throw new Error("Stock issue not found");
    if (issue.movementType !== "receipt") {
      return { canCancel: true, blockingIssues: [] };
    }
    if (issue.status !== "confirmed") {
      return { canCancel: true, blockingIssues: [] };
    }

    // Get receipt lines
    const receiptLines = await db
      .select({ id: stockIssueLines.id })
      .from(stockIssueLines)
      .where(eq(stockIssueLines.stockIssueId, id));

    if (receiptLines.length === 0) {
      return { canCancel: true, blockingIssues: [] };
    }

    const blockingIssues: BlockingIssueInfo[] = [];

    for (const receiptLine of receiptLines) {
      // Find issue movements that reference this receipt line (negative qty, not storno)
      const issueMoves = await db
        .select({
          stockIssueId: stockMovements.stockIssueId,
          quantity: stockMovements.quantity,
          stockIssueLineId: stockMovements.stockIssueLineId,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.receiptLineId, receiptLine.id),
            sql`${stockMovements.quantity}::decimal < 0`,
            sql`${stockMovements.notes} IS DISTINCT FROM 'Storno'`
          )
        );

      for (const mov of issueMoves) {
        if (!mov.stockIssueId) continue;

        // Get the issue document details
        const issueDocRows = await db
          .select({
            issueId: stockIssues.id,
            issueCode: stockIssues.code,
            issueStatus: stockIssues.status,
          })
          .from(stockIssues)
          .where(eq(stockIssues.id, mov.stockIssueId))
          .limit(1);

        const issueDoc = issueDocRows[0];
        if (!issueDoc || issueDoc.issueStatus !== "confirmed") continue;

        // Get item name from the issue line
        let itemName = "?";
        if (mov.stockIssueLineId) {
          const lineItemRows = await db
            .select({ itemName: items.name })
            .from(stockIssueLines)
            .innerJoin(items, eq(stockIssueLines.itemId, items.id))
            .where(eq(stockIssueLines.id, mov.stockIssueLineId))
            .limit(1);
          itemName = lineItemRows[0]?.itemName ?? "?";
        }

        const allocatedQty = Math.abs(Number(mov.quantity));

        // Aggregate
        const existing = blockingIssues.find(
          (b) => b.issueId === issueDoc.issueId
        );
        if (existing) {
          existing.allocatedQty += allocatedQty;
        } else {
          blockingIssues.push({
            issueId: issueDoc.issueId,
            issueCode: issueDoc.issueCode,
            itemName,
            allocatedQty,
          });
        }
      }
    }

    return {
      canCancel: blockingIssues.length === 0,
      blockingIssues,
    };
  });
}

// ── WORKFLOW: Cancel ───────────────────────────────────────────

/**
 * Cancel a confirmed stock issue: confirmed → cancelled.
 * Creates counter-movements, reverses stock_status.
 * For issues: restores remaining_qty on receipt lines.
 * For receipts: checks no confirmed issues reference this receipt.
 */
export async function cancelStockIssue(id: string): Promise<StockIssue> {
  return withTenant(async (tenantId) => {
    const result = await db.transaction(async (tx) => {
      // 1. LOAD issue
      const issueRows = await tx
        .select()
        .from(stockIssues)
        .where(
          and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, id))
        )
        .for("update")
        .limit(1);

      const issue = issueRows[0];
      if (!issue) throw new Error("Stock issue not found");
      if (issue.status !== "confirmed") {
        throw new Error("Can only cancel confirmed stock issues");
      }

      const isReceipt = issue.movementType === "receipt";

      // 1b. For receipts: check that no confirmed issues reference this receipt
      if (isReceipt) {
        const cancelCheck = await checkReceiptCancellable(id);
        if (!cancelCheck.canCancel) {
          const details = cancelCheck.blockingIssues
            .map((b) => `${b.issueCode} (${b.itemName}: ${b.allocatedQty})`)
            .join(", ");
          throw new Error(
            `RECEIPT_HAS_ALLOCATIONS:${JSON.stringify(cancelCheck.blockingIssues)}:${details}`
          );
        }
      }

      // 2. Load existing movements for this issue (non-storno only)
      const movements = await tx
        .select()
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.stockIssueId, id),
            sql`${stockMovements.notes} IS DISTINCT FROM 'Storno'`
          )
        );

      // 3. For each movement: create counter-movement, reverse stock_status
      for (const movement of movements) {
        const qty = Number(movement.quantity);

        // Create counter-movement (opposite sign)
        await tx.insert(stockMovements).values({
          tenantId,
          itemId: movement.itemId,
          warehouseId: movement.warehouseId,
          movementType: movement.movementType,
          quantity: String(-qty),
          unitPrice: movement.unitPrice,
          stockIssueId: id,
          stockIssueLineId: movement.stockIssueLineId,
          receiptLineId: movement.receiptLineId,
          batchId: movement.batchId,
          isClosed: true,
          date: issue.date,
          notes: "Storno",
        });

        // If this is an issue movement with receipt_line_id, restore remaining_qty
        if (!isReceipt && movement.receiptLineId) {
          const allocatedQty = Math.abs(qty);
          await tx
            .update(stockIssueLines)
            .set({
              remainingQty: sql`COALESCE(${stockIssueLines.remainingQty}::decimal, 0) + ${allocatedQty}`,
            })
            .where(eq(stockIssueLines.id, movement.receiptLineId));
        }

        // Reverse stock_status
        await updateStockStatusRow(
          tx,
          tenantId,
          movement.itemId,
          movement.warehouseId,
          -qty // Reverse the original delta
        );
      }

      // 4. For receipts: set remaining_qty = 0 on all receipt lines
      if (isReceipt) {
        await tx
          .update(stockIssueLines)
          .set({ remainingQty: "0" })
          .where(eq(stockIssueLines.stockIssueId, id));
      }

      // 5. Update issue status
      const updatedRows = await tx
        .update(stockIssues)
        .set({
          status: "cancelled",
          updatedAt: sql`now()`,
        })
        .where(eq(stockIssues.id, id))
        .returning();

      const updated = updatedRows[0];
      if (!updated) throw new Error("Failed to update stock issue");
      return mapIssueRow(updated);
    });

    return result;
  });
}

// ── QUERIES: Stock Status ──────────────────────────────────────

/** Get stock status for an item across all warehouses. */
export async function getItemStockStatus(
  itemId: string
): Promise<
  Array<{ warehouseId: string; quantity: string; reservedQty: string }>
> {
  return withTenant(async (tenantId) => {
    const { stockStatus } = await import("@/../drizzle/schema/stock");

    const rows = await db
      .select({
        warehouseId: stockStatus.warehouseId,
        quantity: stockStatus.quantity,
        reservedQty: stockStatus.reservedQty,
      })
      .from(stockStatus)
      .where(
        and(
          eq(stockStatus.tenantId, tenantId),
          eq(stockStatus.itemId, itemId)
        )
      );

    return rows.map((r) => ({
      warehouseId: r.warehouseId,
      quantity: r.quantity ?? "0",
      reservedQty: r.reservedQty ?? "0",
    }));
  });
}

/** Get movements for a stock issue. */
export async function getStockIssueMovements(
  issueId: string
): Promise<Array<typeof stockMovements.$inferSelect>> {
  return withTenant(async (tenantId) => {
    return db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.tenantId, tenantId),
          eq(stockMovements.stockIssueId, issueId)
        )
      )
      .orderBy(stockMovements.createdAt);
  });
}

// ── HELPERS: Select Options ──────────────────────────────────

/** Get warehouse options for select fields. */
export async function getWarehouseOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: warehouses.id, name: warehouses.name, code: warehouses.code })
      .from(warehouses)
      .where(and(eq(warehouses.tenantId, tenantId), eq(warehouses.isActive, true)))
      .orderBy(warehouses.name);

    return rows.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` }));
  });
}

/** Get partner options for select fields. */
export async function getPartnerOptions(): Promise<
  Array<{ value: string; label: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: partners.id, name: partners.name })
      .from(partners)
      .where(and(eq(partners.tenantId, tenantId), eq(partners.isActive, true)))
      .orderBy(partners.name);

    return rows.map((r) => ({ value: r.id, label: r.name }));
  });
}

/** Get item options for line item selection (includes material info for lot attributes). */
export async function getItemOptions(): Promise<
  Array<{
    value: string;
    label: string;
    code: string;
    isBrewMaterial: boolean;
    materialType: string | null;
    issueMode: string;
  }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: items.id,
        name: items.name,
        code: items.code,
        isBrewMaterial: items.isBrewMaterial,
        materialType: items.materialType,
        issueMode: items.issueMode,
      })
      .from(items)
      .where(and(eq(items.tenantId, tenantId), eq(items.isActive, true)))
      .orderBy(items.name);

    return rows.map((r) => ({
      value: r.id,
      label: `${r.code} — ${r.name}`,
      code: r.code,
      isBrewMaterial: r.isBrewMaterial ?? false,
      materialType: r.materialType ?? null,
      issueMode: r.issueMode ?? "fifo",
    }));
  });
}

// ── LOT ACTIONS: Manual Lot Selection ───────────────────────

/**
 * Get available receipt lines for manual lot selection.
 * Returns confirmed receipt lines with remaining_qty > 0 for a given item+warehouse.
 */
export async function getAvailableReceiptLines(
  itemId: string,
  warehouseId: string
): Promise<AvailableReceiptLine[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        receiptLineId: stockIssueLines.id,
        receiptDate: stockIssues.date,
        receiptCode: stockIssues.code,
        supplierName: partners.name,
        lotNumber: stockIssueLines.lotNumber,
        expiryDate: stockIssueLines.expiryDate,
        requestedQty: stockIssueLines.requestedQty,
        remainingQty: stockIssueLines.remainingQty,
        unitPrice: stockIssueLines.unitPrice,
      })
      .from(stockIssueLines)
      .innerJoin(
        stockIssues,
        eq(stockIssueLines.stockIssueId, stockIssues.id)
      )
      .leftJoin(partners, eq(stockIssues.partnerId, partners.id))
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.itemId, itemId),
          eq(stockIssues.warehouseId, warehouseId),
          eq(stockIssues.movementType, "receipt"),
          eq(stockIssues.status, "confirmed"),
          sql`${stockIssueLines.remainingQty}::decimal > 0`
        )
      )
      .orderBy(stockIssues.date, stockIssueLines.createdAt);

    return rows.map((r) => ({
      receiptLineId: r.receiptLineId,
      receiptDate: r.receiptDate,
      receiptCode: r.receiptCode,
      supplierName: r.supplierName ?? null,
      lotNumber: r.lotNumber ?? null,
      expiryDate: r.expiryDate ?? null,
      requestedQty: r.requestedQty,
      remainingQty: r.remainingQty ?? "0",
      unitPrice: r.unitPrice ?? null,
    }));
  });
}

/**
 * Save manual allocation entries to a line's manualAllocations JSONB.
 * Called from the LotSelectionDialog before confirm.
 */
export async function saveManualAllocations(
  issueLineId: string,
  entries: ManualAllocationInput[]
): Promise<void> {
  return withTenant(async (tenantId) => {
    // Verify draft status
    const lineRow = await db
      .select({ issueStatus: stockIssues.status })
      .from(stockIssueLines)
      .innerJoin(
        stockIssues,
        eq(stockIssueLines.stockIssueId, stockIssues.id)
      )
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.id, issueLineId)
        )
      )
      .limit(1);

    if (!lineRow[0]) throw new Error("Stock issue line not found");
    if (lineRow[0].issueStatus !== "draft") {
      throw new Error("Can only set allocations on draft stock issues");
    }

    // Convert to JSONB format
    const jsonEntries: ManualAllocationJsonEntry[] = entries.map((e) => ({
      receipt_line_id: e.receiptLineId,
      quantity: Number(e.quantity),
    }));

    await db
      .update(stockIssueLines)
      .set({ manualAllocations: jsonEntries.length > 0 ? jsonEntries : null })
      .where(
        and(
          eq(stockIssueLines.tenantId, tenantId),
          eq(stockIssueLines.id, issueLineId)
        )
      );
  });
}

/** Get stock status for availability check (used by confirm dialog). */
export async function getStockStatusForItems(
  warehouseId: string,
  itemIds: string[]
): Promise<Record<string, number>> {
  return withTenant(async (tenantId) => {
    const { stockStatus } = await import("@/../drizzle/schema/stock");

    const result: Record<string, number> = {};

    for (const itemId of itemIds) {
      const rows = await db
        .select({ quantity: stockStatus.quantity })
        .from(stockStatus)
        .where(
          and(
            eq(stockStatus.tenantId, tenantId),
            eq(stockStatus.itemId, itemId),
            eq(stockStatus.warehouseId, warehouseId)
          )
        )
        .limit(1);

      result[itemId] = Number(rows[0]?.quantity ?? "0");
    }

    return result;
  });
}
