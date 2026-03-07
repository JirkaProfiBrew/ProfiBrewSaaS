"use server";

import { db } from "@/lib/db";
import { cashflowCategoryTemplates } from "@/../drizzle/schema/billing";
import { eq, asc, sql } from "drizzle-orm";
import { withSuperadmin } from "@/lib/auth/superadmin";

export type CashflowTemplate = typeof cashflowCategoryTemplates.$inferSelect;

export async function listTemplates(): Promise<CashflowTemplate[]> {
  return withSuperadmin(async () => {
    const rows = await db
      .select()
      .from(cashflowCategoryTemplates)
      .orderBy(asc(cashflowCategoryTemplates.sortOrder));

    return rows;
  });
}

export async function createTemplate(data: {
  name: string;
  cashflowType: string;
  parentId?: string;
  sortOrder?: number;
}): Promise<CashflowTemplate> {
  return withSuperadmin(async () => {
    const [row] = await db
      .insert(cashflowCategoryTemplates)
      .values({
        name: data.name,
        cashflowType: data.cashflowType,
        parentId: data.parentId ?? null,
        sortOrder: data.sortOrder ?? 0,
      })
      .returning();

    if (!row) throw new Error("Failed to create template");
    return row;
  });
}

export async function updateTemplate(
  id: string,
  data: { name?: string; sortOrder?: number; isActive?: boolean }
): Promise<CashflowTemplate> {
  return withSuperadmin(async () => {
    const updateData: Record<string, unknown> = {
      updatedAt: sql`now()`,
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [row] = await db
      .update(cashflowCategoryTemplates)
      .set(updateData)
      .where(eq(cashflowCategoryTemplates.id, id))
      .returning();

    if (!row) throw new Error("Template not found");
    return row;
  });
}

export async function deleteTemplate(id: string): Promise<CashflowTemplate> {
  return withSuperadmin(async () => {
    const [row] = await db
      .update(cashflowCategoryTemplates)
      .set({
        isActive: false,
        updatedAt: sql`now()`,
      })
      .where(eq(cashflowCategoryTemplates.id, id))
      .returning();

    if (!row) throw new Error("Template not found");
    return row;
  });
}
