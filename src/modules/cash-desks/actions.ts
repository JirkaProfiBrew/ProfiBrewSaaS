"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { cashDesks, cashflows, cashflowCategories } from "@/../drizzle/schema/cashflows";
import { shops } from "@/../drizzle/schema/shops";
import { eq, ne, and, sql, desc, asc } from "drizzle-orm";
import { getNextNumber } from "@/lib/db/counters";
import type {
  CashDesk,
  CreateCashDeskInput,
  UpdateCashDeskInput,
  CashDeskTransactionInput,
  CashDeskDailySummary,
  CashDeskBalanceBreakdown,
} from "./types";
import type { CashFlow } from "@/modules/cashflows/types";

// -- Helpers -----------------------------------------------------------------

function mapCashDeskRow(
  row: typeof cashDesks.$inferSelect,
  joined?: { shopName?: string | null }
): CashDesk {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    shopId: row.shopId,
    shopName: joined?.shopName ?? null,
    currentBalance: row.currentBalance ?? "0",
    isActive: row.isActive ?? true,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

function mapCashFlowRow(
  row: {
    id: string;
    tenantId: string;
    code: string | null;
    cashflowType: string;
    categoryId: string | null;
    amount: string;
    currency: string | null;
    date: string;
    dueDate: string | null;
    paidDate: string | null;
    status: string | null;
    partnerId: string | null;
    orderId: string | null;
    stockIssueId: string | null;
    shopId: string | null;
    description: string | null;
    notes: string | null;
    isCash: boolean | null;
    cashDeskId: string | null;
    createdBy: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  },
  joined?: { categoryName?: string | null }
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
    status: (row.status ?? "planned") as CashFlow["status"],
    partnerId: row.partnerId ?? null,
    orderId: row.orderId ?? null,
    stockIssueId: row.stockIssueId ?? null,
    shopId: row.shopId ?? null,
    description: row.description ?? null,
    notes: row.notes ?? null,
    isCash: row.isCash ?? false,
    cashDeskId: row.cashDeskId ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    categoryName: joined?.categoryName ?? null,
    partnerName: null,
    cashDeskName: null,
  };
}

// -- getCashDesks -----------------------------------------------------------

export async function getCashDesks(): Promise<CashDesk[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: cashDesks.id,
        tenantId: cashDesks.tenantId,
        name: cashDesks.name,
        shopId: cashDesks.shopId,
        currentBalance: cashDesks.currentBalance,
        isActive: cashDesks.isActive,
        createdAt: cashDesks.createdAt,
        updatedAt: cashDesks.updatedAt,
        shopName: shops.name,
      })
      .from(cashDesks)
      .leftJoin(shops, eq(cashDesks.shopId, shops.id))
      .where(eq(cashDesks.tenantId, tenantId))
      .orderBy(asc(cashDesks.name));

    return rows.map((row) =>
      mapCashDeskRow(row, { shopName: row.shopName })
    );
  });
}

// -- getCashDesk ------------------------------------------------------------

export async function getCashDesk(id: string): Promise<CashDesk | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: cashDesks.id,
        tenantId: cashDesks.tenantId,
        name: cashDesks.name,
        shopId: cashDesks.shopId,
        currentBalance: cashDesks.currentBalance,
        isActive: cashDesks.isActive,
        createdAt: cashDesks.createdAt,
        updatedAt: cashDesks.updatedAt,
        shopName: shops.name,
      })
      .from(cashDesks)
      .leftJoin(shops, eq(cashDesks.shopId, shops.id))
      .where(and(eq(cashDesks.id, id), eq(cashDesks.tenantId, tenantId)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapCashDeskRow(row, { shopName: row.shopName });
  });
}

// -- createCashDesk ---------------------------------------------------------

export async function createCashDesk(
  data: CreateCashDeskInput
): Promise<CashDesk | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const inserted = await db
        .insert(cashDesks)
        .values({
          tenantId,
          name: data.name,
          shopId: data.shopId,
          currentBalance: "0",
        })
        .returning();

      const row = inserted[0];
      if (!row) return { error: "INSERT_FAILED" };

      // Fetch shop name for the response
      const shopRows = await db
        .select({ name: shops.name })
        .from(shops)
        .where(eq(shops.id, row.shopId))
        .limit(1);

      return mapCashDeskRow(row, { shopName: shopRows[0]?.name ?? null });
    });
  } catch (err: unknown) {
    console.error("[cash-desks] createCashDesk error:", err);
    return { error: "CREATE_FAILED" };
  }
}

// -- updateCashDesk ---------------------------------------------------------

export async function updateCashDesk(
  id: string,
  data: UpdateCashDeskInput
): Promise<CashDesk | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const existing = await db
        .select({ id: cashDesks.id })
        .from(cashDesks)
        .where(and(eq(cashDesks.id, id), eq(cashDesks.tenantId, tenantId)))
        .limit(1);

      if (!existing[0]) return { error: "NOT_FOUND" };

      const updated = await db
        .update(cashDesks)
        .set({
          ...(data.name !== undefined && { name: data.name }),
          ...(data.shopId !== undefined && { shopId: data.shopId }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
          updatedAt: sql`now()`,
        })
        .where(and(eq(cashDesks.id, id), eq(cashDesks.tenantId, tenantId)))
        .returning();

      const row = updated[0];
      if (!row) return { error: "UPDATE_FAILED" };

      // Fetch shop name for the response
      const shopRows = await db
        .select({ name: shops.name })
        .from(shops)
        .where(eq(shops.id, row.shopId))
        .limit(1);

      return mapCashDeskRow(row, { shopName: shopRows[0]?.name ?? null });
    });
  } catch (err: unknown) {
    console.error("[cash-desks] updateCashDesk error:", err);
    return { error: "UPDATE_FAILED" };
  }
}

// -- deleteCashDesk ---------------------------------------------------------

export async function deleteCashDesk(
  id: string
): Promise<{ deleted: true } | { deactivated: true } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      // Load desk to check balance
      const rows = await db
        .select({
          id: cashDesks.id,
          currentBalance: cashDesks.currentBalance,
        })
        .from(cashDesks)
        .where(and(eq(cashDesks.id, id), eq(cashDesks.tenantId, tenantId)))
        .limit(1);

      const desk = rows[0];
      if (!desk) return { error: "NOT_FOUND" };

      // Check if any cashflow transactions exist for this cash desk
      const txRows = await db
        .select({ cnt: sql<number>`COUNT(*)::int` })
        .from(cashflows)
        .where(
          and(
            eq(cashflows.tenantId, tenantId),
            eq(cashflows.cashDeskId, id)
          )
        );

      const hasTransactions = (txRows[0]?.cnt ?? 0) > 0;

      if (hasTransactions) {
        // Deactivate — records exist
        await db
          .update(cashDesks)
          .set({ isActive: false, updatedAt: sql`now()` })
          .where(and(eq(cashDesks.id, id), eq(cashDesks.tenantId, tenantId)));
        return { deactivated: true };
      }

      // No linked records — hard delete
      await db
        .delete(cashDesks)
        .where(and(eq(cashDesks.id, id), eq(cashDesks.tenantId, tenantId)));
      return { deleted: true };
    });
  } catch (err: unknown) {
    console.error("[cash-desks] deleteCashDesk error:", err);
    return { error: "DELETE_FAILED" };
  }
}

// -- createCashDeskTransaction ----------------------------------------------

export async function createCashDeskTransaction(
  cashDeskId: string,
  data: CashDeskTransactionInput
): Promise<{ cashflowId: string } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const today = new Date().toISOString().slice(0, 10);

      // Generate cashflow code OUTSIDE the transaction (counter uses its own tx)
      const code = await getNextNumber(tenantId, "cashflow");

      const result = await db.transaction(async (tx) => {
        // 1. Load cash desk — verify exists, is active, get shopId
        const deskRows = await tx
          .select({
            id: cashDesks.id,
            shopId: cashDesks.shopId,
            isActive: cashDesks.isActive,
          })
          .from(cashDesks)
          .where(
            and(eq(cashDesks.id, cashDeskId), eq(cashDesks.tenantId, tenantId))
          )
          .limit(1);

        const desk = deskRows[0];
        if (!desk) return { error: "CASH_DESK_NOT_FOUND" } as const;
        if (!desk.isActive) return { error: "CASH_DESK_INACTIVE" } as const;

        // 2. Insert cashflow record
        const inserted = await tx
          .insert(cashflows)
          .values({
            tenantId,
            code,
            cashflowType: data.type,
            categoryId: data.categoryId ?? null,
            amount: data.amount,
            currency: "CZK",
            date: today,
            dueDate: null,
            paidDate: today,
            status: "paid",
            partnerId: null,
            orderId: null,
            stockIssueId: null,
            shopId: desk.shopId,
            description: data.description,
            notes: null,
            isCash: true,
            cashDeskId: cashDeskId,
          })
          .returning();

        const cfRow = inserted[0];
        if (!cfRow) return { error: "INSERT_CASHFLOW_FAILED" } as const;

        // 3. Update cash desk balance atomically
        const delta =
          data.type === "income" ? data.amount : `-${data.amount}`;

        await tx
          .update(cashDesks)
          .set({
            currentBalance: sql`COALESCE(current_balance, 0) + ${delta}::decimal`,
            updatedAt: sql`now()`,
          })
          .where(
            and(eq(cashDesks.id, cashDeskId), eq(cashDesks.tenantId, tenantId))
          );

        return { cashflowId: cfRow.id };
      });

      return result;
    });
  } catch (err: unknown) {
    console.error("[cash-desks] createCashDeskTransaction error:", err);
    return { error: "TRANSACTION_FAILED" };
  }
}

// -- getCashDeskTransactions ------------------------------------------------

export async function getCashDeskTransactions(
  cashDeskId: string,
  date?: string
): Promise<CashFlow[]> {
  return withTenant(async (tenantId) => {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    const rows = await db
      .select({
        id: cashflows.id,
        tenantId: cashflows.tenantId,
        code: cashflows.code,
        cashflowType: cashflows.cashflowType,
        categoryId: cashflows.categoryId,
        amount: cashflows.amount,
        currency: cashflows.currency,
        date: cashflows.date,
        dueDate: cashflows.dueDate,
        paidDate: cashflows.paidDate,
        status: cashflows.status,
        partnerId: cashflows.partnerId,
        orderId: cashflows.orderId,
        stockIssueId: cashflows.stockIssueId,
        shopId: cashflows.shopId,
        description: cashflows.description,
        notes: cashflows.notes,
        isCash: cashflows.isCash,
        cashDeskId: cashflows.cashDeskId,
        createdBy: cashflows.createdBy,
        createdAt: cashflows.createdAt,
        updatedAt: cashflows.updatedAt,
        categoryName: cashflowCategories.name,
      })
      .from(cashflows)
      .leftJoin(
        cashflowCategories,
        eq(cashflows.categoryId, cashflowCategories.id)
      )
      .where(
        and(
          eq(cashflows.tenantId, tenantId),
          eq(cashflows.cashDeskId, cashDeskId),
          eq(cashflows.date, targetDate),
          ne(cashflows.status, "cancelled")
        )
      )
      .orderBy(desc(cashflows.createdAt));

    return rows.map((row) =>
      mapCashFlowRow(row, { categoryName: row.categoryName })
    );
  });
}

// -- getCashDeskDailySummary ------------------------------------------------

export async function getCashDeskDailySummary(
  cashDeskId: string,
  date?: string
): Promise<CashDeskDailySummary | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      const targetDate = date ?? new Date().toISOString().slice(0, 10);

      const rows = await db
        .select({
          cashflowType: cashflows.cashflowType,
          totalAmount: sql<string>`COALESCE(SUM(${cashflows.amount}), 0)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(cashflows)
        .where(
          and(
            eq(cashflows.tenantId, tenantId),
            eq(cashflows.cashDeskId, cashDeskId),
            eq(cashflows.date, targetDate),
            ne(cashflows.status, "cancelled")
          )
        )
        .groupBy(cashflows.cashflowType);

      let income = 0;
      let expense = 0;
      let transactionCount = 0;

      for (const row of rows) {
        const amount = parseFloat(row.totalAmount ?? "0");
        const count = row.count ?? 0;
        transactionCount += count;

        if (row.cashflowType === "income") {
          income += amount;
        } else {
          expense += amount;
        }
      }

      return {
        income: income.toFixed(2),
        expense: expense.toFixed(2),
        net: (income - expense).toFixed(2),
        transactionCount,
      };
    });
  } catch (err: unknown) {
    console.error("[cash-desks] getCashDeskDailySummary error:", err);
    return { error: "SUMMARY_FAILED" };
  }
}

// -- getCashDeskBalanceBreakdown -----------------------------------------------

export async function getCashDeskBalanceBreakdown(
  cashDeskId: string
): Promise<CashDeskBalanceBreakdown | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      // Fetch current balance from cash desk
      const deskRow = await db
        .select({ currentBalance: cashDesks.currentBalance })
        .from(cashDesks)
        .where(and(eq(cashDesks.id, cashDeskId), eq(cashDesks.tenantId, tenantId)))
        .limit(1);

      const currentBalance = parseFloat(deskRow[0]?.currentBalance ?? "0");

      // Sum non-cancelled transactions linked to this desk
      const rows = await db
        .select({
          cashflowType: cashflows.cashflowType,
          totalAmount: sql<string>`COALESCE(SUM(${cashflows.amount}), 0)::text`,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(cashflows)
        .where(
          and(
            eq(cashflows.tenantId, tenantId),
            eq(cashflows.cashDeskId, cashDeskId),
            ne(cashflows.status, "cancelled")
          )
        )
        .groupBy(cashflows.cashflowType);

      let totalIncome = 0;
      let totalExpense = 0;
      let transactionCount = 0;

      for (const row of rows) {
        const amount = parseFloat(row.totalAmount ?? "0");
        transactionCount += row.count ?? 0;
        if (row.cashflowType === "income") {
          totalIncome += amount;
        } else {
          totalExpense += amount;
        }
      }

      // Opening balance = currentBalance - (income - expense)
      const openingBalance = currentBalance - (totalIncome - totalExpense);

      return {
        totalIncome: totalIncome.toFixed(2),
        totalExpense: totalExpense.toFixed(2),
        transactionCount,
        openingBalance: openingBalance.toFixed(2),
      };
    });
  } catch (err: unknown) {
    console.error("[cash-desks] getCashDeskBalanceBreakdown error:", err);
    return { error: "BREAKDOWN_FAILED" };
  }
}

// -- updateCashDeskTransaction ------------------------------------------------

export async function updateCashDeskTransaction(
  cashDeskId: string,
  cashflowId: string,
  data: { amount?: string; description?: string; categoryId?: string | null }
): Promise<{ success: true } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      // Load existing cashflow
      const existing = await db
        .select({
          id: cashflows.id,
          amount: cashflows.amount,
          cashflowType: cashflows.cashflowType,
          isCash: cashflows.isCash,
        })
        .from(cashflows)
        .where(and(eq(cashflows.id, cashflowId), eq(cashflows.tenantId, tenantId)))
        .limit(1);

      const record = existing[0];
      if (!record) return { error: "NOT_FOUND" };
      if (!record.isCash) return { error: "NOT_CASH_TRANSACTION" };

      const oldAmount = Number(record.amount);
      const newAmount = data.amount !== undefined ? Number(data.amount) : oldAmount;
      const amountDelta = newAmount - oldAmount;

      await db.transaction(async (tx) => {
        // Update cashflow record
        await tx
          .update(cashflows)
          .set({
            ...(data.amount !== undefined && { amount: data.amount }),
            ...(data.description !== undefined && { description: data.description }),
            ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
            updatedAt: sql`now()`,
          })
          .where(and(eq(cashflows.id, cashflowId), eq(cashflows.tenantId, tenantId)));

        // Adjust cash desk balance if amount changed
        if (Math.abs(amountDelta) > 0.001) {
          // Income adds to balance, expense subtracts
          const balanceDelta = record.cashflowType === "income"
            ? amountDelta
            : -amountDelta;

          await tx
            .update(cashDesks)
            .set({
              currentBalance: sql`COALESCE(current_balance, 0) + ${String(balanceDelta)}::decimal`,
              updatedAt: sql`now()`,
            })
            .where(and(eq(cashDesks.id, cashDeskId), eq(cashDesks.tenantId, tenantId)));
        }
      });

      return { success: true };
    });
  } catch (err: unknown) {
    console.error("[cash-desks] updateCashDeskTransaction error:", err);
    return { error: "UPDATE_FAILED" };
  }
}

// -- deleteCashDeskTransaction ------------------------------------------------

export async function deleteCashDeskTransaction(
  cashDeskId: string,
  cashflowId: string,
  deleteCf: boolean = true
): Promise<{ success: true } | { error: string }> {
  try {
    return await withTenant(async (tenantId) => {
      // Load existing cashflow
      const existing = await db
        .select({
          id: cashflows.id,
          amount: cashflows.amount,
          cashflowType: cashflows.cashflowType,
          isCash: cashflows.isCash,
        })
        .from(cashflows)
        .where(and(eq(cashflows.id, cashflowId), eq(cashflows.tenantId, tenantId)))
        .limit(1);

      const record = existing[0];
      if (!record) return { error: "NOT_FOUND" };
      if (!record.isCash) return { error: "NOT_CASH_TRANSACTION" };

      // Reverse balance: income → subtract, expense → add
      const reversal = record.cashflowType === "income"
        ? `-${record.amount}`
        : record.amount;

      await db.transaction(async (tx) => {
        if (deleteCf) {
          // Hard delete cashflow record
          await tx
            .delete(cashflows)
            .where(and(eq(cashflows.id, cashflowId), eq(cashflows.tenantId, tenantId)));
        } else {
          // Unlink from cash desk — keep CF record
          await tx
            .update(cashflows)
            .set({ cashDeskId: null, isCash: false, updatedAt: sql`now()` })
            .where(and(eq(cashflows.id, cashflowId), eq(cashflows.tenantId, tenantId)));
        }

        // Reverse cash desk balance
        await tx
          .update(cashDesks)
          .set({
            currentBalance: sql`COALESCE(current_balance, 0) + ${reversal}::decimal`,
            updatedAt: sql`now()`,
          })
          .where(and(eq(cashDesks.id, cashDeskId), eq(cashDesks.tenantId, tenantId)));
      });

      return { success: true };
    });
  } catch (err: unknown) {
    console.error("[cash-desks] deleteCashDeskTransaction error:", err);
    return { error: "DELETE_FAILED" };
  }
}

// -- getShopOptions ---------------------------------------------------------

export async function getShopOptions(): Promise<
  { value: string; label: string }[]
> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({ value: shops.id, label: shops.name })
      .from(shops)
      .where(and(eq(shops.tenantId, tenantId), eq(shops.isActive, true)))
      .orderBy(asc(shops.name));

    return rows;
  });
}
