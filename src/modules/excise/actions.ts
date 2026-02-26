"use server";

import { eq, and, desc, sql, isNull, or, getTableColumns } from "drizzle-orm";

import { db } from "@/lib/db";
import { withTenant } from "@/lib/db/with-tenant";
import {
  exciseMovements,
  exciseRates,
  exciseMonthlyReports,
} from "@/../drizzle/schema/excise";
import { batches } from "@/../drizzle/schema/batches";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { stockIssues, stockIssueLines } from "@/../drizzle/schema/stock";
import { tenants } from "@/../drizzle/schema/tenants";
import { recipes } from "@/../drizzle/schema/recipes";
import { items } from "@/../drizzle/schema/items";
import type {
  ExciseMovement,
  ExciseRate,
  ExciseMonthlyReport,
  ExciseSettings,
  CreateExciseMovementInput,
  UpdateExciseMovementInput,
  ExciseMovementFilter,
  ExciseDashboardData,
  TaxDetailEntry,
  ExcisePrevalidationError,
  ExcisePrevalidationResult,
} from "./types";
import { DEFAULT_EXCISE_SETTINGS } from "./types";

// ── Helpers ────────────────────────────────────────────────────

function getPreviousPeriod(period: string): string {
  const parts = period.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function todayISO(): string {
  return new Date().toISOString().split("T")[0] ?? "";
}

function mapMovementRow(
  row: typeof exciseMovements.$inferSelect,
  joined?: {
    batchNumber?: string | null;
    stockIssueCode?: string | null;
    warehouseName?: string | null;
  }
): ExciseMovement {
  return {
    id: row.id,
    tenantId: row.tenantId,
    batchId: row.batchId,
    stockIssueId: row.stockIssueId,
    warehouseId: row.warehouseId,
    movementType: row.movementType,
    volumeHl: row.volumeHl,
    direction: row.direction,
    plato: row.plato,
    platoSource: row.platoSource,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    date: row.date,
    period: row.period,
    status: row.status ?? "draft",
    description: row.description,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    batchNumber: joined?.batchNumber ?? null,
    stockIssueCode: joined?.stockIssueCode ?? null,
    warehouseName: joined?.warehouseName ?? null,
  };
}

function mapRateRow(row: typeof exciseRates.$inferSelect): ExciseRate {
  return {
    id: row.id,
    tenantId: row.tenantId,
    category: row.category,
    ratePerPlatoHl: row.ratePerPlatoHl,
    validFrom: row.validFrom,
    validTo: row.validTo,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
  };
}

function mapReportRow(
  row: typeof exciseMonthlyReports.$inferSelect
): ExciseMonthlyReport {
  return {
    id: row.id,
    tenantId: row.tenantId,
    period: row.period,
    openingBalanceHl: row.openingBalanceHl ?? "0",
    productionHl: row.productionHl ?? "0",
    transferInHl: row.transferInHl ?? "0",
    releaseHl: row.releaseHl ?? "0",
    transferOutHl: row.transferOutHl ?? "0",
    lossHl: row.lossHl ?? "0",
    destructionHl: row.destructionHl ?? "0",
    adjustmentHl: row.adjustmentHl ?? "0",
    closingBalanceHl: row.closingBalanceHl ?? "0",
    totalTax: row.totalTax ?? "0",
    taxDetails: (row.taxDetails as TaxDetailEntry[] | null) ?? null,
    status: row.status ?? "draft",
    submittedAt: row.submittedAt,
    submittedBy: row.submittedBy,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ── Tenant Excise Settings ────────────────────────────────────

export async function getTenantExciseSettings(
  tenantId: string
): Promise<ExciseSettings> {
  const rows = await db
    .select({ settings: tenants.settings })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const raw = (rows[0]?.settings ?? {}) as Record<string, unknown>;

  return {
    excise_enabled:
      typeof raw.excise_enabled === "boolean"
        ? raw.excise_enabled
        : DEFAULT_EXCISE_SETTINGS.excise_enabled,
    excise_brewery_category:
      (raw.excise_brewery_category as ExciseSettings["excise_brewery_category"]) ??
      DEFAULT_EXCISE_SETTINGS.excise_brewery_category,
    excise_tax_point:
      (raw.excise_tax_point as ExciseSettings["excise_tax_point"]) ??
      DEFAULT_EXCISE_SETTINGS.excise_tax_point,
    excise_plato_source:
      (raw.excise_plato_source as ExciseSettings["excise_plato_source"]) ??
      DEFAULT_EXCISE_SETTINGS.excise_plato_source,
    excise_loss_norm_pct:
      typeof raw.excise_loss_norm_pct === "number"
        ? raw.excise_loss_norm_pct
        : DEFAULT_EXCISE_SETTINGS.excise_loss_norm_pct,
  };
}

// ── Excise Rates ──────────────────────────────────────────────

export async function getCurrentExciseRate(
  tenantId: string,
  category: string
): Promise<ExciseRate | null> {
  const today = todayISO();

  const rows = await db
    .select()
    .from(exciseRates)
    .where(
      and(
        or(eq(exciseRates.tenantId, tenantId), isNull(exciseRates.tenantId)),
        eq(exciseRates.category, category),
        sql`${exciseRates.validFrom} <= ${today}`,
        or(
          isNull(exciseRates.validTo),
          sql`${exciseRates.validTo} >= ${today}`
        ),
        eq(exciseRates.isActive, true)
      )
    )
    .orderBy(
      sql`${exciseRates.tenantId} NULLS LAST`,
      desc(exciseRates.validFrom)
    )
    .limit(1);

  const first = rows[0];
  if (!first) return null;
  return mapRateRow(first);
}

export async function getExciseRates(): Promise<ExciseRate[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(exciseRates)
      .where(
        or(eq(exciseRates.tenantId, tenantId), isNull(exciseRates.tenantId))
      )
      .orderBy(exciseRates.category, exciseRates.validFrom);

    return rows.map(mapRateRow);
  });
}

// ── Excise Movements (CRUD) ───────────────────────────────────

export async function getExciseMovements(
  filters?: ExciseMovementFilter
): Promise<ExciseMovement[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(exciseMovements.tenantId, tenantId)];

    if (filters?.direction) {
      conditions.push(eq(exciseMovements.direction, filters.direction));
    }
    if (filters?.period) {
      conditions.push(eq(exciseMovements.period, filters.period));
    }
    if (filters?.movementType) {
      conditions.push(eq(exciseMovements.movementType, filters.movementType));
    }
    if (filters?.warehouseId) {
      conditions.push(eq(exciseMovements.warehouseId, filters.warehouseId));
    }
    if (filters?.status) {
      conditions.push(eq(exciseMovements.status, filters.status));
    }
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(
        or(
          sql`${exciseMovements.description} ILIKE ${term}`,
          sql`${batches.batchNumber} ILIKE ${term}`,
          sql`${stockIssues.code} ILIKE ${term}`
        )!
      );
    }

    const rows = await db
      .select({
        ...getTableColumns(exciseMovements),
        batchNumber: batches.batchNumber,
        stockIssueCode: stockIssues.code,
        warehouseName: warehouses.name,
      })
      .from(exciseMovements)
      .leftJoin(batches, eq(exciseMovements.batchId, batches.id))
      .leftJoin(stockIssues, eq(exciseMovements.stockIssueId, stockIssues.id))
      .leftJoin(warehouses, eq(exciseMovements.warehouseId, warehouses.id))
      .where(and(...conditions))
      .orderBy(desc(exciseMovements.date), desc(exciseMovements.createdAt));

    return rows.map((r) =>
      mapMovementRow(r, {
        batchNumber: r.batchNumber,
        stockIssueCode: r.stockIssueCode,
        warehouseName: r.warehouseName,
      })
    );
  });
}

export async function getExciseMovement(id: string): Promise<ExciseMovement> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        ...getTableColumns(exciseMovements),
        batchNumber: batches.batchNumber,
        stockIssueCode: stockIssues.code,
        warehouseName: warehouses.name,
      })
      .from(exciseMovements)
      .leftJoin(batches, eq(exciseMovements.batchId, batches.id))
      .leftJoin(stockIssues, eq(exciseMovements.stockIssueId, stockIssues.id))
      .leftJoin(warehouses, eq(exciseMovements.warehouseId, warehouses.id))
      .where(
        and(eq(exciseMovements.id, id), eq(exciseMovements.tenantId, tenantId))
      )
      .limit(1);

    const r = rows[0];
    if (!r) {
      throw new Error("EXCISE_MOVEMENT_NOT_FOUND");
    }

    return mapMovementRow(r, {
      batchNumber: r.batchNumber,
      stockIssueCode: r.stockIssueCode,
      warehouseName: r.warehouseName,
    });
  });
}

/**
 * Get all excise movements linked to a batch.
 * Used by ExciseBatchCard to show real movement data.
 */
export async function getExciseMovementsForBatch(
  batchId: string
): Promise<ExciseMovement[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        ...getTableColumns(exciseMovements),
        batchNumber: batches.batchNumber,
        stockIssueCode: stockIssues.code,
        warehouseName: warehouses.name,
      })
      .from(exciseMovements)
      .leftJoin(batches, eq(exciseMovements.batchId, batches.id))
      .leftJoin(stockIssues, eq(exciseMovements.stockIssueId, stockIssues.id))
      .leftJoin(warehouses, eq(exciseMovements.warehouseId, warehouses.id))
      .where(
        and(
          eq(exciseMovements.batchId, batchId),
          eq(exciseMovements.tenantId, tenantId)
        )
      )
      .orderBy(desc(exciseMovements.date));

    return rows.map((r) =>
      mapMovementRow(r, {
        batchNumber: r.batchNumber,
        stockIssueCode: r.stockIssueCode,
        warehouseName: r.warehouseName,
      })
    );
  });
}

export async function createExciseMovement(
  data: CreateExciseMovementInput
): Promise<ExciseMovement> {
  return withTenant(async (tenantId) => {
    const [inserted] = await db
      .insert(exciseMovements)
      .values({
        tenantId,
        batchId: data.batchId ?? null,
        stockIssueId: data.stockIssueId ?? null,
        warehouseId: data.warehouseId ?? null,
        movementType: data.movementType,
        volumeHl: data.volumeHl,
        direction: data.direction,
        plato: data.plato ?? null,
        platoSource: data.platoSource ?? null,
        taxRate: data.taxRate ?? null,
        taxAmount: data.taxAmount ?? null,
        date: data.date,
        period: data.period,
        status: data.status ?? "draft",
        description: data.description ?? null,
        notes: data.notes ?? null,
      })
      .returning();

    if (!inserted) {
      throw new Error("EXCISE_MOVEMENT_INSERT_FAILED");
    }

    return mapMovementRow(inserted);
  });
}

export async function updateExciseMovement(
  id: string,
  data: UpdateExciseMovementInput
): Promise<ExciseMovement> {
  return withTenant(async (tenantId) => {
    const updateData: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (data.plato !== undefined) updateData.plato = data.plato;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.movementType !== undefined)
      updateData.movementType = data.movementType;
    if (data.volumeHl !== undefined) updateData.volumeHl = data.volumeHl;
    if (data.direction !== undefined) updateData.direction = data.direction;
    if (data.date !== undefined) updateData.date = data.date;
    if (data.warehouseId !== undefined)
      updateData.warehouseId = data.warehouseId;
    if (data.description !== undefined)
      updateData.description = data.description;

    const [updated] = await db
      .update(exciseMovements)
      .set(updateData)
      .where(
        and(eq(exciseMovements.id, id), eq(exciseMovements.tenantId, tenantId))
      )
      .returning();

    if (!updated) {
      throw new Error("EXCISE_MOVEMENT_NOT_FOUND");
    }

    return mapMovementRow(updated);
  });
}

export async function deleteExciseMovement(id: string): Promise<void> {
  return withTenant(async (tenantId) => {
    // Only allow deleting draft + adjustment movements
    const existing = await db
      .select({
        status: exciseMovements.status,
        movementType: exciseMovements.movementType,
      })
      .from(exciseMovements)
      .where(
        and(eq(exciseMovements.id, id), eq(exciseMovements.tenantId, tenantId))
      )
      .limit(1);

    const row = existing[0];
    if (!row) {
      throw new Error("EXCISE_MOVEMENT_NOT_FOUND");
    }

    if (row.status !== "draft" && row.movementType !== "adjustment") {
      throw new Error("EXCISE_MOVEMENT_CANNOT_DELETE");
    }

    await db
      .delete(exciseMovements)
      .where(
        and(eq(exciseMovements.id, id), eq(exciseMovements.tenantId, tenantId))
      );
  });
}

// ── Plato Resolution ──────────────────────────────────────────

export async function resolveExcisePlato(
  batchId: string | null,
  tenantId: string
): Promise<{ plato: number | null; source: string | null }> {
  if (!batchId) return { plato: null, source: null };

  const settings = await getTenantExciseSettings(tenantId);

  const batchRows = await db
    .select({
      ogActual: batches.ogActual,
      recipeId: batches.recipeId,
    })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.tenantId, tenantId)))
    .limit(1);

  const batch = batchRows[0];
  if (!batch) return { plato: null, source: null };

  // Prefer batch measurement
  if (
    settings.excise_plato_source === "batch_measurement" &&
    batch.ogActual
  ) {
    return { plato: Number(batch.ogActual), source: "batch_measurement" };
  }

  // Fallback to recipe OG
  if (batch.recipeId) {
    const recipeRows = await db
      .select({ og: recipes.og })
      .from(recipes)
      .where(eq(recipes.id, batch.recipeId))
      .limit(1);

    const recipe = recipeRows[0];
    if (recipe?.og) {
      return { plato: Number(recipe.og), source: "recipe" };
    }
  }

  // Manual source with batch measurement as fallback
  if (settings.excise_plato_source === "manual" && batch.ogActual) {
    return { plato: Number(batch.ogActual), source: "batch_measurement" };
  }

  return { plato: null, source: null };
}

// ── Stock Issue Pre-validation ─────────────────────────────────

/**
 * Pre-validates excise prerequisites for a stock issue BEFORE confirmation.
 * Called from StockIssueConfirmDialog to block confirmation if excise data is incomplete.
 * Returns applicable=false if the warehouse is not excise-relevant (no checks needed).
 */
export async function prevalidateExciseForStockIssue(
  issueId: string
): Promise<ExcisePrevalidationResult> {
  return withTenant(async (tenantId) => {
    // Load issue to get warehouse + batch
    const issueRows = await db
      .select({
        warehouseId: stockIssues.warehouseId,
        batchId: stockIssues.batchId,
        movementType: stockIssues.movementType,
        movementPurpose: stockIssues.movementPurpose,
      })
      .from(stockIssues)
      .where(
        and(eq(stockIssues.tenantId, tenantId), eq(stockIssues.id, issueId))
      )
      .limit(1);

    const issue = issueRows[0];
    if (!issue) return { applicable: false, errors: [] };

    // Check if warehouse is excise relevant
    const whRows = await db
      .select({ isExciseRelevant: warehouses.isExciseRelevant })
      .from(warehouses)
      .where(eq(warehouses.id, issue.warehouseId))
      .limit(1);

    if (!whRows[0]?.isExciseRelevant) {
      return { applicable: false, errors: [] };
    }

    // Warehouse IS excise-relevant → run all checks
    const errors: ExcisePrevalidationError[] = [];

    // 1. Excise enabled?
    const settings = await getTenantExciseSettings(tenantId);
    if (!settings.excise_enabled) {
      errors.push({
        code: "excise_not_enabled",
        detail: "Nastavení → Spotřební daň → zapnout evidenci",
      });
    }

    // 2. Brewery category set?
    if (!settings.excise_brewery_category) {
      errors.push({
        code: "no_brewery_category",
        detail: "Nastavení → Spotřební daň → vybrat kategorii pivovaru",
      });
    }

    // 3. Excise rate exists for the category?
    if (settings.excise_brewery_category) {
      const rate = await getCurrentExciseRate(
        tenantId,
        settings.excise_brewery_category
      );
      if (!rate) {
        errors.push({
          code: "no_excise_rate",
          detail: `Sazba pro kategorii ${settings.excise_brewery_category} nenalezena`,
        });
      }
    }

    // 4. At least one excise-relevant item on the lines?
    const lines = await db
      .select({
        isExciseRelevant: items.isExciseRelevant,
      })
      .from(stockIssueLines)
      .innerJoin(items, eq(stockIssueLines.itemId, items.id))
      .where(
        and(
          eq(stockIssueLines.stockIssueId, issueId),
          eq(stockIssueLines.tenantId, tenantId)
        )
      );

    const exciseLines = lines.filter((l) => l.isExciseRelevant);
    if (exciseLines.length === 0) {
      // Not an error — just means no excise movement will be created
      return { applicable: false, errors: [] };
    }

    // 5. Plato resolvable? (for production receipts with batch)
    if (issue.batchId) {
      const { plato } = await resolveExcisePlato(issue.batchId, tenantId);
      if (plato === null) {
        errors.push({
          code: "no_plato",
          detail: "Várka nemá zadanou stupňovitost (OG)",
        });
      }
    }

    return { applicable: true, errors };
  });
}

/**
 * Pre-validates excise prerequisites for a batch BEFORE creating a production receipt.
 * Called from BatchBottlingTab "Naskladnit pivo?" dialog.
 * Finds the target warehouse by looking at excise-relevant warehouses for this tenant.
 */
export async function prevalidateExciseForBatch(
  batchId: string
): Promise<ExcisePrevalidationResult> {
  return withTenant(async (tenantId) => {
    // Load batch to get item
    const batchRows = await db
      .select({ itemId: batches.itemId })
      .from(batches)
      .where(and(eq(batches.tenantId, tenantId), eq(batches.id, batchId)))
      .limit(1);

    const batch = batchRows[0];
    if (!batch?.itemId) return { applicable: false, errors: [] };

    // Check if production item is excise-relevant
    const itemRows = await db
      .select({ isExciseRelevant: items.isExciseRelevant })
      .from(items)
      .where(eq(items.id, batch.itemId))
      .limit(1);

    if (!itemRows[0]?.isExciseRelevant) {
      return { applicable: false, errors: [] };
    }

    // Check if tenant has ANY excise-relevant warehouse
    const whRows = await db
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenantId, tenantId),
          eq(warehouses.isExciseRelevant, true),
          eq(warehouses.isActive, true)
        )
      )
      .limit(1);

    if (whRows.length === 0) {
      return { applicable: false, errors: [] };
    }

    // Item IS excise-relevant and there are excise warehouses → run checks
    const errors: ExcisePrevalidationError[] = [];

    const settings = await getTenantExciseSettings(tenantId);
    if (!settings.excise_enabled) {
      errors.push({
        code: "excise_not_enabled",
        detail: "Nastavení → Spotřební daň → zapnout evidenci",
      });
    }

    if (!settings.excise_brewery_category) {
      errors.push({
        code: "no_brewery_category",
        detail: "Nastavení → Spotřební daň → vybrat kategorii pivovaru",
      });
    }

    if (settings.excise_brewery_category) {
      const rate = await getCurrentExciseRate(
        tenantId,
        settings.excise_brewery_category
      );
      if (!rate) {
        errors.push({
          code: "no_excise_rate",
          detail: `Sazba pro kategorii ${settings.excise_brewery_category} nenalezena`,
        });
      }
    }

    // Plato resolvable?
    const { plato } = await resolveExcisePlato(batchId, tenantId);
    if (plato === null) {
      errors.push({
        code: "no_plato",
        detail: "Várka nemá zadanou stupňovitost (OG)",
      });
    }

    return { applicable: true, errors };
  });
}

// ── Stock Issue Integration ───────────────────────────────────

/**
 * Called from stock-issues confirmStockIssue hook.
 * Creates an excise movement when a stock issue is confirmed.
 * Receives tenantId as parameter — does NOT use withTenant.
 */
export async function createExciseMovementFromStockIssue(
  issueId: string,
  issueMovementType: string,
  issueMovementPurpose: string,
  warehouseId: string,
  issueBatchId: string | null,
  issueDate: string,
  tenantId: string
): Promise<void> {
  // Check if warehouse is excise relevant
  const whRows = await db
    .select({ isExciseRelevant: warehouses.isExciseRelevant })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .limit(1);

  const wh = whRows[0];
  if (!wh || !wh.isExciseRelevant) return;

  // Check excise_enabled in settings
  const settings = await getTenantExciseSettings(tenantId);
  if (!settings.excise_enabled) return;

  // Determine movementType and direction from issue type/purpose
  let movementType: string;
  let direction: string;

  if (
    issueMovementType === "receipt" &&
    issueMovementPurpose === "production_in"
  ) {
    movementType = "production";
    direction = "in";
  } else if (
    issueMovementType === "receipt" &&
    issueMovementPurpose === "transfer"
  ) {
    movementType = "transfer_in";
    direction = "in";
  } else if (
    issueMovementType === "issue" &&
    issueMovementPurpose === "sale"
  ) {
    movementType = "release";
    direction = "out";
  } else if (
    issueMovementType === "issue" &&
    issueMovementPurpose === "waste"
  ) {
    movementType = "destruction";
    direction = "out";
  } else if (
    issueMovementType === "issue" &&
    issueMovementPurpose === "transfer"
  ) {
    movementType = "transfer_out";
    direction = "out";
  } else if (issueMovementType === "issue") {
    movementType = "release";
    direction = "out";
  } else {
    return;
  }

  // Get rate from excise_rates
  const rate = await getCurrentExciseRate(
    tenantId,
    settings.excise_brewery_category
  );

  // Is this movement type the taxable point per tenant settings?
  const isTaxable =
    (settings.excise_tax_point === "production" &&
      movementType === "production") ||
    (settings.excise_tax_point === "release" && movementType === "release");

  const period = issueDate.substring(0, 7);

  if (issueMovementType === "receipt") {
    // ── RECEIPT PATH (production, transfer_in) ──
    // Plato + batchId are stored directly on receipt lines
    const receiptLines = await db
      .select({
        requestedQty: stockIssueLines.requestedQty,
        plato: stockIssueLines.plato,
        receiptBatchId: stockIssueLines.receiptBatchId,
        isExciseRelevant: items.isExciseRelevant,
      })
      .from(stockIssueLines)
      .innerJoin(items, eq(stockIssueLines.itemId, items.id))
      .where(
        and(
          eq(stockIssueLines.stockIssueId, issueId),
          eq(stockIssueLines.tenantId, tenantId)
        )
      );

    const exciseLines = receiptLines.filter((l) => l.isExciseRelevant);
    if (exciseLines.length === 0) return;

    const totalVolumeHl = exciseLines.reduce(
      (sum, l) => sum + Number(l.requestedQty) / 100,
      0
    );
    if (totalVolumeHl <= 0) return;

    // For receipts, all lines come from the same batch
    const linePlato = exciseLines[0]?.plato
      ? Number(exciseLines[0].plato)
      : null;
    const effectiveBatchId =
      exciseLines[0]?.receiptBatchId ?? issueBatchId;

    // Fallback: if line has no plato (pre-migration data), resolve from batch
    let plato = linePlato;
    let platoSource: string | null = linePlato ? "batch_measurement" : null;
    if (plato === null && effectiveBatchId) {
      const resolved = await resolveExcisePlato(effectiveBatchId, tenantId);
      plato = resolved.plato;
      platoSource = resolved.source;
    }

    let taxRate: string | null = null;
    let taxAmount: string | null = null;
    if (isTaxable && plato && rate) {
      taxRate = rate.ratePerPlatoHl;
      taxAmount = String(totalVolumeHl * plato * Number(rate.ratePerPlatoHl));
    }

    await db.insert(exciseMovements).values({
      tenantId,
      batchId: effectiveBatchId ?? null,
      stockIssueId: issueId,
      warehouseId,
      movementType,
      volumeHl: String(totalVolumeHl),
      direction,
      plato: plato !== null ? String(plato) : null,
      platoSource,
      taxRate,
      taxAmount,
      date: issueDate,
      period,
      status: "confirmed",
    });

    // Update batch excise fields
    if (effectiveBatchId) {
      await db
        .update(batches)
        .set({
          exciseRelevantHl: sql`COALESCE(${batches.exciseRelevantHl}, '0')::numeric + ${String(totalVolumeHl)}::numeric`,
          exciseStatus: "pending",
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(batches.id, effectiveBatchId),
            eq(batches.tenantId, tenantId)
          )
        );
    }
  } else {
    // ── ISSUE PATH (release, destruction, transfer_out) ──
    // Get plato + batchId per source batch from FIFO allocations.
    // stock_movements (out) → receipt_line (plato, batch_id) → GROUP BY batch
    const batchGroupRows = await db.execute(sql`
      SELECT rl.batch_id, rl.plato,
             SUM(ABS(sm.quantity::numeric)) AS total_qty_liters
      FROM stock_movements sm
      JOIN stock_issue_lines rl ON rl.id = sm.receipt_line_id
      JOIN items i ON i.id = sm.item_id
      WHERE sm.stock_issue_id = ${issueId}
        AND sm.tenant_id = ${tenantId}
        AND sm.movement_type = 'out'
        AND i.is_excise_relevant = true
      GROUP BY rl.batch_id, rl.plato
    `);

    const batchGroups = batchGroupRows as unknown as Array<{
      batch_id: string | null;
      plato: string | null;
      total_qty_liters: string;
    }>;

    if (batchGroups.length === 0) {
      // Fallback: no FIFO data (e.g. pre-migration movements without receipt_line_id)
      const lines = await db
        .select({
          requestedQty: stockIssueLines.requestedQty,
          isExciseRelevant: items.isExciseRelevant,
        })
        .from(stockIssueLines)
        .innerJoin(items, eq(stockIssueLines.itemId, items.id))
        .where(
          and(
            eq(stockIssueLines.stockIssueId, issueId),
            eq(stockIssueLines.tenantId, tenantId)
          )
        );

      const exciseLines = lines.filter((l) => l.isExciseRelevant);
      if (exciseLines.length === 0) return;

      const totalVolumeHl = exciseLines.reduce(
        (sum, l) => sum + Number(l.requestedQty) / 100,
        0
      );
      if (totalVolumeHl <= 0) return;

      const { plato, source } = await resolveExcisePlato(
        issueBatchId,
        tenantId
      );

      let taxRate: string | null = null;
      let taxAmount: string | null = null;
      if (isTaxable && plato && rate) {
        taxRate = rate.ratePerPlatoHl;
        taxAmount = String(
          totalVolumeHl * plato * Number(rate.ratePerPlatoHl)
        );
      }

      await db.insert(exciseMovements).values({
        tenantId,
        batchId: issueBatchId ?? null,
        stockIssueId: issueId,
        warehouseId,
        movementType,
        volumeHl: String(totalVolumeHl),
        direction,
        plato: plato !== null ? String(plato) : null,
        platoSource: source ?? null,
        taxRate,
        taxAmount,
        date: issueDate,
        period,
        status: "confirmed",
      });
      return;
    }

    // Create one excise movement per source batch (different °P)
    for (const group of batchGroups) {
      const volumeHl = Number(group.total_qty_liters) / 100;
      if (volumeHl <= 0) continue;

      const plato = group.plato ? Number(group.plato) : null;

      let taxRate: string | null = null;
      let taxAmount: string | null = null;
      if (isTaxable && plato && rate) {
        taxRate = rate.ratePerPlatoHl;
        taxAmount = String(
          volumeHl * plato * Number(rate.ratePerPlatoHl)
        );
      }

      await db.insert(exciseMovements).values({
        tenantId,
        batchId: group.batch_id ?? null,
        stockIssueId: issueId,
        warehouseId,
        movementType,
        volumeHl: String(volumeHl),
        direction,
        plato: plato !== null ? String(plato) : null,
        platoSource: plato ? "batch_measurement" : null,
        taxRate,
        taxAmount,
        date: issueDate,
        period,
        status: "confirmed",
      });
    }
  }
}

/**
 * Called from stock-issues cancelStockIssue hook.
 * Creates a counter-movement to reverse the excise effect.
 * Receives tenantId as parameter — does NOT use withTenant.
 */
export async function cancelExciseMovementForStockIssue(
  issueId: string,
  tenantId: string
): Promise<void> {
  // Find excise movement by stock_issue_id
  const existing = await db
    .select()
    .from(exciseMovements)
    .where(
      and(
        eq(exciseMovements.stockIssueId, issueId),
        eq(exciseMovements.tenantId, tenantId)
      )
    )
    .limit(1);

  const original = existing[0];
  if (!original) return;

  // Create counter-movement (opposite direction, type=adjustment, negative tax)
  const oppositeDirection = original.direction === "in" ? "out" : "in";
  const negativeTax = original.taxAmount
    ? String(-Number(original.taxAmount))
    : null;

  await db.insert(exciseMovements).values({
    tenantId,
    batchId: original.batchId,
    stockIssueId: issueId,
    warehouseId: original.warehouseId,
    movementType: "adjustment",
    volumeHl: original.volumeHl,
    direction: oppositeDirection,
    plato: original.plato,
    platoSource: original.platoSource,
    taxRate: original.taxRate,
    taxAmount: negativeTax,
    date: original.date,
    period: original.period,
    status: "confirmed",
    description: `Storno pohybu pro doklad ${issueId}`,
  });

  // Reverse batch excise fields if batchId present
  if (original.batchId) {
    await db
      .update(batches)
      .set({
        exciseRelevantHl: sql`GREATEST(0, COALESCE(${batches.exciseRelevantHl}, '0')::numeric - ${original.volumeHl}::numeric)`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(batches.id, original.batchId),
          eq(batches.tenantId, tenantId)
        )
      );
  }
}

/**
 * Called from batches module after packaging loss is recorded.
 * Creates a loss excise movement.
 * Receives tenantId as parameter — does NOT use withTenant.
 */
export async function createExciseLossFromPackaging(
  batchId: string,
  tenantId: string
): Promise<void> {
  // Check excise_enabled
  const settings = await getTenantExciseSettings(tenantId);
  if (!settings.excise_enabled) return;

  // Load batch
  const batchRows = await db
    .select({
      id: batches.id,
      packagingLossL: batches.packagingLossL,
      tenantId: batches.tenantId,
    })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.tenantId, tenantId)))
    .limit(1);

  const batch = batchRows[0];
  if (!batch) return;

  const lossL = Number(batch.packagingLossL ?? 0);
  if (lossL <= 0) return;

  const lossHl = lossL / 100;

  // Resolve plato
  const { plato, source: platoSource } = await resolveExcisePlato(
    batchId,
    tenantId
  );

  const today = todayISO();
  const period = today.substring(0, 7);

  await db.insert(exciseMovements).values({
    tenantId,
    batchId,
    movementType: "loss",
    volumeHl: String(lossHl),
    direction: "out",
    plato: plato !== null ? String(plato) : null,
    platoSource: platoSource ?? null,
    date: today,
    period,
    status: "confirmed",
    description: "Ztrata z baleni",
  });
}

// ── Monthly Reports ───────────────────────────────────────────

export async function getMonthlyReports(): Promise<ExciseMonthlyReport[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(exciseMonthlyReports)
      .where(eq(exciseMonthlyReports.tenantId, tenantId))
      .orderBy(desc(exciseMonthlyReports.period));

    return rows.map(mapReportRow);
  });
}

export async function getMonthlyReport(
  id: string
): Promise<ExciseMonthlyReport> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(exciseMonthlyReports)
      .where(
        and(
          eq(exciseMonthlyReports.id, id),
          eq(exciseMonthlyReports.tenantId, tenantId)
        )
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new Error("EXCISE_REPORT_NOT_FOUND");
    }

    return mapReportRow(row);
  });
}

export async function generateMonthlyReport(
  period: string
): Promise<ExciseMonthlyReport> {
  return withTenant(async (tenantId) => {
    // Check if existing report for period
    const existingRows = await db
      .select()
      .from(exciseMonthlyReports)
      .where(
        and(
          eq(exciseMonthlyReports.tenantId, tenantId),
          eq(exciseMonthlyReports.period, period)
        )
      )
      .limit(1);

    const existingReport = existingRows[0];

    if (existingReport) {
      if (
        existingReport.status === "submitted" ||
        existingReport.status === "accepted"
      ) {
        throw new Error("EXCISE_REPORT_ALREADY_SUBMITTED");
      }
    }

    // Get opening balance from previous month's report
    const prevPeriod = getPreviousPeriod(period);
    const prevReportRows = await db
      .select({ closingBalanceHl: exciseMonthlyReports.closingBalanceHl })
      .from(exciseMonthlyReports)
      .where(
        and(
          eq(exciseMonthlyReports.tenantId, tenantId),
          eq(exciseMonthlyReports.period, prevPeriod)
        )
      )
      .limit(1);

    const openingBalanceHl = Number(
      prevReportRows[0]?.closingBalanceHl ?? "0"
    );

    // Sum excise_movements by type for this period (confirmed status only)
    const movementSums = await db
      .select({
        movementType: exciseMovements.movementType,
        direction: exciseMovements.direction,
        totalVolume: sql<string>`SUM(${exciseMovements.volumeHl}::numeric)`,
      })
      .from(exciseMovements)
      .where(
        and(
          eq(exciseMovements.tenantId, tenantId),
          eq(exciseMovements.period, period),
          eq(exciseMovements.status, "confirmed")
        )
      )
      .groupBy(exciseMovements.movementType, exciseMovements.direction);

    let productionHl = 0;
    let transferInHl = 0;
    let releaseHl = 0;
    let transferOutHl = 0;
    let lossHl = 0;
    let destructionHl = 0;
    let adjustmentHl = 0;

    for (const row of movementSums) {
      const vol = Number(row.totalVolume ?? 0);
      switch (row.movementType) {
        case "production":
          productionHl += vol;
          break;
        case "transfer_in":
          transferInHl += vol;
          break;
        case "release":
          releaseHl += vol;
          break;
        case "transfer_out":
          transferOutHl += vol;
          break;
        case "loss":
          lossHl += vol;
          break;
        case "destruction":
          destructionHl += vol;
          break;
        case "adjustment":
          // Adjustments can be in or out
          if (row.direction === "in") {
            adjustmentHl += vol;
          } else {
            adjustmentHl -= vol;
          }
          break;
      }
    }

    // Calculate closing balance
    const closingBalanceHl =
      openingBalanceHl +
      productionHl +
      transferInHl -
      releaseHl -
      transferOutHl -
      lossHl -
      destructionHl +
      adjustmentHl;

    // Group release movements by plato for tax_details
    const taxDetailRows = await db
      .select({
        plato: exciseMovements.plato,
        totalVolume: sql<string>`SUM(${exciseMovements.volumeHl}::numeric)`,
        totalTax: sql<string>`SUM(${exciseMovements.taxAmount}::numeric)`,
      })
      .from(exciseMovements)
      .where(
        and(
          eq(exciseMovements.tenantId, tenantId),
          eq(exciseMovements.period, period),
          eq(exciseMovements.status, "confirmed"),
          eq(exciseMovements.movementType, "release")
        )
      )
      .groupBy(exciseMovements.plato);

    const taxDetails: TaxDetailEntry[] = taxDetailRows
      .filter((r) => r.plato !== null)
      .map((r) => ({
        plato: Number(r.plato),
        volume_hl: Number(r.totalVolume ?? 0),
        tax: Number(r.totalTax ?? 0),
      }));

    // Calculate total_tax from tax_details
    const totalTax = taxDetails.reduce((sum, d) => sum + d.tax, 0);

    const reportData = {
      openingBalanceHl: String(openingBalanceHl),
      productionHl: String(productionHl),
      transferInHl: String(transferInHl),
      releaseHl: String(releaseHl),
      transferOutHl: String(transferOutHl),
      lossHl: String(lossHl),
      destructionHl: String(destructionHl),
      adjustmentHl: String(adjustmentHl),
      closingBalanceHl: String(closingBalanceHl),
      totalTax: String(totalTax),
      taxDetails,
    };

    // Upsert report
    if (existingReport) {
      const [updated] = await db
        .update(exciseMonthlyReports)
        .set({
          ...reportData,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(exciseMonthlyReports.id, existingReport.id),
            eq(exciseMonthlyReports.tenantId, tenantId)
          )
        )
        .returning();

      if (!updated) {
        throw new Error("EXCISE_REPORT_UPDATE_FAILED");
      }

      return mapReportRow(updated);
    }

    const [inserted] = await db
      .insert(exciseMonthlyReports)
      .values({
        tenantId,
        period,
        ...reportData,
      })
      .returning();

    if (!inserted) {
      throw new Error("EXCISE_REPORT_INSERT_FAILED");
    }

    return mapReportRow(inserted);
  });
}

export async function submitMonthlyReport(
  id: string
): Promise<ExciseMonthlyReport> {
  return withTenant(async (tenantId) => {
    // Update status to 'submitted', set submittedAt
    const [updated] = await db
      .update(exciseMonthlyReports)
      .set({
        status: "submitted",
        submittedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(exciseMonthlyReports.id, id),
          eq(exciseMonthlyReports.tenantId, tenantId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("EXCISE_REPORT_NOT_FOUND");
    }

    // Update all confirmed excise movements in this period to 'reported'
    await db
      .update(exciseMovements)
      .set({ status: "reported", updatedAt: sql`now()` })
      .where(
        and(
          eq(exciseMovements.tenantId, tenantId),
          eq(exciseMovements.period, updated.period),
          eq(exciseMovements.status, "confirmed")
        )
      );

    // Update related batches excise_status to 'reported'
    const periodMovements = await db
      .select({ batchId: exciseMovements.batchId })
      .from(exciseMovements)
      .where(
        and(
          eq(exciseMovements.tenantId, tenantId),
          eq(exciseMovements.period, updated.period),
          eq(exciseMovements.status, "reported")
        )
      );

    const batchIds = [
      ...new Set(
        periodMovements
          .map((m) => m.batchId)
          .filter((bid): bid is string => bid !== null)
      ),
    ];

    for (const batchId of batchIds) {
      await db
        .update(batches)
        .set({
          exciseStatus: "reported",
          updatedAt: sql`now()`,
        })
        .where(
          and(eq(batches.id, batchId), eq(batches.tenantId, tenantId))
        );
    }

    return mapReportRow(updated);
  });
}

export async function revertMonthlyReport(
  id: string
): Promise<ExciseMonthlyReport> {
  return withTenant(async (tenantId) => {
    // Load the report
    const reportRows = await db
      .select()
      .from(exciseMonthlyReports)
      .where(
        and(
          eq(exciseMonthlyReports.id, id),
          eq(exciseMonthlyReports.tenantId, tenantId)
        )
      )
      .limit(1);

    const report = reportRows[0];
    if (!report) {
      throw new Error("EXCISE_REPORT_NOT_FOUND");
    }

    if (report.status !== "submitted") {
      throw new Error("EXCISE_REPORT_NOT_SUBMITTED");
    }

    // Revert status: submitted -> draft
    const [updated] = await db
      .update(exciseMonthlyReports)
      .set({
        status: "draft",
        submittedAt: null,
        submittedBy: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(exciseMonthlyReports.id, id),
          eq(exciseMonthlyReports.tenantId, tenantId)
        )
      )
      .returning();

    if (!updated) {
      throw new Error("EXCISE_REPORT_UPDATE_FAILED");
    }

    // Revert excise movements back to 'confirmed'
    await db
      .update(exciseMovements)
      .set({ status: "confirmed", updatedAt: sql`now()` })
      .where(
        and(
          eq(exciseMovements.tenantId, tenantId),
          eq(exciseMovements.period, report.period),
          eq(exciseMovements.status, "reported")
        )
      );

    return mapReportRow(updated);
  });
}

// ── Excise Warehouses ─────────────────────────────────────────

export async function getExciseWarehouses(): Promise<
  Array<{ id: string; name: string }>
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ id: warehouses.id, name: warehouses.name })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.tenantId, tenantId),
          eq(warehouses.isExciseRelevant, true),
          eq(warehouses.isActive, true)
        )
      )
      .orderBy(warehouses.name);
    return rows;
  });
}

// ── Tenant Excise Settings (withTenant wrapper) ───────────────

export async function getTenantExciseSettingsForUI(): Promise<ExciseSettings> {
  return withTenant(async (tenantId) => {
    return getTenantExciseSettings(tenantId);
  });
}

// ── Update Excise Settings ────────────────────────────────────

export async function updateExciseSettings(
  settings: Partial<ExciseSettings>
): Promise<void> {
  return withTenant(async (tenantId) => {
    const current = await db
      .select({ settings: tenants.settings })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    const currentSettings = (current[0]?.settings ?? {}) as Record<
      string,
      unknown
    >;
    const merged = { ...currentSettings };

    if (settings.excise_enabled !== undefined)
      merged.excise_enabled = settings.excise_enabled;
    if (settings.excise_brewery_category !== undefined)
      merged.excise_brewery_category = settings.excise_brewery_category;
    if (settings.excise_tax_point !== undefined)
      merged.excise_tax_point = settings.excise_tax_point;
    if (settings.excise_plato_source !== undefined)
      merged.excise_plato_source = settings.excise_plato_source;
    if (settings.excise_loss_norm_pct !== undefined)
      merged.excise_loss_norm_pct = settings.excise_loss_norm_pct;

    await db
      .update(tenants)
      .set({ settings: merged, updatedAt: sql`now()` })
      .where(eq(tenants.id, tenantId));
  });
}

// ── Dashboard ─────────────────────────────────────────────────

export async function getExciseDashboard(): Promise<ExciseDashboardData> {
  return withTenant(async (tenantId) => {
    const currentPeriod = getCurrentPeriod();

    // Sum movements for current period
    const periodSums = await db
      .select({
        movementType: exciseMovements.movementType,
        direction: exciseMovements.direction,
        totalVolume: sql<string>`SUM(${exciseMovements.volumeHl}::numeric)`,
        totalTax: sql<string>`SUM(COALESCE(${exciseMovements.taxAmount}, '0')::numeric)`,
      })
      .from(exciseMovements)
      .where(
        and(
          eq(exciseMovements.tenantId, tenantId),
          eq(exciseMovements.period, currentPeriod),
          or(
            eq(exciseMovements.status, "confirmed"),
            eq(exciseMovements.status, "reported")
          )
        )
      )
      .groupBy(exciseMovements.movementType, exciseMovements.direction);

    let monthProduction = 0;
    let monthRelease = 0;
    let monthTax = 0;
    let monthIn = 0;
    let monthOut = 0;

    for (const row of periodSums) {
      const vol = Number(row.totalVolume ?? 0);
      const tax = Number(row.totalTax ?? 0);

      if (row.direction === "in") monthIn += vol;
      else monthOut += vol;

      if (row.movementType === "production") monthProduction += vol;
      if (row.movementType === "release") {
        monthRelease += vol;
        monthTax += tax;
      }
    }

    // Calculate current balance from latest report closing + current month movements
    const prevPeriod = getPreviousPeriod(currentPeriod);
    const prevReportRows = await db
      .select({ closingBalanceHl: exciseMonthlyReports.closingBalanceHl })
      .from(exciseMonthlyReports)
      .where(
        and(
          eq(exciseMonthlyReports.tenantId, tenantId),
          eq(exciseMonthlyReports.period, prevPeriod)
        )
      )
      .limit(1);

    const prevClosing = Number(
      prevReportRows[0]?.closingBalanceHl ?? "0"
    );
    const currentBalanceHl = prevClosing + monthIn - monthOut;

    return {
      currentBalanceHl,
      monthProduction,
      monthRelease,
      monthTax,
      currentPeriod,
    };
  });
}
