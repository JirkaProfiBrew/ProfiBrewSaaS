"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { cashflowCategories } from "@/../drizzle/schema/cashflows";
import { eq, and, sql, count } from "drizzle-orm";
import type {
  CashFlowCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "./types";

// ── Helpers ────────────────────────────────────────────────────

/** Map a Drizzle row to a CashFlowCategory type. */
function mapRow(
  row: typeof cashflowCategories.$inferSelect
): CashFlowCategory {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    parentId: row.parentId,
    cashflowType: row.cashflowType as "income" | "expense",
    isSystem: row.isSystem ?? false,
    sortOrder: row.sortOrder ?? 0,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
  };
}

// ── Actions ────────────────────────────────────────────────────

/**
 * List all categories for the current tenant,
 * ordered by cashflowType, sortOrder, name.
 */
export async function getCategories(): Promise<CashFlowCategory[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(cashflowCategories)
      .where(eq(cashflowCategories.tenantId, tenantId))
      .orderBy(
        cashflowCategories.cashflowType,
        cashflowCategories.sortOrder,
        cashflowCategories.name
      );

    return rows.map(mapRow);
  });
}

/**
 * Create a new (non-system) category.
 */
export async function createCategory(
  data: CreateCategoryInput
): Promise<CashFlowCategory | { error: string }> {
  return withTenant(async (tenantId) => {
    if (!data.name.trim()) {
      return { error: "NAME_REQUIRED" };
    }

    // If parentId is provided, validate it belongs to the same tenant and type
    if (data.parentId) {
      const parentRows = await db
        .select()
        .from(cashflowCategories)
        .where(
          and(
            eq(cashflowCategories.id, data.parentId),
            eq(cashflowCategories.tenantId, tenantId)
          )
        )
        .limit(1);

      const parent = parentRows[0];
      if (!parent) {
        return { error: "PARENT_NOT_FOUND" };
      }
      if (parent.cashflowType !== data.cashflowType) {
        return { error: "PARENT_TYPE_MISMATCH" };
      }
    }

    const rows = await db
      .insert(cashflowCategories)
      .values({
        tenantId,
        name: data.name.trim(),
        parentId: data.parentId,
        cashflowType: data.cashflowType,
        isSystem: false,
        sortOrder: 0,
        isActive: true,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      return { error: "CREATE_FAILED" };
    }

    return mapRow(row);
  });
}

/**
 * Update an existing category.
 * Rejects if the category is a system category (is_system = true).
 */
export async function updateCategory(
  id: string,
  data: UpdateCategoryInput
): Promise<CashFlowCategory | { error: string }> {
  return withTenant(async (tenantId) => {
    // Fetch existing category
    const existing = await db
      .select()
      .from(cashflowCategories)
      .where(
        and(
          eq(cashflowCategories.id, id),
          eq(cashflowCategories.tenantId, tenantId)
        )
      )
      .limit(1);

    const cat = existing[0];
    if (!cat) {
      return { error: "NOT_FOUND" };
    }

    if (cat.isSystem) {
      return { error: "SYSTEM_CATEGORY" };
    }

    if (data.name !== undefined && !data.name.trim()) {
      return { error: "NAME_REQUIRED" };
    }

    // Build the update set
    const updateSet: Record<string, unknown> = {};
    if (data.name !== undefined) updateSet.name = data.name.trim();
    if (data.parentId !== undefined) updateSet.parentId = data.parentId;
    if (data.sortOrder !== undefined) updateSet.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) updateSet.isActive = data.isActive;

    const rows = await db
      .update(cashflowCategories)
      .set(updateSet)
      .where(
        and(
          eq(cashflowCategories.id, id),
          eq(cashflowCategories.tenantId, tenantId)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) {
      return { error: "UPDATE_FAILED" };
    }

    return mapRow(row);
  });
}

/**
 * Delete a category.
 * Rejects if the category is a system category or has children.
 */
export async function deleteCategory(
  id: string
): Promise<{ success: true } | { error: string }> {
  return withTenant(async (tenantId) => {
    // Fetch existing category
    const existing = await db
      .select()
      .from(cashflowCategories)
      .where(
        and(
          eq(cashflowCategories.id, id),
          eq(cashflowCategories.tenantId, tenantId)
        )
      )
      .limit(1);

    const cat = existing[0];
    if (!cat) {
      return { error: "NOT_FOUND" };
    }

    if (cat.isSystem) {
      return { error: "SYSTEM_CATEGORY" };
    }

    // Check for children
    const childCountResult = await db
      .select({ value: count() })
      .from(cashflowCategories)
      .where(
        and(
          eq(cashflowCategories.parentId, id),
          eq(cashflowCategories.tenantId, tenantId)
        )
      );

    const childCount = childCountResult[0]?.value ?? 0;
    if (childCount > 0) {
      return { error: "HAS_CHILDREN" };
    }

    // Physical delete (categories are config data, not transactional)
    await db
      .delete(cashflowCategories)
      .where(
        and(
          eq(cashflowCategories.id, id),
          eq(cashflowCategories.tenantId, tenantId)
        )
      );

    return { success: true };
  });
}

// ── Seed Data ──────────────────────────────────────────────────

interface SeedCategory {
  name: string;
  sortOrder: number;
  children?: SeedCategory[];
}

const SEED_INCOME: SeedCategory[] = [
  {
    name: "Prodej piva",
    sortOrder: 1,
    children: [
      { name: "Prodej sudové", sortOrder: 1 },
      { name: "Prodej lahvové", sortOrder: 2 },
      { name: "Prodej taproom", sortOrder: 3 },
    ],
  },
  { name: "Zálohy přijaté", sortOrder: 2 },
  { name: "Ostatní příjmy", sortOrder: 3 },
];

const SEED_EXPENSE: SeedCategory[] = [
  {
    name: "Nákup surovin",
    sortOrder: 1,
    children: [
      { name: "Slad", sortOrder: 1 },
      { name: "Chmel", sortOrder: 2 },
      { name: "Kvasnice", sortOrder: 3 },
      { name: "Ostatní suroviny", sortOrder: 4 },
    ],
  },
  {
    name: "Provozní náklady",
    sortOrder: 2,
    children: [
      { name: "Energie", sortOrder: 1 },
      { name: "Nájemné", sortOrder: 2 },
      { name: "Pojistka", sortOrder: 3 },
      { name: "Údržba", sortOrder: 4 },
    ],
  },
  { name: "Obaly a materiál", sortOrder: 3 },
  {
    name: "Daně a poplatky",
    sortOrder: 4,
    children: [
      { name: "Spotřební daň", sortOrder: 1 },
      { name: "DPH", sortOrder: 2 },
    ],
  },
  { name: "Mzdy", sortOrder: 5 },
  { name: "Ostatní výdaje", sortOrder: 6 },
];

/**
 * Seed system categories for the current tenant.
 * Idempotent — skips if any categories already exist.
 */
export async function seedCategories(): Promise<void> {
  await withTenant(async (tenantId) => {
    // Check if categories already exist for this tenant
    const existingCount = await db
      .select({ value: count() })
      .from(cashflowCategories)
      .where(eq(cashflowCategories.tenantId, tenantId));

    if ((existingCount[0]?.value ?? 0) > 0) {
      return;
    }

    // Helper to insert a group of seed categories
    async function insertGroup(
      items: SeedCategory[],
      cashflowType: "income" | "expense"
    ): Promise<void> {
      for (const item of items) {
        // Insert parent
        const parentRows = await db
          .insert(cashflowCategories)
          .values({
            tenantId,
            name: item.name,
            parentId: null,
            cashflowType,
            isSystem: true,
            sortOrder: item.sortOrder,
            isActive: true,
          })
          .returning();

        const parentRow = parentRows[0];
        if (!parentRow) continue;

        // Insert children
        if (item.children && item.children.length > 0) {
          await db.insert(cashflowCategories).values(
            item.children.map((child) => ({
              tenantId,
              name: child.name,
              parentId: parentRow.id,
              cashflowType,
              isSystem: true,
              sortOrder: child.sortOrder,
              isActive: true,
            }))
          );
        }
      }
    }

    await insertGroup(SEED_INCOME, "income");
    await insertGroup(SEED_EXPENSE, "expense");
  });
}
