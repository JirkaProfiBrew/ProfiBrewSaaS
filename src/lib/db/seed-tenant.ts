/**
 * Tenant-specific seed data — called during registration.
 * Each function accepts tenantId directly (no withTenant/auth context needed).
 * All functions are idempotent (safe to call multiple times).
 */

import { db } from "@/lib/db";
import { deposits } from "@/../drizzle/schema/deposits";
import { cashflowCategories } from "@/../drizzle/schema/cashflows";
import { eq } from "drizzle-orm";
import { count } from "drizzle-orm";
import { seedDefaultCounters } from "./counters";

// -- Default Deposits -------------------------------------------------------

const DEFAULT_DEPOSITS = [
  { name: "Keg 30L", depositAmount: "1500" },
  { name: "Keg 50L", depositAmount: "2000" },
  { name: "Přepravka", depositAmount: "200" },
] as const;

async function seedDefaultDeposits(tenantId: string): Promise<void> {
  const existing = await db
    .select({ value: count() })
    .from(deposits)
    .where(eq(deposits.tenantId, tenantId));

  if ((existing[0]?.value ?? 0) > 0) return;

  await db.insert(deposits).values(
    DEFAULT_DEPOSITS.map((d) => ({
      tenantId,
      name: d.name,
      depositAmount: d.depositAmount,
    }))
  );
}

// -- Default CashFlow Categories --------------------------------------------

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

async function seedDefaultCashFlowCategories(tenantId: string): Promise<void> {
  const existing = await db
    .select({ value: count() })
    .from(cashflowCategories)
    .where(eq(cashflowCategories.tenantId, tenantId));

  if ((existing[0]?.value ?? 0) > 0) return;

  async function insertGroup(
    items: SeedCategory[],
    cashflowType: "income" | "expense"
  ): Promise<void> {
    for (const item of items) {
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
}

// -- Main entry point -------------------------------------------------------

/**
 * Seed all default data for a newly created tenant.
 * Called from the signUp flow. Idempotent — safe to re-run.
 */
export async function seedTenantDefaults(tenantId: string): Promise<void> {
  await seedDefaultCounters(tenantId);
  await seedDefaultDeposits(tenantId);
  await seedDefaultCashFlowCategories(tenantId);
}
