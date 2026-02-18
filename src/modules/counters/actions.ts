"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { counters } from "@/../drizzle/schema/system";
import { eq, and, sql } from "drizzle-orm";
import type { Counter, CounterUpdate } from "./types";

/**
 * Get all counters for the current tenant.
 */
export async function getCounters(): Promise<Counter[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(counters)
      .where(eq(counters.tenantId, tenantId))
      .orderBy(counters.entity);

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenantId,
      entity: row.entity,
      prefix: row.prefix,
      includeYear: row.includeYear ?? true,
      currentNumber: row.currentNumber ?? 0,
      padding: row.padding ?? 3,
      separator: row.separator ?? "-",
      resetYearly: row.resetYearly ?? true,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  });
}

/**
 * Update a counter's configuration.
 * Only allows updating: prefix, includeYear, padding, separator, resetYearly.
 * Entity and currentNumber cannot be changed through this action.
 */
export async function updateCounter(
  id: string,
  data: CounterUpdate
): Promise<Counter> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(counters)
      .set({
        prefix: data.prefix,
        includeYear: data.includeYear,
        padding: data.padding,
        separator: data.separator,
        resetYearly: data.resetYearly,
        updatedAt: sql`now()`,
      })
      .where(and(eq(counters.id, id), eq(counters.tenantId, tenantId)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error(`Counter ${id} not found`);
    }

    return {
      id: row.id,
      tenantId: row.tenantId,
      entity: row.entity,
      prefix: row.prefix,
      includeYear: row.includeYear ?? true,
      currentNumber: row.currentNumber ?? 0,
      padding: row.padding ?? 3,
      separator: row.separator ?? "-",
      resetYearly: row.resetYearly ?? true,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
}

