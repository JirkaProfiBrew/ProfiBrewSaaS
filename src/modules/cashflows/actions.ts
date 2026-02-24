"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { cashflows, cashflowCategories, cashflowTemplates, cashDesks } from "@/../drizzle/schema/cashflows";
import { partners } from "@/../drizzle/schema/partners";
import { orders } from "@/../drizzle/schema/orders";
import { eq, and, sql, desc, asc, ilike, or, gte, lte } from "drizzle-orm";
import { getNextNumber } from "@/lib/db/counters";
import type { CashFlow, CashFlowTemplate, CashFlowFilter, CashFlowSummary, CreateCashFlowInput, UpdateCashFlowInput, CreateTemplateInput, UpdateTemplateInput, CashFlowType, SelectOption, CategoryOption } from "./types";

// -- Helpers -----------------------------------------------------------------

function mapCashFlowRow(
  row: typeof cashflows.$inferSelect,
  joined?: { categoryName?: string | null; partnerName?: string | null }
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
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    categoryName: joined?.categoryName ?? null,
    partnerName: joined?.partnerName ?? null,
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
        isCash: cashflows.isCash, createdBy: cashflows.createdBy,
        createdAt: cashflows.createdAt, updatedAt: cashflows.updatedAt,
        categoryName: cashflowCategories.name,
        partnerName: partners.name,
      })
      .from(cashflows)
      .leftJoin(cashflowCategories, eq(cashflows.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflows.partnerId, partners.id))
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
      mapCashFlowRow(row, { categoryName: row.categoryName, partnerName: row.partnerName })
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
        isCash: cashflows.isCash, createdBy: cashflows.createdBy,
        createdAt: cashflows.createdAt, updatedAt: cashflows.updatedAt,
        categoryName: cashflowCategories.name,
        partnerName: partners.name,
      })
      .from(cashflows)
      .leftJoin(cashflowCategories, eq(cashflows.categoryId, cashflowCategories.id))
      .leftJoin(partners, eq(cashflows.partnerId, partners.id))
      .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return mapCashFlowRow(row, { categoryName: row.categoryName, partnerName: row.partnerName });
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
        .select({ id: cashflows.id, status: cashflows.status })
        .from(cashflows)
        .where(and(eq(cashflows.id, id), eq(cashflows.tenantId, tenantId)))
        .limit(1);
      const record = existing[0];
      if (!record) return { error: "NOT_FOUND" };
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
// -- generateFromTemplates ----------------------------------------------

export async function generateFromTemplates(): Promise<
  { generated: number } | { error: string }
> {
  try {
    return await withTenant(async (tenantId) => {
      const today = new Date().toISOString().slice(0, 10);
      const templates = await db
        .select()
        .from(cashflowTemplates)
        .where(and(eq(cashflowTemplates.tenantId, tenantId), eq(cashflowTemplates.isActive, true)));

      let generated = 0;
      for (const template of templates) {
        let nextDate = template.nextDate;
        while (nextDate <= today) {
          if (template.endDate && nextDate > template.endDate) break;
          const code = await getNextNumber(tenantId, "cashflow");
          await db.insert(cashflows).values({
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
          });
          generated += 1;
          nextDate = advanceDate(nextDate, template.frequency);
        }
        await db
          .update(cashflowTemplates)
          .set({ nextDate, lastGenerated: today, updatedAt: sql`now()` })
          .where(and(eq(cashflowTemplates.id, template.id), eq(cashflowTemplates.tenantId, tenantId)));
      }
      return { generated };
    });
  } catch (err: unknown) {
    console.error("[cashflows] generateFromTemplates error:", err);
    return { error: "GENERATE_FAILED" };
  }
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