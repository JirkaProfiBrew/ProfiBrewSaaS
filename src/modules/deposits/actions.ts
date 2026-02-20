"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { deposits } from "@/../drizzle/schema/deposits";
import { eq, and, sql } from "drizzle-orm";
import type { Deposit, CreateDepositInput, UpdateDepositInput } from "./types";

/**
 * Map a DB row to the Deposit interface.
 */
function toDeposit(row: typeof deposits.$inferSelect): Deposit {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    depositAmount: row.depositAmount,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Get all deposits for the current tenant, ordered by name.
 */
export async function getDeposits(): Promise<Deposit[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(deposits)
      .where(eq(deposits.tenantId, tenantId))
      .orderBy(deposits.name);

    return rows.map(toDeposit);
  });
}

/**
 * Create a new deposit for the current tenant.
 */
export async function createDeposit(
  data: CreateDepositInput
): Promise<Deposit | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      if (!data.name.trim()) {
        return { error: "NAME_REQUIRED" };
      }

      if (!data.depositAmount || isNaN(Number(data.depositAmount))) {
        return { error: "AMOUNT_REQUIRED" };
      }

      const rows = await db
        .insert(deposits)
        .values({
          tenantId,
          name: data.name.trim(),
          depositAmount: data.depositAmount,
        })
        .returning();

      const row = rows[0];
      if (!row) {
        return { error: "CREATE_FAILED" };
      }

      return toDeposit(row);
    } catch (err) {
      console.error("Failed to create deposit:", err);
      return { error: "CREATE_FAILED" };
    }
  });
}

/**
 * Update an existing deposit.
 */
export async function updateDeposit(
  id: string,
  data: UpdateDepositInput
): Promise<Deposit | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      if (data.name !== undefined && !data.name.trim()) {
        return { error: "NAME_REQUIRED" };
      }

      if (
        data.depositAmount !== undefined &&
        isNaN(Number(data.depositAmount))
      ) {
        return { error: "AMOUNT_REQUIRED" };
      }

      const setValues: Record<string, unknown> = {
        updatedAt: sql`now()`,
      };

      if (data.name !== undefined) {
        setValues.name = data.name.trim();
      }
      if (data.depositAmount !== undefined) {
        setValues.depositAmount = data.depositAmount;
      }
      if (data.isActive !== undefined) {
        setValues.isActive = data.isActive;
      }

      const rows = await db
        .update(deposits)
        .set(setValues)
        .where(and(eq(deposits.id, id), eq(deposits.tenantId, tenantId)))
        .returning();

      const row = rows[0];
      if (!row) {
        return { error: "NOT_FOUND" };
      }

      return toDeposit(row);
    } catch (err) {
      console.error("Failed to update deposit:", err);
      return { error: "UPDATE_FAILED" };
    }
  });
}

/**
 * Soft-delete a deposit (set isActive = false).
 */
export async function deleteDeposit(
  id: string
): Promise<{ success: true } | { error: string }> {
  return withTenant(async (tenantId) => {
    try {
      const rows = await db
        .update(deposits)
        .set({
          isActive: false,
          updatedAt: sql`now()`,
        })
        .where(and(eq(deposits.id, id), eq(deposits.tenantId, tenantId)))
        .returning();

      if (rows.length === 0) {
        return { error: "NOT_FOUND" };
      }

      return { success: true };
    } catch (err) {
      console.error("Failed to delete deposit:", err);
      return { error: "DELETE_FAILED" };
    }
  });
}
