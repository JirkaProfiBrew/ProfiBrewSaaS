"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { cashflows, cashflowCategories, cashflowTemplates, cashDesks, cfAutoGenerationLog } from "@/../drizzle/schema/cashflows";
import { partners } from "@/../drizzle/schema/partners";
import { orders } from "@/../drizzle/schema/orders";
import { stockIssues } from "@/../drizzle/schema/stock";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { shops } from "@/../drizzle/schema/shops";
import { eq, and, sql, desc, asc, ilike, or, gte, lte } from "drizzle-orm";
import { getNextNumber } from "@/lib/db/counters";
import type { CashFlow, CashFlowTemplate, CashFlowFilter, CashFlowSummary, CreateCashFlowInput, UpdateCashFlowInput, CreateTemplateInput, UpdateTemplateInput, CashFlowType, SelectOption, CategoryOption } from "./types";

// -- Helpers -----------------------------------------------------------------

function mapCashFlowRow(
  row: typeof cashflows.$inferSelect,
  joined?: { categoryName?: string | null; partnerName?: string | null; cashDeskName?: string | null }
): CashFlow {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code ?? null,
    cashflowType: row.cashflowType as CashFlow["cashflowType"],
    categoryId: row.categoryId ?? null,
    amount: row.amount,
    currency: row.currency ?? "CZK",
    date: row.date,
    dueDate: row.dueDate ?? null,
    paidDate: row.paidDate ?? null,
    status: row.status as CashFlow["status"],
    partnerId: row.partnerId ?? null,
    orderId: row.orderId ?? null,
    stockIssueId: row.stockIssueId ?? null,
    shopId: row.shopId ?? null,
    description: row.description ?? null,
    notes: row.notes ?? null,
    isCash: row.isCash ?? false,
    cashDeskId: row.cashDeskId ?? null,
    templateId: row.templateId ?? null,
    isRecurring: row.isRecurring ?? false,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    categoryName: joined?.categoryName ?? null,
    partnerName: joined?.partnerName ?? null,
    cashDeskName: joined?.cashDeskName ?? null,
  };
}

function mapTemplateRow(
  row: typeof cashflowTemplates.$inferSelect,
  joined?: { categoryName?: string | null; partnerName?: string | null }
): CashFlowTemplate {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    cashflowType: row.cashflowType as CashFlowTemplate["cashflowType"],
    categoryId: row.categoryId ?? null,
    amount: row.amount,
    description: row.description ?? null,
    partnerId: row.partnerId ?? null,
    frequency: row.frequency as CashFlowTemplate["frequency"],
    dayOfMonth: row.dayOfMonth ?? null,
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    nextDate: row.nextDate,
    isActive: row.isActive ?? true,
    autoGenerate: row.autoGenerate ?? false,
    lastGenerated: row.lastGenerated ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    categoryName: joined?.categoryName ?? null,
    partnerName: joined?.partnerName ?? null,
  };
}

function advanceDate(dateStr: string, frequency: string): string {
  const d = new Date(dateStr);
  switch (frequency) {
    case "weekly":    d.setDate(d.getDate() + 7);        break;
    case "monthly":   d.setMonth(d.getMonth() + 1);       break;
    case "quarterly": d.setMonth(d.getMonth() + 3);       break;
    case "yearly":    d.setFullYear(d.getFullYear() + 1); break;
    default:          d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}
// -- getCashFlows -------------------------------------------------------

export async function getCashFlows(
  filter?: CashFlowFilter
): Promise<CashFlow[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: cashflows.id, tenantId: cashflows.tenantId, code: cashflows.code,
        cashflowType: cashflows.cashflowType, categoryId: cashflows.categoryId,
        amount: cashflows.amount, currency: cashflows.currency, date: cashflows.date,
        dueDate: cashflows.dueDate, paidDate: cashflows.paidDate, status: cashflows.status,
        partnerId: cashflows.partnerId, orderId: cashflows.orderId,
        stockIssueId: cashflows.stockIssueId, shopId: cashflows.shopId,
        description: cashflows.description, notes: cashflows.notes,
        isCash: cashflows.isCash, cashDeskId: cashflows.cashDeskId,
        templateId: cashflows.templateId, isRecurring: cashflows.isRecurring,
        createdBy: cashflows.createdBy,
        createdAt: cashflows.createdAt, updatedAt: cashflows.updatedAt,
        categoryName: cashflowCategories.name,
        partnerName: partners.name,
        cashDeskName: cashDesks.name,
      })
      .from(cashflows)
      .leftJoin(cashflowCategories, eq(cashflows.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflows.partnerId, partners.id))
      .leftJoin(cashDesks, eq(cashflows.cashDeskId, cashDesks.id))
      .where(
        and(
          eq(cashflows.tenantId, tenantId),
          filter?.cashflowType ? eq(cashflows.cashflowType, filter.cashflowType) : undefined,
          filter?.status       ? eq(cashflows.status, filter.status)             : undefined,
          filter?.categoryId   ? eq(cashflows.categoryId, filter.categoryId)     : undefined,
          filter?.partnerId    ? eq(cashflows.partnerId, filter.partnerId)        : undefined,
          filter?.dateFrom     ? gte(cashflows.date, filter.dateFrom)             : undefined,
          filter?.dateTo       ? lte(cashflows.date, filter.dateTo)               : undefined,
          filter?.search
            ? or(
                ilike(cashflows.code, "%" + filter.search + "%"),
                ilike(cashflows.description, "%" + filter.search + "%")
              )
            : undefined
        )
      )
      .orderBy(desc(cashflows.date), desc(cashflows.createdAt));
    return rows.map((row) =>
      mapCashFlowRow(row, { categoryName: row.categoryName, partnerName: row.partnerName, cashDeskName: row.cashDeskName })
    );
  });
}
// -- getCashFlow --------------------------------------------------------

export async function getCashFlow(id: string): Promise<CashFlow | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: cashflows.id, tenantId: cashflows.tenantId, code: cashflows.code,
        cashflowType: cashflows.cashflowType, categoryId: cashflows.categoryId,
        amount: cashflows.amount, currency: cashflows.currency, date: cashflows.date,
        dueDate: cashflows.dueDate, paidDate: cashflows.paidDate, status: cashflows.status,
        partnerId: cashflows.partnerId, orderId: cashflows.orderId,
        stockIssueId: cashflows.stockIssueId, shopId: cashflows.shopId,
        description: cashflows.description, notes: cashflows.notes,
        isCash: cashflows.isCash, cashDeskId: cashflows.cashDeskId,
        templateId: cashflows.templateId, isRecurring: cashflows.isRecurring,
        createdBy: cashflows.createdBy,
        createdAt: cashflows.createdAt, updatedAt: cashflows.updatedAt,
        categoryName: cashflowCategories.name,
        partnerName: partners.name,
        cashDeskName: cashDesks.name,
      })
      .from(cashflows)
      .leftJoin(cashflowCategories, eq(cashflows.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflows.partnerId, partners.id))
      .leftJoin(cashDesks, eq(cashflows.cashDeskId, cashDesks.id))
      .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return mapCashFlowRow(row, { categoryName: row.categoryName, partnerName: row.partnerName, cashDeskName: row.cashDeskName });
  });
}

// -- createCashFlow -----------------------------------------------------

export async function createCashFlow(
  data: CreateCashFlowInput
): Promise<CashFlow | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      // Generate cashflow code OUTSIDE transaction (counter uses its own tx)
      const code = await getNextNumber(tenantId, "cashflow");

      // Cash desk path — insert CF + update desk balance atomically
      if (data.isCash && data.cashDeskId) {
        const today = new Date().toISOString().slice(0, 10);

        const result = await db.transaction(async (tx) => {
          // 1. Verify cash desk exists and is active
          const deskRows = await tx
            .select({
              id: cashDesks.id,
              shopId: cashDesks.shopId,
              isActive: cashDesks.isActive,
            })
            .from(cashDesks)
            .where(and(eq(cashDesks.id, data.cashDeskId!), eq(cashDesks.tenantId, tenantId)))
            .limit(1);

          const desk = deskRows[0];
          if (!desk) return { error: "CASH_DESK_NOT_FOUND" } as const;
          if (!desk.isActive) return { error: "CASH_DESK_INACTIVE" } as const;

          // 2. Insert cashflow — auto-paid, linked to desk's shop
          const inserted = await tx
            .insert(cashflows)
            .values({
              tenantId, code,
              cashflowType: data.cashflowType,
              categoryId:   data.categoryId   ?? null,
              amount:       data.amount,
              currency:     data.currency     ?? "CZK",
              date:         data.date,
              dueDate:      null,
              paidDate:     today,
              status:       "paid",
              partnerId:    data.partnerId    ?? null,
              orderId:      null,
              stockIssueId: null,
              shopId:       desk.shopId,
              description:  data.description  ?? null,
              notes:        data.notes        ?? null,
              isCash:       true,
              cashDeskId:   data.cashDeskId!,
            })
            .returning();

          const cfRow = inserted[0];
          if (!cfRow) return { error: "INSERT_FAILED" } as const;

          // 3. Update cash desk balance atomically
          const delta = data.cashflowType === "income" ? data.amount : `-${data.amount}`;
          await tx
            .update(cashDesks)
            .set({
              currentBalance: sql`COALESCE(current_balance, 0) + ${delta}::decimal`,
              updatedAt: sql`now()`,
            })
            .where(and(eq(cashDesks.id, data.cashDeskId!), eq(cashDesks.tenantId, tenantId)));

          return mapCashFlowRow(cfRow);
        });

        return result;
      }

      // Standard (non-cash) path
      const inserted = await db
        .insert(cashflows)
        .values({
          tenantId, code,
          cashflowType: data.cashflowType,
          categoryId:   data.categoryId   ?? null,
          amount:       data.amount,
          currency:     data.currency     ?? "CZK",
          date:         data.date,
          dueDate:      data.dueDate      ?? null,
          status:       data.status       ?? "planned",
          partnerId:    data.partnerId    ?? null,
          orderId:      data.orderId      ?? null,
          stockIssueId: data.stockIssueId ?? null,
          shopId:       data.shopId       ?? null,
          description:  data.description  ?? null,
          notes:        data.notes        ?? null,
          isCash:       data.isCash       ?? false,
        })
        .returning();
      const row = inserted[0];
      if (!row) return { error: "INSERT_FAILED" };

      // Back-link stock issue if provided
      if (data.stockIssueId) {
        await db
          .update(stockIssues)
          .set({ cashflowId: row.id, updatedAt: sql`now()` })
          .where(and(eq(stockIssues.id, data.stockIssueId), eq(stockIssues.tenantId, tenantId)));
      }

      return mapCashFlowRow(row);
    });
  } catch (err: unknown) {
    console.error("[cashflows] createCashFlow error:", err);
    return { error: "CREATE_FAILED" };
  }
}
// -- updateCashFlow -----------------------------------------------------

export async function updateCashFlow(
  id: string,
  data: UpdateCashFlowInput
): Promise<CashFlow | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const existing = await db
        .select({ id: cashflows.id, status: cashflows.status })
        .from(cashflows)
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
        .limit(1);
      const record = existing[0];
      if (!record) return { error: "NOT_FOUND" };
      if (record.status === "cancelled") {
        return { error: "CASHFLOW_NOT_EDITABLE" };
      }
      const updated = await db
        .update(cashflows)
        .set({
          ...(data.categoryId  !== undefined && { categoryId:  data.categoryId }),
          ...(data.amount      !== undefined && { amount:      data.amount }),
          ...(data.currency    !== undefined && { currency:    data.currency }),
          ...(data.date        !== undefined && { date:        data.date }),
          ...(data.dueDate     !== undefined && { dueDate:     data.dueDate }),
          ...(data.status      !== undefined && { status:      data.status }),
          ...(data.partnerId   !== undefined && { partnerId:   data.partnerId }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.notes       !== undefined && { notes:       data.notes }),
          ...(data.isCash      !== undefined && { isCash:      data.isCash }),
          updatedAt: sql`now()`,
        })
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
        .returning();
      const row = updated[0];
      if (!row) return { error: "UPDATE_FAILED" };
      return mapCashFlowRow(row);
    });
  } catch (err: unknown) {
    console.error("[cashflows] updateCashFlow error:", err);
    return { error: "UPDATE_FAILED" };
  }
}

// -- deleteCashFlow (soft) ----------------------------------------------

export async function deleteCashFlow(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const existing = await db
        .select({ id: cashflows.id, status: cashflows.status, cashDeskId: cashflows.cashDeskId })
        .from(cashflows)
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
        .limit(1);
      const record = existing[0];
      if (!record) return { error: "NOT_FOUND" };
      if (record.cashDeskId) return { error: "HAS_CASH_DESK" };
      if (record.status === "cancelled") return { error: "CASHFLOW_NOT_DELETABLE" };
      await db
        .update(cashflows)
        .set({ status: "cancelled", updatedAt: sql`now()` })
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)));
      return { success: true };
    });
  } catch (err: unknown) {
    console.error("[cashflows] deleteCashFlow error:", err);
    return { error: "DELETE_FAILED" };
  }
}
// -- markCashFlowPaid ---------------------------------------------------

export async function markCashFlowPaid(
  id: string,
  paidDate?: string
): Promise<CashFlow | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const existing = await db
        .select({ id: cashflows.id, status: cashflows.status })
        .from(cashflows)
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
        .limit(1);
      const record = existing[0];
      if (!record) return { error: "NOT_FOUND" };
      if (record.status === "cancelled") return { error: "CASHFLOW_CANCELLED" };
      if (record.status === "paid")      return { error: "CASHFLOW_ALREADY_PAID" };
      const effectivePaidDate = paidDate ?? new Date().toISOString().slice(0, 10);
      const updated = await db
        .update(cashflows)
        .set({ status: "paid", paidDate: effectivePaidDate, updatedAt: sql`now()` })
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
        .returning();
      const row = updated[0];
      if (!row) return { error: "UPDATE_FAILED" };
      return mapCashFlowRow(row);
    });
  } catch (err: unknown) {
    console.error("[cashflows] markCashFlowPaid error:", err);
    return { error: "MARK_PAID_FAILED" };
  }
}

// -- cancelCashFlow -----------------------------------------------------

export async function cancelCashFlow(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const existing = await db
        .select({ id: cashflows.id, status: cashflows.status })
        .from(cashflows)
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
        .limit(1);
      const record = existing[0];
      if (!record) return { error: "NOT_FOUND" };
      if (record.status === "cancelled") return { error: "CASHFLOW_ALREADY_CANCELLED" };
      await db
        .update(cashflows)
        .set({ status: "cancelled", updatedAt: sql`now()` })
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)));
      return { success: true };
    });
  } catch (err: unknown) {
    console.error("[cashflows] cancelCashFlow error:", err);
    return { error: "CANCEL_FAILED" };
  }
}
// -- getCashFlowSummary -------------------------------------------------

export async function getCashFlowSummary(
  month: number,
  year: number
): Promise<CashFlowSummary | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const monthStr     = String(month).padStart(2, "0");
      const dateFrom     = year + "-" + monthStr + "-01";
      const nextMonth    = month === 12 ? 1 : month + 1;
      const nextYear     = month === 12 ? year + 1 : year;
      const nextMonthStr = String(nextMonth).padStart(2, "0");
      const dateTo       = nextYear + "-" + nextMonthStr + "-01";

      const rows = await db
        .select({
          cashflowType: cashflows.cashflowType,
          status:       cashflows.status,
          totalAmount:  sql<string>`COALESCE(SUM(${cashflows.amount}), 0)::text`,
        })
        .from(cashflows)
        .where(
          and(
            eq(cashflows.tenantId, tenantId),
            gte(cashflows.date, dateFrom),
            sql`${cashflows.date} < ${dateTo}`,
            sql`${cashflows.status} != ${"cancelled"}`,
          )
        )
        .groupBy(cashflows.cashflowType, cashflows.status);

      let totalIncome = 0, totalExpense = 0, paidIncome = 0, paidExpense = 0;
      for (const row of rows) {
        const amount = parseFloat(row.totalAmount ?? "0");
        if (row.cashflowType === "income") {
          totalIncome += amount;
          if (row.status === "paid") paidIncome += amount;
        } else {
          totalExpense += amount;
          if (row.status === "paid") paidExpense += amount;
        }
      }
      return {
        month, year,
        totalIncome:  totalIncome.toFixed(2),
        totalExpense: totalExpense.toFixed(2),
        balance:      (totalIncome - totalExpense).toFixed(2),
        paidIncome:   paidIncome.toFixed(2),
        paidExpense:  paidExpense.toFixed(2),
        paidBalance:  (paidIncome - paidExpense).toFixed(2),
      };
    });
  } catch (err: unknown) {
    console.error("[cashflows] getCashFlowSummary error:", err);
    return { error: "SUMMARY_FAILED" };
  }
}
// -- getTemplates -------------------------------------------------------

export async function getTemplates(): Promise<CashFlowTemplate[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: cashflowTemplates.id, tenantId: cashflowTemplates.tenantId,
        name: cashflowTemplates.name, cashflowType: cashflowTemplates.cashflowType,
        categoryId: cashflowTemplates.categoryId, amount: cashflowTemplates.amount,
        description: cashflowTemplates.description, partnerId: cashflowTemplates.partnerId,
        frequency: cashflowTemplates.frequency, dayOfMonth: cashflowTemplates.dayOfMonth,
        startDate: cashflowTemplates.startDate, endDate: cashflowTemplates.endDate,
        nextDate: cashflowTemplates.nextDate, isActive: cashflowTemplates.isActive,
        autoGenerate: cashflowTemplates.autoGenerate,
        lastGenerated: cashflowTemplates.lastGenerated,
        createdAt: cashflowTemplates.createdAt, updatedAt: cashflowTemplates.updatedAt,
        categoryName: cashflowCategories.name, partnerName: partners.name,
      })
      .from(cashflowTemplates)
      .leftJoin(cashflowCategories, eq(cashflowTemplates.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflowTemplates.partnerId, partners.id))
      .where(eq(cashflowTemplates.tenantId, tenantId))
      .orderBy(asc(cashflowTemplates.name));
    return rows.map((row) =>
      mapTemplateRow(row, { categoryName: row.categoryName, partnerName: row.partnerName })
    );
  });
}

// -- getTemplate --------------------------------------------------------

export async function getTemplate(id: string): Promise<CashFlowTemplate | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: cashflowTemplates.id, tenantId: cashflowTemplates.tenantId,
        name: cashflowTemplates.name, cashflowType: cashflowTemplates.cashflowType,
        categoryId: cashflowTemplates.categoryId, amount: cashflowTemplates.amount,
        description: cashflowTemplates.description, partnerId: cashflowTemplates.partnerId,
        frequency: cashflowTemplates.frequency, dayOfMonth: cashflowTemplates.dayOfMonth,
        startDate: cashflowTemplates.startDate, endDate: cashflowTemplates.endDate,
        nextDate: cashflowTemplates.nextDate, isActive: cashflowTemplates.isActive,
        autoGenerate: cashflowTemplates.autoGenerate,
        lastGenerated: cashflowTemplates.lastGenerated,
        createdAt: cashflowTemplates.createdAt, updatedAt: cashflowTemplates.updatedAt,
        categoryName: cashflowCategories.name, partnerName: partners.name,
      })
      .from(cashflowTemplates)
      .leftJoin(cashflowCategories, eq(cashflowTemplates.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflowTemplates.partnerId, partners.id))
      .where(and(eq(cashflowTemplates.id, id), eq(cashflowTemplates.tenantId, tenantId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return mapTemplateRow(row, { categoryName: row.categoryName, partnerName: row.partnerName });
  });
}

// -- createTemplate -----------------------------------------------------

export async function createTemplate(
  data: CreateTemplateInput
): Promise<CashFlowTemplate | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const inserted = await db
        .insert(cashflowTemplates)
        .values({
          tenantId,
          name: data.name, cashflowType: data.cashflowType,
          categoryId: data.categoryId ?? null,
          amount: data.amount,
          description: data.description ?? null,
          partnerId: data.partnerId ?? null,
          frequency: data.frequency,
          dayOfMonth: data.dayOfMonth ?? null,
          startDate: data.startDate,
          endDate: data.endDate ?? null,
          nextDate: data.nextDate,
          isActive: true,
          autoGenerate: data.autoGenerate ?? false,
        })
        .returning();
      const row = inserted[0];
      if (!row) return { error: "INSERT_FAILED" };
      return mapTemplateRow(row);
    });
  } catch (err: unknown) {
    console.error("[cashflows] createTemplate error:", err);
    return { error: "CREATE_TEMPLATE_FAILED" };
  }
}

// -- updateTemplate -----------------------------------------------------

export async function updateTemplate(
  id: string,
  data: UpdateTemplateInput
): Promise<CashFlowTemplate | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const existing = await db
        .select({ id: cashflowTemplates.id })
        .from(cashflowTemplates)
        .where(and(eq(cashflowTemplates.id, id), eq(cashflowTemplates.tenantId, tenantId)))
        .limit(1);
      if (!existing[0]) return { error: "NOT_FOUND" };
      const updated = await db
        .update(cashflowTemplates)
        .set({
          ...(data.name        !== undefined && { name:        data.name }),
          ...(data.categoryId  !== undefined && { categoryId:  data.categoryId }),
          ...(data.amount      !== undefined && { amount:      data.amount }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.partnerId   !== undefined && { partnerId:   data.partnerId }),
          ...(data.frequency   !== undefined && { frequency:   data.frequency }),
          ...(data.dayOfMonth  !== undefined && { dayOfMonth:  data.dayOfMonth }),
          ...(data.endDate     !== undefined && { endDate:     data.endDate }),
          ...(data.nextDate    !== undefined && { nextDate:    data.nextDate }),
          ...(data.isActive    !== undefined && { isActive:    data.isActive }),
          ...(data.autoGenerate !== undefined && { autoGenerate: data.autoGenerate }),
          updatedAt: sql`now()`,
        })
        .where(and(eq(cashflowTemplates.id, id), eq(cashflowTemplates.tenantId, tenantId)))
        .returning();
      const row = updated[0];
      if (!row) return { error: "UPDATE_FAILED" };
      return mapTemplateRow(row);
    });
  } catch (err: unknown) {
    console.error("[cashflows] updateTemplate error:", err);
    return { error: "UPDATE_TEMPLATE_FAILED" };
  }
}

// -- deleteTemplate (soft) ----------------------------------------------

export async function deleteTemplate(
  id: string
): Promise<{ success: true } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const existing = await db
        .select({ id: cashflowTemplates.id })
        .from(cashflowTemplates)
        .where(and(eq(cashflowTemplates.id, id), eq(cashflowTemplates.tenantId, tenantId)))
        .limit(1);
      if (!existing[0]) return { error: "NOT_FOUND" };
      await db
        .update(cashflowTemplates)
        .set({ isActive: false, updatedAt: sql`now()` })
        .where(and(eq(cashflowTemplates.id, id), eq(cashflowTemplates.tenantId, tenantId)));
      return { success: true };
    });
  } catch (err: unknown) {
    console.error("[cashflows] deleteTemplate error:", err);
    return { error: "DELETE_TEMPLATE_FAILED" };
  }
}
// -- Generated CF item type ---------------------------------------------

export interface GeneratedCfItem {
  id: string;
  code: string;
  date: string;
  amount: string;
  cashflowType: string;
  templateName: string;
}

// -- Pending CF item type (preview) -------------------------------------

export interface PendingCfItem {
  templateId: string;
  templateName: string;
  date: string;
  amount: string;
  cashflowType: string;
  categoryId: string | null;
  autoGenerate: boolean;
}

// -- generateFromTemplates (bulk) ---------------------------------------

export async function generateFromTemplates(): Promise<
  { generated: number; items: GeneratedCfItem[] } | { error: string }
> {
  try {
    return await withTenant(async (tenantId) => {
      const today = new Date().toISOString().slice(0, 10);
      const templates = await db
        .select()
        .from(cashflowTemplates)
        .where(and(
          eq(cashflowTemplates.tenantId, tenantId),
          eq(cashflowTemplates.isActive, true),
          eq(cashflowTemplates.autoGenerate, false),
        ));

      const items: GeneratedCfItem[] = [];
      for (const template of templates) {
        let nextDate = template.nextDate;
        while (nextDate <= today) {
          if (template.endDate && nextDate > template.endDate) break;
          const code = await getNextNumber(tenantId, "cashflow");
          const inserted = await db.insert(cashflows).values({
            tenantId, code,
            cashflowType: template.cashflowType,
            categoryId:   template.categoryId  ?? null,
            amount:       template.amount,
            currency:     "CZK",
            date:         nextDate,
            status:       "planned",
            partnerId:    template.partnerId   ?? null,
            description:  template.description ?? null,
            isCash:       false,
            templateId:   template.id,
            isRecurring:  true,
          }).returning();
          if (inserted[0]) {
            items.push({
              id: inserted[0].id,
              code: inserted[0].code ?? "",
              date: nextDate,
              amount: template.amount,
              cashflowType: template.cashflowType,
              templateName: template.name,
            });
          }
          nextDate = advanceDate(nextDate, template.frequency);
        }
        await db
          .update(cashflowTemplates)
          .set({ nextDate, lastGenerated: today, updatedAt: sql`now()` })
          .where(and(eq(cashflowTemplates.id, template.id), eq(cashflowTemplates.tenantId, tenantId)));
      }
      return { generated: items.length, items };
    });
  } catch (err: unknown) {
    console.error("[cashflows] generateFromTemplates error:", err);
    return { error: "GENERATE_FAILED" };
  }
}

// -- generateFromTemplate (per-template) --------------------------------

export async function generateFromTemplate(
  templateId: string
): Promise<{ generated: GeneratedCfItem[] } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const rows = await db
        .select()
        .from(cashflowTemplates)
        .where(and(
          eq(cashflowTemplates.id, templateId),
          eq(cashflowTemplates.tenantId, tenantId)
        ))
        .limit(1);

      if (!rows[0]) return { error: "TEMPLATE_NOT_FOUND" };
      if (!rows[0].isActive) return { error: "TEMPLATE_INACTIVE" };

      const tpl = rows[0];
      const today = new Date().toISOString().slice(0, 10);
      const generated: GeneratedCfItem[] = [];
      let nextDate = tpl.nextDate;

      while (nextDate <= today) {
        if (tpl.endDate && nextDate > tpl.endDate) break;
        const code = await getNextNumber(tenantId, "cashflow");
        const inserted = await db.insert(cashflows).values({
          tenantId, code,
          cashflowType: tpl.cashflowType,
          categoryId:   tpl.categoryId ?? null,
          amount:       tpl.amount,
          currency:     "CZK",
          date:         nextDate,
          status:       "planned",
          partnerId:    tpl.partnerId ?? null,
          description:  tpl.description ?? null,
          isCash:       false,
          templateId:   tpl.id,
          isRecurring:  true,
        }).returning();

        if (inserted[0]) {
          generated.push({
            id: inserted[0].id,
            code: inserted[0].code ?? "",
            date: nextDate,
            amount: tpl.amount,
            cashflowType: tpl.cashflowType,
            templateName: tpl.name,
          });
        }
        nextDate = advanceDate(nextDate, tpl.frequency);
      }

      await db.update(cashflowTemplates).set({
        nextDate,
        lastGenerated: today,
        updatedAt: sql`now()`,
      }).where(and(
        eq(cashflowTemplates.id, templateId),
        eq(cashflowTemplates.tenantId, tenantId)
      ));

      return { generated };
    });
  } catch (err: unknown) {
    console.error("[cashflows] generateFromTemplate error:", err);
    return { error: "GENERATE_FAILED" };
  }
}

// -- previewGeneration (dry-run) ----------------------------------------

export async function previewGeneration(
  templateId?: string
): Promise<PendingCfItem[]> {
  return withTenant(async (tenantId) => {
    const whereClause = templateId
      ? and(eq(cashflowTemplates.id, templateId), eq(cashflowTemplates.tenantId, tenantId), eq(cashflowTemplates.isActive, true))
      : and(eq(cashflowTemplates.tenantId, tenantId), eq(cashflowTemplates.isActive, true));

    const templates = await db.select().from(cashflowTemplates).where(whereClause);
    const today = new Date().toISOString().slice(0, 10);
    const pending: PendingCfItem[] = [];

    for (const tpl of templates) {
      let nextDate = tpl.nextDate;
      while (nextDate <= today) {
        if (tpl.endDate && nextDate > tpl.endDate) break;
        pending.push({
          templateId: tpl.id,
          templateName: tpl.name,
          date: nextDate,
          amount: tpl.amount,
          cashflowType: tpl.cashflowType,
          categoryId: tpl.categoryId,
          autoGenerate: tpl.autoGenerate ?? false,
        });
        nextDate = advanceDate(nextDate, tpl.frequency);
      }
    }

    return pending;
  });
}

// -- getGeneratedCashFlows (from a template) ----------------------------

export async function getGeneratedCashFlows(
  templateId: string
): Promise<CashFlow[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: cashflows.id, tenantId: cashflows.tenantId, code: cashflows.code,
        cashflowType: cashflows.cashflowType, categoryId: cashflows.categoryId,
        amount: cashflows.amount, currency: cashflows.currency, date: cashflows.date,
        dueDate: cashflows.dueDate, paidDate: cashflows.paidDate, status: cashflows.status,
        partnerId: cashflows.partnerId, orderId: cashflows.orderId,
        stockIssueId: cashflows.stockIssueId, shopId: cashflows.shopId,
        description: cashflows.description, notes: cashflows.notes,
        isCash: cashflows.isCash, cashDeskId: cashflows.cashDeskId,
        templateId: cashflows.templateId, isRecurring: cashflows.isRecurring,
        createdBy: cashflows.createdBy,
        createdAt: cashflows.createdAt, updatedAt: cashflows.updatedAt,
        categoryName: cashflowCategories.name,
        partnerName: partners.name,
        cashDeskName: cashDesks.name,
      })
      .from(cashflows)
      .leftJoin(cashflowCategories, eq(cashflows.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflows.partnerId, partners.id))
      .leftJoin(cashDesks, eq(cashflows.cashDeskId, cashDesks.id))
      .where(and(
        eq(cashflows.tenantId, tenantId),
        eq(cashflows.templateId, templateId)
      ))
      .orderBy(desc(cashflows.date));

    return rows.map((row) =>
      mapCashFlowRow(row, { categoryName: row.categoryName, partnerName: row.partnerName, cashDeskName: row.cashDeskName })
    );
  });
}

// -- createCashFlowFromOrder --------------------------------------------

export async function createCashFlowFromOrder(
  orderId: string
): Promise<CashFlow | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const orderRows = await db
        .select({
          id: orders.id, tenantId: orders.tenantId,
          orderNumber: orders.orderNumber, partnerId: orders.partnerId,
          totalInclVat: orders.totalInclVat, currency: orders.currency,
          orderDate: orders.orderDate, cashflowId: orders.cashflowId,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
        .limit(1);
      const order = orderRows[0];
      if (!order) return { error: "ORDER_NOT_FOUND" };
      if (order.cashflowId) return { error: "ORDER_CASHFLOW_EXISTS" };
      const code = await getNextNumber(tenantId, "cashflow");
      const inserted = await db
        .insert(cashflows)
        .values({
          tenantId, code,
          cashflowType: "income",
          amount:       order.totalInclVat ?? "0",
          currency:     order.currency    ?? "CZK",
          date:         order.orderDate,
          status:       "pending",
          partnerId:    order.partnerId   ?? null,
          orderId:      order.id,
          description:  "Objednavka " + order.orderNumber,
          isCash:       false,
        })
        .returning();
      const cfRow = inserted[0];
      if (!cfRow) return { error: "INSERT_FAILED" };
      await db
        .update(orders)
        .set({ cashflowId: cfRow.id, updatedAt: sql`now()` })
        .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)));
      return mapCashFlowRow(cfRow);
    });
  } catch (err: unknown) {
    console.error("[cashflows] createCashFlowFromOrder error:", err);
    return { error: "CREATE_FROM_ORDER_FAILED" };
  }
}

// -- CF defaults from shop settings (warehouse → shop → settings) ----------

/** Internal helper: load CF category/status defaults from warehouse's shop settings. */
async function loadCfDefaultsFromWarehouse(
  warehouseId: string
): Promise<{ categoryId: string | null; status: string }> {
  const whRows = await db
    .select({ shopId: warehouses.shopId })
    .from(warehouses)
    .where(eq(warehouses.id, warehouseId))
    .limit(1);
  const shopId = whRows[0]?.shopId;
  if (!shopId) return { categoryId: null, status: "pending" };

  const shopRows = await db
    .select({ settings: shops.settings })
    .from(shops)
    .where(eq(shops.id, shopId))
    .limit(1);
  const settings = (shopRows[0]?.settings ?? {}) as Record<string, unknown>;

  return {
    categoryId: (settings.auto_cf_category_id as string | undefined) ?? null,
    status: (settings.auto_cf_status as string | undefined) ?? "pending",
  };
}

/** Public action: get CF defaults for a given stock issue (receipt).
 *  Used by CashFlowDetail form when a receipt is selected. */
export async function getReceiptCfDefaults(
  stockIssueId: string
): Promise<{ categoryId: string | null; status: string } | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ warehouseId: stockIssues.warehouseId })
      .from(stockIssues)
      .where(and(eq(stockIssues.id, stockIssueId), eq(stockIssues.tenantId, tenantId)))
      .limit(1);
    const issue = rows[0];
    if (!issue) return null;
    return loadCfDefaultsFromWarehouse(issue.warehouseId);
  });
}

// -- createCashFlowFromReceipt -------------------------------------------

export async function createCashFlowFromReceipt(
  stockIssueId: string
): Promise<CashFlow | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const rows = await db
        .select({
          id: stockIssues.id,
          tenantId: stockIssues.tenantId,
          code: stockIssues.code,
          movementType: stockIssues.movementType,
          status: stockIssues.status,
          partnerId: stockIssues.partnerId,
          totalCost: stockIssues.totalCost,
          date: stockIssues.date,
          cashflowId: stockIssues.cashflowId,
          warehouseId: stockIssues.warehouseId,
        })
        .from(stockIssues)
        .where(
          and(eq(stockIssues.id, stockIssueId), eq(stockIssues.tenantId, tenantId))
        )
        .limit(1);
      const issue = rows[0];
      if (!issue) return { error: "RECEIPT_NOT_FOUND" };
      if (issue.movementType !== "receipt") return { error: "NOT_A_RECEIPT" };
      if (issue.status !== "confirmed") return { error: "RECEIPT_NOT_CONFIRMED" };
      if (issue.cashflowId) return { error: "RECEIPT_CASHFLOW_EXISTS" };

      // Look up shop settings via warehouse → shop
      const defaults = await loadCfDefaultsFromWarehouse(issue.warehouseId);

      const code = await getNextNumber(tenantId, "cashflow");
      const inserted = await db
        .insert(cashflows)
        .values({
          tenantId,
          code,
          cashflowType: "expense",
          categoryId: defaults.categoryId,
          amount: issue.totalCost ?? "0",
          currency: "CZK",
          date: issue.date,
          status: defaults.status === "planned" ? "planned" : "pending",
          partnerId: issue.partnerId ?? null,
          stockIssueId: issue.id,
          description: issue.code,
          isCash: false,
        })
        .returning();
      const cfRow = inserted[0];
      if (!cfRow) return { error: "INSERT_FAILED" };

      await db
        .update(stockIssues)
        .set({ cashflowId: cfRow.id, updatedAt: sql`now()` })
        .where(
          and(eq(stockIssues.id, stockIssueId), eq(stockIssues.tenantId, tenantId))
        );

      return mapCashFlowRow(cfRow);
    });
  } catch (err: unknown) {
    console.error("[cashflows] createCashFlowFromReceipt error:", err);
    return { error: "CREATE_FROM_RECEIPT_FAILED" };
  }
}

// -- createCashFlowFromReceiptAuto (called by confirm hook) ---------------

/** Auto-generate CF from receipt. Like createCashFlowFromReceipt but accepts category + status. */
export async function createCashFlowFromReceiptAuto(
  stockIssueId: string,
  categoryId: string | null,
  status: string
): Promise<void> {
  try {
    await withTenant(async (tenantId) => {
      const rows = await db
        .select({
          id: stockIssues.id,
          code: stockIssues.code,
          partnerId: stockIssues.partnerId,
          totalCost: stockIssues.totalCost,
          date: stockIssues.date,
          cashflowId: stockIssues.cashflowId,
        })
        .from(stockIssues)
        .where(and(eq(stockIssues.id, stockIssueId), eq(stockIssues.tenantId, tenantId)))
        .limit(1);
      const issue = rows[0];
      if (!issue || issue.cashflowId) return; // already has CF or not found

      const code = await getNextNumber(tenantId, "cashflow");
      const inserted = await db
        .insert(cashflows)
        .values({
          tenantId,
          code,
          cashflowType: "expense",
          categoryId: categoryId ?? null,
          amount: issue.totalCost ?? "0",
          currency: "CZK",
          date: issue.date,
          status: status === "planned" ? "planned" : "pending",
          partnerId: issue.partnerId ?? null,
          stockIssueId: issue.id,
          description: issue.code,
          isCash: false,
        })
        .returning();
      const cfRow = inserted[0];
      if (!cfRow) return;

      await db
        .update(stockIssues)
        .set({ cashflowId: cfRow.id, updatedAt: sql`now()` })
        .where(and(eq(stockIssues.id, stockIssueId), eq(stockIssues.tenantId, tenantId)));
    });
  } catch (err: unknown) {
    console.error("[cashflows] createCashFlowFromReceiptAuto error:", err);
  }
}

// -- getReceiptOptionsForCashFlow ----------------------------------------

export interface ReceiptOption {
  value: string;
  label: string;
  amount: string;
  partnerId: string | null;
  partnerName: string | null;
  date: string;
}

/** Confirmed receipts without an existing CF link. */
export async function getReceiptOptionsForCashFlow(): Promise<ReceiptOption[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: stockIssues.id,
        code: stockIssues.code,
        totalCost: stockIssues.totalCost,
        partnerId: stockIssues.partnerId,
        partnerName: partners.name,
        date: stockIssues.date,
      })
      .from(stockIssues)
      .leftJoin(partners, eq(stockIssues.partnerId, partners.id))
      .where(
        and(
          eq(stockIssues.tenantId, tenantId),
          eq(stockIssues.movementType, "receipt"),
          eq(stockIssues.status, "confirmed"),
          sql`${stockIssues.cashflowId} IS NULL`
        )
      )
      .orderBy(desc(stockIssues.date));
    return rows.map((r) => ({
      value: r.id,
      label: r.code,
      amount: r.totalCost ?? "0",
      partnerId: r.partnerId,
      partnerName: r.partnerName ?? null,
      date: r.date,
    }));
  });
}

// -- getPartnerOptions --------------------------------------------------

export async function getPartnerOptions(): Promise<SelectOption[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ value: partners.id, label: partners.name })
      .from(partners)
      .where(and(eq(partners.tenantId, tenantId), eq(partners.isActive, true)))
      .orderBy(asc(partners.name));
    return rows;
  });
}

// -- getCategoryOptions -------------------------------------------------

export async function getCategoryOptions(
  type?: CashFlowType
): Promise<CategoryOption[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        value:    cashflowCategories.id,
        label:    cashflowCategories.name,
        type:     cashflowCategories.cashflowType,
        parentId: cashflowCategories.parentId,
      })
      .from(cashflowCategories)
      .where(
        and(
          eq(cashflowCategories.tenantId, tenantId),
          eq(cashflowCategories.isActive, true),
          type ? eq(cashflowCategories.cashflowType, type) : undefined
        )
      )
      .orderBy(asc(cashflowCategories.sortOrder), asc(cashflowCategories.name));
    return rows.map((row) => ({
      value:    row.value,
      label:    row.label,
      type:     row.type as CashFlowType,
      parentId: row.parentId,
    }));
  });
}

// -- autoGenerateForAllTenants (cron) ------------------------------------

/**
 * Automatic CF generation from templates for ALL tenants.
 * Called from API cron route. Does NOT use withTenant() — iterates tenants directly.
 */
export async function autoGenerateForAllTenants(): Promise<{
  tenantsProcessed: number;
  totalGenerated: number;
}> {
  const tenantIds = await db
    .selectDistinct({ tenantId: cashflowTemplates.tenantId })
    .from(cashflowTemplates)
    .where(
      and(
        eq(cashflowTemplates.isActive, true),
        eq(cashflowTemplates.autoGenerate, true),
      )
    );

  const today = new Date().toISOString().slice(0, 10);
  let totalGenerated = 0;

  for (const { tenantId } of tenantIds) {
    const templates = await db
      .select()
      .from(cashflowTemplates)
      .where(
        and(
          eq(cashflowTemplates.tenantId, tenantId),
          eq(cashflowTemplates.isActive, true),
          eq(cashflowTemplates.autoGenerate, true),
        )
      );

    const generatedItems: Array<{
      templateName: string;
      code: string;
      date: string;
      amount: string;
    }> = [];

    for (const tpl of templates) {
      let nextDate = tpl.nextDate;
      while (nextDate <= today) {
        if (tpl.endDate && nextDate > tpl.endDate) break;

        const code = await getNextNumber(tenantId, "cashflow");
        await db.insert(cashflows).values({
          tenantId,
          code,
          cashflowType: tpl.cashflowType,
          categoryId: tpl.categoryId ?? null,
          amount: tpl.amount,
          currency: "CZK",
          date: nextDate,
          status: "planned",
          partnerId: tpl.partnerId ?? null,
          description: tpl.description ?? null,
          isCash: false,
          templateId: tpl.id,
          isRecurring: true,
        });

        generatedItems.push({
          templateName: tpl.name,
          code,
          date: nextDate,
          amount: tpl.amount,
        });

        nextDate = advanceDate(nextDate, tpl.frequency);
      }

      await db
        .update(cashflowTemplates)
        .set({ nextDate, lastGenerated: today, updatedAt: sql`now()` })
        .where(eq(cashflowTemplates.id, tpl.id));
    }

    if (generatedItems.length > 0) {
      await db
        .insert(cfAutoGenerationLog)
        .values({
          tenantId,
          runDate: today,
          generated: generatedItems.length,
          details: generatedItems,
        })
        .onConflictDoUpdate({
          target: [cfAutoGenerationLog.tenantId, cfAutoGenerationLog.runDate],
          set: {
            generated: sql`excluded.generated`,
            details: sql`excluded.details`,
          },
        });
    }

    totalGenerated += generatedItems.length;
  }

  return { tenantsProcessed: tenantIds.length, totalGenerated };
}

// -- getTodayAutoGenerationInfo (dashboard) ------------------------------

export interface AutoGenerationInfo {
  generated: number;
  details: Array<{ templateName: string; code: string; date: string; amount: string }>;
}

export async function getTodayAutoGenerationInfo(): Promise<AutoGenerationInfo | null> {
  return withTenant(async (tenantId) => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(cfAutoGenerationLog)
      .where(
        and(
          eq(cfAutoGenerationLog.tenantId, tenantId),
          eq(cfAutoGenerationLog.runDate, today),
        )
      )
      .limit(1);

    if (!rows[0] || rows[0].generated === 0) return null;

    return {
      generated: rows[0].generated,
      details: rows[0].details as AutoGenerationInfo["details"],
    };
  });
}