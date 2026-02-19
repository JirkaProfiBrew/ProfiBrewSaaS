"use server";

import { eq, and, ilike, or, gte, lte, sql, desc } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import { getNextNumber } from "@/lib/db/counters";
import {
  stockIssues,
  stockIssueLines,
  stockMovements,
  stockIssueAllocations,
} from "@/../drizzle/schema/stock";
import { items } from "@/../drizzle/schema/items";
import { allocateIssue } from "./lib/allocation-engine";
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
} from "./types";

// ── Helpers ────────────────────────────────────────────────────

function mapIssueRow(row: typeof stockIssues.$inferSelect): StockIssue {
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
  };
}

function mapLineRow(row: typeof stockIssueLines.$inferSelect): StockIssueLine {
  return {
    id: row.id,
    tenantId: row.tenantId,
    stockIssueId: row.stockIssueId,
    itemId: row.itemId,
    lineNo: row.lineNo,
    requestedQty: row.requestedQty,
    issuedQty: row.issuedQty,
    missingQty: row.missingQty,
    unitPrice: row.unitPrice,
    totalCost: row.totalCost,
    issueModeSnapshot: row.issueModeSnapshot,
    notes: row.notes,
    sortOrder: row.sortOrder ?? 0,
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
      .select()
      .from(stockIssues)
      .where(and(...conditions))
      .orderBy(desc(stockIssues.date), desc(stockIssues.createdAt));

    return rows.map(mapIssueRow);
  });
}

/** Get a single stock issue by ID, including lines. */
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

    return {
      ...mapIssueRow(issueRow),
      lines: lineRows.map(mapLineRow),
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

// ── WORKFLOW: Confirm ──────────────────────────────────────────

/**
 * Confirm a stock issue: draft → confirmed.
 * Creates stock movements, runs FIFO/LIFO allocation (for issues),
 * and updates stock_status. All within a DB transaction.
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

      for (const line of lines) {
        const issuedQty = Number(line.issuedQty ?? line.requestedQty);
        if (issuedQty <= 0) {
          throw new Error(
            `Line ${line.lineNo ?? "?"} must have issued quantity > 0`
          );
        }
      }

      const isReceipt = issue.movementType === "receipt";
      let documentTotalCost = 0;

      // 3. PROCESS each line
      for (const line of lines) {
        const issuedQty = Number(line.issuedQty ?? line.requestedQty);
        let lineUnitPrice = Number(line.unitPrice ?? "0");
        let lineTotalCost = issuedQty * lineUnitPrice;

        // 3a. Create stock movement
        const movementRows = await tx
          .insert(stockMovements)
          .values({
            tenantId,
            itemId: line.itemId,
            warehouseId: issue.warehouseId,
            movementType: isReceipt ? "in" : "out",
            quantity: String(isReceipt ? issuedQty : -issuedQty),
            unitPrice: line.unitPrice,
            stockIssueId: id,
            stockIssueLineId: line.id,
            batchId: issue.batchId,
            isClosed: false,
            date: issue.date,
          })
          .returning();

        const movement = movementRows[0];
        if (!movement) throw new Error("Failed to create stock movement");

        // 3b. FIFO/LIFO allocation (only for issues, not receipts)
        if (!isReceipt) {
          // Get item's issue_mode
          const itemRows = await tx
            .select({ issueMode: items.issueMode })
            .from(items)
            .where(eq(items.id, line.itemId))
            .limit(1);

          const issueMode =
            (itemRows[0]?.issueMode as "fifo" | "lifo" | "average") ?? "fifo";

          // Snapshot issue mode on the line
          await tx
            .update(stockIssueLines)
            .set({ issueModeSnapshot: issueMode })
            .where(eq(stockIssueLines.id, line.id));

          // Run allocation
          const allocation = await allocateIssue(
            tx,
            tenantId,
            line.itemId,
            issue.warehouseId,
            issuedQty,
            issueMode
          );

          // Create allocation records
          for (const alloc of allocation.allocations) {
            await tx.insert(stockIssueAllocations).values({
              tenantId,
              stockIssueLineId: line.id,
              sourceMovementId: alloc.sourceMovementId,
              quantity: String(alloc.quantity),
              unitPrice: String(alloc.unitPrice),
            });
          }

          // Update line with computed prices
          lineUnitPrice = allocation.weightedAvgPrice;
          lineTotalCost = allocation.totalCost;
        }

        // 3c. Update line with final cost
        await tx
          .update(stockIssueLines)
          .set({
            issuedQty: String(issuedQty),
            unitPrice: String(lineUnitPrice),
            totalCost: String(lineTotalCost),
            missingQty:
              Number(line.requestedQty) > issuedQty
                ? String(Number(line.requestedQty) - issuedQty)
                : null,
          })
          .where(eq(stockIssueLines.id, line.id));

        documentTotalCost += lineTotalCost;

        // 3d. Update stock_status
        const quantityDelta = isReceipt ? issuedQty : -issuedQty;
        await updateStockStatusRow(
          tx,
          tenantId,
          line.itemId,
          issue.warehouseId,
          quantityDelta
        );
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

// ── WORKFLOW: Cancel ───────────────────────────────────────────

/**
 * Cancel a confirmed stock issue: confirmed → cancelled.
 * Creates counter-movements, reverses allocations and stock_status.
 * All within a DB transaction.
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

      // 2. Load existing movements for this issue
      const movements = await tx
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.stockIssueId, id));

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
          batchId: movement.batchId,
          isClosed: true,
          date: issue.date,
          notes: "Storno",
        });

        // Reverse stock_status
        await updateStockStatusRow(
          tx,
          tenantId,
          movement.itemId,
          movement.warehouseId,
          -qty // Reverse the original delta
        );
      }

      // 4. For issues (not receipts): restore allocations
      if (!isReceipt) {
        // Load allocations for this issue's lines
        const lines = await tx
          .select({ id: stockIssueLines.id })
          .from(stockIssueLines)
          .where(eq(stockIssueLines.stockIssueId, id));

        for (const line of lines) {
          const allocations = await tx
            .select()
            .from(stockIssueAllocations)
            .where(eq(stockIssueAllocations.stockIssueLineId, line.id));

          // Re-open the source movements
          for (const alloc of allocations) {
            await tx
              .update(stockMovements)
              .set({ isClosed: false })
              .where(eq(stockMovements.id, alloc.sourceMovementId));
          }

          // Delete allocation records
          await tx
            .delete(stockIssueAllocations)
            .where(eq(stockIssueAllocations.stockIssueLineId, line.id));
        }
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

/** Get allocations for a stock issue's lines. */
export async function getStockIssueAllocations(
  issueId: string
): Promise<Array<typeof stockIssueAllocations.$inferSelect>> {
  return withTenant(async (tenantId) => {
    const lines = await db
      .select({ id: stockIssueLines.id })
      .from(stockIssueLines)
      .where(eq(stockIssueLines.stockIssueId, issueId));

    if (lines.length === 0) return [];

    const lineIds = lines.map((l) => l.id);

    // Use OR to match any line
    const allAllocations: Array<typeof stockIssueAllocations.$inferSelect> = [];
    for (const lineId of lineIds) {
      const rows = await db
        .select()
        .from(stockIssueAllocations)
        .where(
          and(
            eq(stockIssueAllocations.tenantId, tenantId),
            eq(stockIssueAllocations.stockIssueLineId, lineId)
          )
        );
      allAllocations.push(...rows);
    }

    return allAllocations;
  });
}
