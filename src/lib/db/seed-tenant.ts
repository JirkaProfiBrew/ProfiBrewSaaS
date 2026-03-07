/**
 * Tenant-specific seed data — called during registration.
 * Each function accepts tenantId directly (no withTenant/auth context needed).
 * All functions are idempotent (safe to call multiple times).
 */

import { db } from "@/lib/db";
import { deposits } from "@/../drizzle/schema/deposits";
import { cashflowCategories } from "@/../drizzle/schema/cashflows";
import { cashDesks } from "@/../drizzle/schema/cashflows";
import { shops } from "@/../drizzle/schema/shops";
import { warehouses } from "@/../drizzle/schema/warehouses";
import { cashflowCategoryTemplates } from "@/../drizzle/schema/billing";
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

async function seedFromTemplates(
  tenantId: string,
  templates: (typeof cashflowCategoryTemplates.$inferSelect)[]
): Promise<void> {
  const idMap = new Map<string, string>(); // template.id → new category.id

  // Pass 1: roots (parentId IS NULL)
  const roots = templates.filter((t) => t.parentId === null);
  for (const template of roots) {
    const [cat] = await db
      .insert(cashflowCategories)
      .values({
        tenantId,
        name: template.name,
        cashflowType: template.cashflowType,
        isSystem: true,
        sortOrder: template.sortOrder ?? 0,
        templateId: template.id,
      })
      .returning();
    if (cat) idMap.set(template.id, cat.id);
  }

  // Pass 2: children
  const children = templates.filter((t) => t.parentId !== null);
  for (const template of children) {
    const newParentId = idMap.get(template.parentId!);
    if (!newParentId) continue;
    const [cat] = await db
      .insert(cashflowCategories)
      .values({
        tenantId,
        name: template.name,
        parentId: newParentId,
        cashflowType: template.cashflowType,
        isSystem: true,
        sortOrder: template.sortOrder ?? 0,
        templateId: template.id,
      })
      .returning();
    if (cat) idMap.set(template.id, cat.id);
  }
}

async function seedFromHardcoded(tenantId: string): Promise<void> {
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

async function seedDefaultCashFlowCategories(tenantId: string): Promise<void> {
  const existing = await db
    .select({ value: count() })
    .from(cashflowCategories)
    .where(eq(cashflowCategories.tenantId, tenantId));

  if ((existing[0]?.value ?? 0) > 0) return;

  // Try template-based seeding first
  const templates = await db
    .select()
    .from(cashflowCategoryTemplates)
    .where(eq(cashflowCategoryTemplates.isActive, true));

  if (templates.length > 0) {
    await seedFromTemplates(tenantId, templates);
  } else {
    // Fallback to hardcoded
    await seedFromHardcoded(tenantId);
  }
}

// -- Default Shop + Warehouses + Cash Desk ----------------------------------

function getStockModeForPlan(slug: string): string {
  if (slug === "free") return "none";
  if (
    ["starter", "community_homebrewer", "community_school"].includes(slug)
  )
    return "liters";
  if (["pro", "business"].includes(slug)) return "packages";
  return "liters"; // fallback
}

async function seedDefaultShopAndWarehouse(
  tenantId: string,
  breweryName: string,
  planSlug: string
): Promise<void> {
  const existingShops = await db
    .select({ value: count() })
    .from(shops)
    .where(eq(shops.tenantId, tenantId));

  if ((existingShops[0]?.value ?? 0) > 0) return;

  const [shop] = await db
    .insert(shops)
    .values({
      tenantId,
      name: breweryName || "Hlavní provozovna",
      shopType: "brewery",
      isDefault: true,
    })
    .returning();

  if (!shop) return;

  const existingWarehouses = await db
    .select({ value: count() })
    .from(warehouses)
    .where(eq(warehouses.tenantId, tenantId));

  if ((existingWarehouses[0]?.value ?? 0) > 0) return;

  const warehouseDefs = [
    {
      name: "Suroviny",
      code: "SUR",
      type: "raw_materials" as const,
      isDefault: true,
      isExciseRelevant: false,
      categories: ["suroviny"],
    },
    {
      name: "Pivo",
      code: "PIVO",
      type: "beer" as const,
      isDefault: false,
      isExciseRelevant: true,
      categories: ["pivo", "obaly"],
    },
    {
      name: "Ostatní",
      code: "OST",
      type: "other" as const,
      isDefault: false,
      isExciseRelevant: false,
      categories: ["ostatní"],
    },
  ];

  const createdWarehouses = await db
    .insert(warehouses)
    .values(
      warehouseDefs.map((w) => ({
        tenantId,
        shopId: shop.id,
        ...w,
      }))
    )
    .returning();

  // Update shop settings with warehouse references
  const rawWarehouse = createdWarehouses.find(
    (w) => w.type === "raw_materials"
  );
  const beerWarehouse = createdWarehouses.find((w) => w.type === "beer");

  await db
    .update(shops)
    .set({
      settings: {
        stockMode: getStockModeForPlan(planSlug),
        rawMaterialWarehouseId: rawWarehouse?.id ?? null,
        beerWarehouseId: beerWarehouse?.id ?? null,
        rawMaterialPriceSource: "calc_price",
        beerPriceSource: "fixed_price",
        overheadPercentage: 15,
        overheadFixed: 1000,
        batchCost: 2000,
        generateExpenseFromReceipt: false,
      },
    })
    .where(eq(shops.id, shop.id));

  // Seed default cash desk
  const existingDesks = await db
    .select({ value: count() })
    .from(cashDesks)
    .where(eq(cashDesks.tenantId, tenantId));

  if ((existingDesks[0]?.value ?? 0) === 0) {
    await db.insert(cashDesks).values({
      tenantId,
      shopId: shop.id,
      name: "Hlavní pokladna",
    });
  }
}

// -- Main entry point -------------------------------------------------------

/**
 * Seed all default data for a newly created tenant.
 * Called from the signUp flow. Idempotent — safe to re-run.
 */
export async function seedTenantDefaults(
  tenantId: string,
  breweryName?: string,
  planSlug?: string
): Promise<void> {
  try {
    await seedDefaultShopAndWarehouse(
      tenantId,
      breweryName || "Hlavní provozovna",
      planSlug || "pro"
    );
  } catch (err) {
    console.error("[seed] seedDefaultShopAndWarehouse failed:", err);
  }

  try {
    await seedDefaultCounters(tenantId);
  } catch (err) {
    console.error("[seed] seedDefaultCounters failed:", err);
  }

  try {
    await seedDefaultDeposits(tenantId);
  } catch (err) {
    console.error("[seed] seedDefaultDeposits failed:", err);
  }

  try {
    await seedDefaultCashFlowCategories(tenantId);
  } catch (err) {
    console.error("[seed] seedDefaultCashFlowCategories failed:", err);
  }
}
